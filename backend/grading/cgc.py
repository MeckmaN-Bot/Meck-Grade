"""
Maps subscores to CGC 1-10 grades.
CGC is stricter than PSA at the top: CGC 10 Pristine requires near-perfect conditions.
"""
from backend.grading.scorer import Subscores

CGC_LABELS = {
    10.0: "Pristine",
    9.8:  "Gem Mint",
    9.6:  "Gem Mint",
    9.4:  "Mint+",
    9.2:  "Mint+",
    9.0:  "Mint",
    8.5:  "NM/Mint+",
    8.0:  "NM/Mint",
    7.5:  "Near Mint+",
    7.0:  "Near Mint",
    6.0:  "Excellent/Near Mint",
    5.0:  "Excellent",
    4.0:  "Very Good/Excellent",
    3.0:  "Very Good",
    2.0:  "Good",
    1.5:  "Fair",
    1.0:  "Poor",
}


def compute_cgc_grade(sub: Subscores) -> tuple[float, str]:
    """
    Returns (cgc_grade, label).
    CGC uses half-point grades at the high end.
    """
    c = sub.composite
    min_sub = min(sub.centering, sub.corners, sub.edges, sub.surface)

    # CGC 10 Pristine: all subscores ≥ 94, composite ≥ 97
    if c >= 97 and min_sub >= 94:
        return 10.0, "Pristine"
    elif c >= 93 and min_sub >= 90:
        return 9.8, "Gem Mint"
    elif c >= 90 and min_sub >= 87:
        return 9.6, "Gem Mint"
    elif c >= 87 and min_sub >= 83:
        return 9.4, "Mint+"
    elif c >= 84 and min_sub >= 80:
        return 9.2, "Mint+"
    elif c >= 80 and min_sub >= 75:
        return 9.0, "Mint"
    elif c >= 75 and min_sub >= 68:
        return 8.5, "NM/Mint+"
    elif c >= 70 and min_sub >= 62:
        return 8.0, "NM/Mint"
    elif c >= 65:
        return 7.5, "Near Mint+"
    elif c >= 58:
        return 7.0, "Near Mint"
    elif c >= 50:
        return 6.0, "Excellent/Near Mint"
    elif c >= 40:
        return 5.0, "Excellent"
    elif c >= 30:
        return 4.0, "Very Good/Excellent"
    elif c >= 20:
        return 3.0, "Very Good"
    elif c >= 12:
        return 2.0, "Good"
    elif c >= 6:
        return 1.5, "Fair"
    else:
        return 1.0, "Poor"
