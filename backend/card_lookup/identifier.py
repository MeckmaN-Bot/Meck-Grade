"""
Card identification from a perspective-corrected scan.

Two pieces of information are extracted:
  • the card NAME (top-of-card title bar)
  • the card NUMBER e.g. "290/217" (bottom-left strip on Pokémon cards)

The number is what makes a Pokémon TCG API query *definitive* — the same
name appears across many sets, but `name + number` resolves to a single
specific printing.  We OCR both, then return a dict; callers that only
care about the name use `extract_card_name()` for back-compat.

Robustness for full-art / holographic backgrounds:
  • Try several preprocess variants (Otsu, adaptive, CLAHE, colour-masked)
  • Keep the result with the highest tesseract confidence
  • Strip OCR junk and normalise spacing afterwards
"""
from __future__ import annotations

import re
from typing import Optional, Dict, List, Tuple

import cv2
import numpy as np


# ─── Public API ──────────────────────────────────────────────────────────────

def extract_card_info(card_img: np.ndarray) -> Dict[str, str]:
    """
    Returns:
      {"name": str, "number": str, "total": str}
    All fields may be empty on failure.  `number` is e.g. "290",
    `total` e.g. "217" — together they form "290/217".
    """
    out = {"name": "", "number": "", "total": ""}
    if card_img is None or card_img.size == 0:
        return out
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return out

    out["name"] = _ocr_name(card_img)
    num, total = _ocr_number(card_img)
    out["number"] = num
    out["total"] = total
    return out


def extract_card_name(card_img: np.ndarray) -> str:
    """Back-compat shim — returns just the name string."""
    return extract_card_info(card_img).get("name", "")


# ─── Name OCR ────────────────────────────────────────────────────────────────

def _ocr_name(card_img: np.ndarray) -> str:
    h, w = card_img.shape[:2]
    # Title-bar strips. Multiple candidate crops because card layouts vary
    # (full-art shifts the title slightly, older sets put it lower, etc.).
    strips = [
        card_img[int(h * 0.04):int(h * 0.10), int(w * 0.18):int(w * 0.78)],
        card_img[int(h * 0.03):int(h * 0.10), int(w * 0.10):int(w * 0.85)],
        card_img[int(h * 0.05):int(h * 0.11), int(w * 0.20):int(w * 0.80)],
    ]
    psm_modes = (7, 8, 6)
    # Hyphen and apostrophe MUST be omitted from a tesseract whitelist —
    # they get parsed as command-line flags by pytesseract's arg builder.
    # We post-process the raw text and re-allow hyphens / apostrophes there.
    whitelist = (
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
    )

    best_text = ""
    best_score = -1.0
    for strip in strips:
        if strip.size == 0:
            continue
        for _, img in _preprocess_variants(strip, target_height=140):
            for psm in psm_modes:
                text, conf = _ocr_with_confidence(img, psm=psm, whitelist=whitelist)
                text = _clean_name(text)
                if not _looks_like_a_name(text):
                    continue
                if conf > best_score:
                    best_score = conf
                    best_text = text
    return best_text


def _looks_like_a_name(text: str) -> bool:
    """
    Heuristic: a real card name has at least one ≥ 4-char word, and at
    least 50 % of its letters live in such words.  Filters out OCR noise
    like "5eD AD gopemGX VA Ya" while accepting "Mega Dragoran ex".
    """
    if not text:
        return False
    total_letters = sum(c.isalpha() for c in text)
    if total_letters < 4:
        return False
    long_word_letters = sum(len(w) for w in text.split() if len(w) >= 4 and w.isalpha())
    if long_word_letters == 0:
        return False
    return long_word_letters / max(total_letters, 1) >= 0.50


# ─── Number OCR ──────────────────────────────────────────────────────────────

def _ocr_number(card_img: np.ndarray) -> Tuple[str, str]:
    """
    Locate the bottom "NUM/TOTAL" strip and read it.
    Returns (num, total). Best-effort — returns ("", "") on failure.

    Approach:
      1. Try a generous bottom-strip with CLAHE + sharpen — PSM 11/12 work
         best on the small "290/217"-style printed text.
      2. Several tighter sub-strips for older set layouts.
      3. Aggressive regex on raw output: any "\\d+/\\d+" wins.
    """
    h, w = card_img.shape[:2]
    strips: List[np.ndarray] = [
        # Wide modern strip (Mega-Dragoran, Sword & Shield, Scarlet & Violet)
        card_img[int(h * 0.93):int(h * 0.99), int(w * 0.05):int(w * 0.55)],
        # Same with right shift for cards that bias the number further right
        card_img[int(h * 0.93):int(h * 0.99), int(w * 0.16):int(w * 0.55)],
        # Tight crop right around the number
        card_img[int(h * 0.94):int(h * 0.985), int(w * 0.20):int(w * 0.45)],
        # Legacy bottom-right (Base Set / Fossil)
        card_img[int(h * 0.93):int(h * 0.99), int(w * 0.55):int(w * 0.95)],
        # Legacy "below illustrator" wide
        card_img[int(h * 0.92):int(h * 0.99), int(w * 0.05):int(w * 0.95)],
    ]

    candidates: list[tuple[float, str, str]] = []
    for strip in strips:
        if strip.size < 100:
            continue
        for img in _strong_number_variants(strip):
            padded = cv2.copyMakeBorder(img, 30, 30, 30, 30,
                                        cv2.BORDER_CONSTANT, value=255)
            for psm in (11, 12, 6, 7, 8, 13):
                # `image_to_string` returns raw text with all punctuation
                # preserved — critical for keeping the "/" between num/total
                # which `image_to_data` sometimes drops as low-confidence.
                text = _ocr_raw_text(padded, psm=psm)
                num, total = _parse_card_number(text)
                if not num:
                    continue
                # Strong preference for results with a parsed total — that
                # proves the "/" was recognised (much harder OCR).
                score = (4 if total else 0) + len(num) + len(total) * 0.5
                candidates.append((score, num, total))
    if not candidates:
        return "", ""
    candidates.sort(reverse=True)
    return candidates[0][1], candidates[0][2]


def _ocr_raw_text(img: np.ndarray, *, psm: int) -> str:
    import pytesseract
    try:
        return pytesseract.image_to_string(
            img, config=f"--psm {psm} --oem 3"
        ).strip()
    except Exception:
        return ""


def _strong_number_variants(strip: np.ndarray) -> List[np.ndarray]:
    """CLAHE + sharpen + Otsu — much better for the tiny printed NUM/TOTAL."""
    out = []
    g = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY) if strip.ndim == 3 else strip
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    eq = clahe.apply(g)
    big = cv2.resize(eq, (eq.shape[1] * 6, eq.shape[0] * 6),
                     interpolation=cv2.INTER_CUBIC)
    sharp = cv2.filter2D(big, -1,
                         np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]))
    for src in (big, sharp):
        _, otsu = cv2.threshold(src, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        _, otsu_inv = cv2.threshold(src, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        out.extend([otsu, otsu_inv])
    return out


def _parse_card_number(raw: str) -> Tuple[str, str]:
    """Extract NUM/TOTAL from OCR output. Tolerant of whitespace + junk.

    Returns the most plausible (num, total) pair: prefer one where the
    total is large enough (≥ num, ≥ 50) to look like a real set total.
    """
    if not raw:
        return "", ""
    # Find ALL "<num>/<total>" matches; prefer the one with the largest
    # plausible total (≥ 20 — set totals are never tiny). Note: num CAN
    # exceed total for secret-rare cards (e.g. 290/217 in Erhabene Helden),
    # so we don't reject those.
    best = None
    best_total = -1
    for m in re.finditer(r"(\d{1,4})\s*[/\\IlOo]\s*(\d{1,4})", raw):
        try:
            n = int(m.group(1)); t = int(m.group(2))
        except ValueError:
            continue
        if t < 20 or n < 1 or n > 1500 or t > 1500:
            continue
        if t > best_total:
            best_total = t
            best = (str(n), str(t))
    if best:
        return best
    # Sometimes only the number prints on full-art (no total). Take a
    # bare digit run 2-4 chars (single-digit unreliable).
    m2 = re.search(r"\b(\d{2,4})\b", raw)
    return (m2.group(1) if m2 else ""), ""


# ─── Preprocess variants ─────────────────────────────────────────────────────

def _preprocess_variants(strip: np.ndarray,
                         target_height: int) -> List[Tuple[str, np.ndarray]]:
    """
    Yield several candidate binarisations of the same strip — tesseract
    is sensitive to thresholding, especially on holographic backgrounds.
    """
    if strip.size == 0:
        return []
    gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY) if strip.ndim == 3 else strip

    # Upscale so small text becomes legible.
    h0 = gray.shape[0]
    if h0 > 0 and target_height > h0:
        scale = target_height / h0
        new_size = (int(gray.shape[1] * scale), int(gray.shape[0] * scale))
        gray = cv2.resize(gray, new_size, interpolation=cv2.INTER_CUBIC)

    out: List[Tuple[str, np.ndarray]] = []

    # Variant 1: Otsu on raw gray
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(("otsu", otsu))
    out.append(("otsu_inv", cv2.bitwise_not(otsu)))

    # Variant 2: CLAHE then Otsu (boosts local contrast on holo)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    eq = clahe.apply(gray)
    _, otsu_clahe = cv2.threshold(eq, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(("clahe_otsu", otsu_clahe))
    out.append(("clahe_otsu_inv", cv2.bitwise_not(otsu_clahe)))

    # Variant 3: adaptive
    adaptive = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10,
    )
    out.append(("adaptive", adaptive))
    out.append(("adaptive_inv", cv2.bitwise_not(adaptive)))

    # Variant 4: CLAHE adaptive
    adaptive_clahe = cv2.adaptiveThreshold(
        eq, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 10,
    )
    out.append(("clahe_adaptive", adaptive_clahe))

    return out


def _ocr_with_confidence(img: np.ndarray, *, psm: int, whitelist: str = "") -> Tuple[str, float]:
    """Run tesseract; return (text, mean_confidence_0_to_100)."""
    import pytesseract
    config = f"--psm {psm} --oem 3"
    if whitelist:
        config += f" -c tessedit_char_whitelist={whitelist}"
    try:
        data = pytesseract.image_to_data(
            img, config=config, output_type=pytesseract.Output.DICT,
        )
    except Exception:
        return "", 0.0
    words = []
    confs = []
    for i, w in enumerate(data.get("text", [])):
        w = (w or "").strip()
        if not w:
            continue
        try:
            c = float(data["conf"][i])
        except (TypeError, ValueError):
            continue
        if c < 0:
            continue
        words.append(w)
        confs.append(c)
    text = " ".join(words)
    conf = sum(confs) / len(confs) if confs else 0.0
    return text, conf


def _clean_name(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9 \-']", "", raw)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Reject one-character or very short noise.
    if len(cleaned) < 2:
        return ""
    return cleaned
