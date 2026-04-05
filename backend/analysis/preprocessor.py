"""
Stage 0: Image preprocessing.
- Load image, read/estimate DPI, normalize to WORKING_DPI
- Detect card boundary via 3-mode contour detection (dark / light / adaptive)
- Apply perspective correction
- Extract sub-regions for downstream analyzers
"""
from dataclasses import dataclass, field
from typing import Optional, Tuple, List
import numpy as np
import cv2

from backend.config import (
    WORKING_DPI, CARD_ASPECT_RATIO, ASPECT_RATIO_TOLERANCE,
    CORNER_REGION_SIZE, EDGE_STRIP_WIDTH, SURFACE_INSET,
)
from backend.utils.image_io import (
    load_image_cv2, read_dpi, estimate_dpi_from_card, normalize_to_working_dpi,
)


@dataclass
class CardRegions:
    """All sub-regions extracted from the corrected card image."""
    card: np.ndarray                        # Full perspective-corrected card (BGR)
    gray: np.ndarray                        # Grayscale version
    corner_tl: np.ndarray                   # Top-left corner crop
    corner_tr: np.ndarray                   # Top-right corner crop
    corner_bl: np.ndarray                   # Bottom-left corner crop
    corner_br: np.ndarray                   # Bottom-right corner crop
    edge_top: np.ndarray                    # Top edge strip
    edge_bottom: np.ndarray
    edge_left: np.ndarray
    edge_right: np.ndarray
    surface: np.ndarray                     # Inner surface region
    card_h: int
    card_w: int
    corner_size: int
    edge_thickness_h: int                   # Edge strip thickness along height
    edge_thickness_w: int                   # Edge strip thickness along width


@dataclass
class PreprocessResult:
    regions: Optional[CardRegions] = None
    dpi_used: int = WORKING_DPI
    card_detected: bool = False
    detection_method: str = "fallback"      # "dark", "light", "adaptive", "fallback"
    error: Optional[str] = None
    original: Optional[np.ndarray] = None  # Original loaded image (not warped)


def preprocess(file_path: str) -> PreprocessResult:
    """
    Full preprocessing pipeline for a single card image.
    Returns PreprocessResult with regions or error.
    """
    # 1. Load image
    img = load_image_cv2(file_path)
    if img is None:
        return PreprocessResult(error="Could not load image file.")

    # 2. Determine DPI and normalize
    dpi = read_dpi(file_path) or estimate_dpi_from_card(img) or WORKING_DPI
    img = normalize_to_working_dpi(img, dpi)

    # 3. Detect card and apply perspective correction (3-mode)
    warped, detected, method = _detect_and_warp(img)

    if not detected or warped is None:
        warped = _fallback_crop(img)
        method = "fallback"

    # 4. Resize warped card to standard internal size
    card_w_px = int(WORKING_DPI * 2.5)  # 2.5 inches at WORKING_DPI
    card_h_px = int(WORKING_DPI * 3.5)  # 3.5 inches at WORKING_DPI
    warped = cv2.resize(warped, (card_w_px, card_h_px), interpolation=cv2.INTER_LANCZOS4)

    # 5. Extract sub-regions
    regions = _extract_regions(warped)

    return PreprocessResult(
        regions=regions,
        dpi_used=dpi,
        card_detected=detected,
        detection_method=method,
        original=img,
    )


def _detect_and_warp(img: np.ndarray) -> Tuple[Optional[np.ndarray], bool, str]:
    """
    Try 3 detection modes in sequence, return the first success.
    Returns (warped_image, success_flag, method_name).
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (7, 7), 0)

    # Mode 1: Dark background — standard Canny on grayscale
    result = _try_canny(img, blurred, low=30, high=120)
    if result is not None:
        return result, True, "dark"

    # Mode 2: Light/white background — invert image then Canny
    # On a white platen, the card is darker than the background.
    # Inverting makes the card bright and background dark → same pipeline applies.
    inverted = cv2.bitwise_not(blurred)
    result = _try_canny(img, inverted, low=30, high=120)
    if result is not None:
        return result, True, "light"

    # Mode 3: Adaptive threshold — works on grey/mixed backgrounds
    # Produces a binary image regardless of global illumination.
    adaptive = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, blockSize=51, C=10
    )
    result = _try_contours(img, adaptive)
    if result is not None:
        return result, True, "adaptive"

    return None, False, "fallback"


def _try_canny(img: np.ndarray, processed: np.ndarray,
               low: int, high: int) -> Optional[np.ndarray]:
    """Run Canny edge detection and attempt to find a valid card contour."""
    edges = cv2.Canny(processed, low, high)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)
    return _try_contours(img, edges)


def _try_contours(img: np.ndarray, binary: np.ndarray) -> Optional[np.ndarray]:
    """
    Find the largest 4-sided contour with card-like aspect ratio.
    Returns warped card image or None.
    """
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contours = sorted(contours, key=cv2.contourArea, reverse=True)
    img_area = img.shape[0] * img.shape[1]

    # First pass: strict 4-sided polygon with correct aspect ratio
    for cnt in contours[:8]:
        if cv2.contourArea(cnt) < img_area * 0.10:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            rect = cv2.minAreaRect(pts)
            rw, rh = rect[1]
            if rw == 0 or rh == 0:
                continue
            aspect = max(rw, rh) / min(rw, rh)
            if abs(aspect - CARD_ASPECT_RATIO) <= ASPECT_RATIO_TOLERANCE:
                return _four_point_transform(img, pts)

    # Second pass: relaxed — largest contour, looser polygon approximation
    for cnt in contours[:3]:
        if cv2.contourArea(cnt) < img_area * 0.10:
            continue
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            return _four_point_transform(img, pts)

    return None


def _four_point_transform(img: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """Apply perspective transform given 4 corner points."""
    rect = _order_points(pts)
    tl, tr, br, bl = rect

    w_top = np.linalg.norm(tr - tl)
    w_bot = np.linalg.norm(br - bl)
    h_left = np.linalg.norm(bl - tl)
    h_right = np.linalg.norm(br - tr)
    max_w = int(max(w_top, w_bot))
    max_h = int(max(h_left, h_right))

    if max_w < 10 or max_h < 10:
        return img  # degenerate contour

    dst = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1],
    ], dtype=np.float32)

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(img, M, (max_w, max_h))


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _fallback_crop(img: np.ndarray) -> np.ndarray:
    """If no card found, return the center 90% of the image as the card."""
    h, w = img.shape[:2]
    margin_y = int(h * 0.05)
    margin_x = int(w * 0.05)
    return img[margin_y:h - margin_y, margin_x:w - margin_x]


def _extract_regions(card: np.ndarray) -> CardRegions:
    """Carve out corner, edge, and surface sub-regions from a corrected card image."""
    h, w = card.shape[:2]
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)

    cs = int(w * CORNER_REGION_SIZE)
    et_w = int(w * EDGE_STRIP_WIDTH)
    et_h = int(h * EDGE_STRIP_WIDTH)
    si = int(min(h, w) * SURFACE_INSET)

    corner_tl = card[0:cs, 0:cs]
    corner_tr = card[0:cs, w - cs:w]
    corner_bl = card[h - cs:h, 0:cs]
    corner_br = card[h - cs:h, w - cs:w]

    edge_top    = card[0:et_h, :]
    edge_bottom = card[h - et_h:h, :]
    edge_left   = card[:, 0:et_w]
    edge_right  = card[:, w - et_w:w]

    surface = card[si:h - si, si:w - si]

    return CardRegions(
        card=card,
        gray=gray,
        corner_tl=corner_tl,
        corner_tr=corner_tr,
        corner_bl=corner_bl,
        corner_br=corner_br,
        edge_top=edge_top,
        edge_bottom=edge_bottom,
        edge_left=edge_left,
        edge_right=edge_right,
        surface=surface,
        card_h=h,
        card_w=w,
        corner_size=cs,
        edge_thickness_h=et_h,
        edge_thickness_w=et_w,
    )
