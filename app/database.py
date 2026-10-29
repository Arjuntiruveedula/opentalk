import sqlite3
import os
import json
import uuid
import random
from datetime import datetime, date
from typing import Optional, Dict, Any, List

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "opentalk.db"))

INCOGNITO_ALIASES = [
    "Curious Dolphin", "Silver Fox", "Eager Falcon", "Wise Owl",
    "Swift Cheetah", "Noble Eagle", "Radiant Otter", "Brave Tiger"
]

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT NOT NULL,
        incognito_name TEXT NOT NULL,
        avatar TEXT,
        level TEXT DEFAULT 'Intermediate',
        native_language TEXT DEFAULT 'Telugu',
        gender TEXT DEFAULT 'Boy',
        matching_mode TEXT DEFAULT 'local',
        bio TEXT DEFAULT '',
        daily_free_minutes INTEGER DEFAULT 20,
        streak_days INTEGER DEFAULT 1,
        last_active_date TEXT,
        total_minutes_spoken INTEGER DEFAULT 0,
        total_calls INTEGER DEFAULT 0,
        rating REAL DEFAULT 4.8,
        coins INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Safe migrations for existing users table
    cursor.execute("PRAGMA table_info(users)")
    user_cols = {col[1] for col in cursor.fetchall()}
    
    if "email" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    if "password_hash" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    if "native_language" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN native_language TEXT DEFAULT 'Telugu'")
    if "gender" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT 'Boy'")
    if "matching_mode" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN matching_mode TEXT DEFAULT 'local'")
    if "bio" not in user_cols:
        cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''")
    
    # Create or migrate call_logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS call_logs (
        id TEXT PRIMARY KEY,
        caller_id TEXT,
        receiver_id TEXT,
        caller_name TEXT,
        receiver_name TEXT,
        caller_avatar TEXT,
        receiver_avatar TEXT,
        caller_gender TEXT DEFAULT 'Boy',
        receiver_gender TEXT DEFAULT 'Girl',
        caller_language TEXT DEFAULT 'Telugu',
        receiver_language TEXT DEFAULT 'Telugu',
        duration_seconds INTEGER DEFAULT 0,
        caller_rating REAL,
        caller_feedback TEXT,
        receiver_rating REAL,
        receiver_feedback TEXT,
        match_type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("PRAGMA table_info(call_logs)")
    log_cols = {col[1] for col in cursor.fetchall()}
    cols_to_add = [
        ("caller_id", "TEXT"),
        ("receiver_id", "TEXT"),
        ("caller_name", "TEXT"),
        ("receiver_name", "TEXT"),
        ("caller_avatar", "TEXT"),
        ("receiver_avatar", "TEXT"),
        ("caller_gender", "TEXT DEFAULT 'Boy'"),
        ("receiver_gender", "TEXT DEFAULT 'Girl'"),
        ("caller_language", "TEXT DEFAULT 'Telugu'"),
        ("receiver_language", "TEXT DEFAULT 'Telugu'"),
        ("caller_rating", "REAL"),
        ("caller_feedback", "TEXT"),
        ("receiver_rating", "REAL"),
        ("receiver_feedback", "TEXT"),
        ("match_type", "TEXT")
    ]
    for col_name, col_type in cols_to_add:
        if col_name not in log_cols:
            cursor.execute(f"ALTER TABLE call_logs ADD COLUMN {col_name} {col_type}")

    # Create friends table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS friends (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, friend_id)
    )
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        host_id TEXT NOT NULL,
        host_name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Pre-populate sample rooms if empty
    cursor.execute("SELECT COUNT(*) FROM rooms")
    if cursor.fetchone()[0] == 0:
        sample_rooms = [
            ("room_ielts_01", "IELTS Band 8+ Speaking Mock Practice", "IELTS", "Daily cue card discussions with peer feedback", "user_host_1", "Sarah Wilson"),
            ("room_casual_02", "Casual Coffee Chit-Chat & Debate", "General", "Talk about movies, weekend plans, and hobbies", "user_host_2", "Alex Chen"),
            ("room_job_03", "Software & Tech Job Interview Prep", "Career", "Behavioral questions, STAR method, and salary negotiation", "user_host_3", "Rohan Mehta"),
            ("room_culture_04", "Global Cultures & Travel Stories", "Travel", "Share travel memories and practice conversational English", "user_host_4", "Elena Rostova")
        ]
        cursor.executemany("INSERT INTO rooms (id, title, category, description, host_id, host_name) VALUES (?, ?, ?, ?, ?, ?)", sample_rooms)

    conn.commit()
    conn.close()

def _check_and_reset_daily(row, conn) -> dict:
    """Checks if a new day has arrived and resets daily minutes / updates streak."""
    today_str = str(date.today())
    last_date = row["last_active_date"]
    user_id = row["id"]
    
    if last_date != today_str:
        new_streak = row["streak_days"] + 1
        cursor = conn.cursor()
        cursor.execute("""
        UPDATE users SET daily_free_minutes = 20, streak_days = ?, last_active_date = ? WHERE id = ?
        """, (new_streak, today_str, user_id))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        
    return dict(row)

def create_user(
    email: str,
    password_hash: str,
    name: str,
    native_language: str = "Telugu",
    gender: str = "Boy",
    level: str = "Intermediate",
    avatar: Optional[str] = None,
    bio: str = "",
    matching_mode: str = "local"
) -> dict:
    conn = get_db()
    cursor = conn.cursor()
    
    user_id = f"user_{uuid.uuid4().hex[:10]}"
    incognito = random.choice(INCOGNITO_ALIASES)
    today_str = str(date.today())
    clean_email = email.strip().lower()
    clean_name = name.strip() or "Learner"
    final_avatar = avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={user_id}"
    clean_gender = "Girl" if gender.strip().lower() in ["girl", "female", "f"] else "Boy"
    
    cursor.execute("""
    INSERT INTO users (
        id, email, password_hash, name, incognito_name, avatar,
        level, native_language, gender, matching_mode, bio,
        daily_free_minutes, streak_days, last_active_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 20, 1, ?)
    """, (
        user_id, clean_email, password_hash, clean_name, incognito, final_avatar,
        level, native_language, clean_gender, matching_mode, bio, today_str
    ))
    conn.commit()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    user_dict = dict(row)
    conn.close()
    return user_dict

def get_user_by_email(email: str) -> Optional[dict]:
    conn = get_db()
    cursor = conn.cursor()
    clean_email = email.strip().lower()
    cursor.execute("SELECT * FROM users WHERE LOWER(email) = ?", (clean_email,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    user_dict = _check_and_reset_daily(row, conn)
    conn.close()
    return user_dict

def get_user_by_id(user_id: str) -> Optional[dict]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    user_dict = _check_and_reset_daily(row, conn)
    conn.close()
    return user_dict

def update_user_profile(user_id: str, updates: Dict[str, Any]) -> Optional[dict]:
    allowed_fields = {"name", "native_language", "gender", "level", "avatar", "matching_mode", "bio"}
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}
    
    if not filtered_updates:
        return get_user_by_id(user_id)
        
    set_clause = ", ".join([f"{k} = ?" for k in filtered_updates.keys()])
    values = list(filtered_updates.values())
    values.append(user_id)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE users SET {set_clause} WHERE id = ?", tuple(values))
    conn.commit()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    return dict(row)

def get_or_create_user(user_id: str, name: str = "Learner") -> dict:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    
    today_str = str(date.today())
    if not row:
        incognito = random.choice(INCOGNITO_ALIASES)
        cursor.execute("""
        INSERT INTO users (id, name, incognito_name, avatar, level, native_language, gender, matching_mode, daily_free_minutes, streak_days, last_active_date)
        VALUES (?, ?, ?, ?, ?, 'Telugu', 'Boy', 'local', 20, 1, ?)
        """, (user_id, name, incognito, f"https://api.dicebear.com/7.x/bottts/svg?seed={user_id}", "Intermediate", today_str))
        conn.commit()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
    else:
        row = _check_and_reset_daily(row, conn)
            
    user_dict = dict(row)
    conn.close()
    return user_dict

def update_user_stats(user_id: str, minutes: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    UPDATE users 
    SET total_minutes_spoken = total_minutes_spoken + ?,
        total_calls = total_calls + 1,
        daily_free_minutes = MAX(0, daily_free_minutes - ?)
    WHERE id = ?
    """, (minutes, minutes, user_id))
    conn.commit()
    conn.close()

# ----------------- Call Logs & Feedback Handling -----------------

def record_call_end(session_id: str, caller: Any, receiver: Any, duration_seconds: int, match_type: str = "1-on-1 Practice"):
    """Records or updates completed call in call_logs."""
    conn = get_db()
    cursor = conn.cursor()
    
    if isinstance(caller, str):
        u = get_user_by_id(caller)
        caller = u or {"id": caller, "name": "Caller"}
    if isinstance(receiver, str):
        u = get_user_by_id(receiver)
        receiver = u or {"id": receiver, "name": "Receiver"}

    c_id = caller.get("user_id") or caller.get("id") or "user_c"
    r_id = receiver.get("user_id") or receiver.get("id") or "user_r"
    c_name = caller.get("name", "Caller")
    r_name = receiver.get("name", "Receiver")
    c_avatar = caller.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={c_id}"
    r_avatar = receiver.get("avatar") or f"https://api.dicebear.com/7.x/bottts/svg?seed={r_id}"
    c_gender = caller.get("gender", "Boy")
    r_gender = receiver.get("gender", "Girl")
    c_lang = caller.get("native_language", "Telugu")
    r_lang = receiver.get("native_language", "Telugu")

    cursor.execute("SELECT id FROM call_logs WHERE id = ?", (session_id,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute("""
        UPDATE call_logs SET duration_seconds = ? WHERE id = ?
        """, (duration_seconds, session_id))
    else:
        cursor.execute("""
        INSERT INTO call_logs (
            id, caller_id, receiver_id, caller_name, receiver_name,
            caller_avatar, receiver_avatar, caller_gender, receiver_gender,
            caller_language, receiver_language, duration_seconds, match_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            session_id, c_id, r_id, c_name, r_name,
            c_avatar, r_avatar, c_gender, r_gender,
            c_lang, r_lang, duration_seconds, match_type
        ))
        
    conn.commit()
    conn.close()

def submit_feedback(session_id: str, rater_id: str, partner_id: str, rating: float, feedback: str, add_friend_flag: bool = False) -> dict:
    """Saves rating and remark, recalculates partner rating, and optionally adds friend."""
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. Update the call log record
    cursor.execute("SELECT * FROM call_logs WHERE id = ?", (session_id,))
    row = cursor.fetchone()
    if row:
        if row["caller_id"] == rater_id:
            cursor.execute("UPDATE call_logs SET caller_rating = ?, caller_feedback = ? WHERE id = ?", (rating, feedback, session_id))
        else:
            cursor.execute("UPDATE call_logs SET receiver_rating = ?, receiver_feedback = ? WHERE id = ?", (rating, feedback, session_id))
    else:
        # Fallback if call log wasn't created yet
        cursor.execute("""
        INSERT INTO call_logs (id, caller_id, receiver_id, caller_rating, caller_feedback)
        VALUES (?, ?, ?, ?, ?)
        """, (session_id, rater_id, partner_id, rating, feedback))
    conn.commit()

    # 2. Recalculate partner's overall rating
    cursor.execute("""
    SELECT AVG(score) FROM (
        SELECT caller_rating AS score FROM call_logs WHERE receiver_id = ? AND caller_rating IS NOT NULL
        UNION ALL
        SELECT receiver_rating AS score FROM call_logs WHERE caller_id = ? AND receiver_rating IS NOT NULL
    )
    """, (partner_id, partner_id))
    avg_row = cursor.fetchone()
    if avg_row and avg_row[0] is not None:
        new_rating = round(float(avg_row[0]), 1)
        cursor.execute("UPDATE users SET rating = ? WHERE id = ?", (new_rating, partner_id))
        conn.commit()

    conn.close()

    # 3. Add friend if flagged
    if add_friend_flag and rater_id and partner_id and rater_id != partner_id:
        add_friend(rater_id, partner_id)

    return {"status": "ok", "message": "Feedback submitted successfully"}

def get_user_call_history(user_id: str, limit: int = 30) -> List[dict]:
    """Retrieves formatted past call history for user."""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT * FROM call_logs
    WHERE caller_id = ? OR receiver_id = ?
    ORDER BY created_at DESC
    LIMIT ?
    """, (user_id, user_id, limit))
    rows = cursor.fetchall()
    
    # Fetch user's friends set for quick lookup
    cursor.execute("SELECT friend_id FROM friends WHERE user_id = ?", (user_id,))
    friend_ids = {r[0] for r in cursor.fetchall()}
    conn.close()

    history = []
    for r in rows:
        is_caller = (r["caller_id"] == user_id)
        partner_id = r["receiver_id"] if is_caller else r["caller_id"]
        partner_name = r["receiver_name"] if is_caller else r["caller_name"]
        partner_avatar = r["receiver_avatar"] if is_caller else r["caller_avatar"]
        partner_gender = r["receiver_gender"] if is_caller else r["caller_gender"]
        partner_language = r["receiver_language"] if is_caller else r["caller_language"]
        rating_given = r["caller_rating"] if is_caller else r["receiver_rating"]
        feedback_given = r["caller_feedback"] if is_caller else r["receiver_feedback"]

        duration = r["duration_seconds"] or 0
        mins = duration // 60
        secs = duration % 60
        duration_text = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

        history.append({
            "session_id": r["id"],
            "partner_id": partner_id,
            "partner_name": partner_name or "Practice Partner",
            "partner_avatar": partner_avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={partner_id}",
            "partner_gender": partner_gender or "Boy",
            "partner_language": partner_language or "Telugu",
            "duration_seconds": duration,
            "duration_text": duration_text,
            "rating_given": rating_given,
            "feedback_given": feedback_given,
            "match_type": r["match_type"] or "1-on-1 Practice",
            "created_at": r["created_at"],
            "is_friend": partner_id in friend_ids
        })

    return history

# ----------------- Friends & Following System -----------------

def add_friend(user_id: str, friend_id: str) -> bool:
    if user_id == friend_id:
        return False
    conn = get_db()
    cursor = conn.cursor()
    friendship_id = f"fr_{uuid.uuid4().hex[:10]}"
    try:
        cursor.execute("""
        INSERT OR IGNORE INTO friends (id, user_id, friend_id)
        VALUES (?, ?, ?)
        """, (friendship_id, user_id, friend_id))
        conn.commit()
        success = cursor.rowcount > 0
    except Exception:
        success = False
    finally:
        conn.close()
    return success

def remove_friend(user_id: str, friend_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM friends WHERE user_id = ? AND friend_id = ?", (user_id, friend_id))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success

def get_user_friends(user_id: str) -> List[dict]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT u.id, u.name, u.avatar, u.gender, u.native_language, u.level, u.rating, u.streak_days, u.bio, f.created_at as befriended_at
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
