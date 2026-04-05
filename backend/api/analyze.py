"""
POST /api/analyze       — Run full analysis pipeline (synchronous, returns JSON).
GET  /api/analyze/stream/{session_id} — SSE stream of real-time progress events.
GET  /api/result/{session_id}         — Retrieve cached/stored result.
DELETE /api/session/{session_id}      — Clean up files and cache.
"""
import json
import os
from typing import Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.analysis.pipeline import run_pipeline, run_pipeline_stream
from backend.models.response import AnalysisResult

router = APIRouter()

# In-memory result cache (sufficient for a local single-user tool).
# Extended by the history DB in backend/db/history.py when available.
_cache: Dict[str, AnalysisResult] = {}


class AnalyzeRequest(BaseModel):
    session_id: str


# ── Synchronous endpoint (kept for compatibility) ────────────────────────────

@router.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalyzeRequest) -> AnalysisResult:
    result = run_pipeline(req.session_id)
    _cache[req.session_id] = result
    _save_to_history(result)
    return result


# ── SSE streaming endpoint ───────────────────────────────────────────────────

@router.get("/analyze/stream/{session_id}")
async def analyze_stream(session_id: str):
    """
    Server-Sent Events stream. Yields progress events then the final result.
    Each event is a JSON object: {pct, msg, done, [result]}.
    """
    async def event_generator():
        try:
            for event in run_pipeline_stream(session_id):
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("done") and "result" in event:
                    # Cache the result
                    result = AnalysisResult.model_validate(event["result"])
                    _cache[session_id] = result
                    _save_to_history(result)
        except Exception as e:
            err = {"pct": 0, "msg": f"Error: {e}", "done": True, "error": True}
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering if proxied
        },
    )


# ── Result retrieval ─────────────────────────────────────────────────────────

@router.get("/result/{session_id}", response_model=AnalysisResult)
def get_result(session_id: str) -> AnalysisResult:
    # Try in-memory cache first
    if session_id in _cache:
        return _cache[session_id]
    # Try history DB
    result = _load_from_history(session_id)
    if result:
        return result
    raise HTTPException(404, "Result not found. Please run /api/analyze first.")


# ── Session cleanup ──────────────────────────────────────────────────────────

@router.delete("/session/{session_id}")
def delete_session(session_id: str) -> dict:
    _cache.pop(session_id, None)
    uploads_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
    )
    removed = 0
    if os.path.isdir(uploads_dir):
        for fname in os.listdir(uploads_dir):
            if fname.startswith(session_id):
                try:
                    os.remove(os.path.join(uploads_dir, fname))
                    removed += 1
                except OSError:
                    pass
    return {"status": "ok", "files_removed": removed}


# ── History integration (optional, graceful if DB not available) ─────────────

def _save_to_history(result: AnalysisResult) -> None:
    try:
        from backend.db.history import save_result
        save_result(result)
    except Exception:
        pass  # DB unavailable — silent fail


def _load_from_history(session_id: str) -> AnalysisResult | None:
    try:
        from backend.db.history import load_result
        return load_result(session_id)
    except Exception:
        return None
