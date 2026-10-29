import json
import logging
from typing import Dict, Set
from fastapi import WebSocket
from app.matchmaking import matchmaker
from app.database import update_user_stats, record_call_end

logger = logging.getLogger("opentalk.hub")

class ConnectionManager:
    def __init__(self):
        # socket_id -> WebSocket
        self.active_sockets: Dict[str, WebSocket] = {}
        # room_id -> set of socket_ids
        self.room_members: Dict[str, Set[str]] = {}
        # socket_id -> room_id
        self.socket_to_room: Dict[str, str] = {}
        # socket_id -> user_data
        self.socket_user_map: Dict[str, dict] = {}

    async def connect(self, socket_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_sockets[socket_id] = websocket

    async def disconnect(self, socket_id: str):
        # 1. Check if in matchmaking queue
        matchmaker.remove_from_queue(socket_id)
        
        # 2. Check if in active 1-on-1 call session
        session = matchmaker.get_session_by_socket(socket_id)
        if session:
            session_id = session["session_id"]
            ended_session = matchmaker.end_session(session_id)
            if ended_session:
                partner_sid = ended_session["peer2"]["socket_id"] if ended_session["peer1"]["socket_id"] == socket_id else ended_session["peer1"]["socket_id"]
                await self.send_to(partner_sid, {
                    "type": "call-ended",
                    "reason": "Partner disconnected",
                    "duration_seconds": ended_session.get("duration_seconds", 0)
                })
                # Update user stats
                duration_min = max(1, ended_session.get("duration_seconds", 0) // 60)
                update_user_stats(ended_session["peer1"]["user_id"], duration_min)
                update_user_stats(ended_session["peer2"]["user_id"], duration_min)
                record_call_end(
                    session_id=session_id,
                    caller=ended_session["peer1"],
                    receiver=ended_session["peer2"],
                    duration_seconds=ended_session.get("duration_seconds", 0),
                    match_type=ended_session.get("match_type", "1-on-1 Practice")
                )

        # 3. Check if in an audio room
        room_id = self.socket_to_room.pop(socket_id, None)
        if room_id and room_id in self.room_members:
            self.room_members[room_id].discard(socket_id)
            user_data = self.socket_user_map.get(socket_id, {})
            await self.broadcast_to_room(room_id, {
                "type": "room-user-left",
                "socket_id": socket_id,
                "user_name": user_data.get("name", "A listener")
            }, exclude=socket_id)
            
        self.active_sockets.pop(socket_id, None)
        self.socket_user_map.pop(socket_id, None)

    async def send_to(self, socket_id: str, message: dict):
        ws = self.active_sockets.get(socket_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {socket_id}: {e}")

    async def broadcast_to_room(self, room_id: str, message: dict, exclude: str = None):
        if room_id in self.room_members:
            for sid in list(self.room_members[room_id]):
                if sid != exclude:
                    await self.send_to(sid, message)

manager = ConnectionManager()
