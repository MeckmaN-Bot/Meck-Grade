"""
GET    /api/history                     — List sessions (with filter/sort params)
GET    /api/history/export              — Bulk export as CSV or JSON
GET    /api/history/{session_id}        — Full result for one session
DELETE /api/history/{session_id}        — Remove entry
PATCH  /api/history/{session_id}        — Update user notes
PATCH  /api/history/{session_id}/tags   — Update user tags
"""
import csv
import io
import os

from fastapi import APIRouter, HTTPException, Query, Header
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

from backend.db.history import (
    list_sessions, load_result, delete_session, update_notes, update_tags,
    save_result, session_owner,
)
from backend.db import users as udb
from backend.models.response import AnalysisResult
from backend.api.analyze import _cache as _result_cache


def _current_profile_id(x_user_id: Optional[str]) -> str:
    if not x_user_id:
        raise HTTPException(401, "missing X-User-Id header")
    p = udb.get_profile(x_user_id)
    if not p:
        raise HTTPException(401, "unknown profile")
    return p["id"]


def _assert_owns(session_id: str, pid: str) -> None:
    """Allow access only to the row's owner, or unowned legacy rows."""
    owner = session_owner(session_id)
    if owner is None:
        return
    if owner != pid:
        raise HTTPException(404, "history entry not found")

router = APIRouter()

_EXPORT_FIELDS = [
    "id", "card_name", "card_set", "card_number",
    "psa_grade", "bgs_composite", "centering", "corners", "edges", "surface",
    "timestamp", "tags",
]
# Human-readable CSV header names (exported column order + labels)
_EXPORT_HEADERS = {
    "id":           "session_id",
    "card_name":    "card_name",
    "card_set":     "set_name",
    "card_number":  "card_number",
    "psa_grade":    "psa_grade",
    "bgs_composite":"bgs_composite",
    "centering":    "centering_score",
    "corners":      "corner_score",
    "edges":        "edge_score",
    "surface":      "surface_score",
    "timestamp":    "scanned_at",
    "tags":         "tags",
}


class PatchNotesRequest(BaseModel):
    notes: str


class PatchTagsRequest(BaseModel):
    tags: str  # comma-separated, e.g. "holo,wertvoll"


class AddToCollectionRequest(BaseModel):
    card_name:   Optional[str] = ""
    card_set:    Optional[str] = ""
    card_id:     Optional[str] = ""   # canonical tcgdex id, e.g. "me02.5-290"
    card_number: Optional[str] = ""   # collector number, e.g. "290"


@router.get("/history/export")
def export_history(
    format: str = Query("csv", pattern="^(csv|json)$"),
    search: str = Query(""),
    psa_min: int = Query(1, ge=1, le=10),
    psa_max: int = Query(10, ge=1, le=10),
    x_user_id: Optional[str] = Header(None),
):
    """Export the current user's grading history as CSV or JSON."""
    pid = _current_profile_id(x_user_id)
    entries = list_sessions(profile_id=pid, limit=2000, search=search,
                            sort="date_desc", psa_min=psa_min, psa_max=psa_max)
    raw = [{f: e.get(f, "") for f in _EXPORT_FIELDS} for e in entries]
    # Remap to human-readable header names
    rows = [{_EXPORT_HEADERS[f]: v for f, v in r.items()} for r in raw]
    fieldnames = list(_EXPORT_HEADERS.values())

    if format == "json":
        return JSONResponse(
            content=rows,
            headers={"Content-Disposition": "attachment; filename=meck-grade-history.json"},
        )

    # CSV
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=meck-grade-history.csv"},
    )


@router.post("/history/{session_id}")
def add_to_collection(session_id: str, body: AddToCollectionRequest,
                      x_user_id: Optional[str] = Header(None)) -> dict:
    """
    Save the cached analyze result to history with the user-confirmed card
    name + set, scoped to the current user. The result screen's "Add to
    Collection" button calls this after the lookup is confirmed.
    """
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)  # noop for new rows; rejects cross-user re-add
    result = _result_cache.get(session_id)
    if result is None:
        existing = load_result(session_id)
        if existing is not None:
            owner = session_owner(session_id)
            if owner == pid:
                return {"status": "exists", "session_id": session_id}
            raise HTTPException(404, "history entry not found")
        raise HTTPException(404, "Session not found in cache. Re-run analyze.")
    save_result(result, card_name=body.card_name or "", card_set=body.card_set or "",
                profile_id=pid, card_id=body.card_id or "", card_number=body.card_number or "")
    return {"status": "added", "session_id": session_id}


@router.get("/history")
def get_history(
    limit: int = Query(500, ge=1, le=2000),
    search: str = Query(""),
    sort: str = Query("date_desc"),
    psa_min: int = Query(1, ge=1, le=10),
    psa_max: int = Query(10, ge=1, le=10),
    x_user_id: Optional[str] = Header(None),
) -> List[dict]:
    pid = _current_profile_id(x_user_id)
    return list_sessions(profile_id=pid, limit=limit, search=search, sort=sort,
                         psa_min=psa_min, psa_max=psa_max)


@router.get("/history/{session_id}", response_model=AnalysisResult)
def get_history_entry(session_id: str,
                      x_user_id: Optional[str] = Header(None)) -> AnalysisResult:
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)
    result = load_result(session_id)
    if not result:
        raise HTTPException(404, "History entry not found.")
    return result


@router.delete("/history/{session_id}")
def delete_history_entry(session_id: str,
                         x_user_id: Optional[str] = Header(None)) -> dict:
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)
    delete_session(session_id)
    return {"status": "ok"}


@router.patch("/history/{session_id}")
def patch_history_notes(session_id: str, body: PatchNotesRequest,
                        x_user_id: Optional[str] = Header(None)) -> dict:
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)
    update_notes(session_id, body.notes)
    return {"status": "ok"}


@router.patch("/history/{session_id}/tags")
def patch_history_tags(session_id: str, body: PatchTagsRequest,
                       x_user_id: Optional[str] = Header(None)) -> dict:
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)
    update_tags(session_id, body.tags)
    return {"status": "ok"}


@router.get("/scan/{session_id}/{side}")
def get_scan(session_id: str, side: str,
             x_user_id: Optional[str] = Header(None)):
    """Return the original (compressed) upload for one side of a scan.
    Owner-only — protects raw photos from cross-user access."""
    if side not in ("front", "back"):
        raise HTTPException(404, "side must be front or back")
    pid = _current_profile_id(x_user_id)
    _assert_owns(session_id, pid)

    from glob import glob as _glob
    from backend.paths import get_uploads_dir
    matches = _glob(os.path.join(get_uploads_dir(), f"{session_id}_{side}.*"))
    if not matches:
        raise HTTPException(404, "scan not found")

    from fastapi.responses import FileResponse
    return FileResponse(
        matches[0],
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


# ── CSV Import / Preview ─────────────────────────────────────────────────────

from fastapi import UploadFile, File as FastAPIFile, Form


def _decode_csv(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def _csv_dialect_and_reader(text: str):
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return dialect, csv.DictReader(io.StringIO(text), dialect=dialect)


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


@router.post("/history/csv-preview")
async def csv_preview(
    file: UploadFile = FastAPIFile(...),
    x_user_id: Optional[str] = Header(None),
) -> dict:
    """Upload a CSV and get back detected headers + first 5 preview rows."""
    _current_profile_id(x_user_id)  # auth check only
    text = _decode_csv(await file.read())
    _, reader = _csv_dialect_and_reader(text)
    preview = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        preview.append(list(row.values()))
    return {"headers": reader.fieldnames or [], "preview": preview}


@router.post("/history/import-csv")
async def import_csv(
    file: UploadFile = FastAPIFile(...),
    mapping: str = Form('{"name_col":"name","set_col":"set"}'),
    x_user_id: Optional[str] = Header(None),
) -> ImportResult:
    """Import unanalysed cards from a CSV file.

    `mapping` is a JSON string with optional column-name overrides:
      { "name_col": "...", "set_col": "...", "qty_col": "...",
        "lang_col": "...", "condition_col": "..." }
    """
    import json, uuid
    pid = _current_profile_id(x_user_id)

    try:
        m = json.loads(mapping)
    except Exception:
        m = {}

    name_col      = m.get("name_col") or "name"
    set_col       = m.get("set_col")  or "set"
    qty_col       = m.get("qty_col")  or None
    lang_col      = m.get("lang_col") or None
    condition_col = m.get("condition_col") or None

    text = _decode_csv(await file.read())
    _, reader = _csv_dialect_and_reader(text)
    imported, skipped, errors = 0, 0, []

    from backend.db.history import save_unanalysed

    for row in reader:
        name = (row.get(name_col) or "").strip()
        if not name:
            skipped += 1
            continue

        set_name  = (row.get(set_col) or "").strip() if set_col else ""
        lang      = (row.get(lang_col) or "").strip() if lang_col else ""
        condition = (row.get(condition_col) or "").strip() if condition_col else ""
        qty_raw   = (row.get(qty_col) or "1").strip() if qty_col else "1"
        try:
            qty = max(1, int(float(qty_raw)))
        except Exception:
            qty = 1

        notes_parts = []
        if lang:      notes_parts.append(f"lang:{lang}")
        if condition: notes_parts.append(f"condition:{condition}")
        notes = ", ".join(notes_parts)

        for _ in range(min(qty, 20)):  # cap per-row duplicates at 20
            session_id = str(uuid.uuid4())
            try:
                save_unanalysed(session_id, name, set_name, profile_id=pid)
                if notes:
                    from backend.db.history import update_notes
                    update_notes(session_id, notes)
                imported += 1
            except Exception as e:
                errors.append(str(e))
            if imported >= 500:
                break
        if imported >= 500:
            break

    return ImportResult(imported=imported, skipped=skipped, errors=errors)
