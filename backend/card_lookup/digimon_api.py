"""
Digimon TCG card lookup via digimoncard.io public API (free, no auth).
https://digimoncard.io/
"""
from typing import Optional
from urllib.parse import quote


def lookup_digimon(name: str) -> Optional[dict]:
    """Search for a Digimon card by name. Returns normalised card dict or None."""
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    try:
        resp = requests.get(
            "https://digimoncard.io/api-public/search.php",
            params={"n": name, "type": "Card", "sort": "name", "limit": "1"},
            timeout=8,
            headers={"User-Agent": "Meck-Grade/1.4"},
        )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and data:
                return _parse_digimon_card(data[0])
    except Exception:
        pass
    return None


def _parse_digimon_card(card: dict) -> dict:
    card_name = card.get("name", "")
    image_url = card.get("image_url", "")
    # Digimon API rarely has prices; leave as None
    pop_url = (
        f"https://www.psacard.com/pop/search-pop-report/?category=59"
        f"&specname={quote(card_name)}"
    )

    return {
        "game":          "digimon",
        "name":          card_name,
        "set_name":      card.get("set", ""),
        "set_id":        card.get("id", ""),
        "number":        card.get("cardnumber", ""),
        "rarity":        card.get("rarity", ""),
        "image_url":     image_url,
        "tcgplayer_url": f"https://www.tcgplayer.com/search/digimon/product?q={quote(card_name)}",
        "cardmarket_url": f"https://www.cardmarket.com/en/Digimon/Search?searchString={quote(card_name)}",
        "raw_nm_price":  None,
        "currency":      "USD",
        "psa_pop_url":   pop_url,
    }
