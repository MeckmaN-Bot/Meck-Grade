"""
Stage 4: Surface analysis.
Five independent techniques applied to the card surface region:

1. CLAHE + directional Sobel  → scratch pixel count + DefectInstances
2. Laplacian connected components → dent/indentation DefectInstances
3. FFT magnitude spectrum → print defects / periodic artifacts
4. LBP on holo regions → micro-scratch detection in holo foil
5. SSIM vs. blurred reference → global surface quality map

Additional processing:
- Relief image built via high-pass + emboss for visual defect highlighting
- Zone-weighted severity scoring (corner_zone, edge_zone, center)
- Defect clustering penalty
- Multi-image confirmation via brightness variants (suppresses noise)

Returns a 0-100 surface score and detailed findings.
"""
from dataclasses import dataclass, field
from typing import Optional, List, Tuple
import numpy as np
import cv2

try:
    from skimage.metrics import structural_similarity as ssim
    from skimage.feature import local_binary_pattern
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False

from backend.analysis.preprocessor import CardRegions
from backend.config import (
    CLAHE_CLIP_LIMIT, CLAHE_TILE_SIZE,
    SCRATCH_THRESHOLD, LAPLACIAN_THRESHOLD, MIN_DENT_AREA,
    HOLO_LBP_RADIUS, HOLO_LBP_POINTS,
)


@dataclass
class DefectInstance:
    defect_type: str         # "scratch" | "dent"
    shape_class: str         # "linear" | "punctual" | "irregular"
    zone: str                # "corner_zone" | "edge_zone" | "center"
    cx: int                  # centroid x in surface image coords
    cy: int                  # centroid y in surface image coords
    area_px: int             # pixel area of defect
    severity: float          # 0.0 – 1.0
    zone_weight: float       # 1.0 | 1.2 | 1.4 (center | edge_zone | corner_zone)
    weighted_severity: float # severity * zone_weight


@dataclass
class SurfaceResult:
    scratch_pixel_count: int
    scratch_ratio: float        # scratch pixels / total surface pixels
    dent_region_count: int
    holo_detected: bool
    holo_damage_score: float    # 0-1, higher = more holo damage
    ssim_score: float           # 0-1, higher = cleaner surface
    print_defect_score: float   # 0-1, higher = more print artifacts
    surface_score: float        # 0-100
    defect_map: Optional[np.ndarray] = None    # grayscale heat map for annotation
    relief_map: Optional[np.ndarray] = None    # emboss/high-pass relief image
    defects: List[DefectInstance] = field(default_factory=list)


def analyze_surface(regions: CardRegions) -> SurfaceResult:
    surface = regions.surface
    if surface.size == 0:
        return SurfaceResult(
            scratch_pixel_count=0, scratch_ratio=0.0, dent_region_count=0,
            holo_detected=False, holo_damage_score=0.0, ssim_score=1.0,
            print_defect_score=0.0, surface_score=100.0,
        )

    gray = cv2.cvtColor(surface, cv2.COLOR_BGR2GRAY) if len(surface.shape) == 3 else surface.copy()
    total_pixels = gray.size
    h, w = gray.shape

    # --- Technique 1: CLAHE + Sobel scratch detection ---
    scratch_map, scratch_defects = _detect_scratches(gray)
    scratch_count = int(np.sum(scratch_map > 0))
    scratch_ratio = scratch_count / max(total_pixels, 1)

    # --- Technique 2: Laplacian dent detection ---
    dent_map, dent_defects = _detect_dents(gray)

    # --- Technique 3: FFT print defect detection ---
    print_defect_score = _detect_print_defects(gray)

    # --- Technique 4: Holo detection + LBP micro-scratch ---
    holo_detected, holo_damage = _detect_holo_damage(surface, gray)

    # --- Technique 5: SSIM surface quality ---
    ssim_val = _compute_ssim(gray)

    # --- Multi-image confirmation: filter noise via brightness variants ---
    primary_defects = scratch_defects + dent_defects
    confirmed = _confirmed_defects(gray, primary_defects)
    conf_scratches = [d for d in confirmed if d.defect_type == "scratch"]
    conf_dents     = [d for d in confirmed if d.defect_type == "dent"]

    # --- Build combined defect map ---
    defect_map = _build_defect_map(scratch_map, dent_map, gray.shape)

    # --- Relief image ---
    relief_map = _build_relief_image(gray)

    # --- Cluster penalty ---
    cluster_mult = _cluster_penalty(confirmed)

    # --- Weighted score ---
    weighted_dent_severity = sum(d.weighted_severity for d in conf_dents)
    scratch_penalty = min(scratch_ratio * 2000, 40) * cluster_mult   # up to 40 pts
    dent_penalty    = min(weighted_dent_severity * 8, 25) * cluster_mult
    holo_penalty    = holo_damage * 15 if holo_detected else 0.0
    ssim_penalty    = (1.0 - ssim_val) * 30
    print_penalty   = print_defect_score * 10

    surface_score = 100.0 - scratch_penalty - dent_penalty - holo_penalty - ssim_penalty - print_penalty
    surface_score = max(0.0, min(100.0, surface_score))

    return SurfaceResult(
        scratch_pixel_count=scratch_count,
        scratch_ratio=round(scratch_ratio, 6),
        dent_region_count=len(conf_dents),
        holo_detected=holo_detected,
        holo_damage_score=round(float(holo_damage), 4),
        ssim_score=round(float(ssim_val), 4),
        print_defect_score=round(float(print_defect_score), 4),
        surface_score=round(float(surface_score), 2),
        defect_map=defect_map,
        relief_map=relief_map,
        defects=confirmed,
    )


# ─── Detection ────────────────────────────────────────────────────────────────

def _detect_scratches(gray: np.ndarray) -> Tuple[np.ndarray, List[DefectInstance]]:
    """
    CLAHE amplifies local contrast → directional Sobel detects scratch streaks.
    Returns (scratch_binary_map, List[DefectInstance]).
    """
    h, w = gray.shape

    # Step 1: CLAHE
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_SIZE)
    enhanced = clahe.apply(gray)

    # Step 2: Multi-directional Sobel to detect scratches at any angle
    sobel_x   = cv2.Sobel(enhanced, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y   = cv2.Sobel(enhanced, cv2.CV_64F, 0, 1, ksize=3)
    sobel_45  = _diagonal_sobel(enhanced, direction=45)
    sobel_135 = _diagonal_sobel(enhanced, direction=135)

    # Combine: max response across all directions
    combined = np.maximum.reduce([
        np.abs(sobel_x), np.abs(sobel_y),
        np.abs(sobel_45), np.abs(sobel_135),
    ])

    # Step 3: Threshold to get scratch pixels
    combined_norm = np.clip(combined / combined.max() * 255, 0, 255).astype(np.uint8) \
        if combined.max() > 0 else np.zeros_like(gray)
    scratch_binary = (combined_norm > SCRATCH_THRESHOLD).astype(np.uint8) * 255

    # Step 4: Remove small isolated noise clusters
    kernel = np.ones((3, 3), np.uint8)
    scratch_binary = cv2.morphologyEx(scratch_binary, cv2.MORPH_OPEN, kernel)

    # Step 5: Connected components → DefectInstances
    defects: List[DefectInstance] = []
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        scratch_binary, connectivity=8
    )
    for label_id in range(1, num_labels):
        area = int(stats[label_id, cv2.CC_STAT_AREA])
        if area <= 10:   # discard tiny noise components
            continue
        bw = int(stats[label_id, cv2.CC_STAT_WIDTH])
        bh = int(stats[label_id, cv2.CC_STAT_HEIGHT])
        cx = int(round(centroids[label_id, 0]))
        cy = int(round(centroids[label_id, 1]))
        shape_class = _classify_shape(bw, bh)
        zone_name, zone_weight = _get_zone(cx, cy, h, w)
        severity = min(area / 500.0, 1.0)
        defects.append(DefectInstance(
            defect_type="scratch",
            shape_class=shape_class,
            zone=zone_name,
            cx=cx, cy=cy,
            area_px=area,
            severity=round(severity, 4),
            zone_weight=zone_weight,
            weighted_severity=round(severity * zone_weight, 4),
        ))

    return scratch_binary, defects


def _diagonal_sobel(gray: np.ndarray, direction: int) -> np.ndarray:
    """Apply a Sobel-like kernel in the 45° or 135° direction."""
    if direction == 45:
        kernel = np.array([[-2, -1, 0], [-1, 0, 1], [0, 1, 2]], dtype=np.float32)
    else:
        kernel = np.array([[0, 1, 2], [-1, 0, 1], [-2, -1, 0]], dtype=np.float32)
    return cv2.filter2D(gray.astype(np.float32), -1, kernel)


def _detect_dents(gray: np.ndarray) -> Tuple[np.ndarray, List[DefectInstance]]:
    """
    Laplacian responds to second-derivative changes in intensity — characteristic of dents.
    Returns (dent_map, List[DefectInstance]).
    """
    h, w = gray.shape
    lap = cv2.Laplacian(gray, cv2.CV_64F, ksize=5)
    lap_abs = np.abs(lap)
    lap_norm = np.clip(lap_abs / max(lap_abs.max(), 1) * 255, 0, 255).astype(np.uint8)

    # Threshold: only keep strong Laplacian responses
    _, thresh = cv2.threshold(lap_norm, LAPLACIAN_THRESHOLD, 255, cv2.THRESH_BINARY)

    # Find connected components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(thresh, connectivity=8)

    defects: List[DefectInstance] = []
    dent_map = np.zeros_like(thresh)
    for label_id in range(1, num_labels):
        area = int(stats[label_id, cv2.CC_STAT_AREA])
        if area < MIN_DENT_AREA:
            continue
        dent_map[labels == label_id] = 255
        bw = int(stats[label_id, cv2.CC_STAT_WIDTH])
        bh = int(stats[label_id, cv2.CC_STAT_HEIGHT])
        cx = int(round(centroids[label_id, 0]))
        cy = int(round(centroids[label_id, 1]))
        shape_class = _classify_shape(bw, bh)
        zone_name, zone_weight = _get_zone(cx, cy, h, w)
        severity = min(area / 200.0, 1.0)
        defects.append(DefectInstance(
            defect_type="dent",
            shape_class=shape_class,
            zone=zone_name,
            cx=cx, cy=cy,
            area_px=area,
            severity=round(severity, 4),
            zone_weight=zone_weight,
            weighted_severity=round(severity * zone_weight, 4),
        ))

    return dent_map, defects


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _classify_shape(w_bbox: int, h_bbox: int) -> str:
    """Classify a defect shape based on its bounding-box aspect ratio."""
    ratio = max(w_bbox, h_bbox) / max(min(w_bbox, h_bbox), 1)
    if ratio > 3.5:
        return "linear"
    if ratio < 2.0:
        return "punctual"
    return "irregular"


def _get_zone(cx: int, cy: int, h: int, w: int) -> Tuple[str, float]:
    """
    Return (zone_name, zone_weight) based on relative position in the image.
    Corner zone = outer 15% of both axes.
    Edge zone   = outer 30% of at least one axis.
    """
    rx = cx / max(w, 1)
    ry = cy / max(h, 1)
    in_corner = (rx < 0.15 or rx > 0.85) and (ry < 0.15 or ry > 0.85)
    in_edge   = (rx < 0.15 or rx > 0.85) or  (ry < 0.15 or ry > 0.85)
    if in_corner:
        return "corner_zone", 1.4
    if in_edge:
        return "edge_zone", 1.2
    return "center", 1.0


def _cluster_penalty(defects: List[DefectInstance], radius: int = 60) -> float:
    """
    Return 1.3× penalty multiplier if 3 or more defects are clustered
    within `radius` pixels of each other; otherwise 1.0.
    """
    if len(defects) < 3:
        return 1.0
    max_cluster = 1
    for i, d in enumerate(defects):
        nearby = sum(
            1 for j, e in enumerate(defects)
            if i != j and abs(d.cx - e.cx) < radius and abs(d.cy - e.cy) < radius
        )
        if nearby + 1 > max_cluster:
            max_cluster = nearby + 1
    return 1.3 if max_cluster >= 3 else 1.0


def _confirmed_defects(
    gray: np.ndarray, primary_defects: List[DefectInstance]
) -> List[DefectInstance]:
    """
    Validate each detected defect against two brightness variants (+20/-20).
    Only keep defects whose centroid is found within 15px in at least one variant.
    This suppresses scan artifacts and noise that don't correspond to real damage.

    NOTE: variant detection runs exactly TWICE (once per variant), not once per
    defect — running it inside the defect loop would be O(N_defects × 2) full
    CV passes and hang on real card images.
    """
    if not primary_defects:
        return []

    # Compute variant defect lists ONCE each — O(2) CV passes total
    variant_images = [
        np.clip(gray.astype(np.int32) + 20, 0, 255).astype(np.uint8),
        np.clip(gray.astype(np.int32) - 20, 0, 255).astype(np.uint8),
    ]
    variant_defects: List[List[DefectInstance]] = []
    for v in variant_images:
        _, v_scratches = _detect_scratches(v)
        _, v_dents     = _detect_dents(v)
        variant_defects.append(v_scratches + v_dents)

    # Now check each primary defect against pre-computed variant results
    confirmed: List[DefectInstance] = []
    for d in primary_defects:
        for all_v in variant_defects:
            if any(
                abs(d.cx - e.cx) <= 15 and abs(d.cy - e.cy) <= 15
                for e in all_v
            ):
                confirmed.append(d)
                break

    return confirmed


def _build_relief_image(gray: np.ndarray) -> np.ndarray:
    """
    Build a relief/emboss image that makes micro-defects visually prominent.
    Combines a high-pass filter (emphasises local anomalies) with an emboss
    filter (simulates directional lighting) and applies CLAHE for local contrast.
    """
    # High-pass: remove large-scale brightness variation, keep local edges
    blurred = cv2.GaussianBlur(gray, (21, 21), 0)
    hp = cv2.subtract(gray, blurred)
    hp = np.clip(hp.astype(np.int32) + 128, 0, 255).astype(np.uint8)

    # Emboss: simulates light from upper-left, highlights relief structure
    emboss_kernel = np.array([[-2, -1, 0], [-1, 0, 1], [0, 1, 2]], dtype=np.float32)
    emboss = cv2.filter2D(gray.astype(np.float32), -1, emboss_kernel)
    emboss = np.clip(emboss + 128, 0, 255).astype(np.uint8)

    # Blend 60% high-pass + 40% emboss
    combined = cv2.addWeighted(hp, 0.6, emboss, 0.4, 0)

    # CLAHE for local contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    return clahe.apply(combined)


# ─── Remaining techniques (unchanged) ────────────────────────────────────────

def _detect_print_defects(gray: np.ndarray) -> float:
    """
    FFT-based detection of anomalous periodic patterns (print lines, roller marks).
    Returns a 0-1 defect score.
    """
    try:
        f = np.fft.fft2(gray.astype(np.float32))
        fshift = np.fft.fftshift(f)
        magnitude = 20 * np.log(np.abs(fshift) + 1)

        h, w = magnitude.shape
        cy, cx = h // 2, w // 2
        mask_size = max(int(min(h, w) * 0.02), 3)
        magnitude[cy - mask_size:cy + mask_size, cx - mask_size:cx + mask_size] = 0

        threshold = np.mean(magnitude) + 2.5 * np.std(magnitude)
        anomalous = (magnitude > threshold).astype(float)
        defect_ratio = float(np.mean(anomalous))
        return min(defect_ratio / 0.05, 1.0)
    except Exception:
        return 0.0


def _detect_holo_damage(surface_bgr: np.ndarray, gray: np.ndarray) -> tuple:
    """
    Detect if card has a holo surface, then check for micro-scratches via LBP.
    Returns (holo_detected, damage_score_0_1).
    """
    if not HAS_SKIMAGE:
        return _fallback_holo_detection(gray)

    if len(surface_bgr.shape) == 3:
        hsv = cv2.cvtColor(surface_bgr, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].astype(float)
        val = hsv[:, :, 2].astype(float)
        sat_variance = float(np.var(sat))
        val_mean = float(np.mean(val))
        holo_detected = sat_variance > 800 and val_mean > 80
    else:
        holo_detected = False

    if not holo_detected:
        return False, 0.0

    try:
        lbp = local_binary_pattern(
            gray, HOLO_LBP_POINTS, HOLO_LBP_RADIUS, method="uniform"
        )
        lbp_variance = float(np.var(lbp))
        damage = min(max((lbp_variance - 200) / 400, 0.0), 1.0)
        return True, damage
    except Exception:
        return True, 0.0


def _fallback_holo_detection(gray: np.ndarray) -> tuple:
    """Simple holo detection without scikit-image."""
    variance = float(np.var(gray))
    holo = variance > 1500
    damage = 0.0
    if holo:
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(np.var(lap))
        damage = min(max((lap_var - 500) / 2000, 0.0), 1.0)
    return holo, damage


def _compute_ssim(gray: np.ndarray) -> float:
    """
    Compare surface against a blurred version (ideal smooth reference).
    Low SSIM = localized surface damage.
    """
    if not HAS_SKIMAGE:
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(np.var(lap))
        return max(0.0, 1.0 - lap_var / 5000.0)

    try:
        reference = cv2.GaussianBlur(gray, (31, 31), 0)
        score, _ = ssim(gray, reference, full=True, data_range=255)
        return float(np.clip(score, 0.0, 1.0))
    except Exception:
        return 0.85


def _build_defect_map(scratch_map: np.ndarray, dent_map: np.ndarray,
                      shape: tuple) -> np.ndarray:
    """Combine scratch and dent maps into a single grayscale heat map."""
    combined = np.zeros(shape, dtype=np.uint8)
    if scratch_map is not None and scratch_map.shape == shape:
        combined = np.maximum(combined, scratch_map)
    if dent_map is not None and dent_map.shape == shape:
        combined = np.maximum(combined, dent_map)
    if combined.max() > 0:
        combined = cv2.GaussianBlur(combined, (5, 5), 0)
    return combined
