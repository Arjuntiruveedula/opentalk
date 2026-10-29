import asyncio
import time
import uuid
from typing import Dict, List, Optional

class MatchmakingQueue:
    def __init__(self):
        # socket_id -> user_data
        self.waiting_pool: Dict[str, dict] = {}
        # session_id -> { caller_ws, receiver_ws, user1, user2, start_time }
        self.active_sessions: Dict[str, dict] = {}
        # socket_id -> session_id
        self.user_to_session: Dict[str, str] = {}

    def add_to_queue(self, socket_id: str, user_info: dict) -> Optional[dict]:
        """
        Adds a user to waiting pool and attempts to match with another waiting peer.
        Enforces language matching rules and Partner Gender matching with Opposite-Gender priority.
        """
        user_info["socket_id"] = socket_id
        user_info["joined_at"] = time.time()
        
        user_id = user_info.get("user_id")
        user_mode = (user_info.get("matching_mode") or "local").lower()
        user_lang = (user_info.get("native_language") or "Telugu").strip().title()
        
        user_gender = "Girl" if (user_info.get("gender") or "Boy").strip().title() in ["Girl", "Female"] else "Boy"
        user_pref = (user_info.get("partner_gender_pref") or "Any").strip().title() # Any, Girls, Boys
        user_info["gender"] = user_gender
        user_info["partner_gender_pref"] = user_pref
        
        opp_gender = "Girl" if user_gender == "Boy" else "Boy"

        # 1. Filter all eligible peers who pass language & strict gender constraints
        compatible_peers = []
        for peer_sid, peer_info in list(self.waiting_pool.items()):
            if peer_sid == socket_id or peer_info.get("user_id") == user_id:
                continue
                
            peer_mode = (peer_info.get("matching_mode") or "local").lower()
            peer_lang = (peer_info.get("native_language") or "Telugu").strip().title()
            peer_gender = "Girl" if (peer_info.get("gender") or "Boy").strip().title() in ["Girl", "Female"] else "Boy"
            peer_pref = (peer_info.get("partner_gender_pref") or "Any").strip().title()

            # Language compatibility
            if user_mode == "local" or peer_mode == "local":
                if user_lang.lower() != peer_lang.lower():
                    continue

            # Mutual Gender preference compatibility
            # User constraints on peer
            if user_pref == "Girls" and peer_gender != "Girl":
                continue
            if user_pref == "Boys" and peer_gender != "Boy":
                continue

            # Peer constraints on user
            if peer_pref == "Girls" and user_gender != "Girl":
                continue
            if peer_pref == "Boys" and user_gender != "Boy":
                continue

            compatible_peers.append((peer_sid, peer_info, peer_gender))

        if not compatible_peers:
            self.waiting_pool[socket_id] = user_info
            return None

        # 2. Priority Selection:
        # Pass 1: Try to match with Opposite Gender
        selected_peer_sid = None
        selected_peer_info = None

        for p_sid, p_info, p_gender in compatible_peers:
            if p_gender == opp_gender:
                selected_peer_sid = p_sid
                selected_peer_info = p_info
                break

        # Pass 2: Fallback to any compatible candidate (if no opposite gender peer available)
        if not selected_peer_sid:
            selected_peer_sid = compatible_peers[0][0]
            selected_peer_info = compatible_peers[0][1]

        # Match found! Remove partner from pool
        del self.waiting_pool[selected_peer_sid]
        
        session_id = f"call_{uuid.uuid4().hex[:10]}"
        peer_lang = (selected_peer_info.get("native_language") or "Telugu").strip().title()
        peer_gender = selected_peer_info.get("gender", "Boy")
        
        # Determine human-readable match title
        if user_lang.lower() == peer_lang.lower() and (user_mode == "local" or selected_peer_info.get("matching_mode") == "local"):
            match_type = f"{user_lang} ➔ {peer_lang} Match"
            is_local = True
        else:
            match_type = "Global Match"
            is_local = False

        session = {
            "session_id": session_id,
            "peer1": selected_peer_info,
            "peer2": user_info,
            "created_at": time.time(),
            "state": "connecting",
            "match_type": match_type,
            "is_local": is_local,
            "is_opposite_gender": (user_gender != peer_gender),
            "shared_language": user_lang if user_lang.lower() == peer_lang.lower() else None
        }
        
        self.active_sessions[session_id] = session
        self.user_to_session[selected_peer_sid] = session_id
        self.user_to_session[socket_id] = session_id
        
        return session

    def remove_from_queue(self, socket_id: str):
        if socket_id in self.waiting_pool:
            del self.waiting_pool[socket_id]

    def get_session_by_socket(self, socket_id: str) -> Optional[dict]:
        session_id = self.user_to_session.get(socket_id)
        if session_id:
            return self.active_sessions.get(session_id)
        return None

    def end_session(self, session_id: str) -> Optional[dict]:
        session = self.active_sessions.pop(session_id, None)
        if session:
            p1_sid = session["peer1"]["socket_id"]
            p2_sid = session["peer2"]["socket_id"]
            self.user_to_session.pop(p1_sid, None)
            self.user_to_session.pop(p2_sid, None)
            session["ended_at"] = time.time()
            session["duration_seconds"] = int(session["ended_at"] - session["created_at"])
            return session
        return None

matchmaker = MatchmakingQueue()
