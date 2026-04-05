"""
POST /api/analyze — Run full analysis pipeline for a session.
GET  /api/result/{session_id} — Retrieve cached result.
"""
import json
import os
from typing import Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.analysis.pipeline import run_pipeline
from backend.models.response import AnalysisResult

router = APIRouter()

# In-memory result cache (sufficient for a local single-user tool)
_cache: Dict[str, AnalysisResult] = {}


class AnalyzeRequest(BaseModel):
    session_id: str


@router.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalyzeRequest) -> AnalysisResult:
    result = run_pipeline(req.session_id)
    _cache[req.session_id] = result
    return result


@router.get("/result/{session_id}", response_model=AnalysisResult)
def get_result(session_id: str) -> AnalysisResult:
    if session_id not in _cache:
        raise HTTPException(404, "Result not found. Please run /api/analyze first.")
    return _cache[session_id]


@router.delete("/session/{session_id}")
def delete_session(session_id: str) -> dict:
    _cache.pop(session_id, None)
    # Remove uploaded files
    uploads_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
    )
    removed = 0
    for fname in os.listdir(uploads_dir):
        if fname.startswith(session_id):
            try:
                os.remove(os.path.join(uploads_dir, fname))
                removed += 1
            except OSError:
                pass
    return {"status": "ok", "files_removed": removed}
