"""
GET    /api/history                  — List last 100 grading sessions
GET    /api/history/{session_id}     — Full result for one session
DELETE /api/history/{session_id}     — Remove entry
PATCH  /api/history/{session_id}     — Update user notes
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from backend.db.history import (
    list_sessions, load_result, delete_session, update_notes,
)
from backend.models.response import AnalysisResult

router = APIRouter()


class PatchNotesRequest(BaseModel):
    notes: str


@router.get("/history")
def get_history() -> List[dict]:
    return list_sessions(limit=100)


@router.get("/history/{session_id}", response_model=AnalysisResult)
def get_history_entry(session_id: str) -> AnalysisResult:
    result = load_result(session_id)
    if not result:
        raise HTTPException(404, "History entry not found.")
    return result


@router.delete("/history/{session_id}")
def delete_history_entry(session_id: str) -> dict:
    delete_session(session_id)
    return {"status": "ok"}


@router.patch("/history/{session_id}")
def patch_history_notes(session_id: str, body: PatchNotesRequest) -> dict:
    update_notes(session_id, body.notes)
    return {"status": "ok"}
