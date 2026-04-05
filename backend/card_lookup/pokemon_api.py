"""
Pokémon TCG API integration.
Uses the free public API (no API key required for basic searches).
https://api.pokemontcg.io/v2/
"""
from typing import Optional
import json


def lookup_pokemon(name: str) -> Optional[dict]:
    """
    Search for a Pokémon card by name.
    Returns a dict with card info or None if not found.
    """
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    try:
        # Search for exact name first, then fuzzy
        for query in [f'name:"{name}"', f"name:{name}"]:
            resp = requests.get(
                "https://api.pokemontcg.io/v2/cards",
                params={"q": query, "pageSize": 1, "select": "id,name,set,number,rarity,images,tcgplayer"},
                timeout=8,
                headers={"User-Agent": "Meck-Grade/1.1"},
            )
            if resp.status_code == 200:
                data = resp.json()
                cards = data.get("data", [])
                if cards:
                    return _parse_pokemon_card(cards[0])
    except Exception:
        pass
    return None


def _parse_pokemon_card(card: dict) -> dict:
    """Extract relevant fields from a Pokémon TCG API card object."""
    set_info = card.get("set", {})
    images   = card.get("images", {})
    tcgp     = card.get("tcgplayer", {})
    prices   = tcgp.get("prices", {})

    # Get the "near mint" raw price as the baseline for grade estimates
    raw_price = _extract_raw_price(prices)

    return {
        "game":          "pokemon",
        "name":          card.get("name", ""),
        "set_name":      set_info.get("name", ""),
        "set_id":        set_info.get("id", ""),
        "number":        card.get("number", ""),
        "rarity":        card.get("rarity", ""),
        "image_url":     images.get("small", ""),
        "tcgplayer_url": tcgp.get("url", ""),
        "cardmarket_url": "",  # not in this API
        "raw_nm_price":  raw_price,
        "currency":      "USD",
    }


def _extract_raw_price(prices: dict) -> Optional[float]:
    """Get the NM raw price from TCGPlayer price dict."""
    for tier in ["holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil"]:
        if tier in prices:
            p = prices[tier]
            val = p.get("market") or p.get("mid") or p.get("high")
            if val:
                try:
                    return float(val)
                except (TypeError, ValueError):
                    pass
    return None
