"""
Card name extraction from the scan image.
Tries two approaches in order:
  1. pytesseract OCR on the card name region (top strip above artwork)
  2. If pytesseract is unavailable, returns an empty string (lookup skipped)
"""
from typing import Optional
import numpy as np
import cv2


def extract_card_name(card_img: np.ndarray) -> str:
    """
    Attempt to read the card name from the top name-bar region of a
    perspective-corrected card image (BGR, standard TCG proportions).
    Returns the cleaned name string, or "" if extraction fails.
    """
    try:
        import pytesseract
    except ImportError:
        return ""  # pytesseract not installed — lookup will be skipped

    if card_img is None or card_img.size == 0:
        return ""

    h, w = card_img.shape[:2]

    # Name bar: approximately the top 8–12% of the card, full width
    # Slightly inset horizontally to avoid the border edge noise
    inset_x = int(w * 0.05)
    name_strip = card_img[
        int(h * 0.03): int(h * 0.11),
        inset_x: w - inset_x,
    ]

    if name_strip.size == 0:
        return ""

    # Pre-process: grayscale, upscale, threshold for OCR
    gray = cv2.cvtColor(name_strip, cv2.COLOR_BGR2GRAY)
    # Scale up 3× for better OCR accuracy on small text
    upscaled = cv2.resize(gray, (gray.shape[1] * 3, gray.shape[0] * 3),
                          interpolation=cv2.INTER_CUBIC)
    # Adaptive threshold for variable background colors
    binary = cv2.adaptiveThreshold(
        upscaled, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10
    )

    config = "--psm 7 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -"

    try:
        text = pytesseract.image_to_string(binary, config=config).strip()
        return _clean_name(text)
    except Exception:
        return ""


def _clean_name(raw: str) -> str:
    """Remove noise characters and normalise spacing."""
    import re
    # Keep alphanumeric, spaces, hyphens
    cleaned = re.sub(r"[^A-Za-z0-9 \-']", "", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned
