"""
GET /api/lookup/{session_id}
Identifies the card in a session and returns price estimates.
Uses OCR + Pokémon TCG API / Scryfall.
All external calls are best-effort; returns null fields on failure.
"""
from fastapi import APIRouter
from typing import Optional
from glob import glob
import os

from backend.models.response import CardInfo
from backend.card_lookup.prices import estimate_prices

router = APIRouter()

UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


@router.get("/lookup/{session_id}", response_model=Optional[CardInfo])
def lookup_card(session_id: str, name: Optional[str] = None) -> Optional[CardInfo]:
    """
    Run card identification for an uploaded session.
    Pass ?name=... to override the OCR result with a manually corrected name.
    Returns CardInfo on success, or a minimal CardInfo with empty fields.
    """
    front_path = _find_file(session_id, "front")
    if not front_path:
        return CardInfo()

    # Use override name if provided, otherwise run OCR
    card_name = name.strip() if name else _ocr_name(front_path)
    if not card_name:
        return CardInfo()

    # Try Pokémon → MTG → Yu-Gi-Oh → Digimon
    card_data = (
        _lookup_pokemon(card_name)
        or _lookup_mtg(card_name)
        or _lookup_yugioh(card_name)
        or _lookup_digimon(card_name)
    )
    if not card_data:
        return CardInfo(name=card_name)

    # Estimate prices
    psa_grade = _get_session_psa_grade(session_id)
    prices = estimate_prices(card_data.get("raw_nm_price"), psa_grade or 8)

    # Update history DB with card name if available
    _update_history(session_id, card_data.get("name", card_name), card_data.get("set_name", ""))

    return CardInfo(
        game=card_data.get("game", ""),
        name=card_data.get("name", card_name),
        set_name=card_data.get("set_name", ""),
        set_id=card_data.get("set_id", ""),
        number=card_data.get("number", ""),
        rarity=card_data.get("rarity", ""),
        image_url=card_data.get("image_url", ""),
        tcgplayer_url=card_data.get("tcgplayer_url", ""),
        cardmarket_url=card_data.get("cardmarket_url", ""),
        raw_nm_price=card_data.get("raw_nm_price"),
        currency=card_data.get("currency", "USD"),
        prices=prices,
        psa_pop_url=card_data.get("psa_pop_url", ""),
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _find_file(session_id: str, side: str) -> Optional[str]:
    matches = glob(os.path.join(UPLOADS_DIR, f"{session_id}_{side}.*"))
    return matches[0] if matches else None


def _ocr_name(image_path: str) -> str:
    try:
        from backend.utils.image_io import load_image_cv2
        from backend.card_lookup.identifier import extract_card_name
        img = load_image_cv2(image_path)
        if img is not None:
            return extract_card_name(img)
    except Exception:
        pass
    return ""


def _lookup_pokemon(name: str):
    try:
        from backend.card_lookup.pokemon_api import lookup_pokemon
        return lookup_pokemon(name)
    except Exception:
        return None


def _lookup_mtg(name: str):
    try:
        from backend.card_lookup.scryfall_api import lookup_mtg
        return lookup_mtg(name)
    except Exception:
        return None


def _lookup_yugioh(name: str):
    try:
        from backend.card_lookup.yugioh_api import lookup_yugioh
        return lookup_yugioh(name)
    except Exception:
        return None


def _lookup_digimon(name: str):
    try:
        from backend.card_lookup.digimon_api import lookup_digimon
        return lookup_digimon(name)
    except Exception:
        return None


def _get_session_psa_grade(session_id: str) -> Optional[int]:
    try:
        from backend.db.history import load_result
        result = load_result(session_id)
        return result.grades.psa if result else None
    except Exception:
        return None


def _update_history(session_id: str, name: str, set_name: str) -> None:
    try:
        from backend.db.history import update_card_info
        update_card_info(session_id, name, set_name)
    except Exception:
        pass
