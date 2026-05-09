"""
German → English Pokémon species name translator.

Built from a one-time PokeAPI dump (`data/pokemon_names.json`, 1025 species).
The Pokémon TCG API only indexes English names, but most German users scan
German cards. This module bridges the gap, including a small fuzzy match so
OCR typos like "Dragoren" still resolve to "Dragoran" → "Dragonite".

Public:
    de_to_en(name)            → English species name or None
    translate_card_name(name) → full card name with species translated
                                ("Mega-Dragoran ex" → "Mega-Dragonite ex")
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Optional


_DATA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "pokemon_names.json",
)


@lru_cache(maxsize=1)
def _load_table() -> dict:
    try:
        with open(_DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# ── Public ──────────────────────────────────────────────────────────────────

def de_to_en(name: str) -> Optional[str]:
    """Translate a single German Pokémon species name to English.

    Tolerates OCR typos via:
      • exact normalised match
      • Levenshtein distance ≤ len/5 across the whole name
      • sliding-window match: every 6..12-char substring of the input is
        compared to the species list — handy when OCR prefixes/suffixes
        garbage onto the species name (e.g. "aeMagnDragoren" → "Dragoren"
        slice → "Dragoran" → "Dragonite").
    Returns None if no plausible match.
    """
    if not name:
        return None
    table = _load_table()
    if not table:
        return None

    key = _normalise(name)
    if key in table:
        return table[key]

    # Whole-string fuzzy match.
    best_de, best_d = _best_match(key, table)
    if best_de is not None and best_d <= max(1, len(key) // 5):
        return table[best_de]

    # Slice-fuzzy: try every 6-12 char substring of the input.
    if len(key) >= 6:
        for win in range(min(12, len(key)), 5, -1):
            for i in range(0, len(key) - win + 1):
                sub = key[i:i + win]
                if sub in table:
                    return table[sub]
                de, d = _best_match(sub, table)
                if de is not None and d <= max(1, win // 6):
                    return table[de]
    return None


def _best_match(key: str, table: dict) -> tuple:
    best_de, best_d = None, 999
    for de_name in table:
        # Cheap length pre-filter — Levenshtein is O(m·n) per pair.
        if abs(len(de_name) - len(key)) > 3:
            continue
        d = _levenshtein(key, de_name)
        if d < best_d:
            best_d = d
            best_de = de_name
    return best_de, best_d


def translate_card_name(card_name: str) -> str:
    """
    Translate a full card name string.  Picks the longest token (species
    name candidate), translates it via DE→EN, and rebuilds the string with
    common modifiers ("Mega", "ex", "GX", "V", "VMAX", …) preserved.
    """
    if not card_name:
        return card_name

    tokens = card_name.replace("-", " ").split()
    if not tokens:
        return card_name

    # The species name is the longest alphabetic token in most cases.
    candidates = sorted(
        ((i, t) for i, t in enumerate(tokens) if t.isalpha() and len(t) >= 4),
        key=lambda x: -len(x[1]),
    )
    if not candidates:
        return card_name

    for i, tok in candidates:
        translated = de_to_en(tok)
        if translated:
            new_tokens = list(tokens)
            new_tokens[i] = translated
            return " ".join(new_tokens)
    return card_name


# ── Helpers ─────────────────────────────────────────────────────────────────

def _normalise(s: str) -> str:
    s = s.lower()
    # Strip diacritics common in German Pokémon names (é, ü, etc.)
    table = str.maketrans({"é": "e", "ä": "a", "ö": "o", "ü": "u", "ß": "ss"})
    s = s.translate(table)
    return re.sub(r"[^a-z0-9]", "", s)


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        curr = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[-1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]
