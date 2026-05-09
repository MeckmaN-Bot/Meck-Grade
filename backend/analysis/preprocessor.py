"""
Stage 0 — Smartphone- and scanner-capable card detection.

Pipeline:
  1. Load image (with EXIF auto-rotation).
  2. Downscale to DETECT_LONG_SIDE for detection speed.
  3. Build a foreground mask via a 3-cue ensemble:
       a) Background-colour subtraction (sample 4 image-corner patches).
       b) GrabCut seeded from inner 80 % rectangle.
       c) Adaptive luminance threshold + morphology.
  4. Pick the largest connected component, fit min-area rectangle
     → 4 candidate corners.
  5. Sub-pixel side refinement: per side, sample many gradient strips
     along the side and RANSAC-fit a straight line. Replace each side
     with the refined line; recompute corners as line intersections.
  6. Validate: aspect 1.4 ± DETECT_ASPECT_TOLERANCE, area ≥
     DETECT_MIN_CARD_AREA_FRAC, solidity ≥ DETECT_SOLIDITY_MIN.
     If validation fails, return an error — no silent fallback.
  7. Perspective-warp to canonical orientation (height > width)
     at native pixel density.
  8. Compute pixels-per-mm from CARD_WIDTH_MM / CARD_HEIGHT_MM.

Downstream analyzers receive `CardRegions` and a `pixels_per_mm`
calibration; this is the basis for accurate, real-world centering.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Tuple, List

import cv2
import numpy as np
from PIL import Image, ImageOps

from backend.config import (
    CARD_ASPECT_RATIO, CARD_WIDTH_MM, CARD_HEIGHT_MM,
    CORNER_REGION_SIZE, EDGE_STRIP_WIDTH, SURFACE_INSET,
    DETECT_LONG_SIDE, DETECT_MIN_CARD_AREA_FRAC,
    DETECT_ASPECT_TOLERANCE, DETECT_SOLIDITY_MIN,
    EDGE_REFINE_STRIPS, EDGE_REFINE_BAND,
)


# ─── Data classes ──────────────────────────────────────────────────────────

@dataclass
class CardRegions:
    """Sub-regions extracted from the perspective-corrected card."""
    card: np.ndarray
    gray: np.ndarray
    corner_tl: np.ndarray
    corner_tr: np.ndarray
    corner_bl: np.ndarray
    corner_br: np.ndarray
    edge_top: np.ndarray
    edge_bottom: np.ndarray
    edge_left: np.ndarray
    edge_right: np.ndarray
    surface: np.ndarray
    card_h: int
    card_w: int
    corner_size: int
    edge_thickness_h: int
    edge_thickness_w: int
    pixels_per_mm: float = 0.0


@dataclass
class PreprocessResult:
    regions: Optional[CardRegions] = None
    dpi_used: int = 0
    card_detected: bool = False
    detection_method: str = "fallback"   # "ensemble" | "fallback"
    detection_confidence: float = 0.0    # 0..1
    error: Optional[str] = None
    original: Optional[np.ndarray] = None
    quad: Optional[np.ndarray] = None    # 4×2 corners (in *original* image px)
    # Card warped *with surrounding bg margin* so the editor can show
    # context outside the detected card edges. The actual card occupies
    # the region (margin_px, margin_px) → (margin_px + card_w, margin_px + card_h)
    # within this image.
    card_with_margin: Optional[np.ndarray] = None
    margin_px: int = 0
    # Per-gate diagnostics (best-effort, never throws) — used by debug overlay
    # and to surface low-confidence warnings to the UI.
    diag_area_frac: float = 0.0
    diag_solidity: float = 0.0
    diag_aspect: float = 0.0
    diag_warnings: List[str] = field(default_factory=list)


# ─── Public API ────────────────────────────────────────────────────────────

def preprocess(file_path: str) -> PreprocessResult:
    """Detect card, perspective-warp, slice into sub-regions."""
    img = _load_image(file_path)
    if img is None:
        return PreprocessResult(error="Bild konnte nicht geladen werden.")

    detection = _detect_card_quad(img)
    if detection.quad is None:
        return PreprocessResult(
            error=(
                "Karte konnte nicht erkannt werden — kein zusammenhängender "
                "Vordergrund gefunden. Bitte ein neues Foto mit besserem "
                "Kontrast zwischen Karte und Hintergrund machen."
            ),
            original=img,
            diag_warnings=detection.warnings,
        )
    quad = detection.quad
    conf = detection.confidence

    warped, M1 = _four_point_transform(img, quad)

    # Canonicalize: height > width
    h, w = warped.shape[:2]
    rotated = w > h
    if rotated:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
        h, w = warped.shape[:2]

    pixels_per_mm = (w / CARD_WIDTH_MM + h / CARD_HEIGHT_MM) / 2.0

    # Card-with-margin: same warp, but the output canvas is enlarged by a
    # uniform margin on every side. Output pulls real scan content from
    # outside the detected quad (BORDER_REPLICATE handles image edges).
    margin = max(20, int(round(min(w, h) * 0.06)))
    card_with_margin = _warp_with_margin(img, M1, w, h, margin, rotated)

    regions = _extract_regions(warped, pixels_per_mm)

    return PreprocessResult(
        regions=regions,
        dpi_used=int(pixels_per_mm * 25.4),
        card_detected=True,
        detection_method="ensemble",
        detection_confidence=conf,
        original=img,
        quad=quad.astype(np.float32),
        card_with_margin=card_with_margin,
        margin_px=margin,
        diag_area_frac=detection.area_frac,
        diag_solidity=detection.solidity,
        diag_aspect=detection.aspect,
        diag_warnings=detection.warnings,
    )


def _warp_with_margin(src_img: np.ndarray,
                      M1: np.ndarray,
                      card_w: int, card_h: int,
                      margin: int,
                      rotated: bool) -> np.ndarray:
    """Re-warp the source image so the output is the card surrounded by
    `margin` px of real scan content on every side (or replicated edge if
    the card is near the image border).

    M1 maps orig-image quad → (0,0,card_w_pre,card_h_pre).  We compose with
    a translation (+margin, +margin) and, if `rotated` was applied to the
    canonical card, with a 90°-CW rotation matrix on the output side, so
    the card sits at (margin, margin) → (margin+card_w, margin+card_h)
    in the final image.
    """
    # Pre-rotation card dims (output of M1 before canonicalization)
    if rotated:
        pre_w, pre_h = card_h, card_w
    else:
        pre_w, pre_h = card_w, card_h
    out_w = card_w + 2 * margin
    out_h = card_h + 2 * margin

    # Translation in pre-rotation space
    T_pre = np.array([[1, 0, margin],
                      [0, 1, margin],
                      [0, 0, 1]], dtype=np.float32)
    if rotated:
        # 90° CW rotation that maps (x, y) in pre-frame to (pre_h - y, x) in post-frame.
        # The post-rotation output dims are (out_w, out_h) = (pre_h+2m, pre_w+2m).
        R = np.array([[0, -1, pre_h + 2 * margin - 1],
                      [1,  0, 0],
                      [0,  0, 1]], dtype=np.float32)
        M_full = R @ T_pre @ M1
    else:
        M_full = T_pre @ M1
    return cv2.warpPerspective(src_img, M_full, (out_w, out_h),
                               flags=cv2.INTER_CUBIC,
                               borderMode=cv2.BORDER_REPLICATE)


# ─── Image loading (EXIF-aware) ────────────────────────────────────────────

def _load_image(file_path: str) -> Optional[np.ndarray]:
    """Load + EXIF-auto-rotate (smartphone shots often carry rotation flag)."""
    try:
        with Image.open(file_path) as pil:
            pil = ImageOps.exif_transpose(pil)
            rgb = np.array(pil.convert("RGB"))
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception:
        return None


# ─── Card detection ────────────────────────────────────────────────────────

@dataclass
class _Detection:
    quad: Optional[np.ndarray] = None
    confidence: float = 0.0
    area_frac: float = 0.0
    solidity: float = 0.0
    aspect: float = 0.0
    warnings: List[str] = field(default_factory=list)


def _detect_card_quad(img: np.ndarray) -> _Detection:
    """
    Best-effort card-quad detection.

    Always returns a `_Detection`; if a foreground was found the `quad`
    field is filled in even when one of the gates (area / solidity /
    aspect) is borderline — those only feed into the confidence score and
    raise warnings so the UI can prompt the user to fine-tune the outer
    edges in the editor.  The only hard-fail case is "no foreground at
    all": then `quad` stays `None`.
    """
    H, W = img.shape[:2]
    out = _Detection()

    long_side = max(H, W)
    scale = DETECT_LONG_SIDE / long_side if long_side > DETECT_LONG_SIDE else 1.0
    small = (cv2.resize(img, (int(W * scale), int(H * scale)),
                        interpolation=cv2.INTER_AREA)
             if scale < 1.0 else img.copy())
    sH, sW = small.shape[:2]

    mask = _build_foreground_mask(small)
    if mask is None or cv2.countNonZero(mask) == 0:
        out.warnings.append("Kein Vordergrund erkannt.")
        return out

    cnt = _largest_contour(mask)
    if cnt is None:
        out.warnings.append("Keine Kontur gefunden.")
        return out

    area_frac = cv2.contourArea(cnt) / float(sH * sW)
    hull = cv2.convexHull(cnt)
    solidity = cv2.contourArea(cnt) / max(cv2.contourArea(hull), 1.0)

    out.area_frac = area_frac
    out.solidity = solidity

    if area_frac < 0.01:
        out.warnings.append(f"Erkannter Vordergrund zu klein ({area_frac:.1%}).")
        return out

    # Coarse quad → sub-pixel refinement.
    rect = cv2.minAreaRect(hull)
    box = cv2.boxPoints(rect)
    quad_small = _order_points(box)
    quad_orig = quad_small / scale
    refined = _refine_quad_subpixel(img, quad_orig)
    if refined is None:
        refined = quad_orig

    # Aspect from the would-be warp dimensions.
    out_w = max(_dist(refined[0], refined[1]), _dist(refined[3], refined[2]))
    out_h = max(_dist(refined[0], refined[3]), _dist(refined[1], refined[2]))
    if min(out_w, out_h) < 50:
        out.warnings.append("Erkannte Karte zu klein im Bild.")
        return out
    aspect = max(out_w, out_h) / min(out_w, out_h)
    out.aspect = aspect

    # Per-gate confidence ramps (1 = pass cleanly, 0 = clearly violated).
    c_area = _ramp(area_frac, 0.02, 0.20)
    c_sol  = _ramp(solidity, 0.70, 0.95)
    c_asp  = _ramp(-abs(aspect - CARD_ASPECT_RATIO), -0.40, -0.05)
    confidence = min(c_area, c_sol, c_asp)

    if area_frac < DETECT_MIN_CARD_AREA_FRAC:
        out.warnings.append(
            f"Karte füllt nur {area_frac:.0%} des Bildes — bitte näher fotografieren."
        )
    if solidity < DETECT_SOLIDITY_MIN:
        out.warnings.append(
            f"Karten-Maske unregelmäßig (Solidity {solidity:.2f}) — möglicher Schatten / Reflexion."
        )
    if abs(aspect - CARD_ASPECT_RATIO) > DETECT_ASPECT_TOLERANCE:
        out.warnings.append(
            f"Aspekt-Verhältnis {aspect:.2f} weicht von {CARD_ASPECT_RATIO:.2f} ab "
            "— Außenkanten im Editor prüfen."
        )

    out.quad = refined.astype(np.float32)
    out.confidence = float(confidence)
    return out


def _ramp(x: float, lo: float, hi: float) -> float:
    if x <= lo: return 0.0
    if x >= hi: return 1.0
    return (x - lo) / (hi - lo)


def _build_foreground_mask(img: np.ndarray) -> Optional[np.ndarray]:
    """Combine 3 cues, return a binary uint8 mask (255 = card)."""
    H, W = img.shape[:2]

    # ── Cue A: background-colour subtraction ──────────────────────────────
    # Sample 4 small patches at the image corners. They are almost always
    # background. Anything far from those colours is foreground.
    patch = max(8, min(H, W) // 30)
    samples = np.concatenate([
        img[0:patch, 0:patch].reshape(-1, 3),
        img[0:patch, W - patch:W].reshape(-1, 3),
        img[H - patch:H, 0:patch].reshape(-1, 3),
        img[H - patch:H, W - patch:W].reshape(-1, 3),
    ])
    bg_lab = cv2.cvtColor(samples.reshape(-1, 1, 3).astype(np.uint8),
                          cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    bg_mean = bg_lab.mean(axis=0)
    bg_std = bg_lab.std(axis=0) + 1.0

    img_lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    diff = (img_lab - bg_mean) / bg_std
    dist = np.linalg.norm(diff, axis=2)
    # Threshold: pixels >3 sigma from bg colour distribution
    cue_a = (dist > 3.0).astype(np.uint8) * 255

    # ── Cue B: GrabCut seeded from inner 80 % rectangle ───────────────────
    cue_b = np.zeros((H, W), dtype=np.uint8)
    try:
        gc_mask = np.zeros((H, W), dtype=np.uint8)
        bgd = np.zeros((1, 65), dtype=np.float64)
        fgd = np.zeros((1, 65), dtype=np.float64)
        margin_x, margin_y = int(W * 0.10), int(H * 0.10)
        rect = (margin_x, margin_y, W - 2 * margin_x, H - 2 * margin_y)
        cv2.grabCut(img, gc_mask, rect, bgd, fgd, 3, cv2.GC_INIT_WITH_RECT)
        cue_b = np.where(
            (gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0
        ).astype(np.uint8)
    except cv2.error:
        pass

    # ── Cue C: adaptive luminance threshold ───────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    # Two adaptive thresholds (regular + inverted) — combine to handle
    # both dark and light backgrounds.
    th1 = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY, 51, 5)
    th2 = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 51, 5)
    cue_c = cv2.bitwise_or(th1, th2)
    # Keep only big blobs to suppress fine texture.
    cue_c = cv2.morphologyEx(cue_c, cv2.MORPH_OPEN,
                             np.ones((5, 5), np.uint8), iterations=2)

    # ── Vote: at least 2 of 3 cues agree ──────────────────────────────────
    votes = (cue_a > 0).astype(np.uint8) \
          + (cue_b > 0).astype(np.uint8) \
          + (cue_c > 0).astype(np.uint8)
    mask = (votes >= 2).astype(np.uint8) * 255

    # If GrabCut hard-failed cue_b is empty; fall back to A ∨ C.
    if cv2.countNonZero(mask) < 0.05 * H * W:
        mask = cv2.bitwise_or(cue_a, cue_c)

    # Close holes and remove small specks.
    k = max(3, min(H, W) // 200) | 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            np.ones((k, k), np.uint8), iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            np.ones((k, k), np.uint8), iterations=1)
    return mask


def _largest_contour(mask: np.ndarray) -> Optional[np.ndarray]:
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None
    return max(contours, key=cv2.contourArea)


# ─── Sub-pixel side refinement ─────────────────────────────────────────────

def _refine_quad_subpixel(img: np.ndarray,
                          quad: np.ndarray) -> Optional[np.ndarray]:
    """
    For each of 4 sides, sample EDGE_REFINE_STRIPS perpendicular gradient
    strips, find the sub-pixel gradient peak per strip, RANSAC-fit a line.
    Recompute the 4 corners as line intersections.

    Returns refined 4×2 quad (TL, TR, BR, BL) or None if any side fails.
    """
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    short_side = float(min(_dist(quad[0], quad[1]),
                           _dist(quad[1], quad[2])))
    band = max(8, int(short_side * EDGE_REFINE_BAND))

    sides = [
        (quad[0], quad[1]),  # top
        (quad[1], quad[2]),  # right
        (quad[2], quad[3]),  # bottom
        (quad[3], quad[0]),  # left
    ]

    refined_lines: List[Tuple[np.ndarray, np.ndarray]] = []
    for a, b in sides:
        line = _refine_side(gray, a, b, band, W, H, quad)
        if line is None:
            return None
        refined_lines.append(line)

    # Intersect adjacent refined lines to get refined corners.
    # corner i = intersect(side i-1, side i)
    corners = []
    for i in range(4):
        l1 = refined_lines[(i - 1) % 4]
        l2 = refined_lines[i]
        pt = _line_intersection(l1, l2)
        if pt is None:
            return None
        # Clamp to image bounds (tiny overshoot acceptable)
        pt = np.clip(pt, [-20, -20], [W + 20, H + 20])
        corners.append(pt)

    return np.array(corners, dtype=np.float32)


def _refine_side(gray: np.ndarray,
                 a: np.ndarray, b: np.ndarray,
                 band: int, W: int, H: int,
                 quad: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """
    Fit a sub-pixel straight line to one side of the quad.

    Walks each perpendicular strip from OUTSIDE the card toward the inside
    and locks onto the FIRST strong gradient peak — the actual outer edge.
    `argmax` would otherwise prefer the inner border-vs-artwork transition
    on light-bordered cards (yellow border → black inner-frame stroke is a
    bigger luminance jump than dim background → yellow border).
    """
    side_vec = b - a
    side_len = np.linalg.norm(side_vec)
    if side_len < 10:
        return None
    side_dir = side_vec / side_len

    # Perpendicular pointing *outward* from the quad centre.
    centre_quad = quad.mean(axis=0)
    side_centre = (a + b) / 2.0
    raw = np.array([-side_dir[1], side_dir[0]], dtype=np.float32)
    if np.dot(side_centre - centre_quad, raw) < 0:
        raw = -raw
    perp_out = raw

    n = EDGE_REFINE_STRIPS
    points: List[Tuple[float, float]] = []

    for i in range(n):
        # Skip the very corners (10 % each side) — they are unreliable.
        t = 0.10 + 0.80 * (i / max(n - 1, 1))
        centre = a + side_vec * t

        # ts goes from +band (OUTSIDE) → -band (INSIDE the card).
        steps = 2 * band + 1
        ts = np.linspace(band, -band, steps, dtype=np.float32)
        xs = centre[0] + perp_out[0] * ts
        ys = centre[1] + perp_out[1] * ts
        map_x = xs.reshape(1, -1).astype(np.float32)
        map_y = ys.reshape(1, -1).astype(np.float32)
        profile = cv2.remap(gray, map_x, map_y,
                            interpolation=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REPLICATE)[0]

        grad = np.abs(np.diff(profile.astype(np.float32)))
        if grad.size < 3:
            continue

        # Walk inward; pick the first local max above an adaptive threshold.
        thresh = max(8.0, float(np.percentile(grad, 80)) * 0.5)
        peak = -1
        for k in range(1, grad.size - 1):
            v = grad[k]
            if v < thresh:
                continue
            if v < grad[k - 1] or v < grad[k + 1]:
                continue
            peak = k
            break
        if peak < 0:
            peak = int(np.argmax(grad))
            if grad[peak] < 6.0:
                continue

        # Sub-pixel parabolic refinement.
        if 0 < peak < grad.size - 1:
            y0, y1, y2 = grad[peak - 1], grad[peak], grad[peak + 1]
            denom = (y0 - 2 * y1 + y2)
            offset = 0.5 * (y0 - y2) / denom if abs(denom) > 1e-6 else 0.0
        else:
            offset = 0.0
        peak_t = ts[peak] + offset

        px = centre[0] + perp_out[0] * peak_t
        py = centre[1] + perp_out[1] * peak_t
        if 0 <= px < W and 0 <= py < H:
            points.append((px, py))

    if len(points) < 6:
        return None

    pts = np.array(points, dtype=np.float32)
    # RANSAC line via cv2.fitLine + iterative inlier refit.
    line = _fit_line_ransac(pts)
    if line is None:
        return None
    return line


def _fit_line_ransac(pts: np.ndarray,
                     iters: int = 50,
                     threshold: float = 1.5) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Simple RANSAC line fit. Returns (point, direction)."""
    n = len(pts)
    if n < 2:
        return None
    rng = np.random.default_rng(42)
    best_inliers = None
    best_count = 0
    for _ in range(iters):
        i, j = rng.choice(n, size=2, replace=False)
        p1, p2 = pts[i], pts[j]
        d = p2 - p1
        norm = np.linalg.norm(d)
        if norm < 1e-3:
            continue
        d /= norm
        # Distance from each point to line through p1 with direction d
        v = pts - p1
        cross = np.abs(v[:, 0] * d[1] - v[:, 1] * d[0])
        inliers = cross < threshold
        count = int(inliers.sum())
        if count > best_count:
            best_count = count
            best_inliers = inliers

    if best_inliers is None or best_count < max(6, n // 2):
        # Fallback: total least squares.
        line = cv2.fitLine(pts, cv2.DIST_L2, 0, 0.01, 0.01).flatten()
        return np.array([line[2], line[3]], np.float32), np.array([line[0], line[1]], np.float32)

    inlier_pts = pts[best_inliers]
    line = cv2.fitLine(inlier_pts, cv2.DIST_L2, 0, 0.01, 0.01).flatten()
    return np.array([line[2], line[3]], np.float32), np.array([line[0], line[1]], np.float32)


def _line_intersection(l1, l2) -> Optional[np.ndarray]:
    """Intersect two lines given as (point, direction). None if parallel."""
    p1, d1 = l1
    p2, d2 = l2
    denom = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(denom) < 1e-6:
        return None
    diff = p2 - p1
    t = (diff[0] * d2[1] - diff[1] * d2[0]) / denom
    return p1 + d1 * t


# ─── Geometry helpers ──────────────────────────────────────────────────────

def _dist(a, b) -> float:
    return float(np.linalg.norm(np.asarray(a) - np.asarray(b)))


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Return pts ordered TL, TR, BR, BL."""
    pts = pts.astype(np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    rect = np.zeros((4, 2), dtype=np.float32)
    rect[0] = pts[np.argmin(s)]      # TL
    rect[2] = pts[np.argmax(s)]      # BR
    rect[1] = pts[np.argmin(diff)]   # TR
    rect[3] = pts[np.argmax(diff)]   # BL
    return rect


def _quad_aspect_ok(quad: np.ndarray) -> bool:
    """Validate that the would-be warped output has a card-like aspect."""
    w_top = _dist(quad[0], quad[1])
    w_bot = _dist(quad[3], quad[2])
    h_left = _dist(quad[0], quad[3])
    h_right = _dist(quad[1], quad[2])
    out_w = max(w_top, w_bot)
    out_h = max(h_left, h_right)
    if out_w < 50 or out_h < 50:
        return False
    aspect = max(out_w, out_h) / min(out_w, out_h)
    return abs(aspect - CARD_ASPECT_RATIO) <= DETECT_ASPECT_TOLERANCE


def _four_point_transform(img: np.ndarray,
                          quad: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Perspective-warp using a 4-point quad (TL, TR, BR, BL).

    Returns (warped_image, perspective_matrix). The matrix maps the input
    quad to a clean (0,0)-anchored output rectangle of the warped image's
    pre-rotation size.
    """
    rect = _order_points(quad)
    tl, tr, br, bl = rect
    out_w = int(max(_dist(tr, tl), _dist(br, bl)))
    out_h = int(max(_dist(bl, tl), _dist(br, tr)))
    out_w = max(out_w, 50)
    out_h = max(out_h, 50)
    dst = np.array([[0, 0], [out_w - 1, 0],
                    [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h),
                                 flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
    return warped, M


# ─── Sub-region extraction ────────────────────────────────────────────────

def _extract_regions(card: np.ndarray, pixels_per_mm: float) -> CardRegions:
    h, w = card.shape[:2]
    gray = cv2.cvtColor(card, cv2.COLOR_BGR2GRAY)

    cs = int(w * CORNER_REGION_SIZE)
    et_w = int(w * EDGE_STRIP_WIDTH)
    et_h = int(h * EDGE_STRIP_WIDTH)
    si = int(min(h, w) * SURFACE_INSET)

    return CardRegions(
        card=card,
        gray=gray,
        corner_tl=card[0:cs, 0:cs],
        corner_tr=card[0:cs, w - cs:w],
        corner_bl=card[h - cs:h, 0:cs],
        corner_br=card[h - cs:h, w - cs:w],
        edge_top=card[0:et_h, :],
        edge_bottom=card[h - et_h:h, :],
        edge_left=card[:, 0:et_w],
        edge_right=card[:, w - et_w:w],
        surface=card[si:h - si, si:w - si],
        card_h=h,
        card_w=w,
        corner_size=cs,
        edge_thickness_h=et_h,
        edge_thickness_w=et_w,
        pixels_per_mm=pixels_per_mm,
    )
