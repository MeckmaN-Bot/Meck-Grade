"""
Maps subscores to TAG precision grade (decimal 1.00 – 10.00).
TAG uses a 1000-point precision scale that maps to a 1-10 decimal.
"""
from backend.grading.scorer import Subscores


def compute_tag_grade(sub: Subscores) -> float:
    """
    Returns a TAG-style precision grade (e.g. 9.83).
    The composite score (0-100) maps directly to a 0-10 scale with 2 decimal places.
    Additional precision comes from balancing all 4 subgrades.
    """
    # Base: composite / 10
    base = sub.composite / 10.0

    # Fine adjustment: penalise imbalance between subgrades
    scores = [sub.centering, sub.corners, sub.edges, sub.surface]
    std_dev = _std(scores)
    # High std_dev = unbalanced card → slight downward adjustment
    imbalance_penalty = min(std_dev / 100.0, 0.15)

    tag_grade = base - imbalance_penalty
    tag_grade = max(1.0, min(10.0, tag_grade))
    return round(tag_grade, 2)


def _std(values: list) -> float:
    n = len(values)
    if n == 0:
        return 0.0
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n
    return variance ** 0.5
