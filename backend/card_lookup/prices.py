"""
Grade-to-price estimation.
Takes a raw NM market price and the estimated PSA grade, returns
a list of price estimates for the key grade levels.
"""
from typing import List, Optional
from dataclasses import dataclass

# Empirical PSA price multipliers vs raw NM value (based on market research)
_MULTIPLIERS = {
    10: 6.0,
    9:  2.8,
    8:  1.6,
    7:  1.1,
    6:  0.85,
    5:  0.65,
}


@dataclass
class GradePrice:
    grade: int
    price_usd: float
    price_str: str


def estimate_prices(
    raw_nm_price: Optional[float],
    psa_grade: int,
    currency: str = "USD",
) -> List[dict]:
    """
    Returns a list of {grade, price_str} dicts for the grades near the
    estimated PSA grade (±2 grades shown).
    """
    if raw_nm_price is None or raw_nm_price <= 0:
        return []

    # Show grades around the estimated grade
    grades_to_show = sorted(
        set([max(psa_grade - 2, 6), psa_grade, min(psa_grade + 1, 10), 10, 9]),
        reverse=True,
    )

    symbol = "€" if currency.upper() == "EUR" else "$"

    results = []
    for g in grades_to_show:
        mult = _MULTIPLIERS.get(g, 1.0)
        price = raw_nm_price * mult
        price_str = f"{symbol}{price:.0f}" if price >= 10 else f"{symbol}{price:.2f}"
        results.append({"grade": g, "price_str": price_str})

    return results
