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
    position: str           # "top_left", "top_right", "bottom_left", "bottom_right"
    whitening_ratio: float  # 0-1, higher = more whitening damage
    sharpness_score: float  # 0-100, higher = sharper corner
    angle_deviation: float  # degrees from 90°
    corner_score: float     # 0-100


@dataclass
class CornerResult:
    corners: List[SingleCornerResult]
    corner_score: float     # 0-100, score of worst corner


def analyze_corners(regions: CardRegions) -> CornerResult:
    crops = [
        ("top_left",     regions.corner_tl),
        ("top_right",    regions.corner_tr),
        ("bottom_left",  regions.corner_bl),
        ("bottom_right", regions.corner_br),
    ]

    results: List[SingleCornerResult] = []
    for pos, crop in crops:
        r = _analyze_single_corner(pos, crop)
        results.append(r)

    worst_score = min(r.corner_score for r in results)
    return CornerResult(corners=results, corner_score=round(worst_score, 2))


def _analyze_single_corner(position: str, crop: np.ndarray) -> SingleCornerResult:
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

    # --- Whitening detection ---
    # Build a triangular mask covering the extreme tip of the corner
    tip_size = max(int(min(h, w) * 0.35), 5)
    tip_mask = _corner_tip_mask(h, w, position, tip_size)

    # Count "unexpectedly white" pixels in the tip region
    tip_pixels = gray[tip_mask > 0]
    if len(tip_pixels) == 0:
        whitening_ratio = 0.0
    else:
        # Pixels brighter than 230 in the tip are suspicious (whitening)
        white_count = np.sum(tip_pixels > 230)
        whitening_ratio = float(white_count) / len(tip_pixels)
        # Reduce false positives: if most of the crop is white (plain border), normalise
        overall_white = np.mean(gray > 230)
        whitening_ratio = max(0.0, whitening_ratio - overall_white * 0.6)

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

    # --- Combine into corner score ---
    # Whitening: 0% = no penalty, 50%+ = very bad
    whitening_penalty = min(whitening_ratio * 2, 1.0) * 50
    # Angle: 0° = no penalty, 10°+ = very bad
    angle_penalty = min(angle_deviation / 10.0, 1.0) * 30
    # Sharpness: 100 = perfect, lower = worse
    sharpness_penalty = (100 - sharpness_score) * 0.20

    corner_score = 100.0 - whitening_penalty - angle_penalty - sharpness_penalty
    corner_score = max(0.0, min(100.0, corner_score))

    return SingleCornerResult(
        position=position,
        whitening_ratio=round(float(whitening_ratio), 4),
        sharpness_score=round(float(sharpness_score), 2),
        angle_deviation=round(float(angle_deviation), 2),
        corner_score=round(float(corner_score), 2),
    )


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
