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

from backend.paths import get_uploads_dir
UPLOADS_DIR = get_uploads_dir()


@router.get("/search/cards")
def search_cards(q: str, lang: str = "de", limit: int = 8):
    """
    Type-ahead card search — proxies TCGdex so the frontend can autocomplete
    without doing direct cross-origin calls (TCGdex IS open-CORS but we
    proxy anyway to keep the FE talking to one origin and to apply tiny
    response trimming).
    """
    if not q or len(q.strip()) < 2:
        return {"results": []}
    try:
        import requests
    except ImportError:
        return {"results": []}
    try:
        r = requests.get(
            f"https://api.tcgdex.net/v2/{lang}/cards",
            params={"name": q.strip()},
            headers={"User-Agent": "Meck-Grade/1.1"},
            timeout=6,
        )
        if r.status_code != 200:
            return {"results": []}
        hits = r.json() or []
    except Exception:
        return {"results": []}

    out = []
    for h in hits[:limit]:
        img = h.get("image", "")
        if img and not img.endswith((".png", ".jpg", ".jpeg")):
            img = f"{img}/low.png"
        out.append({
            "id":       h.get("id", ""),
            "name":     h.get("name", ""),
            "number":   str(h.get("localId", "") or ""),
            "image":    img,
        })
    return {"results": out}


@router.get("/search/sets")
def search_sets(q: str = "", lang: str = "de", limit: int = 50):
    """Proxy TCGdex /sets list — returns id, name, serie, logo, symbol, total."""
    try:
        import requests
        params = {"name": q.strip()} if q.strip() else {}
        r = requests.get(
            f"https://api.tcgdex.net/v2/{lang}/sets",
            params=params,
            headers={"User-Agent": "Meck-Grade/1.1"},
            timeout=6,
        )
        if r.status_code != 200:
            return {"results": []}
        sets = r.json() or []
    except Exception:
        return {"results": []}
    out = []
    for s in sets[:limit]:
        logo = s.get("logo", "")
        if logo and not logo.endswith(".png"):
            logo += "/high.png"
        serie = s.get("serie", {})
        out.append({
            "id":     s.get("id", ""),
            "name":   s.get("name", ""),
            "serie":  serie.get("name", "") if isinstance(serie, dict) else "",
            "total":  s.get("total", 0),
            "logo":   logo,
            "symbol": s.get("symbol", ""),
        })
    return {"results": out}


@router.get("/search/card/{card_id}")
def search_card_detail(card_id: str, lang: str = "de"):
    """Fetch full TCGdex card detail by id (post-autocomplete-click)."""
    try:
        from backend.card_lookup.tcgdex_api import _detail, _to_card_info
        d = _detail(lang, card_id)
        if d is None:
            return None
        return _to_card_info(d, lang)
    except Exception:
        return None


@router.get("/lookup/{session_id}", response_model=Optional[CardInfo])
def lookup_card(
    session_id: str,
    name: Optional[str] = None,
    card_id: Optional[str] = None,
    lang: str = "de",
) -> Optional[CardInfo]:
    """
    Run card identification for an uploaded session.

    Resolution priority:
      1. `card_id` (e.g. "me02.5-290") → fetch the *exact* tcgdex card directly
         (no fuzzy matching, no variant drift).  This is what the frontend
         passes after the user picks a row from the type-ahead.
      2. `name` override → tcgdex name search.
      3. OCR on the uploaded image.
    `lang` comes from the user's card_language setting (default "de").
    """
    front_path = _find_file(session_id, "front")
    if not front_path and not card_id:
        return CardInfo()

    # ── Exact-id path: skip OCR, skip name fuzzy match ───────────────────
    if card_id:
        try:
            from backend.card_lookup.tcgdex_api import _detail, _to_card_info
            # Prefer user's language, fall back to the other one
            langs = [lang] + [l for l in ("de", "en") if l != lang]
            for lng in langs[:2]:
                d = _detail(lng, card_id)
                if d is not None:
                    cd = _to_card_info(d, lng)
                    psa_grade = _get_session_psa_grade(session_id)
                    market = cd.get("prices") or []
                    est = estimate_prices(
                        cd.get("raw_nm_price"),
                        psa_grade or 8,
                        currency=cd.get("currency", "USD"),
                    )
                    return CardInfo(
                        game=cd.get("game", ""),
                        id=cd.get("id", card_id),
                        name=cd.get("name", ""),
                        set_name=cd.get("set_name", ""),
                        set_id=cd.get("set_id", ""),
                        number=cd.get("number", ""),
                        rarity=cd.get("rarity", ""),
                        image_url=cd.get("image_url", ""),
                        tcgplayer_url=cd.get("tcgplayer_url", ""),
                        cardmarket_url=cd.get("cardmarket_url", ""),
                        raw_nm_price=cd.get("raw_nm_price"),
                        currency=cd.get("currency", "USD"),
                        prices=list(market) + list(est),
                        psa_pop_url=cd.get("psa_pop_url", ""),
                    )
        except Exception:
            pass  # fall through to name-based path

    # Use override name if provided, otherwise run OCR (name + number)
    if name:
        card_name = name.strip()
        card_number, card_total = "", ""
    else:
        info = _ocr_info(front_path)
        card_name = info.get("name", "")
        card_number = info.get("number", "")
        card_total = info.get("total", "")
    if not card_name:
        return CardInfo()

    # Try TCGdex (user's preferred language + Cardmarket prices) → pokemontcg.io fallback
    # → MTG / Yu-Gi-Oh / Digimon for non-Pokémon games.
    card_data = (
        _lookup_pokemon_tcgdex(card_name, card_number, card_total, lang=lang)
        or _lookup_pokemon(card_name, card_number, card_total)
        or _lookup_mtg(card_name)
        or _lookup_yugioh(card_name)
        or _lookup_digimon(card_name)
    )
    if not card_data:
        return CardInfo(name=card_name)

    # Combine market-source prices (Cardmarket trend/avg/low/7d/30d from
    # TCGdex, when available) with PSA-grade estimates so the user sees
    # both the raw market and what a graded copy could fetch.
    psa_grade = _get_session_psa_grade(session_id)
    market_prices = card_data.get("prices") or []
    estimated = estimate_prices(
        card_data.get("raw_nm_price"),
        psa_grade or 8,
        currency=card_data.get("currency", "USD"),
    )
    prices = list(market_prices) + list(estimated)

    # NOTE: We deliberately do NOT write back to history here. The history row
    # is owned by the explicit "Add to Collection" action on the result screen.
    # If we updated here, an in-flight auto-lookup could land *after* the user
    # added the card and clobber the just-saved (correct) name.

    return CardInfo(
        game=card_data.get("game", ""),
        id=card_data.get("id", ""),
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


def _ocr_info(image_path: str) -> dict:
    """Run preprocessor → OCR on the warped card. Returns name/number/total."""
    try:
        from backend.analysis.preprocessor import preprocess
        from backend.card_lookup.identifier import extract_card_info
        pre = preprocess(image_path)
        if pre.regions is not None:
            return extract_card_info(pre.regions.card)
        # Fall back to raw image if detection failed
        from backend.utils.image_io import load_image_cv2
        img = load_image_cv2(image_path)
        if img is not None:
            return extract_card_info(img)
    except Exception:
        pass
    return {"name": "", "number": "", "total": ""}


def _lookup_pokemon_tcgdex(name: str, number: str = "", total: str = "", lang: str = "de"):
    try:
        from backend.card_lookup.tcgdex_api import lookup_pokemon_tcgdex
        return lookup_pokemon_tcgdex(name, number, lang=lang, total=total)
    except Exception:
        return None


def _lookup_pokemon(name: str, number: str = "", total: str = ""):
    try:
        from backend.card_lookup.pokemon_api import lookup_pokemon
        return lookup_pokemon(name, number, total)
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
