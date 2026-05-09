"""
Meck-Grade — FastAPI application entry point.
Serves the analysis API and the frontend static files.
"""
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.api import health, upload, analyze, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        from backend.db.history import init_db
        init_db()
    except Exception as e:
        print(f"[Meck-Grade] Warning: could not initialise history DB: {e}")
    try:
        from backend.db.users import init_db as init_users_db
        init_users_db()
    except Exception as e:
        print(f"[Meck-Grade] Warning: could not initialise users DB: {e}")
    yield


app = FastAPI(
    title="Meck-Grade",
    description="TCG Card Pre-Grading Tool",
    version="1.4.0",
    docs_url="/api/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(health.router,   prefix="/api")
app.include_router(upload.router,   prefix="/api")
app.include_router(analyze.router,  prefix="/api")
app.include_router(history.router,  prefix="/api")

# Register export router (optional — graceful if reportlab not installed)
try:
    from backend.api import export as export_api
    app.include_router(export_api.router, prefix="/api")
except ImportError:
    pass  # reportlab not yet installed

# Register card lookup router (optional — graceful if requests not installed)
try:
    from backend.api import lookup as lookup_api
    app.include_router(lookup_api.router, prefix="/api")
except ImportError:
    pass

# Register ROI router
try:
    from backend.api import roi as roi_api
    app.include_router(roi_api.router, prefix="/api")
except Exception:
    pass

# Register user / social / auth router
try:
    from backend.api import users as users_api
    app.include_router(users_api.router, prefix="/api")
except Exception as e:
    print(f"[Meck-Grade] Warning: users router not loaded: {e}")

# Register Supabase OAuth router
try:
    from backend.api import auth_supabase as auth_supabase_api
    app.include_router(auth_supabase_api.router, prefix="/api")
except Exception as e:
    print(f"[Meck-Grade] Warning: Supabase auth router not loaded: {e}")

# Serve uploaded avatars (kept under data/avatars so they persist outside the bundle)
try:
    from backend.paths import get_data_dir
    _AVATAR_DIR = os.path.join(get_data_dir(), "avatars")
    os.makedirs(_AVATAR_DIR, exist_ok=True)
    app.mount("/avatars", StaticFiles(directory=_AVATAR_DIR), name="avatars")
except Exception as e:
    print(f"[Meck-Grade] Avatar mount failed: {e}")

# Serve frontend static files at /
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
