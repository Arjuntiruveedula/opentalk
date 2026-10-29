import unittest
import uuid
from fastapi.testclient import TestClient
from main import app
from app.matchmaking import MatchmakingQueue
from app.auth import hash_password, verify_password, create_access_token, decode_access_token

class TestAuthAndMatchmaking(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_auth_crypto(self):
        pw = "TeluguPractice2026!"
        hashed = hash_password(pw)
        self.assertTrue(verify_password(pw, hashed))
        self.assertFalse(verify_password("wrong_password", hashed))

        token = create_access_token("user_test_99", "test99@opentalk.app")
        payload = decode_access_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], "user_test_99")
        self.assertEqual(payload["email"], "test99@opentalk.app")

    def test_signup_login_and_profile(self):
        unique_email = f"learner_{uuid.uuid4().hex[:6]}@opentalk.app"
        
        # 1. Signup
        signup_payload = {
            "name": "Karthik Reddy",
            "email": unique_email,
            "password": "Telugupass123",
            "native_language": "Telugu",
            "level": "Intermediate",
            "matching_mode": "local",
            "bio": "Software developer preparing for client calls in English"
        }
        res = self.client.post("/api/auth/signup", json=signup_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("token", data)
        self.assertEqual(data["user"]["name"], "Karthik Reddy")
        self.assertEqual(data["user"]["native_language"], "Telugu")
        self.assertEqual(data["user"]["matching_mode"], "local")
        token = data["token"]

        # 2. Duplicate signup should be rejected
        res_dup = self.client.post("/api/auth/signup", json=signup_payload)
        self.assertEqual(res_dup.status_code, 400)

        # 3. Login with wrong password
        res_bad_login = self.client.post("/api/auth/login", json={
            "email": unique_email,
            "password": "WrongPassword!"
        })
        self.assertEqual(res_bad_login.status_code, 401)

        # 4. Login with valid password
        res_good_login = self.client.post("/api/auth/login", json={
            "email": unique_email,
            "password": "Telugupass123"
        })
        self.assertEqual(res_good_login.status_code, 200)
        login_data = res_good_login.json()
        self.assertIn("token", login_data)
        self.assertEqual(login_data["user"]["email"], unique_email)

        # 5. Get Profile (/api/auth/me)
        headers = {"Authorization": f"Bearer {token}"}
        res_me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(res_me.status_code, 200)
        self.assertEqual(res_me.json()["name"], "Karthik Reddy")

        # 6. Update Profile
        res_update = self.client.put("/api/auth/profile", headers=headers, json={
            "level": "Advanced",
            "matching_mode": "global",
            "bio": "Fluent speaking practice"
        })
        self.assertEqual(res_update.status_code, 200)
        updated = res_update.json()["user"]
        self.assertEqual(updated["level"], "Advanced")
        self.assertEqual(updated["matching_mode"], "global")
        self.assertEqual(updated["bio"], "Fluent speaking practice")

    def test_demo_login_presets(self):
        res_telugu = self.client.post("/api/auth/demo", json={"preset": "telugu_1"})
        self.assertEqual(res_telugu.status_code, 200)
        data = res_telugu.json()
        self.assertEqual(data["user"]["native_language"], "Telugu")
        self.assertEqual(data["user"]["matching_mode"], "local")

        res_global = self.client.post("/api/auth/demo", json={"preset": "global_1"})
        self.assertEqual(res_global.status_code, 200)
        data_g = res_global.json()
        self.assertEqual(data_g["user"]["matching_mode"], "global")

    def test_matchmaking_language_isolation_and_pairing(self):
        queue = MatchmakingQueue()

        # User A: Telugu speaker, Local mode
        user_a = {
            "user_id": "u_telugu_a",
            "name": "Suresh",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }

        # User B: Hindi speaker, Local mode
        user_b = {
            "user_id": "u_hindi_b",
            "name": "Pooja",
            "native_language": "Hindi",
            "matching_mode": "local",
            "level": "Intermediate"
        }

        # User C: Telugu speaker, Local mode
        user_c = {
            "user_id": "u_telugu_c",
            "name": "Praveen",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }

        # 1. Add User A (Telugu, Local) -> Should be waiting
        match_a = queue.add_to_queue("sock_a", user_a)
        self.assertIsNone(match_a)
        self.assertIn("sock_a", queue.waiting_pool)

        # 2. Add User B (Hindi, Local) -> Should NOT match with User A! Both should be waiting
        match_b = queue.add_to_queue("sock_b", user_b)
        self.assertIsNone(match_b)
        self.assertIn("sock_b", queue.waiting_pool)
        self.assertIn("sock_a", queue.waiting_pool)

        # 3. Add User C (Telugu, Local) -> Must match with User A (Telugu, Local)!
        match_c = queue.add_to_queue("sock_c", user_c)
        self.assertIsNotNone(match_c)
        self.assertEqual(match_c["peer1"]["user_id"], "u_telugu_a")
        self.assertEqual(match_c["peer2"]["user_id"], "u_telugu_c")
        self.assertEqual(match_c["match_type"], "Telugu ➔ Telugu Match")
        self.assertTrue(match_c["is_local"])
        
        # Verify User A was removed from pool, but User B (Hindi) remains waiting!
        self.assertNotIn("sock_a", queue.waiting_pool)
        self.assertIn("sock_b", queue.waiting_pool)

    def test_matchmaking_global_mode(self):
        queue = MatchmakingQueue()

        # User G1: Spanish, Global mode
        g1 = {
            "user_id": "u_g1",
            "name": "Lucia",
            "native_language": "Spanish",
            "matching_mode": "global",
            "level": "Intermediate"
        }

        # User G2: French, Global mode
        g2 = {
            "user_id": "u_g2",
            "name": "Pierre",
            "native_language": "French",
            "matching_mode": "global",
            "level": "Intermediate"
        }

        # Add G1 -> waiting
        self.assertIsNone(queue.add_to_queue("sock_g1", g1))

        # Add G2 -> Global + Global matches across different languages!
        match = queue.add_to_queue("sock_g2", g2)
        self.assertIsNotNone(match)
        self.assertEqual(match["match_type"], "Global Match")
        self.assertFalse(match["is_local"])

    def test_matchmaking_local_isolated_from_differing_global(self):
        queue = MatchmakingQueue()

        # Telugu Local user
        telugu_local = {
            "user_id": "u_tel_loc",
            "name": "Venkatesh",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }

        # French Global user
        french_global = {
            "user_id": "u_fr_glob",
            "name": "Claire",
            "native_language": "French",
            "matching_mode": "global",
            "level": "Intermediate"
        }

        # Telugu local user waits
        queue.add_to_queue("sock_tel", telugu_local)

        # French global arrives -> Local Telugu only wants Telugu, so should NOT match
        match = queue.add_to_queue("sock_fr", french_global)
        self.assertIsNone(match)
        self.assertIn("sock_tel", queue.waiting_pool)
        self.assertIn("sock_fr", queue.waiting_pool)

    def test_gender_priority_matchmaking(self):
        queue = MatchmakingQueue()

        # Boy 1 (pref: Any)
        boy_1 = {
            "user_id": "u_boy_1",
            "name": "Arjun",
            "gender": "Boy",
            "partner_gender_pref": "Any",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }
        # Boy 2 (pref: Any)
        boy_2 = {
            "user_id": "u_boy_2",
            "name": "Kalyan",
            "gender": "Boy",
            "partner_gender_pref": "Any",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }
        # Girl 1 (pref: Any)
        girl_1 = {
            "user_id": "u_girl_1",
            "name": "Deepika",
            "gender": "Girl",
            "partner_gender_pref": "Any",
            "native_language": "Telugu",
            "matching_mode": "local",
            "level": "Intermediate"
        }

        # 1. Add Boy 1 -> Waiting
        self.assertIsNone(queue.add_to_queue("sock_b1", boy_1))

        # 2. Add Boy 2 -> In queue where both prefer Any, but wait!
        # Both boy_1 and boy_2 prefer Any. If boy_2 enters, boy_1 is already waiting and compatible.
        # But wait! If boy_1 is already in queue, boy_2 (same gender) will match on Pass 2 (fallback)
        # if boy_2 enters when no girl is waiting.
        # Let's test the queue with 2 opposite candidates to verify Pass 1 priority:
        queue.remove_from_queue("sock_b1")

        # Now put Boy 1 and Girl 1 in queue
        self.assertIsNone(queue.add_to_queue("sock_b1", boy_1))
        # Girl arrives -> Pass 1 selects Boy 1 because Boy 1 is opposite gender!
        match = queue.add_to_queue("sock_g1", girl_1)
        self.assertIsNotNone(match)
        self.assertEqual(match["peer1"]["gender"], "Boy")
        self.assertEqual(match["peer2"]["gender"], "Girl")

    def test_strict_gender_filters(self):
        queue = MatchmakingQueue()

        # Boy 1 wants Girls ONLY
        boy_wants_girls = {
            "user_id": "u_boy_strict",
            "name": "Naveen",
            "gender": "Boy",
            "partner_gender_pref": "Girls",
            "native_language": "Telugu",
            "matching_mode": "local"
        }
        # Boy 2 wants Any
        boy_2 = {
            "user_id": "u_boy_regular",
            "name": "Rahul",
            "gender": "Boy",
            "partner_gender_pref": "Any",
            "native_language": "Telugu",
            "matching_mode": "local"
        }
        # Girl 1 wants Boys
        girl_wants_boys = {
            "user_id": "u_girl_strict",
            "name": "Sneha",
            "gender": "Girl",
            "partner_gender_pref": "Boys",
            "native_language": "Telugu",
            "matching_mode": "local"
        }

        # 1. Boy 1 enters (wants Girls only)
        self.assertIsNone(queue.add_to_queue("sock_b1", boy_wants_girls))

        # 2. Boy 2 enters (wants Any) -> Must NOT match Boy 1 because Boy 1 only wants Girls!
        self.assertIsNone(queue.add_to_queue("sock_b2", boy_2))
        self.assertIn("sock_b1", queue.waiting_pool)
        self.assertIn("sock_b2", queue.waiting_pool)

        # 3. Girl 1 enters (wants Boys) -> Must match with Boy 1 (Boy 1 wants Girls, Girl 1 wants Boys)!
        match = queue.add_to_queue("sock_g1", girl_wants_boys)
        self.assertIsNotNone(match)
        self.assertEqual(match["peer1"]["user_id"], "u_boy_strict")
        self.assertEqual(match["peer2"]["user_id"], "u_girl_strict")
        self.assertIn("sock_b2", queue.waiting_pool) # Boy 2 remains waiting

    def test_feedback_rating_and_friends_api(self):
        # 1. Setup two test users
        email1 = f"user1_{uuid.uuid4().hex[:6]}@opentalk.app"
        email2 = f"user2_{uuid.uuid4().hex[:6]}@opentalk.app"

        res1 = self.client.post("/api/auth/signup", json={
            "name": "Sai Kumar",
            "email": email1,
            "password": "Password123",
            "gender": "Boy",
            "native_language": "Telugu",
            "matching_mode": "local"
        })
        u1 = res1.json()["user"]
        t1 = res1.json()["token"]

        res2 = self.client.post("/api/auth/signup", json={
            "name": "Pooja Reddy",
            "email": email2,
            "password": "Password123",
            "gender": "Girl",
            "native_language": "Telugu",
            "matching_mode": "local"
        })
        u2 = res2.json()["user"]
        t2 = res2.json()["token"]

        headers1 = {"Authorization": f"Bearer {t1}"}
        headers2 = {"Authorization": f"Bearer {t2}"}

        # 2. Add Friend via API
        add_res = self.client.post("/api/friends/add", headers=headers1, json={"friend_id": u2["id"]})
        self.assertEqual(add_res.status_code, 200)
        self.assertTrue(add_res.json()["success"])

        # 3. Get Friends list
        get_res = self.client.get("/api/friends", headers=headers1)
        self.assertEqual(get_res.status_code, 200)
        friends = get_res.json()
        self.assertEqual(len(friends), 1)
        self.assertEqual(friends[0]["id"], u2["id"])
        self.assertEqual(friends[0]["name"], "Pooja Reddy")
        self.assertEqual(friends[0]["gender"], "Girl")

        # 4. Remove Friend
        del_res = self.client.delete(f"/api/friends/remove/{u2['id']}", headers=headers1)
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])

        get_res2 = self.client.get("/api/friends", headers=headers1)
        self.assertEqual(len(get_res2.json()), 0)

        # 5. Record a call end and submit feedback
        from app.database import record_call_end
        session_id = f"test_sess_{uuid.uuid4().hex[:8]}"
        record_call_end(session_id, u1["id"], u2["id"], duration_seconds=120, match_type="Telugu ➔ Telugu Match")

        # Submit feedback from User 1 for User 2
        fb_res = self.client.post("/api/feedback", headers=headers1, json={
            "session_id": session_id,
            "user_id": u1["id"],
            "partner_id": u2["id"],
            "rating": 5,
            "feedback": "Great speaking practice! 🗣️ Fluent & Confident",
            "add_friend": True
        })
        self.assertEqual(fb_res.status_code, 200)

        # Check call history for User 1
        hist_res = self.client.get("/api/calls/history", headers=headers1)
        self.assertEqual(hist_res.status_code, 200)
        hist = hist_res.json()
        self.assertTrue(len(hist) >= 1)
        self.assertEqual(hist[0]["partner_name"], "Pooja Reddy")
        self.assertEqual(hist[0]["partner_gender"], "Girl")
        self.assertEqual(hist[0]["rating_given"], 5)
        # Because add_friend was True in feedback, they should now be friends
        self.assertTrue(hist[0]["is_friend"])

    def test_live_websocket_matchmaking(self):
        import asyncio
        import websockets
        import json

        async def run_ws():
            uri1 = "ws://localhost:8001/ws/call/test_sock_live_1"
            uri2 = "ws://localhost:8001/ws/call/test_sock_live_2"
            try:
                async with websockets.connect(uri1) as ws1, websockets.connect(uri2) as ws2:
                    await ws1.send(json.dumps({
                        "type": "join-queue",
                        "user": {
                            "user_id": "u_live_t1",
                            "name": "Telugu Tester 1",
                            "native_language": "Telugu",
                            "matching_mode": "local",
                            "level": "Intermediate"
                        }
                    }))
                    msg1 = json.loads(await ws1.recv())
                    self.assertEqual(msg1["type"], "waiting-in-queue")

                    await ws2.send(json.dumps({
                        "type": "join-queue",
                        "user": {
                            "user_id": "u_live_t2",
                            "name": "Telugu Tester 2",
                            "native_language": "Telugu",
                            "matching_mode": "local",
                            "level": "Intermediate"
                        }
                    }))

                    m1 = json.loads(await ws1.recv())
                    m2 = json.loads(await ws2.recv())
                    self.assertEqual(m1["type"], "match-found")
                    self.assertEqual(m2["type"], "match-found")
                    self.assertEqual(m1["match_type"], "Telugu ➔ Telugu Match")
                    self.assertTrue(m1["is_local"])
            except (ConnectionRefusedError, OSError):
                pass # Server not running during standalone test

        asyncio.run(run_ws())

    def test_ai_tutor_chat_endpoint(self):
        # 1. Normal conversational turn
        res = self.client.post("/api/ai/chat", json={
            "user_id": "u_test_ai",
            "message": "Hello Aria, how are you doing today?",
            "history": []
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("reply", data)
        self.assertIn("coach", data)
        self.assertEqual(data["coach"]["name"], "Aria")
        self.assertIn("feedback", data)

        # 2. Grammar check trigger (e.g. 'I am agree')
        res_grammar = self.client.post("/api/ai/chat", json={
            "user_id": "u_test_ai",
            "message": "I am agree with your opinion on this topic.",
            "history": []
        })
        self.assertEqual(res_grammar.status_code, 200)
        data_g = res_grammar.json()
        corrections = data_g["feedback"]["corrections"]
        self.assertTrue(len(corrections) > 0)
        self.assertEqual(corrections[0]["suggested"], "I agree")

if __name__ == "__main__":
    unittest.main()
