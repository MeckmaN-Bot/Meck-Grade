"""
Stage 1: Centering analysis.
Measures border widths on all 4 sides via intensity profiling,
computes L/R and T/B ratios, and returns a 0-100 centering score.
"""
from dataclasses import dataclass
import numpy as np
import cv2

from backend.analysis.preprocessor import CardRegions
from backend.config import PSA_10_CENTERING_FRONT, PSA_9_CENTERING_FRONT


@dataclass
class CenteringResult:
    left_px: int
    right_px: int
    top_px: int
    bottom_px: int
    lr_ratio: float      # larger / total  (0.5 = perfect centering)
    tb_ratio: float
    lr_percent: str      # human-readable, e.g. "55/45"
    tb_percent: str
    centering_score: float   # 0-100


def analyze_centering(regions: CardRegions, is_back: bool = False) -> CenteringResult:
    """
    Measure the white border widths on each side of the card and compute
    the centering score.
    """
    gray = regions.gray
    h, w = gray.shape

    left_px  = _find_border_width(gray, side="left")
    right_px = _find_border_width(gray, side="right")
    top_px   = _find_border_width(gray, side="top")
    bottom_px = _find_border_width(gray, side="bottom")

    # Clamp to sane values (at least 1 to avoid division by zero)
    left_px   = max(left_px, 1)
    right_px  = max(right_px, 1)
    top_px    = max(top_px, 1)
    bottom_px = max(bottom_px, 1)

    lr_total = left_px + right_px
    tb_total = top_px + bottom_px

    # Ratio = larger side / total  (0.5 = perfect)
    lr_ratio = max(left_px, right_px) / lr_total
    tb_ratio = max(top_px, bottom_px) / tb_total

    lr_left_pct  = round(left_px  / lr_total * 100)
    lr_right_pct = 100 - lr_left_pct
    tb_top_pct   = round(top_px   / tb_total * 100)
    tb_bot_pct   = 100 - tb_top_pct

    lr_percent = f"{max(lr_left_pct, lr_right_pct)}/{min(lr_left_pct, lr_right_pct)}"
    tb_percent = f"{max(tb_top_pct, tb_bot_pct)}/{min(tb_top_pct, tb_bot_pct)}"

    score = _compute_centering_score(lr_ratio, tb_ratio, is_back)

    return CenteringResult(
        left_px=left_px,
        right_px=right_px,
        top_px=top_px,
        bottom_px=bottom_px,
        lr_ratio=round(lr_ratio, 4),
        tb_ratio=round(tb_ratio, 4),
        lr_percent=lr_percent,
        tb_percent=tb_percent,
        centering_score=round(score, 2),
    )


def _find_border_width(gray: np.ndarray, side: str, white_threshold: int = 215) -> int:
    """
    Scan inward from the given side using an intensity profile.
    The border ends where the median row/column intensity drops below white_threshold.
    Returns border width in pixels.
    """
    h, w = gray.shape
    MAX_BORDER = int(min(h, w) * 0.30)  # border can't be more than 30% of dimension

    if side == "left":
        for x in range(MAX_BORDER):
            col = gray[:, x]
            if np.median(col) < white_threshold:
                return max(x - 1, 1)
        return MAX_BORDER

    elif side == "right":
        for x in range(MAX_BORDER):
            col = gray[:, w - 1 - x]
            if np.median(col) < white_threshold:
                return max(x - 1, 1)
        return MAX_BORDER

    elif side == "top":
        for y in range(MAX_BORDER):
            row = gray[y, :]
            if np.median(row) < white_threshold:
                return max(y - 1, 1)
        return MAX_BORDER

    elif side == "bottom":
        for y in range(MAX_BORDER):
            row = gray[h - 1 - y, :]
            if np.median(row) < white_threshold:
                return max(y - 1, 1)
        return MAX_BORDER

    return 1


def _compute_centering_score(lr_ratio: float, tb_ratio: float, is_back: bool) -> float:
    """
    Convert centering ratios to a 0-100 score.
    0.50 = perfect (100 points).
    Deductions increase non-linearly with deviation.
    """
    # Deviation from perfect (0.0 = perfect, 0.5 = maximally off-center)
    lr_dev = lr_ratio - 0.50   # 0.0 to 0.5
    tb_dev = tb_ratio - 0.50

    # Non-linear penalty: small deviations are less punishing
    # Penalty = (dev / 0.25)^2 * 50  →  max 50 pts deducted per axis
    lr_penalty = (lr_dev / 0.25) ** 1.5 * 50
    tb_penalty = (tb_dev / 0.25) ** 1.5 * 50

    score = 100.0 - lr_penalty - tb_penalty
    return max(0.0, min(100.0, score))
