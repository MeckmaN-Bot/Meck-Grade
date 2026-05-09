"""
TCGdex API integration (https://api.tcgdex.net/v2).

Free, no API key, supports localised card names (de/en/fr/...) and bundles
Cardmarket pricing — exactly what a German Pokémon-grading app wants.
We use this as the primary Pokémon lookup; pokemontcg.io stays as a
fallback for English-only edge cases.

Endpoints used:
  GET /v2/{lang}/cards?name=…    → list  (id, localId, name, [image])
  GET /v2/{lang}/cards/{id}      → full card detail incl. pricing
"""
from __future__ import annotations

from typing import Optional, List
from urllib.parse import quote, urlencode


_BASE = "https://api.tcgdex.net/v2"
_HEADERS = {"User-Agent": "Meck-Grade/1.1"}


def lookup_pokemon_tcgdex(name: str,
                          number: str = "",
                          lang: str = "de",
                          total: str = "") -> Optional[dict]:
    """
    Search for a Pokémon card.

    Tries the requested language first (default German), then falls back to
    English so OCR/user input in either language hits.

    Returns a dict shaped like the rest of the lookup pipeline:
      game / name / set_name / set_id / number / rarity / image_url /
      tcgplayer_url / cardmarket_url / raw_nm_price / currency / prices /
      psa_pop_url
    """
    if not name:
        return None
    try:
        import requests
    except ImportError:
        return None

    languages = (lang, "en") if lang != "en" else ("en",)
    queries = _name_variants(name)

    # When we have a number, prefer the variant whose result list contains
    # a hit with that exact localId — even if a shorter / earlier variant
    # would match something else first.
    target_num = str(number).lstrip("0") if number else ""
    fallback_chosen = None
    fallback_lang = None

    for lng in languages:
        for q in queries:
            hits = _search(lng, q)
            if not hits:
                continue
            if target_num:
                # Strict path: only consider this variant if it contains a
                # localId match.
                num_hits = [h for h in hits if str(h.get("localId", "")).lstrip("0") == target_num]
                if num_hits:
                    chosen = _pick_best(num_hits, number, total, lng)
                    if chosen is not None:
                        detail = _detail(lng, chosen.get("id"))
                        if detail is not None:
                            return _to_card_info(detail, lng)
                # No strict match — record first hit as last-resort fallback
                if fallback_chosen is None:
                    fallback_chosen = hits[0]
                    fallback_lang = lng
                continue

            # No number known — first variant with hits wins.
            chosen = _pick_best(hits, number, total, lng)
            if chosen is None:
                continue
            detail = _detail(lng, chosen.get("id"))
            if detail is not None:
                return _to_card_info(detail, lng)

    if fallback_chosen is not None:
        d = _detail(fallback_lang, fallback_chosen.get("id"))
        if d is not None:
            return _to_card_info(d, fallback_lang)
    return None


def _name_variants(name: str) -> List[str]:
    """
    TCGdex's name index uses hyphen-joined tokens internally
    ("Mega-Dragoran-ex"), so a query with spaces matches nothing.  We try
    several formattings + isolated species token + sliding-window slices
    of long tokens to recover from OCR prefix/suffix junk.
    """
    name = name.strip()
    if not name:
        return []
    out: List[str] = []
    seen = set()
    def push(s: str):
        s = s.strip(" -")
        if len(s) >= 4 and s.lower() not in seen:
            seen.add(s.lower()); out.append(s)

    push(name)
    push(name.replace(" ", "-"))
    base = name.replace(" ex", "").replace(" EX", "").replace(" GX", "").replace(" V", "")
    base = base.strip()
    push(base)
    push(base.replace(" ", "-"))

    tokens = [t for t in name.replace("-", " ").split() if t.isalpha() and len(t) >= 4]
    if tokens:
        push(max(tokens, key=len))

    # Sliding-window slices of long tokens — recovers from OCR prefix/suffix
    # noise like "aeMagnDragoren" → tries "MagnDragor", "Dragor", "agoran".
    # We push *short* slices first so they're reached within the cap; long
    # slices with full prefix-junk rarely win matches.
    for tok in tokens:
        if len(tok) < 6:
            continue
        for win in (5, 6, 7, 8):
            for i in range(0, max(1, len(tok) - win + 1)):
                push(tok[i:i + win])
    return out[:30]


# ─── HTTP helpers ────────────────────────────────────────────────────────────

def _search(lang: str, name: str) -> List[dict]:
    import requests
    # TCGdex name search is substring + accent-insensitive on its side; we
    # send the raw name (URL-encoded) and let it do the work.
    url = f"{_BASE}/{lang}/cards?{urlencode({'name': name})}"
    try:
        r = requests.get(url, headers=_HEADERS, timeout=8)
        if r.status_code != 200:
            return []
        return r.json() or []
    except Exception:
        return []


def _detail(lang: str, card_id: str) -> Optional[dict]:
    if not card_id:
        return None
    import requests
    url = f"{_BASE}/{lang}/cards/{quote(card_id)}"
    try:
        r = requests.get(url, headers=_HEADERS, timeout=8)
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def _pick_best(hits: List[dict], number: str, total: str = "", lang: str = "de") -> Optional[dict]:
    """
    Pick the most likely hit.
      1. If we know both number AND total → fetch each candidate's detail and
         match (localId == number) AND (set.cardCount.* == total).
      2. If only number → first hit whose localId matches.
      3. Fallback → first hit.
    """
    if not hits:
        return None

    if number and total:
        # Filter to localId match first (cheap)
        target = str(number).lstrip("0")
        cands = [h for h in hits if str(h.get("localId", "")).lstrip("0") == target]
        if not cands:
            cands = hits[:6]
        # Confirm via set.cardCount.total — needs detail fetch
        try:
            t_int = int(total)
        except (TypeError, ValueError):
            t_int = None
        if t_int:
            for h in cands:
                d = _detail(lang, h.get("id"))
                if not d:
                    continue
                cc = ((d.get("set") or {}).get("cardCount") or {})
                if cc.get("total") == t_int or cc.get("official") == t_int:
                    return h
            # No total match — pick localId match if any
            if cands:
                return cands[0]

    if number:
        target = str(number).lstrip("0")
        for h in hits:
            if str(h.get("localId", "")).lstrip("0") == target:
                return h
    return hits[0]


# ─── Conversion ──────────────────────────────────────────────────────────────

def _to_card_info(card: dict, lang: str) -> dict:
    set_info = card.get("set") or {}
    set_name = set_info.get("name", "")
    set_id   = set_info.get("id", "")
    name     = card.get("name", "")
    number   = str(card.get("localId") or "")

    image_url = card.get("image", "")
    if image_url and "/png" not in image_url and "/high" not in image_url \
            and not image_url.endswith((".png", ".jpg", ".jpeg")):
        image_url = f"{image_url}/low.png"

    pricing = card.get("pricing") or {}
    cm = pricing.get("cardmarket") or {}
    tcgp = pricing.get("tcgplayer") or {}

    # Build a price tier list for the UI, EUR if Cardmarket present.
    prices_rows: List[dict] = []
    raw_nm_price = None
    currency = "EUR"
    if cm:
        unit = cm.get("unit") or "EUR"
        currency = unit
        raw_nm_price = cm.get("trend") or cm.get("avg") or cm.get("low")

        def _fmt(label: str, val) -> Optional[dict]:
            if val is None:
                return None
            return {"grade": label, "price_str": _money(val, unit)}

        for row in (
            _fmt("Cardmarket Trend", cm.get("trend")),
            _fmt("Cardmarket Ø",     cm.get("avg")),
            _fmt("Tiefstpreis",      cm.get("low")),
            _fmt("Ø 7 Tage",         cm.get("avg7")),
            _fmt("Ø 30 Tage",        cm.get("avg30")),
        ):
            if row:
                prices_rows.append(row)

    if tcgp and not raw_nm_price:
        # tcgplayer price block (rare for German cards) — extract a single market price
        for tier in ("holofoil", "reverseHolofoil", "normal"):
            t = (tcgp.get(tier) or {}) if isinstance(tcgp, dict) else {}
            v = t.get("market") or t.get("mid")
            if v:
                try:
                    raw_nm_price = float(v)
                    currency = "USD"
                    break
                except (TypeError, ValueError):
                    pass

    # Always provide a Cardmarket search URL so the button is always shown.
    # If idProduct is known use the direct product URL, otherwise fall back to search.
    if cm.get("idProduct"):
        cardmarket_url = (
            f"https://www.cardmarket.com/de/Pokemon/Products/Singles/"
            f"{quote(set_name)}/{quote(name)}?language=4"
        )
    else:
        cardmarket_url = (
            f"https://www.cardmarket.com/de/Pokemon/Products/Singles"
            f"?searchString={quote(name)}"
        )

    # PSA's pop pages use opaque slug URLs we can't construct deterministically,
    # so use a Google site-search that lands on the correct page reliably.
    _pop_q = " ".join(part for part in (
        "PSA pop", name, set_name, f"#{number}" if number else "",
    ) if part).strip()
    pop_url = (
        "https://www.google.com/search?q="
        + quote(f"site:psacard.com {_pop_q}")
    )

    return {
        "game":          "pokemon",
        "id":            card.get("id", ""),
        "name":          name,
        "set_name":      set_name,
        "set_id":        set_id,
        "number":        number,
        "rarity":        card.get("rarity", ""),
        "image_url":     image_url,
        "tcgplayer_url": "",  # TCGdex does not expose direct TCGPlayer URL
        "cardmarket_url": cardmarket_url,
        "raw_nm_price":  raw_nm_price,
        "currency":      currency,
        "prices":        prices_rows,
        "psa_pop_url":   pop_url,
    }


def _money(val, unit: str) -> str:
    try:
        v = float(val)
    except (TypeError, ValueError):
        return ""
    sym = "€" if unit.upper() == "EUR" else ("$" if unit.upper() == "USD" else unit + " ")
    return f"{sym}{v:,.2f}"
