"""
Scryfall API integration for Magic: The Gathering cards.
Free, no authentication required.
https://scryfall.com/docs/api
"""
from typing import Optional


def lookup_mtg(name: str) -> Optional[dict]:
    """
    Search for an MTG card by name via Scryfall fuzzy search.
    Returns a normalised card info dict or None.
    """
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    try:
        resp = requests.get(
            "https://api.scryfall.com/cards/named",
            params={"fuzzy": name},
            timeout=8,
            headers={"User-Agent": "Meck-Grade/1.1"},
        )
        if resp.status_code == 200:
            card = resp.json()
            return _parse_scryfall_card(card)
    except Exception:
        pass
    return None


def _parse_scryfall_card(card: dict) -> dict:
    prices = card.get("prices", {})
    raw_price = None
    for key in ["usd_foil", "usd"]:
        v = prices.get(key)
        if v:
            try:
                raw_price = float(v)
                break
            except (TypeError, ValueError):
                pass

    images = card.get("image_uris", {})
    if not images and "card_faces" in card:
        images = card["card_faces"][0].get("image_uris", {})

    return {
        "game":          "mtg",
        "name":          card.get("name", ""),
        "set_name":      card.get("set_name", ""),
        "set_id":        card.get("set", ""),
        "number":        card.get("collector_number", ""),
        "rarity":        card.get("rarity", "").title(),
        "image_url":     images.get("small", ""),
        "tcgplayer_url": card.get("purchase_uris", {}).get("tcgplayer", ""),
        "cardmarket_url": card.get("purchase_uris", {}).get("cardmarket", ""),
        "raw_nm_price":  raw_price,
        "currency":      "USD",
    }
