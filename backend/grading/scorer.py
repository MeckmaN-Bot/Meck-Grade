"""
Converts raw analysis results into normalized 0-100 subscores and the
weighted composite score used by all grade mappers.
"""
from dataclasses import dataclass
from backend.config import (
    WEIGHT_CENTERING, WEIGHT_CORNERS, WEIGHT_EDGES, WEIGHT_SURFACE,
)


@dataclass
class Subscores:
    centering: float   # 0-100
    corners:   float
    edges:     float
    surface:   float
    composite: float   # weighted average


def compute_subscores(
    centering_score: float,
    corner_score: float,
    edge_score: float,
    surface_score: float,
) -> Subscores:
    """
    Build Subscores from individual analyzer scores.
    All inputs should already be 0-100.
    """
    # Clamp all inputs
    c  = max(0.0, min(100.0, centering_score))
    co = max(0.0, min(100.0, corner_score))
    e  = max(0.0, min(100.0, edge_score))
    s  = max(0.0, min(100.0, surface_score))

    composite = (
        c  * WEIGHT_CENTERING
        + co * WEIGHT_CORNERS
        + e  * WEIGHT_EDGES
        + s  * WEIGHT_SURFACE
    )

    return Subscores(
        centering=round(c, 2),
        corners=round(co, 2),
        edges=round(e, 2),
        surface=round(s, 2),
        composite=round(composite, 2),
    )
