"""
PDF report generation using reportlab.
Produces a clean A4 report with annotated card images, grade table,
subscore bars and detailed findings.
"""
import base64
import io
from datetime import datetime, timezone
from typing import Optional

from backend.models.response import AnalysisResult

# ── Colors (R, G, B) 0-1 scale ───────────────────────────────────────────────
C_ACCENT = (0.17, 0.32, 0.51)
C_PASS   = (0.15, 0.40, 0.29)
C_WARN   = (0.57, 0.38, 0.05)
C_FAIL   = (0.61, 0.14, 0.21)
C_LIGHT  = (0.96, 0.96, 0.95)
C_BORDER = (0.89, 0.89, 0.86)
C_TEXT   = (0.10, 0.10, 0.10)
C_MUTED  = (0.42, 0.42, 0.42)
C_WHITE  = (1, 1, 1)


def generate_pdf(result: AnalysisResult) -> bytes:
    """Return PDF bytes for the given AnalysisResult."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors

    buf = io.BytesIO()
    w, h = A4        # 595 × 842 pt
    margin = 20 * mm
    content_w = w - 2 * margin

    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Meck-Grade Report — {result.session_id[:8]}")

    y = h - margin   # current y, decrements as we draw

    # ── Header ───────────────────────────────────────────────────────────────
    c.setFillColorRGB(*C_ACCENT)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(margin, y - 14, "Meck-Grade")
    c.setFont("Helvetica", 10)
    c.setFillColorRGB(*C_MUTED)
    c.drawString(margin, y - 28, "TCG Card Pre-Grade Report")
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    c.drawRightString(w - margin, y - 28, date_str)
    y -= 36

    # Divider
    _hline(c, margin, y, w - margin, C_BORDER)
    y -= 10

    # ── Card name (if identified) ─────────────────────────────────────────────
    if result.card_info and result.card_info.name:
        c.setFillColorRGB(*C_TEXT)
        c.setFont("Helvetica-Bold", 13)
        name_line = result.card_info.name
        if result.card_info.set_name:
            name_line += f"  ·  {result.card_info.set_name}"
        c.drawString(margin, y - 14, name_line)
        y -= 22

    # ── Card images ───────────────────────────────────────────────────────────
    img_h = 90 * mm
    img_w = img_h * 2.5 / 3.5   # card aspect ratio
    gap   = 8 * mm

    for side, b64_key, label in [
        ("front", "annotated_front_b64", "Front (annotated)"),
        ("back",  "annotated_back_b64",  "Back"),
    ]:
        b64 = getattr(result, b64_key, None)
        if b64:
            _draw_card_image(c, b64, margin, y - img_h, img_w, img_h, label)
            margin_offset = img_w + gap
            # second image beside first
            if side == "front":
                _last_img_x = margin + img_w + gap
                _last_img_w = img_w
                _last_img_y = y - img_h
                _last_img_label = "Back (annotated)" if result.annotated_back_b64 else "Back"
                _last_img_b64   = result.annotated_back_b64 or result.clean_back_b64
                if _last_img_b64:
                    _draw_card_image(c, _last_img_b64, _last_img_x, _last_img_y,
                                     _last_img_w, img_h, _last_img_label)
                break

    y -= img_h + 14
    _hline(c, margin, y, w - margin, C_BORDER)
    y -= 12

    # ── Grade summary ─────────────────────────────────────────────────────────
    c.setFillColorRGB(*C_ACCENT)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Grade Estimates")
    y -= 16

    grades = [
        ("PSA",  str(result.grades.psa),            result.grades.psa_label),
        ("BGS",  f"{result.grades.bgs.composite:.1f}", _bgs_label(result.grades.bgs)),
        ("CGC",  f"{result.grades.cgc:.1f}",         result.grades.cgc_label),
        ("TAG",  f"{result.grades.tag:.2f}",          "Precision"),
    ]
    box_w = content_w / len(grades) - 4
    x = margin
    for provider, value, label in grades:
        grade_color = _grade_color(float(value))
        _draw_grade_box(c, x, y - 36, box_w, 36, provider, value, label, grade_color)
        x += box_w + 5
    y -= 50

    # ── Subscore bars ─────────────────────────────────────────────────────────
    y -= 6
    c.setFillColorRGB(*C_ACCENT)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(margin, y, "Subscores")
    y -= 14

    sub_items = [
        ("Centering", result.subgrades.centering),
        ("Corners",   result.subgrades.corners),
        ("Edges",     result.subgrades.edges),
        ("Surface",   result.subgrades.surface),
    ]
    for name, score in sub_items:
        y = _draw_score_bar(c, margin, y, content_w, name, score)
        y -= 3

    y -= 6
    _hline(c, margin, y, w - margin, C_BORDER)
    y -= 12

    # ── Centering detail ──────────────────────────────────────────────────────
    if result.centering_front:
        c.setFillColorRGB(*C_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, "Centering")
        y -= 13
        cf = result.centering_front
        _body_line(c, margin, y, f"Front L/R: {cf.lr_percent}   T/B: {cf.tb_percent}   (Score: {cf.centering_score:.0f}/100)")
        y -= 13
        if result.centering_back:
            cb = result.centering_back
            _body_line(c, margin, y, f"Back  L/R: {cb.lr_percent}   T/B: {cb.tb_percent}   (Score: {cb.centering_score:.0f}/100)")
            y -= 13
        y -= 4

    # ── Corners ───────────────────────────────────────────────────────────────
    if result.corners:
        c.setFillColorRGB(*C_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, "Corners")
        y -= 13
        for corner in result.corners:
            pos = corner.position.replace("_", " ").title()
            color = C_PASS if corner.corner_score >= 85 else (C_WARN if corner.corner_score >= 65 else C_FAIL)
            _body_line(c, margin, y,
                       f"{pos}: {corner.corner_score:.0f}/100  "
                       f"(whitening {corner.whitening_ratio*100:.1f}%, "
                       f"angle dev. {corner.angle_deviation:.1f}°)",
                       color=color)
            y -= 13
        y -= 4

    # ── Edges ─────────────────────────────────────────────────────────────────
    if result.edges:
        c.setFillColorRGB(*C_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, "Edges")
        y -= 13
        for edge in result.edges:
            color = C_PASS if edge.edge_score >= 85 else (C_WARN if edge.edge_score >= 65 else C_FAIL)
            _body_line(c, margin, y,
                       f"{edge.position.title()}: {edge.edge_score:.0f}/100  "
                       f"(chips: {edge.chip_count}, fraying: {edge.fray_intensity*100:.1f}%)",
                       color=color)
            y -= 13
        y -= 4

    # ── Surface ───────────────────────────────────────────────────────────────
    if result.surface:
        c.setFillColorRGB(*C_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, "Surface")
        y -= 13
        s = result.surface
        color = C_PASS if s.surface_score >= 85 else (C_WARN if s.surface_score >= 65 else C_FAIL)
        _body_line(c, margin, y, f"Score: {s.surface_score:.0f}/100", color=color)
        y -= 13
        _body_line(c, margin, y,
                   f"Scratches: {s.scratch_pixel_count:,} px ({s.scratch_ratio*100:.3f}%)   "
                   f"Dents: {s.dent_region_count}   SSIM: {s.ssim_score*100:.1f}%")
        y -= 13
        if s.holo_detected:
            _body_line(c, margin, y,
                       f"Holo layer detected — damage score: {s.holo_damage_score*100:.0f}%")
            y -= 13
        y -= 4

    # ── Warnings ──────────────────────────────────────────────────────────────
    if result.warnings:
        _hline(c, margin, y, w - margin, C_BORDER)
        y -= 12
        c.setFillColorRGB(*C_ACCENT)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(margin, y, "Findings & Warnings")
        y -= 13
        for warn in result.warnings:
            _body_line(c, margin + 6, y, f"• {warn}", color=C_WARN)
            y -= 13

    # ── Footer ────────────────────────────────────────────────────────────────
    c.setFillColorRGB(*C_MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w / 2, margin / 2, "Meck-Grade — Pre-grading estimates are indicative only.")

    c.save()
    return buf.getvalue()


# ── Drawing helpers ───────────────────────────────────────────────────────────

def _hline(c, x1, y, x2, color):
    c.setStrokeColorRGB(*color)
    c.line(x1, y, x2, y)


def _draw_grade_box(c, x, y, bw, bh, provider, value, label, color):
    from reportlab.lib.units import mm
    c.setFillColorRGB(*C_LIGHT)
    c.setStrokeColorRGB(*C_BORDER)
    c.roundRect(x, y, bw, bh, 4, fill=1, stroke=1)

    c.setFillColorRGB(*C_MUTED)
    c.setFont("Helvetica", 7)
    c.drawCentredString(x + bw / 2, y + bh - 10, provider)

    c.setFillColorRGB(*color)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(x + bw / 2, y + bh - 27, value)

    c.setFillColorRGB(*C_MUTED)
    c.setFont("Helvetica", 7)
    c.drawCentredString(x + bw / 2, y + 4, label)


def _draw_score_bar(c, x, y, content_w, label, score):
    from reportlab.lib.units import mm
    label_w  = 55
    bar_w    = content_w - label_w - 35
    bar_h    = 7
    val_x    = x + label_w + bar_w + 4

    color = C_PASS if score >= 85 else (C_WARN if score >= 65 else C_FAIL)

    c.setFillColorRGB(*C_MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(x, y, label)

    # Background track
    c.setFillColorRGB(*C_BORDER)
    c.roundRect(x + label_w, y, bar_w, bar_h, 2, fill=1, stroke=0)

    # Filled portion
    fill_w = max(2, bar_w * score / 100)
    c.setFillColorRGB(*color)
    c.roundRect(x + label_w, y, fill_w, bar_h, 2, fill=1, stroke=0)

    # Value
    c.setFillColorRGB(*color)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(val_x, y, f"{score:.0f}")

    return y - bar_h - 4


def _draw_card_image(c, b64: str, x, y, w, h, label: str):
    """Embed a base64 JPEG into the PDF at (x, y) with given dimensions."""
    try:
        from reportlab.lib.utils import ImageReader
        data = base64.b64decode(b64)
        img  = ImageReader(io.BytesIO(data))
        c.drawImage(img, x, y, width=w, height=h, preserveAspectRatio=True)
        c.setFillColorRGB(*C_MUTED)
        c.setFont("Helvetica", 8)
        c.drawCentredString(x + w / 2, y - 9, label)
    except Exception:
        pass


def _body_line(c, x, y, text, color=None):
    c.setFillColorRGB(*(color or C_TEXT))
    c.setFont("Helvetica", 9)
    c.drawString(x, y, text)


def _grade_color(value: float):
    if value >= 9.5: return C_PASS
    if value >= 8.0: return C_ACCENT
    if value >= 6.0: return C_WARN
    return C_FAIL


def _bgs_label(bgs) -> str:
    if bgs.black_label: return "Black Label"
    if bgs.composite >= 9.5: return "Gem Mint"
    if bgs.composite >= 9.0: return "Mint"
    if bgs.composite >= 8.0: return "NM-MT"
    return "Below NM"
