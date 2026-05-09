"""
Pokémon TCG API integration (https://api.pokemontcg.io/v2).

Queries are layered for accuracy:
  1. exact name + number  → definitive single match (best path)
  2. exact name           → first hit (may be wrong printing)
  3. fuzzy name           → last resort

The `total` field (e.g. "217" from "290/217") narrows further when the
set's printedTotal matches.
"""
from typing import Optional
from urllib.parse import quote


def lookup_pokemon(name: str,
                   number: str = "",
                   total: str = "") -> Optional[dict]:
    """
    Search for a Pokémon card.

    Args:
      name   — card name (OCR or user-entered, may be German or English)
      number — card number string e.g. "290" (optional, for exact match)
      total  — set total e.g. "217" (optional, narrows by printedTotal)
    """
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    # If the name is German (or has a German species in it), translate
    # the species token to English. The Pokémon TCG API only indexes English.
    from backend.card_lookup.translate import translate_card_name
    en_name = translate_card_name(name)
    names_to_try: list[str] = []
    if en_name and en_name != name:
        names_to_try.append(en_name)
    names_to_try.append(name)

    queries: list[str] = []
    seen: set[str] = set()
    for n in names_to_try:
        if number:
            queries.append(f'name:"{n}" number:{number}')
            queries.append(f'name:{n} number:{number}')
        queries.append(f'name:"{n}"')
        queries.append(f'name:{n}')
        # OCR-fallback: search by each ≥ 4-char word with a wildcard
        # substring match (`name:*Word*`).  Lucene-style wildcards rescue
        # fuzzy OCR results when at least one word is roughly correct.
        for word in n.split():
            for trim in (0, 1, 2):
                for tail in (0, 1, 2):
                    w = word[trim:len(word) - tail] if len(word) - trim - tail >= 4 else ""
                    if not w or not w.isalpha() or w.lower() in seen:
                        continue
                    seen.add(w.lower())
                    if number:
                        queries.append(f'name:*{w}* number:{number}')
                    queries.append(f'name:*{w}*')

    headers = {"User-Agent": "Meck-Grade/1.1"}
    select = "id,name,set,number,rarity,images,tcgplayer,cardmarket"

    for q in queries:
        try:
            resp = requests.get(
                "https://api.pokemontcg.io/v2/cards",
                params={"q": q, "pageSize": 5, "select": select},
                timeout=8, headers=headers,
            )
            if resp.status_code != 200:
                continue
            cards = resp.json().get("data", []) or []
            if not cards:
                continue
            chosen = _pick_best(cards, number, total)
            if chosen is not None:
                return _parse_pokemon_card(chosen)
        except Exception:
            continue
    return None


def _pick_best(cards: list, number: str, total: str) -> Optional[dict]:
    """Pick the card whose number / printedTotal best matches the OCR'd values."""
    if not cards:
        return None
    if not number and not total:
        return cards[0]

    def score(c: dict) -> int:
        s = 0
        if number and c.get("number") == number:
            s += 10
        if total:
            try:
                pt = int((c.get("set") or {}).get("printedTotal") or 0)
                if pt == int(total):
                    s += 5
            except (TypeError, ValueError):
                pass
        return s

    scored = sorted(((score(c), c) for c in cards), key=lambda t: t[0], reverse=True)
    if scored[0][0] == 0:
        # No match scored — fall back to first hit
        return cards[0]
    return scored[0][1]


def _parse_pokemon_card(card: dict) -> dict:
    set_info = card.get("set") or {}
    images   = card.get("images") or {}
    tcgp     = card.get("tcgplayer") or {}
    cmk      = card.get("cardmarket") or {}
    prices   = tcgp.get("prices") or {}

    raw_price = _extract_raw_price(prices)
    if raw_price is None:
        # Cardmarket fallback: trendPrice (EUR) — useful for European users.
        cm_prices = cmk.get("prices") or {}
        try:
            v = cm_prices.get("trendPrice") or cm_prices.get("avg30")
            if v is not None:
                raw_price = float(v)
        except (TypeError, ValueError):
            pass

    name = card.get("name", "")
    set_name = set_info.get("name", "")
    pop_url = (
        f"https://www.psacard.com/pop/search-pop-report/?category=13"
        f"&setname={quote(set_name)}&specname={quote(name)}"
    )
    return {
        "game":          "pokemon",
        "name":          name,
        "set_name":      set_name,
        "set_id":        set_info.get("id", ""),
        "number":        card.get("number", ""),
        "rarity":        card.get("rarity", ""),
        "image_url":     images.get("small") or images.get("large", ""),
        "tcgplayer_url": tcgp.get("url", ""),
        "cardmarket_url": cmk.get("url", ""),
        "raw_nm_price":  raw_price,
        "currency":      "USD" if tcgp.get("url") else ("EUR" if cmk.get("url") else "USD"),
        "psa_pop_url":   pop_url,
    }


def _extract_raw_price(prices: dict) -> Optional[float]:
    for tier in ("holofoil", "reverseHolofoil", "normal",
                 "1stEditionHolofoil", "1stEditionNormal", "unlimited"):
        if tier in prices:
            p = prices[tier] or {}
            val = p.get("market") or p.get("mid") or p.get("high")
            if val is not None:
                try:
                    return float(val)
                except (TypeError, ValueError):
                    pass
    return None
