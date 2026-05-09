"""
POST /api/upload — Accept front and back card scan images.
"""
import uuid
import os
from typing import Optional

from fastapi import APIRouter, File, UploadFile, HTTPException

from backend.models.response import UploadResponse
from backend.utils.image_io import (
    validate_extension, validate_size, save_upload,
    read_dpi, load_image_cv2, estimate_dpi_from_card,
)
from backend.config import MIN_DPI_WARNING

router = APIRouter()

from backend.paths import get_uploads_dir
UPLOADS_DIR = get_uploads_dir()


@router.post("/upload", response_model=UploadResponse)
async def upload_images(
    front: UploadFile = File(...),
    back: Optional[UploadFile] = File(None),
):
    session_id = str(uuid.uuid4())
    warnings: list[str] = []

    # --- Validate front ---
    if not validate_extension(front.filename or ""):
        raise HTTPException(400, "Front image: unsupported file type. Use TIFF, PNG, or JPEG.")

    front_bytes = await front.read()
    if not validate_size(front_bytes):
        raise HTTPException(413, "Front image exceeds maximum allowed size.")

    front_path = os.path.join(UPLOADS_DIR, f"{session_id}_front{_ext(front.filename)}")
    save_upload(front_bytes, front_path)
    front_dpi = _get_dpi(front_path)
    # Re-encode AFTER measuring DPI so compression doesn't strip the metadata
    # we use for the analysis-quality warning.
    _compress_in_place(front_path)
    if front_dpi and front_dpi < MIN_DPI_WARNING:
        warnings.append(
            f"Front scan appears to be {front_dpi} DPI. "
            f"Results may be less accurate below {MIN_DPI_WARNING} DPI."
        )

    back_saved = False
    back_dpi = None

    if back and back.filename:
        if not validate_extension(back.filename):
            raise HTTPException(400, "Back image: unsupported file type. Use TIFF, PNG, or JPEG.")

        back_bytes = await back.read()
        if not validate_size(back_bytes):
            raise HTTPException(413, "Back image exceeds maximum allowed size.")

        back_path = os.path.join(UPLOADS_DIR, f"{session_id}_back{_ext(back.filename)}")
        save_upload(back_bytes, back_path)
        back_saved = True

        back_dpi = _get_dpi(back_path)
        _compress_in_place(back_path)
        if back_dpi and back_dpi < MIN_DPI_WARNING:
            warnings.append(
                f"Back scan appears to be {back_dpi} DPI. "
                f"Results may be less accurate below {MIN_DPI_WARNING} DPI."
            )

    return UploadResponse(
        session_id=session_id,
        front_saved=True,
        back_saved=back_saved,
        front_dpi_estimate=front_dpi,
        back_dpi_estimate=back_dpi,
        warnings=warnings,
    )


def _ext(filename: Optional[str]) -> str:
    if not filename:
        return ".jpg"
    return os.path.splitext(filename)[1].lower() or ".jpg"


# ── Compression target: long edge ≤ 1600 px, JPEG quality 82 ────────────────
# Keeps detail sharp enough for centering / corner analysis while shrinking
# typical 4-MB phone uploads down to 100-200 KB. Matches what we display in
# the editor + collection at full size — no perceived quality loss.
MAX_LONG_EDGE_PX = 1600
JPEG_QUALITY = 82


def _compress_in_place(path: str) -> None:
    """Re-encode an upload as JPEG with bounded dimensions + quality.

    Best-effort: any failure leaves the original file untouched.
    """
    try:
        import cv2
        import numpy as np
        img = cv2.imread(path)
        if img is None:
            return
        h, w = img.shape[:2]
        long_edge = max(h, w)
        if long_edge > MAX_LONG_EDGE_PX:
            scale = MAX_LONG_EDGE_PX / float(long_edge)
            new_w, new_h = int(round(w * scale)), int(round(h * scale))
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)

        # Always re-encode to JPEG, regardless of original extension.
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        if not ok:
            return

        # Replace the file's contents in place. We keep the original path
        # (and extension) so analyze.py / lookup.py keep finding it.
        with open(path, "wb") as f:
            f.write(buf.tobytes())
    except Exception:
        # Compression is a soft optimization — never block an upload over it.
        pass


def _get_dpi(path: str) -> Optional[int]:
    dpi = read_dpi(path)
    if dpi:
        return dpi
    img = load_image_cv2(path)
    if img is not None:
        return estimate_dpi_from_card(img)
    return None
