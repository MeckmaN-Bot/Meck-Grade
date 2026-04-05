"""
Confidence band calculation for PSA grade estimates.
Returns how confident we are in the grade and which subscore is limiting.
"""
from typing import Tuple

# Lower bound of composite score for each PSA grade (grade 10 → 95, grade 1 → 0)
_THRESHOLDS = [
    (10, 95),
    (9,  85),
    (8,  75),
    (7,  65),
    (6,  55),
    (5,  45),
    (4,  35),
    (3,  25),
    (2,  15),
    (1,   0),
]

_LABEL_MAP = {
    "centering": "Zentrierung",
    "corners":   "Ecken",
    "edges":     "Kanten",
    "surface":   "Oberfläche",
}


def compute_confidence(subgrades: dict, composite: float, psa_grade: int) -> dict:
    """
    Returns:
      confidence_pct  — 0‒95 (never 100 — CV analysis always has uncertainty)
      grade_low       — lowest plausible PSA grade
      grade_high      — highest plausible PSA grade
      limiting_factor — "centering" | "corners" | "edges" | "surface"
    """
    lower, upper = _grade_band(psa_grade)
    band_width = upper - lower

    if band_width <= 0:
        confidence_pct = 60
    else:
        dist_lower = composite - lower
        dist_upper = upper - composite
        min_dist   = min(dist_lower, dist_upper)
        # At exact center of band → ~95%, at edge → ~45%
        center_ratio = min_dist / (band_width / 2.0)
        confidence_pct = int(45 + center_ratio * 50)
        confidence_pct = max(30, min(95, confidence_pct))

    # Grade range: expand by 1 if we are within 30% of band edge
    grade_low  = psa_grade
    grade_high = psa_grade
    if band_width > 0 and min(composite - lower, upper - composite) < band_width * 0.30:
        grade_low  = max(1,  psa_grade - 1)
        grade_high = min(10, psa_grade + 1)

    # Limiting factor = lowest subscore
    sub_map = {
        "centering": subgrades.get("centering", 85.0),
        "corners":   subgrades.get("corners",   85.0),
        "edges":     subgrades.get("edges",     85.0),
        "surface":   subgrades.get("surface",   85.0),
    }
    limiting_key = min(sub_map, key=sub_map.get)

    return {
        "confidence_pct": confidence_pct,
        "grade_low":      grade_low,
        "grade_high":     grade_high,
        "limiting_factor": limiting_key,
    }


def _grade_band(psa_grade: int) -> Tuple[float, float]:
    """Return (lower_bound, upper_bound) for a PSA grade's composite range."""
    lower = 0.0
    upper = 100.0
    for i, (grade, threshold) in enumerate(_THRESHOLDS):
        if grade == psa_grade:
            lower = threshold
            upper = _THRESHOLDS[i - 1][1] if i > 0 else 100.0
            break
    return lower, upper
