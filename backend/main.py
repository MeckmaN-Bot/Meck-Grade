"""
Meck-Grade — FastAPI application entry point.
Serves the analysis API and the frontend static files.
"""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.api import health, upload, analyze

app = FastAPI(
    title="Meck-Grade",
    description="TCG Card Pre-Grading Tool",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(health.router,  prefix="/api")
app.include_router(upload.router,  prefix="/api")
app.include_router(analyze.router, prefix="/api")

# Serve frontend static files at /
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
