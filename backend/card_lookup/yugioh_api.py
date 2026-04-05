"""
Yu-Gi-Oh! card lookup via YGOPRODeck API (free, no auth required).
https://db.ygoprodeck.com/api/v7/
"""
from typing import Optional
from urllib.parse import quote


def lookup_yugioh(name: str) -> Optional[dict]:
    """Search for a Yu-Gi-Oh! card by name. Returns normalised card dict or None."""
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    # Try exact match first, then fuzzy (fname)
    for param, value in [("name", name), ("fname", name)]:
        try:
            resp = requests.get(
                "https://db.ygoprodeck.com/api/v7/cardinfo.php",
                params={param: value},
                timeout=8,
                headers={"User-Agent": "Meck-Grade/1.4"},
            )
            if resp.status_code == 200:
                data = resp.json()
                cards = data.get("data", [])
                if cards:
                    return _parse_yugioh_card(cards[0])
        except Exception:
            continue
    return None


def _parse_yugioh_card(card: dict) -> dict:
    images = card.get("card_images", [{}])
    image_url = images[0].get("image_url_small", "") if images else ""

    # Price: average of available market prices
    prices_raw = card.get("card_prices", [{}])
    raw_price = None
    if prices_raw:
        p = prices_raw[0]
        for key in ("tcgplayer_price", "cardmarket_price", "ebay_price"):
            try:
                val = float(p.get(key, 0) or 0)
                if val > 0:
                    raw_price = val
                    break
            except (TypeError, ValueError):
                pass

    card_name = card.get("name", "")
    pop_url = (
        f"https://www.psacard.com/pop/search-pop-report/?category=31"
        f"&specname={quote(card_name)}"
    )

    return {
        "game":          "yugioh",
        "name":          card_name,
        "set_name":      "",  # YGOPRODeck does not include set in single-card endpoint
        "set_id":        "",
        "number":        str(card.get("id", "")),
        "rarity":        card.get("type", ""),
        "image_url":     image_url,
        "tcgplayer_url": f"https://www.tcgplayer.com/search/yugioh/product?q={quote(card_name)}",
        "cardmarket_url": f"https://www.cardmarket.com/en/YuGiOh/Search?searchString={quote(card_name)}",
        "raw_nm_price":  raw_price,
        "currency":      "USD",
        "psa_pop_url":   pop_url,
    }
