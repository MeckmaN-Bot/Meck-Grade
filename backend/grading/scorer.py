"""
Convert raw analyzer scores into a normalized 0-100 subscore set + composite.

While the corners / edges / surface analyzers are being rebuilt, those
inputs may be `None`.  In that case the composite is computed from the
remaining (active) subscores only, and the missing categories are filled
with the centering score as a *neutral placeholder* so that downstream
PSA / BGS / CGC / TAG mappers — which expect four numeric subscores —
keep functioning.  The frontend hides the placeholder values via the
`analyzers_quarantined` flag on the result.
"""
from dataclasses import dataclass
from typing import Optional

from backend.config import (
    WEIGHT_CENTERING, WEIGHT_CORNERS, WEIGHT_EDGES, WEIGHT_SURFACE,
)


@dataclass
class Subscores:
    centering: float
    corners:   float
    edges:     float
    surface:   float
    composite: float


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


def compute_subscores(
    centering_score: float,
    corner_score:   Optional[float] = None,
    edge_score:     Optional[float] = None,
    surface_score:  Optional[float] = None,
) -> Subscores:
    c = _clamp(centering_score)

    # Active analyzers contribute to composite; missing ones are excluded
    # and their weight is re-normalized over the remaining set.
    parts = [(c, WEIGHT_CENTERING)]
    co_active = corner_score   is not None
    ed_active = edge_score     is not None
    sf_active = surface_score  is not None
    if co_active: parts.append((_clamp(corner_score),  WEIGHT_CORNERS))
    if ed_active: parts.append((_clamp(edge_score),    WEIGHT_EDGES))
    if sf_active: parts.append((_clamp(surface_score), WEIGHT_SURFACE))

    weight_sum = sum(w for _, w in parts)
    composite = sum(s * w for s, w in parts) / weight_sum if weight_sum > 0 else c

    # Neutral placeholders so the downstream grade mappers keep working.
    co = _clamp(corner_score)  if co_active else c
    ed = _clamp(edge_score)    if ed_active else c
    sf = _clamp(surface_score) if sf_active else c

    return Subscores(
        centering=round(c, 2),
        corners=round(co, 2),
        edges=round(ed, 2),
        surface=round(sf, 2),
        composite=round(composite, 2),
    )
