"""
Stage 1 — Centering analysis (inner-frame based).

Real PSA / BGS centering is measured between the **inner frame line** (where
the coloured border meets the artwork) and the **outer card edge** — not
between artwork and edge. This module detects the inner frame on each side
in a colour-agnostic way (works for yellow Pokémon, black MTG, white-bordered
Yu-Gi-Oh, holos, etc.).

Method per side:
  1. Sample the border colour from a thin band just inside the outer edge.
  2. Compute a CIELAB ΔE profile from the outer edge inward, averaged across
     many parallel strips → a single 1-D signal per side.
  3. Smooth the signal, find the first strong peak (ΔE jump) → that is the
     inner-frame distance from the outer edge in pixels.
  4. Refine to sub-pixel via parabolic interpolation around the peak.
  5. Cross-check with a Sobel-gradient peak; pick the more confident one.

Robustness:
  • Multiple parallel strips → median rejects local artwork features.
  • Confidence flag when no strong peak is found (e.g. full-art borderless).
  • Distances reported in both pixels and millimetres (using pixels_per_mm
    from the preprocessor) so the UI can show real-world measurements.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Tuple

import numpy as np
import cv2

from backend.analysis.preprocessor import CardRegions


# ─── Result ────────────────────────────────────────────────────────────────

@dataclass
class CenteringResult:
    # Inner-frame distance from outer edge, in *card pixels* (post-warp).
    left_px: int
    right_px: int
    top_px: int
    bottom_px: int

    # Real-world distances in mm (uses pixels_per_mm).
    left_mm: float
    right_mm: float
    top_mm: float
    bottom_mm: float

    # Ratios — larger / total (0.50 = perfect).
    lr_ratio: float
    tb_ratio: float

    # Human strings, e.g. "55/45".
    lr_percent: str
    tb_percent: str

    # 0..100.
    centering_score: float

    # 0..1 — based on how strong the detected frame peaks are.
    confidence: float

    # Flag: True if any side could not find a confident inner frame.
    frame_uncertain: bool = False

    # Notes (e.g. "Inner frame on top side weak — possibly borderless").
    notes: list = field(default_factory=list)


# ─── Public API ────────────────────────────────────────────────────────────

def analyze_centering(regions: CardRegions, is_back: bool = False) -> CenteringResult:
    card = regions.card
    h, w = regions.card_h, regions.card_w
    pix_per_mm = regions.pixels_per_mm or 1.0

    lab = cv2.cvtColor(card, cv2.COLOR_BGR2LAB).astype(np.float32)
    gray = regions.gray

    # Per-side maximum search depth — a card border is unlikely to exceed
    # ~22 % of the perpendicular dimension. Smaller cap = faster, fewer
    # false peaks from artwork features.
    max_h_depth = int(h * 0.22)
    max_w_depth = int(w * 0.22)

    left_px,   left_conf,   left_note   = _detect_frame_distance(lab, gray, "left",   max_w_depth)
    right_px,  right_conf,  right_note  = _detect_frame_distance(lab, gray, "right",  max_w_depth)
    top_px,    top_conf,    top_note    = _detect_frame_distance(lab, gray, "top",    max_h_depth)
    bottom_px, bottom_conf, bottom_note = _detect_frame_distance(lab, gray, "bottom", max_h_depth)

    notes = [n for n in (left_note, right_note, top_note, bottom_note) if n]
    confidences = [left_conf, right_conf, top_conf, bottom_conf]
    overall_conf = float(np.mean(confidences))
    uncertain = any(c < 0.35 for c in confidences)

    # Clamp to ≥1 to avoid div-by-zero.
    L = max(left_px,   1)
    R = max(right_px,  1)
    T = max(top_px,    1)
    B = max(bottom_px, 1)

    lr_total = L + R
    tb_total = T + B
    lr_ratio = max(L, R) / lr_total
    tb_ratio = max(T, B) / tb_total

    lr_left_pct  = round(L / lr_total * 100)
    lr_right_pct = 100 - lr_left_pct
    tb_top_pct   = round(T / tb_total * 100)
    tb_bot_pct   = 100 - tb_top_pct
    lr_percent   = f"{max(lr_left_pct, lr_right_pct)}/{min(lr_left_pct, lr_right_pct)}"
    tb_percent   = f"{max(tb_top_pct, tb_bot_pct)}/{min(tb_top_pct, tb_bot_pct)}"

    score = _compute_centering_score(lr_ratio, tb_ratio, is_back)

    return CenteringResult(
        left_px=int(L), right_px=int(R), top_px=int(T), bottom_px=int(B),
        left_mm=round(L / pix_per_mm, 2),
        right_mm=round(R / pix_per_mm, 2),
        top_mm=round(T / pix_per_mm, 2),
        bottom_mm=round(B / pix_per_mm, 2),
        lr_ratio=round(lr_ratio, 4),
        tb_ratio=round(tb_ratio, 4),
        lr_percent=lr_percent,
        tb_percent=tb_percent,
        centering_score=round(score, 2),
        confidence=round(overall_conf, 3),
        frame_uncertain=uncertain,
        notes=notes,
    )


# ─── Frame detection per side ──────────────────────────────────────────────

def _detect_frame_distance(lab: np.ndarray,
                           gray: np.ndarray,
                           side: str,
                           max_depth: int) -> Tuple[int, float, Optional[str]]:
    """
    Detect inner-frame distance from the outer edge along the given side.
    Returns (distance_px, confidence_0_to_1, note_or_None).
    """
    profile_de, profile_grad = _build_profiles(lab, gray, side, max_depth)
    if profile_de is None:
        return max_depth // 4, 0.0, f"{_side_name(side)}: kein Profil messbar"

    # Find peaks in both signals; prefer the one with higher relative strength.
    # min_idx=6 skips the outer-edge anti-aliasing zone (and matches the
    # border-colour sampling band in `_build_profiles`).
    peak_de,   conf_de   = _first_strong_peak(profile_de,   min_idx=6)
    peak_grad, conf_grad = _first_strong_peak(profile_grad, min_idx=6)

    if conf_de <= 0.0 and conf_grad <= 0.0:
        # Couldn't find any inner frame. Likely a borderless / full-art card.
        # Fall back to half max_depth — score will reflect that we have no real
        # measurement, but we don't crash. Note flagged.
        return max_depth // 4, 0.0, (
            f"{_side_name(side)}: kein klarer Innen-Rahmen erkannt — "
            "möglicherweise randlos / Full-Art."
        )

    if conf_de >= conf_grad:
        return int(round(peak_de)), float(conf_de), None
    return int(round(peak_grad)), float(conf_grad), None


def _build_profiles(lab: np.ndarray,
                    gray: np.ndarray,
                    side: str,
                    max_depth: int) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    """
    Build two 1-D profiles indexed by depth (0 = outer edge):
      • ΔE-from-border-colour (CIELAB)
      • Sobel gradient magnitude perpendicular to the side
    Sampled along many parallel strips and median-aggregated to reject
    artwork features.
    """
    h, w = gray.shape

    # Slice the side band from the perspective-corrected card.
    if side == "left":
        # band shape: (h, depth)  — depth axis is x ∈ [0, max_depth]
        band_lab = lab[:, :max_depth, :]
        band_gray = gray[:, :max_depth]
        depth_axis = 1
        long_axis = 0
    elif side == "right":
        band_lab = lab[:, w - max_depth:, :][:, ::-1, :]   # flip so depth grows from edge inward
        band_gray = gray[:, w - max_depth:][:, ::-1]
        depth_axis = 1
        long_axis = 0
    elif side == "top":
        band_lab = lab[:max_depth, :, :]
        band_gray = gray[:max_depth, :]
        depth_axis = 0
        long_axis = 1
    elif side == "bottom":
        band_lab = lab[h - max_depth:, :, :][::-1, :, :]
        band_gray = gray[h - max_depth:, :][::-1, :]
        depth_axis = 0
        long_axis = 1
    else:
        return None, None

    if band_gray.size == 0 or band_gray.shape[depth_axis] < 12:
        return None, None

    # Sample border colour from a band 6..14 px deep — far enough inside the
    # outer edge to avoid warp anti-aliasing, but still inside the border
    # stripe of all known TCG cards (>20 px @ 11 px/mm = ~1.8 mm).
    sample_lo = 6
    sample_hi = min(14, band_lab.shape[depth_axis] - 1)
    border_strip = np.take(band_lab, indices=range(sample_lo, sample_hi),
                           axis=depth_axis)
    border_lab = border_strip.reshape(-1, 3).mean(axis=0)

    # ΔE profile: per (long, depth) compute Euclidean Lab distance to border_lab,
    # then take median along the long axis → 1-D signal of length max_depth.
    de = np.linalg.norm(band_lab - border_lab, axis=2)  # (long, depth) or (depth, long)
    # Ensure shape is (long, depth)
    if depth_axis == 0:
        de = de.T
    profile_de = np.median(de, axis=0).astype(np.float32)

    # Sobel-gradient profile along depth direction.
    if long_axis == 0:
        sobel = cv2.Sobel(band_gray.astype(np.float32), cv2.CV_32F, 1, 0, ksize=3)
        # take abs and median across long axis (axis=0)
        grad = np.median(np.abs(sobel), axis=0)
    else:
        sobel = cv2.Sobel(band_gray.astype(np.float32), cv2.CV_32F, 0, 1, ksize=3)
        grad = np.median(np.abs(sobel), axis=1)

    profile_grad = grad.astype(np.float32)

    # Light Gaussian smoothing to suppress single-pixel noise.
    profile_de = cv2.GaussianBlur(profile_de.reshape(-1, 1), (1, 5), 0).flatten()
    profile_grad = cv2.GaussianBlur(profile_grad.reshape(-1, 1), (1, 5), 0).flatten()

    return profile_de, profile_grad


def _first_strong_peak(signal: np.ndarray,
                       min_idx: int = 6) -> Tuple[float, float]:
    """
    Locate the first prominent peak in `signal` past `min_idx`.
    Returns (sub-pixel-refined index, confidence in [0,1]).

    Confidence = peak_rise / (peak_rise + 4·border_noise).
    Returns (0, 0.0) if no peak passes the prominence test.
    """
    if signal.size < min_idx + 5:
        return 0.0, 0.0

    # Estimate baseline + noise from the OUTER border zone — the part of the
    # signal *before* the first plausible inner-frame peak.  In that zone the
    # ΔE / gradient profile should be close to flat (border colour matches
    # itself, no edges).  Estimating from the inner half would mistakenly
    # treat busy artwork as "noise" and inflate the threshold.
    border_zone = signal[max(0, min_idx - 4):min_idx + 4]
    if border_zone.size < 2:
        border_zone = signal[:min_idx + 4]
    baseline = float(np.median(border_zone))
    noise = float(np.std(border_zone)) + 1.0   # absolute floor avoids zero-std blow-ups

    # Prominence threshold: peak must rise > baseline + 4·noise.
    threshold = baseline + 4.0 * noise

    # Walk outward from min_idx and pick the first local maximum above
    # threshold that also has a real "rise" from the immediately preceding
    # valley (rejects monotonic artwork ramps).
    best = -1
    for i in range(min_idx + 1, len(signal) - 1):
        v = signal[i]
        if v < threshold:
            continue
        if v < signal[i - 1] or v < signal[i + 1]:
            continue
        back = signal[max(0, i - 8):i].min()
        if v - back < 0.25 * max(v - baseline, 1.0):
            continue
        best = i
        break

    if best < 0:
        return 0.0, 0.0

    # Sub-pixel parabolic refinement.
    y0, y1, y2 = signal[best - 1], signal[best], signal[best + 1]
    denom = (y0 - 2 * y1 + y2)
    offset = 0.5 * (y0 - y2) / denom if abs(denom) > 1e-6 else 0.0
    refined = best + offset

    rise = float(y1 - baseline)
    confidence = rise / (rise + 4.0 * noise) if rise > 0 else 0.0
    return refined, max(0.0, min(1.0, confidence))


# ─── Score mapping ────────────────────────────────────────────────────────

def _compute_centering_score(lr_ratio: float, tb_ratio: float, is_back: bool) -> float:
    """
    PSA-aligned piecewise mapping. Uses the *worse* of the two axes.

    Front anchors:                          Back anchors (more lenient):
      0.500 → 100   (perfect)                 0.500 → 100
      0.550 → 90    (PSA 10 cap)              0.600 → 92
      0.600 → 75    (PSA 9  cap)              0.700 → 80
      0.650 → 60    (PSA 8  cap)              0.750 → 70    (PSA 10 back cap)
      0.700 → 45    (PSA 7  cap)              0.800 → 55    (PSA 9 back cap)
      0.800 → 25                              0.900 → 25
      1.000 →  0                              1.000 →  0
    """
    worse = max(lr_ratio, tb_ratio)

    if is_back:
        anchors = [(0.50, 100), (0.60, 92), (0.70, 80),
                   (0.75, 70), (0.80, 55), (0.90, 25), (1.00, 0)]
    else:
        anchors = [(0.50, 100), (0.55, 90), (0.60, 75),
                   (0.65, 60), (0.70, 45), (0.80, 25), (1.00, 0)]

    return float(_piecewise_linear(worse, anchors))


def _piecewise_linear(x: float, anchors) -> float:
    if x <= anchors[0][0]:
        return anchors[0][1]
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return anchors[-1][1]


def _side_name(side: str) -> str:
    return {"left": "links", "right": "rechts",
            "top": "oben", "bottom": "unten"}.get(side, side)
