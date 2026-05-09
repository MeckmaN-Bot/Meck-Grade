"""
Stage 2: Corner analysis.
For each of the 4 corners, detects:
  - Whitening (exposed core material at the tip)
  - Rounding (loss of sharp 90° angle)
  - Angle deviation from 90°
Returns a per-corner score (0-100) and the overall score = worst corner.
"""
from dataclasses import dataclass
from typing import List, Tuple
import numpy as np
import cv2

from backend.analysis.preprocessor import CardRegions


@dataclass
class SingleCornerResult:
    position: str
    whitening_ratio: float
    sharpness_score: float
    angle_deviation: float
    corner_score: float
    radius_mm: float = 0.0
    radius_match: float = 0.0
    crop_b64: str = ""
    crop_w: int = 0
    crop_h: int = 0
    measured_radius_px: float = 0.0
    expected_radius_px: float = 0.0
    whitening_mask_b64: str = ""
    pen_whitening: float = 0.0
    pen_sharpness: float = 0.0
    pen_angle: float = 0.0
    pen_radius: float = 0.0
    whitening_unreliable: bool = False  # True = white border / can't detect


@dataclass
class CornerResult:
    corners: List[SingleCornerResult]
    corner_score: float


# Modern Pokémon TCG corner radius spec ≈ 3.0 mm; tolerate 2.5 – 3.5 mm.
EXPECTED_RADIUS_MM = 3.0
RADIUS_TOLERANCE_MM = 0.6


def analyze_corners(regions: CardRegions) -> CornerResult:
    """
    Analyze the four corners of the warped card.

    `regions.corner_*` contains the corner crops *inside* the warped card
    rectangle.  Because the original card has rounded corners, the actual
    corner of each crop shows photo background where the card's rounded
    edge cut into the perfect rectangle — that gives us the silhouette
    we can fit a circle to.
    """
    pixels_per_mm = (regions.card_w / 63.0 + regions.card_h / 88.0) / 2.0

    crops = [
        ("top_left",     regions.corner_tl),
        ("top_right",    regions.corner_tr),
        ("bottom_left",  regions.corner_bl),
        ("bottom_right", regions.corner_br),
    ]

    results: List[SingleCornerResult] = []
    for pos, crop in crops:
        r = _analyze_single_corner(pos, crop, pixels_per_mm)
        results.append(r)

    worst_score = min(r.corner_score for r in results)
    return CornerResult(corners=results, corner_score=round(worst_score, 2))


def _analyze_single_corner(
    position: str, crop: np.ndarray, pixels_per_mm: float = 0.0
) -> SingleCornerResult:
    if crop.size == 0:
        return SingleCornerResult(
            position=position,
            whitening_ratio=0.0,
            sharpness_score=100.0,
            angle_deviation=0.0,
            corner_score=100.0,
        )

    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop.copy()
    h, w = gray.shape

    # --- Whitening detection (border-band reference + saturation gate) ---
    whitening_ratio, whitening_hot_mask, whitening_reliable = _measure_whitening(
        gray, crop, position
    )

    # --- Sharpness / rounding detection via Canny edge lines ---
    edges = cv2.Canny(gray, 40, 120)
    edge_pts = np.column_stack(np.where(edges > 0))  # (y, x)

    angle_deviation = 0.0
    sharpness_score = 100.0

    if len(edge_pts) >= 10:
        # Split points into two halves (horizontal vs vertical edge)
        ys, xs = edge_pts[:, 0], edge_pts[:, 1]
        # Use kmeans-like split by dominant axis
        angle_deviation, sharpness_score = _measure_corner_sharpness(xs, ys, h, w, position)

    # --- Corner-radius detection ---
    radius_mm, radius_match, measured_radius_px = _measure_corner_radius(
        gray, position, pixels_per_mm
    )
    expected_radius_px = pixels_per_mm * EXPECTED_RADIUS_MM if pixels_per_mm > 0 else 0.0

    # --- Combine into corner score ---
    # When whitening detection is unreliable (white border / dark crop / etc.)
    # we skip the penalty entirely. Otherwise: 0 % below 5 %, soft ramp to 25 %.
    if not whitening_reliable or whitening_ratio < 0.05:
        whitening_penalty = 0.0
    else:
        whitening_penalty = min(1.0, (whitening_ratio - 0.05) / 0.20) * 40
    angle_penalty = min(angle_deviation / 10.0, 1.0) * 25
    sharpness_penalty = (100 - sharpness_score) * 0.15
    radius_penalty = (100.0 - radius_match) * 0.20

    corner_score = 100.0 - whitening_penalty - angle_penalty - sharpness_penalty - radius_penalty
    corner_score = max(0.0, min(100.0, corner_score))

    # ── Build visualisation payload ──────────────────────────────────────
    crop_b64 = _encode_jpeg(crop)
    mask_b64 = _encode_alpha_mask(whitening_hot_mask)

    return SingleCornerResult(
        position=position,
        whitening_ratio=round(float(whitening_ratio), 4),
        sharpness_score=round(float(sharpness_score), 2),
        angle_deviation=round(float(angle_deviation), 2),
        corner_score=round(float(corner_score), 2),
        radius_mm=round(float(radius_mm), 2),
        radius_match=round(float(radius_match), 2),
        crop_b64=crop_b64,
        crop_w=int(w),
        crop_h=int(h),
        measured_radius_px=round(float(measured_radius_px), 2),
        expected_radius_px=round(float(expected_radius_px), 2),
        whitening_mask_b64=mask_b64,
        pen_whitening=round(float(whitening_penalty), 2),
        pen_sharpness=round(float(sharpness_penalty), 2),
        pen_angle=round(float(angle_penalty), 2),
        pen_radius=round(float(radius_penalty), 2),
        whitening_unreliable=bool(not whitening_reliable),
    )


def _encode_jpeg(img: np.ndarray) -> str:
    if img is None or img.size == 0:
        return ""
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 82])
    if not ok:
        return ""
    import base64
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _encode_alpha_mask(mask: np.ndarray) -> str:
    """Encode a binary mask as a transparent-background PNG (white pixels visible)."""
    if mask is None or mask.size == 0 or int(mask.max()) == 0:
        return ""
    h, w = mask.shape[:2]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = 255  # R
    rgba[..., 1] = 220  # G
    rgba[..., 2] = 100  # B (warm yellow highlight)
    rgba[..., 3] = mask
    ok, buf = cv2.imencode(".png", rgba)
    if not ok:
        return ""
    import base64
    return base64.b64encode(buf.tobytes()).decode("ascii")


def _measure_corner_radius(
    gray: np.ndarray, position: str, pixels_per_mm: float
) -> tuple:
    """
    Detect the actual corner-radius arc by finding the card silhouette
    near the corner and fitting a circle.

    The crop is taken from inside the warped card image; its real corner
    sits at one of (0,0), (0,W), (H,0), (H,W).  Where the original card
    was rounded, photo background bleeds into the warped rectangle near
    that apex — usually visibly darker than the (white) card border.
    Threshold → contour → circle fit.

    Returns: (radius_mm, match_pct, radius_px_in_crop).
    """
    if pixels_per_mm <= 0 or gray.size == 0:
        return 0.0, 0.0, 0.0

    h, w = gray.shape

    # Use the inner ~50% of the crop nearest the apex — the rest may
    # contain card art that confuses the threshold.
    region = max(int(min(h, w) * 0.6), 12)
    if position == "top_left":
        roi = gray[0:region, 0:region]
        apex = (0, 0)
    elif position == "top_right":
        roi = gray[0:region, w - region:w]
        apex = (0, region - 1)
    elif position == "bottom_left":
        roi = gray[h - region:h, 0:region]
        apex = (region - 1, 0)
    else:
        roi = gray[h - region:h, w - region:w]
        apex = (region - 1, region - 1)

    # Card border is bright white; the rounded-corner cutout shows darker
    # background.  Otsu threshold on the roi — invert so card = 255.
    _, mask = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(np.mean(mask)) < 127:
        mask = 255 - mask  # ensure card = bright

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return 0.0, 0.0, 0.0
    cnt = max(cnts, key=cv2.contourArea)
    if len(cnt) < 8:
        return 0.0, 0.0, 0.0

    pts = cnt.reshape(-1, 2).astype(np.float32)
    apex_xy = np.array([apex[1], apex[0]], dtype=np.float32)
    dists = np.linalg.norm(pts - apex_xy, axis=1)
    near = pts[dists <= region * 0.85]
    if len(near) < 6:
        return 0.0, 0.0, 0.0

    radius_px = _fit_circle_radius(near)
    if radius_px <= 0:
        return 0.0, 0.0, 0.0

    radius_mm = float(radius_px / pixels_per_mm)
    # Match: 100 inside ±tolerance of expected, drops linearly outside.
    diff = abs(radius_mm - EXPECTED_RADIUS_MM)
    if diff <= RADIUS_TOLERANCE_MM:
        match = 100.0 - (diff / RADIUS_TOLERANCE_MM) * 15.0
    else:
        excess = diff - RADIUS_TOLERANCE_MM
        match = max(0.0, 85.0 - excess / 1.5 * 100.0)
    return radius_mm, match, float(radius_px)


def _fit_circle_radius(pts: np.ndarray) -> float:
    """Algebraic least-squares circle fit. Returns radius in pixels."""
    x = pts[:, 0]
    y = pts[:, 1]
    A = np.column_stack([2 * x, 2 * y, np.ones(len(x))]).astype(np.float64)
    b = (x ** 2 + y ** 2).astype(np.float64)
    try:
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return 0.0
    cx, cy, c = sol
    r2 = c + cx * cx + cy * cy
    if r2 <= 0:
        return 0.0
    return float(np.sqrt(r2))


def _measure_whitening(
    gray: np.ndarray,
    color: np.ndarray,
    position: str,
):
    """
    Detect corner whitening = paper core showing through near the card tip.

    Algorithm (v3):
      1. Verify a card↔background boundary is detectable in the crop:
         the apex pixel must differ from the crop median by ≥ 25 grey levels.
         Otherwise (low-contrast / white-on-white photo) → bail (unreliable).
      2. Build a `bg_mask` by flood-filling from the apex pixel.  Pixels in
         that connected blob are background bleed from the rounded-corner
         cutout — not card.
      3. Sample the card-border colour from on-card pixels close to the apex
         (the actual rim of the card).  Median brightness + saturation here
         ARE the card border.
      4. If the card border is itself near-white (ref_brightness > 235),
         single-image whitening detection is unreliable → bail.
      5. Otherwise: hot pixels = on-card tip pixels that are brighter AND
         less saturated than the card-border reference.
    """
    h, w = gray.shape
    empty = np.zeros_like(gray, dtype=np.uint8)

    apex_yx = {
        "top_left":     (0, 0),
        "top_right":    (0, w - 1),
        "bottom_left":  (h - 1, 0),
        "bottom_right": (h - 1, w - 1),
    }.get(position, (0, 0))

    apex_val = int(gray[apex_yx[0], apex_yx[1]])
    crop_median = float(np.median(gray))

    # --- 1. Boundary detectability ----------------------------------------
    if abs(apex_val - crop_median) < 25:
        return 0.0, empty, False

    # --- 2. Flood-fill bg from apex ---------------------------------------
    ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    cv2.floodFill(
        gray.copy(), ff_mask,
        (int(apex_yx[1]), int(apex_yx[0])),
        newVal=0, loDiff=18, upDiff=18,
        flags=cv2.FLOODFILL_MASK_ONLY | (255 << 8),
    )
    bg_mask = ff_mask[1:-1, 1:-1] > 0
    bg_coverage = float(bg_mask.mean())
    if bg_coverage < 0.005 or bg_coverage > 0.55:
        # Either no real bg blob, or flood ate too much → unsafe.
        return 0.0, empty, False

    on_card = ~bg_mask

    # --- 3. Card-border reference -----------------------------------------
    # Sample on-card pixels that are CLOSE to the apex region (= the card
    # border, the actual rim — not the card art further inside).
    tip_size = max(int(min(h, w) * 0.30), 5)
    tip_geom = _corner_tip_mask(h, w, position, tip_size)
    tip_ext  = _corner_tip_mask(h, w, position, int(tip_size * 1.6))

    border_zone = on_card & (tip_ext > 0) & (tip_geom == 0)
    if int(border_zone.sum()) < 30:
        border_zone = on_card & (tip_ext > 0)

    # If the bg flood ate most of the card-border zone (border + bg are both
    # similar tone — white bg + white border), we can't sample a reliable
    # reference here.  Bail.
    tip_ext_total = int((tip_ext > 0).sum())
    if tip_ext_total > 0 and int(border_zone.sum()) < 0.35 * tip_ext_total:
        return 0.0, empty, False
    if int(border_zone.sum()) < 20:
        return 0.0, empty, False

    ref_brightness = float(np.median(gray[border_zone]))

    # --- 4. White card border → bail --------------------------------------
    if ref_brightness > 235.0:
        return 0.0, empty, False
    # Black/very-dark border (rare; e.g. 1st-edition Charizard back) — current
    # algorithm can't reliably distinguish either.
    if ref_brightness < 50.0:
        return 0.0, empty, False

    # --- 5. Hot pixels ----------------------------------------------------
    if len(color.shape) == 3:
        hsv = cv2.cvtColor(color, cv2.COLOR_BGR2HSV)
        sat = hsv[..., 1]
        ref_sat = float(np.median(sat[border_zone]))
    else:
        sat = np.zeros_like(gray)
        ref_sat = 30.0

    bright_thresh = min(ref_brightness + 22.0, 250.0)
    sat_thresh = max(10.0, ref_sat * 0.55)

    is_bright = gray > bright_thresh
    is_low_sat = sat < sat_thresh
    on_card_tip = on_card & (tip_geom > 0)
    hot = is_bright & is_low_sat & on_card_tip

    hot_mask = (hot.astype(np.uint8)) * 255
    on_tip = int(on_card_tip.sum())
    if on_tip < 15:
        return 0.0, hot_mask, False
    return float(int(hot.sum())) / float(on_tip), hot_mask, True


def _corner_tip_mask(h: int, w: int, position: str, tip_size: int) -> np.ndarray:
    """Create a triangular mask at the corner tip."""
    mask = np.zeros((h, w), dtype=np.uint8)
    ts = tip_size

    if position == "top_left":
        pts = np.array([[0, 0], [ts, 0], [0, ts]], np.int32)
    elif position == "top_right":
        pts = np.array([[w - 1, 0], [w - 1 - ts, 0], [w - 1, ts]], np.int32)
    elif position == "bottom_left":
        pts = np.array([[0, h - 1], [ts, h - 1], [0, h - 1 - ts]], np.int32)
    else:  # bottom_right
        pts = np.array([[w - 1, h - 1], [w - 1 - ts, h - 1], [w - 1, h - 1 - ts]], np.int32)

    cv2.fillPoly(mask, [pts], 255)
    return mask


def _measure_corner_sharpness(
    xs: np.ndarray, ys: np.ndarray, h: int, w: int, position: str
) -> Tuple[float, float]:
    """
    Fit two lines to the corner edges and measure:
    - Their intersection angle deviation from 90°
    - The overall sharpness (inverse of residuals)
    Returns (angle_deviation_degrees, sharpness_score_0_100).
    """
    try:
        # Separate edge points into two groups based on dominant direction
        mid_y, mid_x = h // 2, w // 2

        if position in ("top_left", "bottom_left"):
            # Horizontal edge: low y or high y; Vertical edge: low x
            h_pts = np.column_stack([xs[ys < mid_y], ys[ys < mid_y]]) if position == "top_left" \
                    else np.column_stack([xs[ys > mid_y], ys[ys > mid_y]])
            v_pts = np.column_stack([xs[xs < mid_x], ys[xs < mid_x]])
        else:
            h_pts = np.column_stack([xs[ys < mid_y], ys[ys < mid_y]]) if position == "top_right" \
                    else np.column_stack([xs[ys > mid_y], ys[ys > mid_y]])
            v_pts = np.column_stack([xs[xs > mid_x], ys[xs > mid_x]])

        if len(h_pts) < 5 or len(v_pts) < 5:
            return 0.0, 85.0

        # Fit lines to each group
        [vx1, vy1, _, _] = cv2.fitLine(h_pts.reshape(-1, 1, 2).astype(np.float32),
                                        cv2.DIST_L2, 0, 0.01, 0.01)
        [vx2, vy2, _, _] = cv2.fitLine(v_pts.reshape(-1, 1, 2).astype(np.float32),
                                        cv2.DIST_L2, 0, 0.01, 0.01)

        angle1 = float(np.degrees(np.arctan2(float(vy1), float(vx1))))
        angle2 = float(np.degrees(np.arctan2(float(vy2), float(vx2))))
        angle_between = abs(angle1 - angle2)
        # Normalise to 0-90 range
        while angle_between > 90:
            angle_between = abs(angle_between - 180)
        angle_deviation = abs(90.0 - angle_between)

        # Sharpness: based on how cleanly edge pixels fall on the fitted lines
        residuals_h = np.std(h_pts[:, 1].astype(float) if True else h_pts[:, 0])
        residuals_v = np.std(v_pts[:, 0].astype(float))
        avg_residual = (float(residuals_h) + float(residuals_v)) / 2.0
        sharpness = max(0.0, 100.0 - avg_residual * 3.0)

        return angle_deviation, sharpness

    except Exception:
        return 0.0, 85.0
