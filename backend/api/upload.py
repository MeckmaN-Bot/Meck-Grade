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

UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


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


def _get_dpi(path: str) -> Optional[int]:
    dpi = read_dpi(path)
    if dpi:
        return dpi
    img = load_image_cv2(path)
    if img is not None:
        return estimate_dpi_from_card(img)
    return None
