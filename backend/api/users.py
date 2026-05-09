"""
User / social / auth routes — local-only, no external OAuth.

Endpoints:
  POST /api/auth/login        { provider, email } → profile (creates if new)
  GET  /api/me                                    → current profile (X-User-Id)
  PATCH /api/me               { display_name, bio, top_cards, settings }
  GET  /api/profile/{username}                    → public profile
  GET  /api/profile/{username}/cards              → public collection (read-only)
  GET  /api/friends                               → friends list
  POST /api/friends           { username }
  DELETE /api/friends         { username }
  GET  /api/notifications                         → list + unread count
  POST /api/notifications/read { ids: [] | null }
  GET  /api/users/search?q=...                    → username autocomplete
"""
import os
import time
from fastapi import APIRouter, Header, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List

from backend.db import users as udb
from backend.db.history import _connect as _hist_connect
from backend.paths import get_data_dir

router = APIRouter()

_AVATAR_DIR = os.path.join(get_data_dir(), "avatars")
os.makedirs(_AVATAR_DIR, exist_ok=True)
_AVATAR_MAX_BYTES = 4 * 1024 * 1024   # 4 MB
_AVATAR_EXT = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png"}


# ── Schemas ─────────────────────────────────────────────────────────────────

class LoginIn(BaseModel):
    provider: str
    email: str
    display_name: Optional[str] = None


class ProfilePatch(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=64)
    bio:          Optional[str] = Field(default=None, max_length=500)
    avatar:       Optional[str] = Field(default=None, max_length=4096)
    username:     Optional[str] = Field(default=None, max_length=30)
    top_cards:    Optional[List[str]] = Field(default=None, max_length=3)
    settings:     Optional[dict] = None


class FriendIn(BaseModel):
    username: str


class NotifReadIn(BaseModel):
    ids: Optional[List[str]] = None


# ── Auth ────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
def auth_login(body: LoginIn):
    if not body.email or "@" not in body.email:
        raise HTTPException(400, "invalid email")
    profile = udb.upsert_profile_by_email(body.email, body.provider, body.display_name or "")
    return profile


# ── Self ────────────────────────────────────────────────────────────────────

def _require_user(x_user_id: Optional[str]):
    if not x_user_id:
        raise HTTPException(401, "missing X-User-Id header")
    p = udb.get_profile(x_user_id)
    if not p:
        raise HTTPException(401, "unknown profile")
    return p


@router.get("/me")
def me(x_user_id: Optional[str] = Header(None)):
    return _require_user(x_user_id)


@router.patch("/me")
def update_me(patch: ProfilePatch, x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    try:
        return udb.update_profile(p["id"], patch.model_dump(exclude_none=True))
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...),
                        x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    ext = _AVATAR_EXT.get((file.content_type or "").lower())
    if not ext:
        raise HTTPException(400, "Nur PNG oder JPG erlaubt.")
    blob = await file.read()
    if len(blob) > _AVATAR_MAX_BYTES:
        raise HTTPException(413, f"Datei > {_AVATAR_MAX_BYTES // 1024 // 1024} MB.")
    if len(blob) < 100:
        raise HTTPException(400, "Datei zu klein.")

    # Remove any old avatar files for this profile (other extensions).
    for old_ext in (".jpg", ".png"):
        old = os.path.join(_AVATAR_DIR, p["id"] + old_ext)
        if os.path.exists(old) and old.endswith(old_ext) and old_ext != ext:
            try: os.remove(old)
            except OSError: pass

    path = os.path.join(_AVATAR_DIR, p["id"] + ext)
    with open(path, "wb") as f:
        f.write(blob)

    # Cache-bust via timestamp so the browser picks up the new image.
    avatar_url = f"/avatars/{p['id']}{ext}?v={int(time.time())}"
    udb.update_profile(p["id"], {"avatar": avatar_url})
    return udb.get_profile(p["id"])


@router.delete("/me/avatar")
def delete_avatar(x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    for ext in (".jpg", ".png"):
        path = os.path.join(_AVATAR_DIR, p["id"] + ext)
        if os.path.exists(path):
            try: os.remove(path)
            except OSError: pass
    # Reset to a default emoji avatar
    import json
    udb.update_profile(p["id"], {"avatar": "✨"})
    return udb.get_profile(p["id"])


# ── Public profiles ─────────────────────────────────────────────────────────

@router.get("/profile/{username}")
def public_profile(username: str):
    p = udb.get_profile_by_username(username)
    if not p:
        raise HTTPException(404, "no such profile")
    # Strip private bits
    return {
        "username": p["username"],
        "display_name": p["display_name"],
        "bio": p["bio"],
        "avatar": p["avatar"],
        "top_cards": p["top_cards"],
        "created_at": p["created_at"],
    }


@router.get("/profile/{username}/cards")
def public_cards(username: str, limit: int = 50):
    p = udb.get_profile_by_username(username)
    if not p:
        raise HTTPException(404, "no such profile")
    from backend.db.history import list_sessions_for_user
    return list_sessions_for_user(p["id"], limit=limit)


@router.get("/users/search")
def user_search(q: str = "", limit: int = 8):
    q = (q or "").strip().lower()
    if len(q) < 1:
        return {"results": []}
    profiles = udb.list_profiles(200)
    out = []
    for p in profiles:
        if (q in (p["username"] or "").lower()
                or q in (p["display_name"] or "").lower()):
            out.append({"username": p["username"], "display_name": p["display_name"], "avatar": p["avatar"]})
        if len(out) >= limit:
            break
    return {"results": out}


# ── Friends ─────────────────────────────────────────────────────────────────

@router.get("/friends")
def friends_list(x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    friends = udb.list_friends(p["id"])
    return [{
        "username": f["username"], "display_name": f["display_name"],
        "avatar": f["avatar"], "bio": f["bio"], "top_cards": f["top_cards"],
    } for f in friends]


@router.post("/friends")
def friends_add(body: FriendIn, x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    ok = udb.add_friend(p["id"], body.username)
    if not ok:
        raise HTTPException(400, "could not follow (self / unknown)")
    return {"ok": True}


@router.delete("/friends")
def friends_remove(body: FriendIn, x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    udb.remove_friend(p["id"], body.username)
    return {"ok": True}


# ── Notifications ───────────────────────────────────────────────────────────

@router.get("/notifications")
def notifications(x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    return {
        "unread": udb.unread_count(p["id"]),
        "items":  udb.list_notifications(p["id"]),
    }


@router.post("/notifications/read")
def notifications_read(body: NotifReadIn, x_user_id: Optional[str] = Header(None)):
    p = _require_user(x_user_id)
    udb.mark_notifications_read(p["id"], body.ids)
    return {"ok": True}
