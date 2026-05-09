"""
Visual debug CLI for the v2 detection + centering pipeline.

Usage:
    python -m backend.debug_centering <image-path> [<image-path> ...]
    python -m backend.debug_centering -o debug-out tests/scans/*.jpg

For each input image, writes a side-by-side diagnostic PNG containing:
  • the original image with the detected card quad outlined,
  • the perspective-corrected card with inner-frame overlays,
  • a text panel listing px/mm distances, ratios and confidence.

Lets you eyeball whether detection + centering is actually correct on
real scans (smartphone or flatbed) without spinning up the web UI.
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import List

import cv2
import numpy as np

from backend.analysis.preprocessor import preprocess
from backend.analysis.centering import analyze_centering


def _draw_quad(img: np.ndarray, quad: np.ndarray, colour=(0, 220, 0)) -> np.ndarray:
    out = img.copy()
    pts = quad.astype(np.int32)
    cv2.polylines(out, [pts], True, colour,
                  thickness=max(2, img.shape[1] // 400))
    for p in pts:
        cv2.circle(out, tuple(p), max(4, img.shape[1] // 200),
                   colour, -1)
    return out


def _draw_centering_overlay(card: np.ndarray, c) -> np.ndarray:
    out = card.copy()
    h, w = out.shape[:2]
    colour = (0, 200, 255) if c.frame_uncertain else (255, 200, 50)
    th = max(2, w // 350)
    # Inner-frame lines.
    cv2.line(out, (c.left_px, 0),  (c.left_px, h), colour, th)
    cv2.line(out, (w - c.right_px, 0), (w - c.right_px, h), colour, th)
    cv2.line(out, (0, c.top_px), (w, c.top_px), colour, th)
    cv2.line(out, (0, h - c.bottom_px), (w, h - c.bottom_px), colour, th)
    # Distance arrows.
    mid_y, mid_x = h // 2, w // 2
    cv2.arrowedLine(out, (0, mid_y), (c.left_px, mid_y), colour, th, tipLength=0.25)
    cv2.arrowedLine(out, (w, mid_y), (w - c.right_px, mid_y), colour, th, tipLength=0.25)
    cv2.arrowedLine(out, (mid_x, 0), (mid_x, c.top_px), colour, th, tipLength=0.25)
    cv2.arrowedLine(out, (mid_x, h), (mid_x, h - c.bottom_px), colour, th, tipLength=0.25)
    return out


def _build_text_panel(width: int, height: int, lines: List) -> np.ndarray:
    """Render a text panel. Items are either str (default style) or
    a tuple (text, is_heading, bgr_colour)."""
    panel = np.full((height, width, 3), 24, dtype=np.uint8)
    y = 30
    for item in lines:
        if isinstance(item, tuple):
            text, big, colour = item
        else:
            text, big, colour = item, False, (240, 240, 240)
        scale = 0.78 if big else 0.55
        thickness = 2 if big else 1
        cv2.putText(panel, text, (16, y), cv2.FONT_HERSHEY_SIMPLEX,
                    scale, colour, thickness, cv2.LINE_AA)
        y += int(36 * (1.2 if big else 1.0))
        if y >= height - 10:
            break
    return panel


def _compose(orig: np.ndarray, card: np.ndarray, lines: List, target_h: int = 1100) -> np.ndarray:
    def _scale_to_h(img, h):
        s = h / img.shape[0]
        return cv2.resize(img, (int(img.shape[1] * s), h), interpolation=cv2.INTER_AREA)

    a = _scale_to_h(orig, target_h)
    b = _scale_to_h(card, target_h)
    panel_w = max(420, target_h // 2)
    panel = _build_text_panel(panel_w, target_h, lines)
    return np.hstack([a, b, panel])


def process(image_path: str, out_dir: str) -> bool:
    pre = preprocess(image_path)
    base = os.path.splitext(os.path.basename(image_path))[0]
    out_path = os.path.join(out_dir, f"debug_{base}.png")

    if pre.error or pre.regions is None:
        print(f"[FAIL] {image_path}: {pre.error}", file=sys.stderr)
        if pre.original is not None:
            err = pre.original.copy()
            cv2.putText(err, "DETECTION FAILED", (40, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 3)
            cv2.imwrite(out_path, err)
        return False

    cent = analyze_centering(pre.regions, is_back=False)
    quad_img = _draw_quad(pre.original, pre.quad) if pre.quad is not None else pre.original
    card_overlay = _draw_centering_overlay(pre.regions.card, cent)

    lines = [
        ("Meck-Grade — Debug Centering", True, (255, 255, 255)),
        f"Datei: {os.path.basename(image_path)}",
        f"Detection: {pre.detection_method}  conf={pre.detection_confidence:.2f}",
        f"px/mm    : {pre.regions.pixels_per_mm:.2f}   (~{pre.dpi_used} dpi)",
        f"Karte    : {pre.regions.card_w} x {pre.regions.card_h} px",
        "",
        ("Detection Gates", True, (200, 255, 200)),
        f"area_frac: {pre.diag_area_frac:.3f}",
        f"solidity : {pre.diag_solidity:.3f}",
        f"aspect   : {pre.diag_aspect:.3f}  (target 1.40)",
        "",
        ("Inner-Frame Distances", True, (200, 230, 255)),
        f"Links  : {cent.left_mm:5.2f} mm   ({cent.left_px} px)",
        f"Rechts : {cent.right_mm:5.2f} mm   ({cent.right_px} px)",
        f"Oben   : {cent.top_mm:5.2f} mm   ({cent.top_px} px)",
        f"Unten  : {cent.bottom_mm:5.2f} mm   ({cent.bottom_px} px)",
        "",
        ("Ratios", True, (200, 255, 200)),
        f"L/R    : {cent.lr_percent}   ratio={cent.lr_ratio:.3f}",
        f"O/U    : {cent.tb_percent}   ratio={cent.tb_ratio:.3f}",
        f"Score  : {cent.centering_score:.1f} / 100",
        f"Konfid.: {cent.confidence:.2f}",
    ]
    if cent.frame_uncertain:
        lines.append(("Innen-Rahmen unsicher", False, (80, 180, 255)))
    for w in pre.diag_warnings:
        lines.append((f"! {w}", False, (80, 220, 255)))
    for note in cent.notes:
        lines.append((f"- {note}", False, (180, 180, 255)))

    composed = _compose(quad_img, card_overlay, lines)
    cv2.imwrite(out_path, composed)
    print(f"[OK]   {image_path}  →  {out_path}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("images", nargs="+", help="Image files to process")
    ap.add_argument("-o", "--out", default="debug_out", help="Output directory")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    ok = 0
    for path in args.images:
        if not os.path.isfile(path):
            print(f"[SKIP] {path}: not a file", file=sys.stderr)
            continue
        if process(path, args.out):
            ok += 1
    print(f"\n{ok}/{len(args.images)} verarbeitet  (Output: {args.out})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
