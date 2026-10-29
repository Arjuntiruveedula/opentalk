import os
import re
import json
import uuid
from typing import Optional, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

from app.database import (
    init_db,
    get_or_create_user,
    update_user_stats,
    get_db,
    create_user,
    get_user_by_email,
    get_user_by_id,
    update_user_profile,
    record_call_end,
    submit_feedback,
    get_user_call_history,
    add_friend,
    remove_friend,
    get_user_friends
)
from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token
)
from app.catalog import DAILY_WORDS, SPEAKING_TOPICS, ICEBREAKERS
from app.ai_tutor import generate_ai_turn, analyze_user_speech
from app.webrtc_hub import manager
from app.matchmaking import matchmaker

app = FastAPI(title="OpenTalk Spoken English Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB immediately
init_db()

def model_to_dict(model_instance, exclude_unset: bool = True) -> dict:
    if hasattr(model_instance, "model_dump"):
        return model_instance.model_dump(exclude_unset=exclude_unset)
    return model_instance.dict(exclude_unset=exclude_unset)

def serialize_user(user: dict) -> dict:
    """Strips sensitive fields like password_hash from user dictionary."""
    if not user:
        return {}
    clean = dict(user)
    clean.pop("password_hash", None)
    return clean

def get_current_user_from_header(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication token required")
    token = authorization.split("Bearer ")[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ----------------- Authentication Models & Endpoints -----------------

class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    native_language: str = "Telugu"
    gender: str = "Boy"
    level: str = "Intermediate"
    avatar: Optional[str] = None
    bio: str = ""
    matching_mode: str = "local"

class LoginRequest(BaseModel):
    email: str
    password: str

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    native_language: Optional[str] = None
    gender: Optional[str] = None
    level: Optional[str] = None
    avatar: Optional[str] = None
    matching_mode: Optional[str] = None
    bio: Optional[str] = None

class DemoLoginRequest(BaseModel):
    preset: str = "telugu_1" # telugu_1, telugu_2, global_1, global_2

class AddFriendRequest(BaseModel):
    friend_id: str

@app.post("/api/auth/signup")
def signup(req: SignupRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Please enter your name.")

    existing = get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email address already exists. Please log in.")

    hashed_pw = hash_password(req.password)
    user = create_user(
        email=email,
        password_hash=hashed_pw,
        name=req.name.strip(),
        native_language=req.native_language or "Telugu",
        gender=req.gender or "Boy",
        level=req.level or "Intermediate",
        avatar=req.avatar,
        bio=req.bio,
        matching_mode=req.matching_mode or "local"
    )

    token = create_access_token(user["id"], user["email"])
    return {
        "status": "ok",
        "token": token,
        "user": serialize_user(user)
    }

@app.post("/api/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    user = get_user_by_email(email)
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token(user["id"], user["email"])
    return {
        "status": "ok",
        "token": token,
        "user": serialize_user(user)
    }

@app.get("/api/auth/me")
def get_current_user(current_user: dict = Depends(get_current_user_from_header)):
    return serialize_user(current_user)

@app.put("/api/auth/profile")
def update_profile(
    req: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user_from_header)
):
    updates = model_to_dict(req, exclude_unset=True)
    updated = update_user_profile(current_user["id"], updates)
    return {
        "status": "ok",
        "user": serialize_user(updated)
    }

@app.post("/api/auth/demo")
def demo_login(req: DemoLoginRequest):
    presets = {
        "telugu_1": {
            "email": "demo.telugu1@opentalk.app",
            "name": "Ravi Teja",
            "native_language": "Telugu",
            "gender": "Boy",
            "level": "Intermediate",
            "matching_mode": "local",
            "bio": "Software engineer from Hyderabad practicing spoken English for client calls."
        },
        "telugu_2": {
            "email": "demo.telugu2@opentalk.app",
            "name": "Ananya Rao",
            "native_language": "Telugu",
            "gender": "Girl",
            "level": "Intermediate",
            "matching_mode": "local",
            "bio": "College student from Vijayawada preparing for TOEFL speaking exam."
        },
        "global_1": {
            "email": "demo.global1@opentalk.app",
            "name": "Kenji Sato",
            "native_language": "Japanese",
            "gender": "Boy",
            "level": "Intermediate",
            "matching_mode": "global",
            "bio": "Practicing conversational English with global learners worldwide."
        },
        "global_2": {
            "email": "demo.global2@opentalk.app",
            "name": "Maria Gonzalez",
            "native_language": "Spanish",
            "gender": "Girl",
            "level": "Advanced",
            "matching_mode": "global",
            "bio": "Travel enthusiast seeking global English discussions."
        }
    }
    
    selected = presets.get(req.preset, presets["telugu_1"])
    user = get_user_by_email(selected["email"])
    if not user:
        user = create_user(
            email=selected["email"],
            password_hash=hash_password("DemoPassword123!"),
            name=selected["name"],
            native_language=selected["native_language"],
            gender=selected["gender"],
            level=selected["level"],
            avatar=f"https://api.dicebear.com/7.x/bottts/svg?seed={selected['email']}",
            bio=selected["bio"],
            matching_mode=selected["matching_mode"]
        )
    else:
        user = update_user_profile(user["id"], {
            "matching_mode": selected["matching_mode"],
            "native_language": selected["native_language"],
            "gender": selected["gender"]
        })
    token = create_access_token(user["id"], user["email"])
    return {
        "status": "ok",
        "token": token,
        "user": serialize_user(user)
    }

# ----------------- User & Content REST Endpoints -----------------

@app.get("/api/user/{user_id}")
def get_user_profile_endpoint(user_id: str):
    user = get_user_by_id(user_id) or get_or_create_user(user_id)
    return serialize_user(user)

@app.get("/api/catalog/words")
def get_daily_words():
    import random
    selected = random.sample(DAILY_WORDS, min(4, len(DAILY_WORDS)))
    return selected

@app.get("/api/catalog/topics")
def get_speaking_topics():
    return SPEAKING_TOPICS

@app.get("/api/catalog/icebreakers")
def get_icebreakers():
    return ICEBREAKERS

@app.get("/api/rooms")
def get_audio_rooms():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM rooms WHERE is_active = 1 ORDER BY created_at DESC")
    rows = cursor.fetchall()
    rooms = []
    for r in rows:
        d = dict(r)
        d["listener_count"] = len(manager.room_members.get(d["id"], []))
        rooms.append(d)
    conn.close()
    return rooms

class CreateRoomRequest(BaseModel):
    title: str
    category: str
    description: str
    host_id: str
    host_name: str

@app.post("/api/rooms")
def create_room(req: CreateRoomRequest):
    room_id = f"room_{uuid.uuid4().hex[:8]}"
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO rooms (id, title, category, description, host_id, host_name)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (room_id, req.title, req.category, req.description, req.host_id, req.host_name))
    conn.commit()
    conn.close()
    return {"room_id": room_id, "title": req.title}

class AiChatRequest(BaseModel):
    user_id: str
    message: str
    history: list = []

@app.post("/api/ai/chat")
def ai_chat_turn(req: AiChatRequest):
    turn_result = generate_ai_turn(req.history, req.message)
    return turn_result

class PostCallRatingRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    partner_id: str
    rating: float
    feedback: str = ""
    add_friend: bool = False

@app.post("/api/feedback")
def submit_call_feedback(
    req: PostCallRatingRequest,
    current_user: dict = Depends(get_current_user_from_header)
):
    user_id = current_user["id"]
    result = submit_feedback(
        session_id=req.session_id,
        rater_id=user_id,
        partner_id=req.partner_id,
        rating=req.rating,
        feedback=req.feedback,
        add_friend_flag=req.add_friend
    )
    return result

@app.get("/api/calls/history")
def get_call_history_endpoint(current_user: dict = Depends(get_current_user_from_header)):
    history = get_user_call_history(current_user["id"])
    return history

@app.get("/api/friends")
def get_friends_endpoint(current_user: dict = Depends(get_current_user_from_header)):
    friends = get_user_friends(current_user["id"])
    return friends

@app.post("/api/friends/add")
def add_friend_endpoint(
    req: AddFriendRequest,
    current_user: dict = Depends(get_current_user_from_header)
):
    success = add_friend(current_user["id"], req.friend_id)
    return {"status": "ok", "success": success, "message": "Friend added successfully" if success else "Already friends"}

@app.delete("/api/friends/remove/{friend_id}")
def remove_friend_endpoint(
    friend_id: str,
    current_user: dict = Depends(get_current_user_from_header)
):
    success = remove_friend(current_user["id"], friend_id)
    return {"status": "ok", "success": success, "message": "Friend removed successfully"}

# ----------------- WebSocket Signaling -----------------

@app.websocket("/ws/call/{socket_id}")
async def call_signaling_endpoint(websocket: WebSocket, socket_id: str):
    await manager.connect(socket_id, websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)
            msg_type = data.get("type")

            if msg_type == "join-queue":
                user_info = data.get("user", {})
                # Normalize language, mode, gender and preference
                user_info.setdefault("native_language", "Telugu")
                user_info.setdefault("matching_mode", "local")
                user_info.setdefault("gender", "Boy")
                user_info.setdefault("partner_gender_pref", "Any")
                manager.socket_user_map[socket_id] = user_info
                
                # Check remaining free minutes
                db_user = get_user_by_id(user_info.get("user_id", "")) or get_or_create_user(user_info.get("user_id", "user_guest"))
                if db_user["daily_free_minutes"] <= 0:
                    await manager.send_to(socket_id, {
                        "type": "talktime-exhausted",
                        "message": "You have exhausted your 20 daily free minutes. Recharges or VIP tiers coming soon!"
                    })
                    continue

                matched_session = matchmaker.add_to_queue(socket_id, user_info)
                if matched_session:
                    # Notify both peers that a match has been found!
                    p1_sid = matched_session["peer1"]["socket_id"]
                    p2_sid = matched_session["peer2"]["socket_id"]
                    
                    # Determine public vs incognito names
                    p1_name = matched_session["peer1"]["incognito_name"] if matched_session["peer1"].get("is_incognito") else matched_session["peer1"]["name"]
                    p2_name = matched_session["peer2"]["incognito_name"] if matched_session["peer2"].get("is_incognito") else matched_session["peer2"]["name"]
                    
                    p1_avatar = matched_session["peer1"].get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={matched_session['peer1']['user_id']}"
                    p2_avatar = matched_session["peer2"].get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={matched_session['peer2']['user_id']}"

                    # Peer 1 initiates WebRTC offer (Caller)
                    await manager.send_to(p1_sid, {
                        "type": "match-found",
                        "role": "caller",
                        "session_id": matched_session["session_id"],
                        "match_type": matched_session["match_type"],
                        "is_local": matched_session["is_local"],
                        "is_opposite_gender": matched_session.get("is_opposite_gender", False),
                        "partner": {
                            "user_id": matched_session["peer2"]["user_id"],
                            "name": p2_name,
                            "gender": matched_session["peer2"].get("gender", "Girl"),
                            "level": matched_session["peer2"].get("level", "Intermediate"),
                            "avatar": p2_avatar,
                            "is_incognito": matched_session["peer2"].get("is_incognito", False),
                            "native_language": matched_session["peer2"].get("native_language", "Telugu")
                        }
                    })
                    
                    # Peer 2 waits for WebRTC offer (Receiver)
                    await manager.send_to(p2_sid, {
                        "type": "match-found",
                        "role": "receiver",
                        "session_id": matched_session["session_id"],
                        "match_type": matched_session["match_type"],
                        "is_local": matched_session["is_local"],
                        "is_opposite_gender": matched_session.get("is_opposite_gender", False),
                        "partner": {
                            "user_id": matched_session["peer1"]["user_id"],
                            "name": p1_name,
                            "gender": matched_session["peer1"].get("gender", "Boy"),
                            "level": matched_session["peer1"].get("level", "Intermediate"),
                            "avatar": p1_avatar,
                            "is_incognito": matched_session["peer1"].get("is_incognito", False),
                            "native_language": matched_session["peer1"].get("native_language", "Telugu")
                        }
                    })
                else:
                    target_gender = user_info.get("partner_gender_pref", "Any")
                    gender_str = f" ({target_gender})" if target_gender != "Any" else ""
                    mode_display = f"Telugu co-learner{gender_str}" if user_info.get("matching_mode") == "local" and user_info.get("native_language") == "Telugu" else f"{user_info.get('native_language', 'local')} speaker{gender_str}" if user_info.get("matching_mode") == "local" else f"global partner{gender_str}"
                    await manager.send_to(socket_id, {
                        "type": "waiting-in-queue",
                        "message": f"Searching for an active {mode_display}..."
                    })

            elif msg_type == "leave-queue":
                matchmaker.remove_from_queue(socket_id)
                await manager.send_to(socket_id, {"type": "queue-cancelled"})

            elif msg_type in ["offer", "answer", "ice-candidate"]:
                session = matchmaker.get_session_by_socket(socket_id)
                if session:
                    p1_sid = session["peer1"]["socket_id"]
                    p2_sid = session["peer2"]["socket_id"]
                    target_sid = p2_sid if p1_sid == socket_id else p1_sid
                    await manager.send_to(target_sid, data)

            elif msg_type == "end-call":
                session = matchmaker.get_session_by_socket(socket_id)
                if session:
                    session_id = session["session_id"]
                    ended = matchmaker.end_session(session_id)
                    if ended:
                        p1_sid = ended["peer1"]["socket_id"]
                        p2_sid = ended["peer2"]["socket_id"]
                        target_sid = p2_sid if p1_sid == socket_id else p1_sid
                        
                        duration = ended.get("duration_seconds", 0)
                        await manager.send_to(target_sid, {
                            "type": "call-ended",
                            "reason": "Call hung up",
                            "duration_seconds": duration
                        })
                        await manager.send_to(socket_id, {
                            "type": "call-ended",
                            "reason": "You hung up",
                            "duration_seconds": duration
                        })
                        
                        # Deduct minutes from users
                        mins = max(1, duration // 60)
                        update_user_stats(ended["peer1"]["user_id"], mins)
                        update_user_stats(ended["peer2"]["user_id"], mins)
                        
                        # Save call log
                        record_call_end(
                            session_id=session_id,
                            caller=ended["peer1"],
                            receiver=ended["peer2"],
                            duration_seconds=duration,
                            match_type=ended.get("match_type", "1-on-1 Practice")
                        )

    except WebSocketDisconnect:
        await manager.disconnect(socket_id)
    except Exception as e:
        await manager.disconnect(socket_id)

@app.websocket("/ws/room/{room_id}/{socket_id}")
async def room_signaling_endpoint(websocket: WebSocket, room_id: str, socket_id: str):
    await manager.connect(socket_id, websocket)
    if room_id not in manager.room_members:
        manager.room_members[room_id] = set()
    manager.room_members[room_id].add(socket_id)
    manager.socket_to_room[socket_id] = room_id

    try:
        while True:
            data_text = await websocket.receive_text()
            data = json.loads(data_text)
            msg_type = data.get("type")

            if msg_type == "join-room":
                user_info = data.get("user", {})
                manager.socket_user_map[socket_id] = user_info
                # Notify room members of new listener
                await manager.broadcast_to_room(room_id, {
                    "type": "room-user-joined",
                    "socket_id": socket_id,
                    "user": user_info,
                    "total_listeners": len(manager.room_members[room_id])
                })

            elif msg_type == "room-chat":
                await manager.broadcast_to_room(room_id, {
                    "type": "room-chat-message",
                    "sender": manager.socket_user_map.get(socket_id, {}).get("name", "Listener"),
                    "text": data.get("text")
                })

            elif msg_type == "raise-hand":
                user = manager.socket_user_map.get(socket_id, {})
                await manager.broadcast_to_room(room_id, {
                    "type": "user-raised-hand",
                    "socket_id": socket_id,
                    "user_name": user.get("name", "A learner")
                })

            elif msg_type == "promote-speaker":
                target_sid = data.get("target_socket_id")
                await manager.send_to(target_sid, {
                    "type": "promoted-to-speaker"
                })

    except WebSocketDisconnect:
        await manager.disconnect(socket_id)
    except Exception:
        await manager.disconnect(socket_id)

# Mount static web UI & SPA page routes
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(static_dir, exist_ok=True)

@app.get("/manifest.json")
def serve_manifest():
    manifest_path = os.path.join(static_dir, "manifest.json")
    if os.path.exists(manifest_path):
        return FileResponse(manifest_path, media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="Manifest not found")

@app.get("/sw.js")
def serve_service_worker():
    sw_path = os.path.join(static_dir, "sw.js")
    if os.path.exists(sw_path):
        return FileResponse(
            sw_path,
            media_type="application/javascript",
            headers={"Service-Worker-Allowed": "/", "Cache-Control": "no-cache"}
        )
    raise HTTPException(status_code=404, detail="Service worker not found")

@app.get("/login")
@app.get("/signup")
@app.get("/profile")
@app.get("/calls")
@app.get("/clubs")
def serve_spa():
    index_path = os.path.join(static_dir, "index.html")
    return FileResponse(index_path)

app.mount("/static", StaticFiles(directory=static_dir), name="static_dir")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    reload_mode = os.environ.get("ENVIRONMENT", "development").lower() != "production"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload_mode)
