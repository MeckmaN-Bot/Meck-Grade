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
    # Initialise the SQLite history database on startup
    try:
        from backend.db.history import init_db
        init_db()
    except Exception as e:
        print(f"[Meck-Grade] Warning: could not initialise history DB: {e}")
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

# Serve frontend static files at /
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
