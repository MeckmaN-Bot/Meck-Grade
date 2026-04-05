"""
GET /api/roi/{session_id}
Calculates submission ROI per grading service.
"""
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from typing import Optional

router = APIRouter()

# Submission costs (EUR, approximate 2024/2025 rates)
_SERVICES = [
    {
        "service": "PSA",
        "tiers": [
            {"tier": "Economy",       "cost_eur": 25,  "turnaround": "~6 Monate"},
            {"tier": "Regular",       "cost_eur": 50,  "turnaround": "~3 Monate"},
            {"tier": "Express",       "cost_eur": 100, "turnaround": "~30 Tage"},
            {"tier": "Super Express", "cost_eur": 300, "turnaround": "~10 Tage"},
        ],
    },
    {
        "service": "BGS",
        "tiers": [
            {"tier": "Economy",  "cost_eur": 22,  "turnaround": "~6 Monate"},
            {"tier": "Standard", "cost_eur": 50,  "turnaround": "~60 Tage"},
            {"tier": "Express",  "cost_eur": 120, "turnaround": "~10 Tage"},
        ],
    },
    {
        "service": "CGC",
        "tiers": [
            {"tier": "Economy",  "cost_eur": 15,  "turnaround": "~4 Monate"},
            {"tier": "Standard", "cost_eur": 35,  "turnaround": "~60 Tage"},
            {"tier": "Express",  "cost_eur": 85,  "turnaround": "~15 Tage"},
        ],
    },
]

# PSA-equivalent grade multipliers vs raw NM price
_MULTIPLIERS = {10: 6.0, 9: 2.8, 8: 1.6, 7: 1.1, 6: 0.85, 5: 0.65}


@router.get("/roi/{session_id}")
def get_roi(session_id: str):
    """
    Returns ROI calculation per grading service and tier.
    Requires card_info.raw_nm_price in the session history.
    """
    result = _load_result(session_id)
    if not result:
        return JSONResponse({"error": "Session not found."}, status_code=404)

    card_info   = result.get("card_info") or {}
    raw_nm      = card_info.get("raw_nm_price")
    currency    = card_info.get("currency", "USD")
    psa_grade   = (result.get("grades") or {}).get("psa", 0)
    grade_low   = (result.get("grades") or {}).get("grade_low",  psa_grade)
    grade_high  = (result.get("grades") or {}).get("grade_high", psa_grade)

    if not raw_nm or psa_grade == 0:
        return {"available": False, "reason": "Keine Preisdaten verfügbar — führe erst Karten-Lookup durch."}

    # Convert to EUR if needed (rough rate)
    raw_nm_eur = raw_nm if currency == "EUR" else raw_nm * 0.92

    services_out = []
    for svc in _SERVICES:
        tiers_out = []
        for tier in svc["tiers"]:
            cost = tier["cost_eur"]
            rows = []
            for grade in sorted({grade_low, psa_grade, grade_high}):
                mult = _MULTIPLIERS.get(grade, 1.0)
                graded_price = round(raw_nm_eur * mult, 2)
                net_gain     = round(graded_price - raw_nm_eur - cost, 2)
                rows.append({
                    "grade":        grade,
                    "graded_eur":   graded_price,
                    "net_gain_eur": net_gain,
                    "worth":        net_gain > 0,
                })
            tiers_out.append({
                "tier":        tier["tier"],
                "cost_eur":    cost,
                "turnaround":  tier["turnaround"],
                "grades":      rows,
            })
        services_out.append({"service": svc["service"], "tiers": tiers_out})

    return {
        "available":    True,
        "raw_nm_eur":   round(raw_nm_eur, 2),
        "card_name":    card_info.get("name", ""),
        "psa_estimate": psa_grade,
        "grade_low":    grade_low,
        "grade_high":   grade_high,
        "services":     services_out,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_result(session_id: str) -> Optional[dict]:
    try:
        from backend.db.history import load_result
        result = load_result(session_id)
        if result:
            return result.model_dump()
    except Exception:
        pass
    # Fallback: try in-memory cache
    try:
        from backend.api.analyze import _cache
        result = _cache.get(session_id)
        if result:
            return result.model_dump()
    except Exception:
        pass
    return None
