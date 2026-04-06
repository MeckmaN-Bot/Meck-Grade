"""
Stage 3: Edge analysis.
For each of the 4 edges, detects:
  - Chips (sudden dips in edge intensity profile)
  - Fraying / fiber protrusions (perpendicular Sobel response)
  - Ink wear / whitening along the inner edge face
Returns a per-edge score (0-100) and the overall score = worst edge.
"""
from dataclasses import dataclass
from typing import List
import numpy as np
import cv2

from backend.analysis.preprocessor import CardRegions

try:
    from scipy.signal import find_peaks
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


@dataclass
class SingleEdgeResult:
    position: str           # "top", "bottom", "left", "right"
    chip_count: int
    fray_intensity: float   # 0-1, average Sobel response along edge
    whitening_ratio: float  # 0-1, fraction of inner edge pixels near white
    edge_score: float       # 0-100


@dataclass
class EdgeResult:
    edges: List[SingleEdgeResult]
    edge_score: float       # 0-100, score of worst edge


def analyze_edges(regions: CardRegions) -> EdgeResult:
    strips = [
        ("top",    regions.edge_top,    "horizontal"),
        ("bottom", regions.edge_bottom, "horizontal"),
        ("left",   regions.edge_left,   "vertical"),
        ("right",  regions.edge_right,  "vertical"),
    ]

    results: List[SingleEdgeResult] = []
    for pos, strip, orientation in strips:
        r = _analyze_single_edge(pos, strip, orientation)
        results.append(r)

    worst_score = min(r.edge_score for r in results)
    return EdgeResult(edges=results, edge_score=round(worst_score, 2))


def _analyze_single_edge(position: str, strip: np.ndarray, orientation: str) -> SingleEdgeResult:
    if strip.size == 0:
        return SingleEdgeResult(
            position=position, chip_count=0,
            fray_intensity=0.0, whitening_ratio=0.0, edge_score=100.0,
        )

    gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY) if len(strip.shape) == 3 else strip.copy()

    # Apply light denoise to suppress scanner noise
    gray = cv2.medianBlur(gray, 3)

    # --- 1D intensity profile along the edge length ---
    if orientation == "horizontal":
        # For top/bottom strips: average intensity along each column → 1D profile
        profile = np.mean(gray, axis=0).astype(float)
        # The outer edge row (background vs card edge)
        outer_row = gray[0, :]       # top strip: first row is outer
        inner_row = gray[-1, :]      # last row is inner (card art side)
        # Mid-strip reference: 10px-high band from the center of the strip
        mid_h = gray.shape[0]
        mid_ref = gray[max(0, mid_h // 2 - 5):min(mid_h, mid_h // 2 + 5), :]
    else:
        # For left/right strips: average intensity along each row
        profile = np.mean(gray, axis=1).astype(float)
        outer_row = gray[:, 0]
        inner_row = gray[:, -1]
        # Mid-strip reference: 10px-wide band from the center of the strip
        mid_w = gray.shape[1]
        mid_ref = gray[:, max(0, mid_w // 2 - 5):min(mid_w, mid_w // 2 + 5)]

    # --- Chip detection ---
    chip_count = _count_chips(profile)

    # --- Fray detection via Sobel perpendicular to edge ---
    fray_intensity = _measure_fray(gray, orientation)

    # --- Ink wear / whitening along inner face ---
    whitening_ratio = _measure_whitening(inner_row, mid_ref)

    # --- Combine into edge score ---
    chip_penalty      = min(chip_count * 15, 60)         # each chip costs 15 pts, max 60
    fray_penalty      = fray_intensity * 25               # 0-25 pts
    whitening_penalty = whitening_ratio * 20              # 0-20 pts

    edge_score = 100.0 - chip_penalty - fray_penalty - whitening_penalty
    edge_score = max(0.0, min(100.0, edge_score))

    return SingleEdgeResult(
        position=position,
        chip_count=chip_count,
        fray_intensity=round(float(fray_intensity), 4),
        whitening_ratio=round(float(whitening_ratio), 4),
        edge_score=round(float(edge_score), 2),
    )


def _count_chips(profile: np.ndarray) -> int:
    """
    Detect chips as sudden dips in the 1D intensity profile.
    A chip manifests as a local valley where the card edge is missing/chipped.
    """
    if len(profile) < 10:
        return 0

    if HAS_SCIPY:
        # Invert: chips = dips become peaks in -profile
        inverted = 255.0 - profile
        # Minimum prominence to count as a chip (avoid noise)
        prominence = max(15.0, np.std(profile) * 1.5)
        peaks, props = find_peaks(inverted, prominence=prominence, width=2, distance=10)
        return int(len(peaks))
    else:
        # Fallback: manual peak detection
        smoothed = np.convolve(profile, np.ones(5) / 5, mode="same")
        count = 0
        threshold = np.mean(smoothed) - np.std(smoothed) * 1.5
        in_dip = False
        for val in smoothed:
            if val < threshold:
                if not in_dip:
                    count += 1
                    in_dip = True
            else:
                in_dip = False
        return count


def _measure_fray(gray: np.ndarray, orientation: str) -> float:
    """
    Apply Sobel perpendicular to the edge to detect fraying.
    High perpendicular response = fibers sticking out.
    Returns a normalized 0-1 fraying intensity.
    """
    if orientation == "horizontal":
        # Perpendicular to horizontal edge = vertical Sobel
        sobel = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    else:
        # Perpendicular to vertical edge = horizontal Sobel
        sobel = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)

    magnitude = np.abs(sobel)
    # Focus on the outer half of the strip where fraying would appear
    h, w = magnitude.shape
    if orientation == "horizontal":
        outer = magnitude[:h // 2, :]
    else:
        outer = magnitude[:, :w // 2]

    avg = float(np.mean(outer))
    # Normalize: 0 = clean, 1 = heavily frayed (empirical max ~80)
    return min(avg / 80.0, 1.0)


def _measure_whitening(inner_row: np.ndarray, mid_reference: np.ndarray) -> float:
    """
    Measure ink wear along the inner edge face.
    Uses a mid-strip reference to derive an adaptive threshold, avoiding false
    positives on cards with naturally white borders.
    Returns 0-1.
    """
    if len(inner_row) == 0:
        return 0.0

    # Adaptive threshold: expected brightness from the mid-strip + 35, capped at 250
    expected = float(np.mean(mid_reference)) if mid_reference.size > 0 else 185.0
    whitening_threshold = min(expected + 35.0, 250.0)

    # Only count whitening pixels in the outer third of inner_row
    outer_len = max(len(inner_row) // 3, 1)
    outer_pixels = np.concatenate([inner_row[:outer_len], inner_row[-outer_len:]])
    white_pixels = np.sum(outer_pixels > whitening_threshold)
    ratio = float(white_pixels) / len(outer_pixels)
    # Normalise: some whiteness is expected; only excess is penalised
    return max(0.0, ratio - 0.3)
