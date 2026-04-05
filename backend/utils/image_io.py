"""
Safe image read/write utilities with DPI extraction.
"""
import os
import base64
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from backend.config import ALLOWED_EXTENSIONS, MAX_UPLOAD_MB, WORKING_DPI, CARD_WIDTH_IN


def validate_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def validate_size(file_bytes: bytes) -> bool:
    return len(file_bytes) <= MAX_UPLOAD_MB * 1024 * 1024


def read_dpi(file_path: str) -> Optional[int]:
    """Read DPI from image metadata. Returns None if not available."""
    try:
        with Image.open(file_path) as img:
            info = img.info
            if "dpi" in info:
                dpi_val = info["dpi"]
                if isinstance(dpi_val, (tuple, list)):
                    return int(dpi_val[0])
                return int(dpi_val)
            # Try EXIF
            exif = img._getexif() if hasattr(img, "_getexif") else None
            if exif:
                # Tag 282 = XResolution
                x_res = exif.get(282)
                if x_res:
                    if isinstance(x_res, tuple):
                        return int(x_res[0] / x_res[1]) if x_res[1] else None
                    return int(x_res)
    except Exception:
        pass
    return None


def load_image_cv2(file_path: str) -> Optional[np.ndarray]:
    """Load image as OpenCV BGR array. Handles TIFF natively."""
    img = cv2.imread(file_path, cv2.IMREAD_COLOR)
    if img is None:
        # Fallback: load via Pillow and convert
        try:
            with Image.open(file_path) as pil_img:
                rgb = np.array(pil_img.convert("RGB"))
                img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        except Exception:
            return None
    return img


def estimate_dpi_from_card(img: np.ndarray) -> Optional[int]:
    """Estimate DPI based on detected card width in pixels."""
    h, w = img.shape[:2]
    # Assume the shorter dimension corresponds to card width (2.5 inches)
    short = min(h, w)
    estimated = int(short / CARD_WIDTH_IN)
    return estimated if estimated > 50 else None


def normalize_to_working_dpi(img: np.ndarray, source_dpi: int) -> np.ndarray:
    """Resize image so it matches WORKING_DPI resolution."""
    if source_dpi == WORKING_DPI:
        return img
    scale = WORKING_DPI / source_dpi
    new_w = int(img.shape[1] * scale)
    new_h = int(img.shape[0] * scale)
    interpolation = cv2.INTER_LANCZOS4 if scale > 1 else cv2.INTER_AREA
    return cv2.resize(img, (new_w, new_h), interpolation=interpolation)


def encode_image_b64(img: np.ndarray, quality: int = 85) -> str:
    """Encode OpenCV image to base64 JPEG string."""
    success, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not success:
        return ""
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def save_upload(file_bytes: bytes, dest_path: str) -> None:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(file_bytes)
