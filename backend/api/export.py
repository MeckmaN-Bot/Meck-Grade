"""
GET /api/export/{session_id}/pdf — Download a PDF report for a session.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from backend.export.pdf import generate_pdf

router = APIRouter()


@router.get("/export/{session_id}/pdf")
def export_pdf(session_id: str) -> Response:
    # Load from history DB or in-memory cache
    result = _load_result(session_id)
    if result is None:
        raise HTTPException(404, "Session not found. Please analyze the card first.")

    try:
        pdf_bytes = generate_pdf(result)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")

    filename = f"meckgrade_{session_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _load_result(session_id: str):
    # Try in-memory cache first
    try:
        from backend.api.analyze import _cache
        if session_id in _cache:
            return _cache[session_id]
    except Exception:
        pass
    # Try history DB
    try:
        from backend.db.history import load_result
        return load_result(session_id)
    except Exception:
        pass
    return None
