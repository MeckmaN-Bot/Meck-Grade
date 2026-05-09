"""
Local user / social database — SQLite, no external deps.

Tables:
  profiles(
    id, username, display_name, bio, avatar, provider, email,
    top_cards_json, settings_json, created_at
  )
  friends(profile_id, friend_id, ts)              -- 'follow' edges
  notifications(id, profile_id, kind, title, body, payload_json, ts, is_read)
"""
import json
import os
import sqlite3
import time
import uuid
from typing import Optional, List, Dict

from backend.paths import get_data_dir as _get_data_dir

_DB_PATH = os.path.join(_get_data_dir(), "users.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect(); cur = conn.cursor()
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS profiles (
      id              TEXT PRIMARY KEY,
      username        TEXT UNIQUE NOT NULL,
      display_name    TEXT,
      bio             TEXT,
      avatar          TEXT,
      provider        TEXT,
      email           TEXT,
      top_cards_json  TEXT,
      settings_json   TEXT,
      created_at      TEXT
    );
    CREATE TABLE IF NOT EXISTS friends (
      profile_id  TEXT NOT NULL,
      friend_id   TEXT NOT NULL,
      ts          TEXT NOT NULL,
      PRIMARY KEY (profile_id, friend_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id            TEXT PRIMARY KEY,
      profile_id    TEXT NOT NULL,
      kind          TEXT NOT NULL,
      title         TEXT NOT NULL,
      body          TEXT,
      payload_json  TEXT,
      ts            TEXT NOT NULL,
      is_read       INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_notif_profile_ts
      ON notifications(profile_id, ts DESC);
    """)
    conn.commit(); conn.close()


# ─── Profile ────────────────────────────────────────────────────────────────

def upsert_profile_by_email(email: str, provider: str, display_name: str = "") -> dict:
    """
    Find profile by email; create if missing. Used by mock OAuth login.
    Returns the profile dict.
    """
    init_db()
    conn = _connect(); cur = conn.cursor()
    cur.execute("SELECT * FROM profiles WHERE email = ?", (email,))
    row = cur.fetchone()
    if row:
        conn.close()
        return _row_to_profile(row)

    pid = str(uuid.uuid4())
    username = _gen_username_from_email(email, conn)
    display = display_name or username.replace("_", " ").title()
    conn.execute("""
      INSERT INTO profiles (id, username, display_name, bio, avatar, provider, email, top_cards_json, settings_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        pid, username, display, "", _default_avatar(display),
        provider, email,
        json.dumps([]),
        json.dumps(_default_settings()),
        _now(),
    ))
    conn.commit()
    cur.execute("SELECT * FROM profiles WHERE id = ?", (pid,))
    row = cur.fetchone()
    conn.close()

    # Welcome notification
    add_notification(pid, "welcome", "Willkommen bei MeckGrade",
                     "Lade deine erste Karte hoch und sieh ob es sich lohnt sie zu graden.")
    return _row_to_profile(row)


def get_profile(profile_id: str) -> Optional[dict]:
    init_db()
    conn = _connect()
    row = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    conn.close()
    return _row_to_profile(row) if row else None


def get_profile_by_username(username: str) -> Optional[dict]:
    init_db()
    conn = _connect()
    row = conn.execute("SELECT * FROM profiles WHERE username = ?", (username,)).fetchone()
    conn.close()
    return _row_to_profile(row) if row else None


def list_profiles(limit: int = 100) -> List[dict]:
    init_db()
    conn = _connect()
    rows = conn.execute("SELECT * FROM profiles ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [_row_to_profile(r) for r in rows]


def update_profile(profile_id: str, patch: dict) -> Optional[dict]:
    init_db()
    allowed = {"display_name", "bio", "avatar", "username"}
    fields = {k: v for k, v in patch.items() if k in allowed}
    if "username" in fields:
        fields["username"] = _slug(fields["username"])
    if "top_cards" in patch:
        fields["top_cards_json"] = json.dumps(patch["top_cards"][:3])
    if "settings" in patch:
        s = json.dumps(patch["settings"] or {})
        if len(s) > 16_000:
            raise ValueError("settings_too_large")
        fields["settings_json"] = s
    if not fields:
        return get_profile(profile_id)
    sets = ", ".join(f"{k} = ?" for k in fields.keys())
    args = list(fields.values()) + [profile_id]
    conn = _connect()
    try:
        conn.execute(f"UPDATE profiles SET {sets} WHERE id = ?", args)
        conn.commit()
    except sqlite3.IntegrityError as e:
        conn.close()
        raise ValueError(f"username_taken: {e}") from e
    conn.close()
    return get_profile(profile_id)


# ─── Friends ────────────────────────────────────────────────────────────────

def add_friend(profile_id: str, friend_username: str) -> bool:
    """Returns True if a NEW edge was created. Idempotent — no notification
    spam when the user re-clicks Follow."""
    init_db()
    target = get_profile_by_username(friend_username)
    if not target or target["id"] == profile_id:
        return False
    conn = _connect()
    cur = conn.execute(
        "INSERT OR IGNORE INTO friends (profile_id, friend_id, ts) VALUES (?, ?, ?)",
        (profile_id, target["id"], _now()),
    )
    newly_inserted = cur.rowcount > 0
    conn.commit(); conn.close()
    if newly_inserted:
        add_notification(target["id"], "friend_request",
                         "Neuer Follower",
                         f"@{(get_profile(profile_id) or {}).get('username','someone')} folgt dir.")
    return True


def remove_friend(profile_id: str, friend_username: str) -> bool:
    init_db()
    target = get_profile_by_username(friend_username)
    if not target:
        return False
    conn = _connect()
    conn.execute("DELETE FROM friends WHERE profile_id = ? AND friend_id = ?",
                 (profile_id, target["id"]))
    conn.commit(); conn.close()
    return True


def list_friends(profile_id: str) -> List[dict]:
    init_db()
    conn = _connect()
    rows = conn.execute("""
      SELECT p.* FROM friends f JOIN profiles p ON p.id = f.friend_id
      WHERE f.profile_id = ? ORDER BY f.ts DESC
    """, (profile_id,)).fetchall()
    conn.close()
    return [_row_to_profile(r) for r in rows]


# ─── Notifications ──────────────────────────────────────────────────────────

def add_notification(profile_id: str, kind: str, title: str, body: str = "",
                     payload: Optional[dict] = None) -> dict:
    init_db()
    nid = str(uuid.uuid4())
    conn = _connect()
    conn.execute("""
      INSERT INTO notifications (id, profile_id, kind, title, body, payload_json, ts, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    """, (nid, profile_id, kind, title, body, json.dumps(payload or {}), _now()))
    conn.commit(); conn.close()
    return {"id": nid, "kind": kind, "title": title, "body": body,
            "payload": payload or {}, "ts": _now(), "is_read": False}


def list_notifications(profile_id: str, limit: int = 50) -> List[dict]:
    init_db()
    conn = _connect()
    rows = conn.execute("""
      SELECT * FROM notifications WHERE profile_id = ?
      ORDER BY ts DESC LIMIT ?
    """, (profile_id, limit)).fetchall()
    conn.close()
    return [_row_to_notif(r) for r in rows]


def unread_count(profile_id: str) -> int:
    init_db()
    conn = _connect()
    n = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE profile_id = ? AND is_read = 0",
        (profile_id,)).fetchone()[0]
    conn.close()
    return int(n)


def mark_notifications_read(profile_id: str, ids: Optional[List[str]] = None) -> None:
    init_db()
    conn = _connect()
    if ids:
        placeholders = ",".join("?" * len(ids))
        conn.execute(
            f"UPDATE notifications SET is_read = 1 WHERE profile_id = ? AND id IN ({placeholders})",
            [profile_id] + ids,
        )
    else:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE profile_id = ?",
            (profile_id,))
    conn.commit(); conn.close()


# ─── Helpers ────────────────────────────────────────────────────────────────

def _row_to_profile(row: sqlite3.Row) -> dict:
    if row is None: return None
    d = dict(row)
    try:    d["top_cards"] = json.loads(d.pop("top_cards_json") or "[]")
    except: d["top_cards"] = []
    try:    d["settings"]  = json.loads(d.pop("settings_json")  or "{}")
    except: d["settings"]  = {}
    return d


def _row_to_notif(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:    d["payload"] = json.loads(d.pop("payload_json") or "{}")
    except: d["payload"] = {}
    d["is_read"] = bool(d.get("is_read"))
    return d


def _gen_username_from_email(email: str, conn: sqlite3.Connection) -> str:
    base = _slug(email.split("@")[0]) or "user"
    name, n = base, 1
    while conn.execute("SELECT 1 FROM profiles WHERE username = ?", (name,)).fetchone():
        n += 1
        name = f"{base}{n}"
    return name


def _slug(s: str) -> str:
    import re
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9_]+", "_", s).strip("_")
    return s[:32] or "user"


def _default_avatar(display_name: str) -> str:
    """Pick a holo-emoji avatar."""
    EMOJI = ["✨", "🪐", "🌙", "🌒", "🔮", "🃏", "💎", "⚡", "🌌", "🎴"]
    h = sum(ord(c) for c in display_name) if display_name else 0
    return EMOJI[h % len(EMOJI)]


def _default_settings() -> dict:
    return {
        "psa_fee": 28,
        "ship_cost": 22,
        "currency": "EUR",
        "theme": "holo",
        "language": "de",
        "card_language": "de",
    }


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
