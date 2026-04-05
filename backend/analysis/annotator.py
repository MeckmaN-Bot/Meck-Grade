"""
Stage 5: Visual annotator.
Draws colored overlays on the corrected card image to highlight:
  - Centering: blue measurement lines with ratio labels
  - Corners: color-coded bounding boxes (green/yellow/red)
  - Edges: colored highlights on problem edge segments
  - Surface: semi-transparent red heat map for defects
"""
import numpy as np
import cv2
from typing import Optional

from backend.analysis.preprocessor import CardRegions
from backend.analysis.centering import CenteringResult
from backend.analysis.corners import CornerResult
from backend.analysis.edges import EdgeResult
from backend.analysis.surface import SurfaceResult


# Color constants (BGR)
COLOR_BLUE   = (200, 100, 30)
COLOR_GREEN  = (50, 180, 50)
COLOR_YELLOW = (30, 180, 220)
COLOR_RED    = (50, 50, 220)
COLOR_WHITE  = (255, 255, 255)
COLOR_BLACK  = (0, 0, 0)

SCORE_THRESHOLDS = {"good": 85, "warn": 65}


def _score_color(score: float):
    if score >= SCORE_THRESHOLDS["good"]:
        return COLOR_GREEN
    elif score >= SCORE_THRESHOLDS["warn"]:
        return COLOR_YELLOW
    return COLOR_RED


def annotate(
    regions: CardRegions,
    centering: Optional[CenteringResult],
    corners: Optional[CornerResult],
    edges: Optional[EdgeResult],
    surface: Optional[SurfaceResult],
) -> np.ndarray:
    """
    Returns a copy of the card image with all analysis overlays applied.
    """
    img = regions.card.copy()
    h, w = img.shape[:2]

    if surface and surface.defect_map is not None:
        img = _overlay_surface_heatmap(img, surface.defect_map, regions)

    if centering:
        img = _draw_centering(img, centering, h, w)

    if edges:
        img = _draw_edges(img, edges, h, w)

    if corners:
        img = _draw_corners(img, corners, h, w, regions.corner_size)

    return img


def _overlay_surface_heatmap(
    img: np.ndarray, defect_map: np.ndarray, regions: CardRegions
) -> np.ndarray:
    """Overlay semi-transparent red heat map on the surface region."""
    h, w = img.shape[:2]
    si = regions.corner_size  # use corner_size as surface inset approximation

    if defect_map.max() == 0:
        return img

    # Resize defect map to match surface region
    surf_h = h - 2 * si
    surf_w = w - 2 * si
    if surf_h <= 0 or surf_w <= 0:
        return img

    dm_resized = cv2.resize(defect_map, (surf_w, surf_h), interpolation=cv2.INTER_LINEAR)

    # Create red channel overlay
    overlay = img.copy()
    red_mask = dm_resized > 20
    overlay[si:h - si, si:w - si][red_mask] = [30, 30, 200]  # BGR red

    # Blend
    alpha = 0.45
    img = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)
    return img


def _draw_centering(img: np.ndarray, c: CenteringResult, h: int, w: int) -> np.ndarray:
    """Draw border measurement lines and ratio text."""
    mid_y = h // 2
    mid_x = w // 2

    thickness = max(2, w // 400)
    font_scale = max(0.4, w / 2000)
    font = cv2.FONT_HERSHEY_SIMPLEX

    # Left border line
    cv2.line(img, (0, mid_y), (c.left_px, mid_y), COLOR_BLUE, thickness)
    cv2.line(img, (c.left_px, mid_y - 8), (c.left_px, mid_y + 8), COLOR_BLUE, thickness + 1)

    # Right border line
    cv2.line(img, (w, mid_y), (w - c.right_px, mid_y), COLOR_BLUE, thickness)
    cv2.line(img, (w - c.right_px, mid_y - 8), (w - c.right_px, mid_y + 8), COLOR_BLUE, thickness + 1)

    # Top border line
    cv2.line(img, (mid_x, 0), (mid_x, c.top_px), COLOR_BLUE, thickness)
    cv2.line(img, (mid_x - 8, c.top_px), (mid_x + 8, c.top_px), COLOR_BLUE, thickness + 1)

    # Bottom border line
    cv2.line(img, (mid_x, h), (mid_x, h - c.bottom_px), COLOR_BLUE, thickness)
    cv2.line(img, (mid_x - 8, h - c.bottom_px), (mid_x + 8, h - c.bottom_px), COLOR_BLUE, thickness + 1)

    # Labels
    _draw_label(img, c.lr_percent, (w // 2 - 30, mid_y - 15), font_scale, COLOR_BLUE)
    _draw_label(img, c.tb_percent, (mid_x + 5, h // 2 - 15), font_scale, COLOR_BLUE)

    return img


def _draw_corners(
    img: np.ndarray, cr: CornerResult, h: int, w: int, cs: int
) -> np.ndarray:
    """Draw color-coded corner boxes."""
    thickness = max(2, w // 300)
    padding = 2

    pos_rects = {
        "top_left":     (padding, padding, cs, cs),
        "top_right":    (w - cs - padding, padding, w - padding, cs),
        "bottom_left":  (padding, h - cs - padding, cs, h - padding),
        "bottom_right": (w - cs - padding, h - cs - padding, w - padding, h - padding),
    }

    for corner in cr.corners:
        color = _score_color(corner.corner_score)
        x1, y1, x2, y2 = pos_rects[corner.position]
        cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)

        # Score label at corner
        font_scale = max(0.35, w / 2500)
        label = f"{corner.corner_score:.0f}"
        lx = x1 + 4 if "left" in corner.position else x2 - 25
        ly = y1 + 16 if "top" in corner.position else y2 - 6
        _draw_label(img, label, (lx, ly), font_scale, color)

    return img


def _draw_edges(img: np.ndarray, er: EdgeResult, h: int, w: int) -> np.ndarray:
    """Highlight problem edges with colored borders."""
    thickness = max(3, w // 250)

    edge_rects = {
        "top":    ((0, 0), (w, 0)),
        "bottom": ((0, h - 1), (w, h - 1)),
        "left":   ((0, 0), (0, h)),
        "right":  ((w - 1, 0), (w - 1, h)),
    }

    for edge in er.edges:
        if edge.edge_score >= SCORE_THRESHOLDS["good"]:
            continue  # Don't draw green on clean edges (cleaner look)
        color = _score_color(edge.edge_score)
        p1, p2 = edge_rects[edge.position]
        cv2.line(img, p1, p2, color, thickness)

    return img


def _draw_label(
    img: np.ndarray, text: str, pos: tuple, font_scale: float, color: tuple
) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    thickness = 1
    # Dark shadow for readability
    cv2.putText(img, text, (pos[0] + 1, pos[1] + 1), font, font_scale, COLOR_BLACK, thickness + 1)
    cv2.putText(img, text, pos, font, font_scale, color, thickness)
