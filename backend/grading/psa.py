"""
Maps subscores to PSA 1-10 integer grades.
"""
from backend.grading.scorer import Subscores
from backend.config import (
    GEM_MINT_THRESHOLD, MINT_THRESHOLD, NM_MT_THRESHOLD, NM_THRESHOLD,
    EX_MT_THRESHOLD, EX_THRESHOLD, VG_EX_THRESHOLD, VG_THRESHOLD, GOOD_THRESHOLD,
    PSA_10_CENTERING_FRONT,
)

PSA_LABELS = {
    10: "Gem Mint",
    9:  "Mint",
    8:  "NM-MT",
    7:  "NM",
    6:  "EX-MT",
    5:  "EX",
    4:  "VG-EX",
    3:  "VG",
    2:  "Good",
    1:  "Poor",
}


def compute_psa_grade(sub: Subscores, centering_lr_ratio: float = 0.5) -> tuple[int, str]:
    """
    Returns (psa_grade, label).
    Applies industry-accurate gating rules:
      - Any subscore < 70 caps grade at 8
      - Centering outside PSA 10 ratio caps at 9
      - All subscores must meet minimum thresholds for top grades
    """
    c = sub.composite
    min_sub = min(sub.centering, sub.corners, sub.edges, sub.surface)

    # Hard cap: single weak category prevents high grade
    if min_sub < 70:
        c = min(c, 75)   # force into NM-MT or below

    # PSA 10: strict — all subscores ≥ 90, centering within 55/45
    if (c >= GEM_MINT_THRESHOLD
            and sub.centering >= 90
            and sub.corners >= 90
            and sub.edges >= 90
            and sub.surface >= 90
            and centering_lr_ratio <= PSA_10_CENTERING_FRONT):
        grade = 10

    elif c >= MINT_THRESHOLD and min_sub >= 80:
        grade = 9

    elif c >= NM_MT_THRESHOLD and min_sub >= 65:
        grade = 8

    elif c >= NM_THRESHOLD:
        grade = 7

    elif c >= EX_MT_THRESHOLD:
        grade = 6

    elif c >= EX_THRESHOLD:
        grade = 5

    elif c >= VG_EX_THRESHOLD:
        grade = 4

    elif c >= VG_THRESHOLD:
        grade = 3

    elif c >= GOOD_THRESHOLD:
        grade = 2

    else:
        grade = 1

    return grade, PSA_LABELS[grade]
