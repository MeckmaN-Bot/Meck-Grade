"""
Maps subscores to BGS grades (half-point scale 1-10 with 4 independent subgrades).
"""
from dataclasses import dataclass
from backend.grading.scorer import Subscores
from backend.models.response import BGSSubgrades


# Mapping table: raw score (0-100) → BGS half-point subgrade
_BREAKPOINTS = [
    (97, 10.0),
    (93, 9.5),
    (88, 9.0),
    (83, 8.5),
    (75, 8.0),
    (68, 7.5),
    (60, 7.0),
    (52, 6.5),
    (45, 6.0),
    (38, 5.5),
    (30, 5.0),
    (22, 4.0),
    (15, 3.0),
    (8,  2.0),
    (0,  1.0),
]


def _raw_to_bgs(score: float) -> float:
    for threshold, grade in _BREAKPOINTS:
        if score >= threshold:
            return grade
    return 1.0


def compute_bgs_grade(sub: Subscores) -> BGSSubgrades:
    centering_sg = _raw_to_bgs(sub.centering)
    corners_sg   = _raw_to_bgs(sub.corners)
    edges_sg     = _raw_to_bgs(sub.edges)
    surface_sg   = _raw_to_bgs(sub.surface)

    avg = (centering_sg + corners_sg + edges_sg + surface_sg) / 4.0

    # BGS composite rounding:
    # Round to nearest 0.5, but the lowest subgrade has extra pull
    min_sg = min(centering_sg, corners_sg, edges_sg, surface_sg)
    # If any subgrade is 1 step below average, composite is pulled down
    composite = _round_bgs_composite(avg, min_sg)

    black_label = all(sg == 10.0 for sg in [centering_sg, corners_sg, edges_sg, surface_sg])

    return BGSSubgrades(
        centering=centering_sg,
        corners=corners_sg,
        edges=edges_sg,
        surface=surface_sg,
        composite=composite,
        black_label=black_label,
    )


def _round_bgs_composite(avg: float, min_sg: float) -> float:
    """Round average to nearest 0.5, with downward pull from lowest subgrade."""
    # If the lowest subgrade is more than 0.5 below average, pull composite down
    if avg - min_sg > 0.75:
        avg -= 0.5

    # Round to nearest 0.5
    rounded = round(avg * 2) / 2
    return max(1.0, min(10.0, rounded))
