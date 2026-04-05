"""
Stage 4: Surface analysis.
Five independent techniques applied to the card surface region:

1. CLAHE + directional Sobel  → scratch pixel count
2. Laplacian connected components → dent/indentation detection
3. FFT magnitude spectrum → print defects / periodic artifacts
4. LBP on holo regions → micro-scratch detection in holo foil
5. SSIM vs. blurred reference → global surface quality map

Returns a 0-100 surface score and detailed findings.
"""
from dataclasses import dataclass, field
from typing import Optional
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
class SurfaceResult:
    scratch_pixel_count: int
    scratch_ratio: float        # scratch pixels / total surface pixels
    dent_region_count: int
    holo_detected: bool
    holo_damage_score: float    # 0-1, higher = more holo damage
    ssim_score: float           # 0-1, higher = cleaner surface
    print_defect_score: float   # 0-1, higher = more print artifacts
    surface_score: float        # 0-100
    defect_map: Optional[np.ndarray] = None   # grayscale heat map for annotation


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

    # --- Technique 1: CLAHE + Sobel scratch detection ---
    scratch_map, scratch_count = _detect_scratches(gray)
    scratch_ratio = scratch_count / max(total_pixels, 1)

    # --- Technique 2: Laplacian dent detection ---
    dent_count, dent_map = _detect_dents(gray)

    # --- Technique 3: FFT print defect detection ---
    print_defect_score = _detect_print_defects(gray)

    # --- Technique 4: Holo detection + LBP micro-scratch ---
    holo_detected, holo_damage = _detect_holo_damage(surface, gray)

    # --- Technique 5: SSIM surface quality ---
    ssim_val = _compute_ssim(gray)

    # --- Build combined defect map ---
    defect_map = _build_defect_map(scratch_map, dent_map, gray.shape)

    # --- Weighted score ---
    scratch_penalty  = min(scratch_ratio * 2000, 50)   # up to 50 pts, ~2.5% scratch = max
    dent_penalty     = min(dent_count * 5, 25)          # each dent costs 5 pts, max 25
    holo_penalty     = holo_damage * 15 if holo_detected else 0.0
    ssim_penalty     = (1.0 - ssim_val) * 30
    print_penalty    = print_defect_score * 10

    surface_score = 100.0 - scratch_penalty - dent_penalty - holo_penalty - ssim_penalty - print_penalty
    surface_score = max(0.0, min(100.0, surface_score))

    return SurfaceResult(
        scratch_pixel_count=scratch_count,
        scratch_ratio=round(scratch_ratio, 6),
        dent_region_count=dent_count,
        holo_detected=holo_detected,
        holo_damage_score=round(float(holo_damage), 4),
        ssim_score=round(float(ssim_val), 4),
        print_defect_score=round(float(print_defect_score), 4),
        surface_score=round(float(surface_score), 2),
        defect_map=defect_map,
    )


def _detect_scratches(gray: np.ndarray) -> tuple:
    """
    CLAHE amplifies local contrast → directional Sobel detects scratch streaks.
    Returns (scratch_binary_map, scratch_pixel_count).
    """
    # Step 1: CLAHE
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_SIZE)
    enhanced = clahe.apply(gray)

    # Step 2: Multi-directional Sobel to detect scratches at any angle
    sobel_x = cv2.Sobel(enhanced, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(enhanced, cv2.CV_64F, 0, 1, ksize=3)
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

    scratch_count = int(np.sum(scratch_binary > 0))
    return scratch_binary, scratch_count


def _diagonal_sobel(gray: np.ndarray, direction: int) -> np.ndarray:
    """Apply a Sobel-like kernel in the 45° or 135° direction."""
    if direction == 45:
        kernel = np.array([[-2, -1, 0], [-1, 0, 1], [0, 1, 2]], dtype=np.float32)
    else:
        kernel = np.array([[0, 1, 2], [-1, 0, 1], [-2, -1, 0]], dtype=np.float32)
    return cv2.filter2D(gray.astype(np.float32), -1, kernel)


def _detect_dents(gray: np.ndarray) -> tuple:
    """
    Laplacian responds to second-derivative changes in intensity — characteristic of dents.
    Returns (dent_region_count, dent_map).
    """
    lap = cv2.Laplacian(gray, cv2.CV_64F, ksize=5)
    lap_abs = np.abs(lap)
    lap_norm = np.clip(lap_abs / max(lap_abs.max(), 1) * 255, 0, 255).astype(np.uint8)

    # Threshold: only keep strong Laplacian responses
    _, thresh = cv2.threshold(lap_norm, LAPLACIAN_THRESHOLD, 255, cv2.THRESH_BINARY)

    # Find connected components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(thresh, connectivity=8)

    dent_count = 0
    dent_map = np.zeros_like(thresh)
    for label_id in range(1, num_labels):    # skip background (label 0)
        area = stats[label_id, cv2.CC_STAT_AREA]
        if area >= MIN_DENT_AREA:
            dent_count += 1
            dent_map[labels == label_id] = 255

    return dent_count, dent_map


def _detect_print_defects(gray: np.ndarray) -> float:
    """
    FFT-based detection of anomalous periodic patterns (print lines, roller marks).
    Returns a 0-1 defect score.
    """
    try:
        # Compute 2D FFT and shift zero-freq to center
        f = np.fft.fft2(gray.astype(np.float32))
        fshift = np.fft.fftshift(f)
        magnitude = 20 * np.log(np.abs(fshift) + 1)

        # Suppress the DC component (center) by zeroing a small area
        h, w = magnitude.shape
        cy, cx = h // 2, w // 2
        mask_size = max(int(min(h, w) * 0.02), 3)
        magnitude[cy - mask_size:cy + mask_size, cx - mask_size:cx + mask_size] = 0

        # High-frequency anomalous peaks indicate print defects
        threshold = np.mean(magnitude) + 2.5 * np.std(magnitude)
        anomalous = (magnitude > threshold).astype(float)
        defect_ratio = float(np.mean(anomalous))

        # Normalise to 0-1 (typical clean card: ~0.02, defective: >0.05)
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

    # Holo surfaces show high variance in saturation
    if len(surface_bgr.shape) == 3:
        hsv = cv2.cvtColor(surface_bgr, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].astype(float)
        val = hsv[:, :, 2].astype(float)
        # Holo surfaces: high saturation variance + medium-high value
        sat_variance = float(np.var(sat))
        val_mean = float(np.mean(val))
        holo_detected = sat_variance > 800 and val_mean > 80
    else:
        holo_detected = False

    if not holo_detected:
        return False, 0.0

    # LBP on grayscale to detect texture irregularities (micro-scratches in foil)
    try:
        lbp = local_binary_pattern(
            gray, HOLO_LBP_POINTS, HOLO_LBP_RADIUS, method="uniform"
        )
        # High variance in LBP = irregular texture = scratched holo
        lbp_variance = float(np.var(lbp))
        # Empirical: clean holo ~50-200 variance, scratched >400
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
        # Laplacian variance as proxy for micro-scratch detection
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
        # Fallback: use gradient magnitude as quality proxy
        lap = cv2.Laplacian(gray, cv2.CV_64F)
        lap_var = float(np.var(lap))
        return max(0.0, 1.0 - lap_var / 5000.0)

    try:
        # Blurred reference = what the surface would look like without damage
        reference = cv2.GaussianBlur(gray, (31, 31), 0)
        score, _ = ssim(gray, reference, full=True, data_range=255)
        # Flip: high similarity to blurred = smooth = clean
        # We want: clean surface → high SSIM → high score
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

    # Slightly blur for smoother heat map
    if combined.max() > 0:
        combined = cv2.GaussianBlur(combined, (5, 5), 0)
    return combined
