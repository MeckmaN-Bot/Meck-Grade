"""
GET    /api/history                     — List sessions (with filter/sort params)
GET    /api/history/{session_id}        — Full result for one session
DELETE /api/history/{session_id}        — Remove entry
PATCH  /api/history/{session_id}        — Update user notes
PATCH  /api/history/{session_id}/tags   — Update user tags
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional

from backend.db.history import (
    list_sessions, load_result, delete_session, update_notes, update_tags,
)
from backend.models.response import AnalysisResult

router = APIRouter()


class PatchNotesRequest(BaseModel):
    notes: str


class PatchTagsRequest(BaseModel):
    tags: str  # comma-separated, e.g. "holo,wertvoll"


@router.get("/history")
def get_history(
    limit: int = Query(500, ge=1, le=2000),
    search: str = Query(""),
    sort: str = Query("date_desc"),
    psa_min: int = Query(1, ge=1, le=10),
    psa_max: int = Query(10, ge=1, le=10),
) -> List[dict]:
    return list_sessions(limit=limit, search=search, sort=sort,
                         psa_min=psa_min, psa_max=psa_max)


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


@router.patch("/history/{session_id}/tags")
def patch_history_tags(session_id: str, body: PatchTagsRequest) -> dict:
    update_tags(session_id, body.tags)
    return {"status": "ok"}
