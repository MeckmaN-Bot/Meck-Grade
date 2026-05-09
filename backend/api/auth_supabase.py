"""
Supabase OAuth integration — validates Supabase JWTs and syncs user to local DB.

Setup:
  1. Set SUPABASE_URL and SUPABASE_JWT_SECRET env vars (JWT Secret from Supabase → Settings → API)
  2. Enable Google/Apple OAuth in Supabase → Authentication → Providers
  3. Set redirect URL in Supabase: https://meckgrade.pages.dev/auth/callback

Frontend flow:
  - Call supabase.auth.signInWithOAuth({ provider: 'google' })
  - Supabase redirects back with access_token in URL hash
  - Frontend sends token to POST /api/auth/supabase with the access_token
  - Backend validates + creates/updates user → returns profile

Endpoints:
  POST /api/auth/supabase    { access_token } → profile (creates if new)
  GET  /api/auth/callback    (redirect target for OAuth, returns 200 for SPA)
"""
import os
import json
import time
import hashlib
import hmac
import base64
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")


class SupabaseTokenIn(BaseModel):
    access_token: str
    provider: Optional[str] = "google"


def _b64url_decode(s: str) -> bytes:
    s = s.replace("-", "+").replace("_", "/")
    pad = 4 - len(s) % 4
    if pad != 4:
        s += "=" * pad
    return base64.b64decode(s)


def _verify_supabase_jwt(token: str) -> dict:
    """Verify Supabase JWT and return payload. Raises HTTPException on failure."""
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(status_code=503, detail="Supabase not configured — set SUPABASE_JWT_SECRET")
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("malformed JWT")
        header_b64, payload_b64, sig_b64 = parts
        # Verify signature (HS256)
        msg = f"{header_b64}.{payload_b64}".encode()
        secret = SUPABASE_JWT_SECRET.encode()
        expected_sig = base64.urlsafe_b64encode(
            hmac.new(secret, msg, "sha256").digest()
        ).rstrip(b"=").decode()
        if not hmac.compare_digest(sig_b64, expected_sig):
            raise ValueError("invalid signature")
        payload = json.loads(_b64url_decode(payload_b64))
        # Check expiry
        if payload.get("exp", 0) < time.time():
            raise ValueError("token expired")
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Supabase token: {e}")


@router.post("/auth/supabase")
async def supabase_login(body: SupabaseTokenIn):
    """Validate Supabase access token, sync user to local DB, return profile."""
    payload = _verify_supabase_jwt(body.access_token)

    sub = payload.get("sub")  # Supabase user UUID
    email = payload.get("email", "")
    user_meta = payload.get("user_metadata", {})
    display_name = (
        user_meta.get("full_name")
        or user_meta.get("name")
        or user_meta.get("display_name")
        or email.split("@")[0]
    )
    avatar_url = user_meta.get("avatar_url") or user_meta.get("picture") or ""
    provider = payload.get("app_metadata", {}).get("provider", body.provider)

    if not sub or not email:
        raise HTTPException(status_code=400, detail="Token missing sub or email")

    # Deterministic local user ID from Supabase UUID
    local_id = hashlib.sha256(sub.encode()).hexdigest()[:32]

    try:
        from backend.db import users as udb
        profile = udb.get_or_create_user(
            user_id=local_id,
            email=email,
            display_name=display_name,
            provider=provider,
        )
        if avatar_url and not profile.get("avatar_url"):
            udb.update_user(local_id, {"avatar_url": avatar_url})
            profile["avatar_url"] = avatar_url
        return profile
    except Exception as e:
        logger.exception("supabase_login db error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auth/callback")
async def auth_callback():
    """SPA redirect target — just return 200 so the page loads."""
    return {"ok": True, "message": "OAuth callback received — check URL hash for token."}
