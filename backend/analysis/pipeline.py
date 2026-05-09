"""
Analysis pipeline (v2 — centering-focused).

The corners / edges / surface analyzers are *temporarily quarantined* while
they are being rebuilt: the previous implementation produced unreliable
results (e.g. interpreting print patterns as scratches).  The pipeline still
returns the full response model so the frontend keeps working, but those
subscores come back as `None` and the UI hides them with an "in
Überarbeitung" notice.

Active analyzers:
  • Card detection / perspective correction (v2, smartphone-capable)
  • Inner-frame centering (v2, colour-agnostic)
"""
from __future__ import annotations

import os
import time
from glob import glob
from typing import Optional, Generator

from backend.analysis.preprocessor import preprocess
from backend.analysis.centering import analyze_centering, CenteringResult
from backend.analysis.corners import analyze_corners, CornerResult
from backend.analysis.annotator import annotate
from backend.grading.scorer import compute_subscores
from backend.grading.psa import compute_psa_grade
from backend.grading.bgs import compute_bgs_grade
from backend.grading.cgc import compute_cgc_grade
from backend.grading.tag import compute_tag_grade
from backend.grading.confidence import compute_confidence
from backend.models.response import (
    AnalysisResult, SubgradeResult, GradeResult,
    CenteringDetail, CornerDetail,
)
from backend.utils.image_io import encode_image_b64
from backend.config import MIN_DPI_WARNING

from backend.paths import get_uploads_dir
UPLOADS_DIR = get_uploads_dir()


# Active analyzer set — flip these back on once a rebuilt analyzer ships.
ACTIVE_CORNERS = True
ACTIVE_EDGES   = False
ACTIVE_SURFACE = False


def _progress(pct: int, msg: str) -> dict:
    return {"pct": pct, "msg": msg, "done": False}


def _done(result: AnalysisResult) -> dict:
    return {"pct": 100, "msg": "Done.", "done": True, "result": result.model_dump()}


# ─── Main entry point ─────────────────────────────────────────────────────

def run_pipeline_stream(session_id: str) -> Generator[dict, None, None]:
    start_ms = int(time.time() * 1000)
    warnings: list[str] = []

    yield _progress(5, "Lade Scans…")

    front_path = _find_file(session_id, "front")
    back_path  = _find_file(session_id, "back")

    if not front_path:
        yield _done(_error_result(session_id, "Vorderseite nicht gefunden."))
        return

    # ── Preprocess ────────────────────────────────────────────────────────
    yield _progress(20, "Erkenne Karte (Vorderseite)…")
    front_pre = preprocess(front_path)

    yield _progress(35, "Erkenne Karte (Rückseite)…" if back_path else "Verarbeite…")
    back_pre = preprocess(back_path) if back_path else None

    if front_pre.error or front_pre.regions is None:
        yield _done(_error_result(
            session_id,
            front_pre.error or "Karte konnte nicht erkannt werden.",
        ))
        return

    if back_pre and (back_pre.error or back_pre.regions is None):
        warnings.append(
            "Rückseite konnte nicht erkannt werden — Analyse läuft nur auf Vorderseite."
        )
        back_pre = None

    if front_pre.dpi_used and front_pre.dpi_used < MIN_DPI_WARNING:
        warnings.append(
            f"Bildauflösung niedrig (~{front_pre.dpi_used} dpi). "
            "Für höhere Genauigkeit bitte näher / höher auflösend fotografieren oder scannen."
        )
    dpi_warning = bool(front_pre.dpi_used and front_pre.dpi_used < MIN_DPI_WARNING)

    # Surface detection diagnostics so the user knows when to fine-tune
    # the outer edges in the editor.
    if front_pre.detection_confidence < 0.7:
        warnings.append(
            f"Karten-Erkennung unsicher (Konfidenz {front_pre.detection_confidence:.0%}). "
            "Bitte die grünen Außenkanten im Editor prüfen."
        )
    warnings.extend(front_pre.diag_warnings)

    # ── Centering ─────────────────────────────────────────────────────────
    yield _progress(55, "Messe Zentrierung…")
    front_centering: Optional[CenteringResult] = analyze_centering(
        front_pre.regions, is_back=False
    )
    back_centering: Optional[CenteringResult] = (
        analyze_centering(back_pre.regions, is_back=True) if back_pre else None
    )

    if front_centering and front_centering.frame_uncertain:
        warnings.append(
            "Innen-Rahmen nicht sicher erkannt — Zentrierung mit Vorbehalt. "
            "Bei randlosen / Full-Art-Karten ist das normal."
        )
    if front_centering and front_centering.notes:
        warnings.extend(front_centering.notes)

    # ── Corners ──────────────────────────────────────────────────────────
    front_corners: Optional[CornerResult] = None
    if ACTIVE_CORNERS:
        yield _progress(65, "Prüfe Ecken…")
        try:
            front_corners = analyze_corners(front_pre.regions)
        except Exception as exc:
            warnings.append(f"Ecken-Analyse fehlgeschlagen ({type(exc).__name__}).")
            front_corners = None

    # Edges + Surface remain unsupported — silent (no user-facing notice).
    front_edges   = None
    front_surface = None

    # ── Grading (centering-only composite for now) ────────────────────────
    yield _progress(80, "Berechne Bewertung…")
    centering_score = _avg_centering(front_centering, back_centering)

    # While other analyzers are quarantined, the composite is the centering
    # score alone. PSA mapper still gets the L/R ratio for centering caps.
    corner_score = front_corners.corner_score if front_corners else None
    sub = compute_subscores(
        centering_score=centering_score,
        corner_score=corner_score,
        edge_score=None,
        surface_score=None,
    )
    lr_ratio = front_centering.lr_ratio if front_centering else 0.5
    psa_grade, psa_label = compute_psa_grade(sub, lr_ratio)
    bgs_grade           = compute_bgs_grade(sub)
    cgc_grade, cgc_label = compute_cgc_grade(sub)
    tag_grade           = compute_tag_grade(sub)

    real_corner_score = front_corners.corner_score if front_corners else None
    confidence = compute_confidence(
        {
            "centering": sub.centering,
            "corners":   real_corner_score,
            "edges":     None,
            "surface":   None,
        },
        sub.composite,
        psa_grade,
    )

    # Apply sanity-check penalties to the confidence band.
    aspect_quality = _aspect_score(front_pre.regions.card_w, front_pre.regions.card_h)
    radius_consistency = _radius_consistency_score(front_corners)
    detection_signal = front_pre.detection_confidence * 100.0  # 0–100

    sanity = (aspect_quality + radius_consistency + detection_signal) / 3.0
    # Confidence cannot exceed sanity (confidence x sanity / 100, but only when sanity is low).
    if sanity < 80.0:
        confidence["confidence_pct"] = int(min(
            confidence["confidence_pct"], 30 + sanity * 0.7
        ))
        # Widen the band when we're not sure of the inputs.
        confidence["grade_low"]  = max(1,  confidence["grade_low"]  - 1)
        confidence["grade_high"] = min(10, confidence["grade_high"] + 1)
    if aspect_quality < 70:
        warnings.append(
            f"Karten-Seitenverhältnis weicht ab ({front_pre.regions.card_w}×{front_pre.regions.card_h}px). "
            "Bitte grüne Außenkanten im Editor prüfen."
        )
    if radius_consistency < 70 and front_corners:
        warnings.append(
            "Eckenradius zwischen den 4 Ecken inkonsistent — entweder Ecken-Schaden oder Detection-Drift."
        )

    # ── Editor images (card with surrounding scan-bg margin) ─────────────
    yield _progress(92, "Erzeuge Editor-Bilder…")
    front_editor_img = (
        front_pre.card_with_margin
        if front_pre.card_with_margin is not None
        else front_pre.regions.card
    )
    # The warped editor image is shown at ~1.6× scaled-down on a high-DPI
    # display; quality 78 is visually identical and shaves ~30 % off the row
    # size in result_json (which dominates the DB row).
    clean_front_b64 = encode_image_b64(_clamp_long_edge(front_editor_img, 1100), quality=78)
    annotated_front_b64 = None
    clean_back_b64  = None
    annotated_back_b64 = None
    if back_pre and back_pre.regions:
        back_editor_img = (
            back_pre.card_with_margin
            if back_pre.card_with_margin is not None
            else back_pre.regions.card
        )
        clean_back_b64 = encode_image_b64(_clamp_long_edge(back_editor_img, 1100), quality=78)

    # ── Build response ───────────────────────────────────────────────────
    summary = _generate_summary(psa_grade, psa_label, sub, front_centering)
    elapsed = int(time.time() * 1000) - start_ms

    # Real per-analyzer values (None if inactive). The scorer's placeholders
    # only feed the downstream PSA/BGS mappers; the response surfaces None so
    # the UI can correctly mark a sub-axis as "in Überarbeitung".
    real_corners = front_corners.corner_score if front_corners else None
    real_edges   = None
    real_surface = None

    result = AnalysisResult(
        session_id=session_id,
        subgrades=SubgradeResult(
            centering=sub.centering,
            corners=real_corners,
            edges=real_edges,
            surface=real_surface,
        ),
        grades=GradeResult(
            psa=psa_grade, psa_label=psa_label,
            bgs=bgs_grade,
            cgc=cgc_grade, cgc_label=cgc_label,
            tag=tag_grade,
            confidence_pct=confidence["confidence_pct"],
            grade_low=confidence["grade_low"],
            grade_high=confidence["grade_high"],
            limiting_factor=confidence["limiting_factor"],
        ),
        annotated_front_b64=annotated_front_b64,
        annotated_back_b64=annotated_back_b64,
        clean_front_b64=clean_front_b64,
        clean_back_b64=clean_back_b64,
        centering_front=_centering_detail(front_centering),
        centering_back=_centering_detail(back_centering),
        corners=_corner_details(front_corners),
        edges=[],
        surface=None,
        warnings=warnings,
        summary=summary,
        processing_time_ms=elapsed,
        dpi_warning=dpi_warning,
        card_detection_method=front_pre.detection_method,
        card_margin_px=front_pre.margin_px,
        card_w_px=front_pre.regions.card_w,
        card_h_px=front_pre.regions.card_h,
        analyzers_quarantined=False,
    )
    yield _done(result)


def run_pipeline(session_id: str) -> AnalysisResult:
    """Synchronous wrapper — consumes the generator and returns the final result."""
    result = None
    for event in run_pipeline_stream(session_id):
        if event.get("done"):
            from backend.models.response import AnalysisResult as AR
            result = AR.model_validate(event["result"])
    if result is None:
        result = _error_result(session_id, "Pipeline lieferte kein Ergebnis.")
    return result


# ─── Helpers ──────────────────────────────────────────────────────────────

def _find_file(session_id: str, side: str) -> Optional[str]:
    pattern = os.path.join(UPLOADS_DIR, f"{session_id}_{side}.*")
    matches = glob(pattern)
    return matches[0] if matches else None


def _clamp_long_edge(img, max_edge: int):
    """Resize so the longer edge is at most `max_edge` px (no upscale)."""
    if img is None:
        return img
    import cv2 as _cv
    h, w = img.shape[:2]
    long_edge = max(h, w)
    if long_edge <= max_edge:
        return img
    scale = max_edge / float(long_edge)
    return _cv.resize(img, (int(round(w * scale)), int(round(h * scale))),
                      interpolation=_cv.INTER_AREA)


def _avg_centering(front: Optional[CenteringResult],
                   back:  Optional[CenteringResult]) -> float:
    """
    PSA caps centering on the *worse* side, with a slight bias toward
    front (PSA weights front 75/25). Use weighted-min so a great front +
    average back still scores reasonably while a bad back drags it down.
    """
    if front and back:
        weak = min(front.centering_score, back.centering_score)
        strong = max(front.centering_score, back.centering_score)
        return weak * 0.75 + strong * 0.25
    if front:
        return front.centering_score
    if back:
        return back.centering_score
    return 50.0


def _radius_consistency_score(corners: Optional[CornerResult]) -> float:
    """
    Score (0-100) based on how consistent the 4 corner radii are.
    A well-cut card has all 4 corners within ~5% radius of each other;
    inconsistency points to corner damage or a bad warp.
    """
    if not corners:
        return 100.0
    radii = [c.radius_mm for c in corners.corners if c.radius_mm > 0]
    if len(radii) < 2:
        return 100.0
    mean_r = sum(radii) / len(radii)
    if mean_r <= 0:
        return 100.0
    cv = max(abs(r - mean_r) for r in radii) / mean_r  # 0 = perfect
    # 0 % deviation → 100, 5 % → 90, 15 % → 60, 25 %+ → 0
    return max(0.0, 100.0 - cv * 400.0)


def _aspect_score(card_w: int, card_h: int) -> float:
    """
    The warped card should have aspect 63:88 ≈ 0.7159.  A drift of ≥3 %
    means the detection corners were placed wrong → reduce confidence.
    Returns 0-100 (100 = perfect).
    """
    if card_w <= 0 or card_h <= 0:
        return 50.0
    actual = card_w / card_h
    expected = 63.0 / 88.0
    err = abs(actual - expected) / expected
    return max(0.0, 100.0 - err * 1000.0)  # 0 % → 100, 1 % → 90, 5 % → 50


def _corner_details(cr: Optional[CornerResult]) -> list:
    if not cr:
        return []
    return [
        CornerDetail(
            position=c.position,
            whitening_ratio=c.whitening_ratio,
            sharpness_score=c.sharpness_score,
            angle_deviation=c.angle_deviation,
            corner_score=c.corner_score,
            radius_mm=c.radius_mm,
            radius_match=c.radius_match,
            crop_b64=c.crop_b64,
            crop_w=c.crop_w,
            crop_h=c.crop_h,
            measured_radius_px=c.measured_radius_px,
            expected_radius_px=c.expected_radius_px,
            whitening_mask_b64=c.whitening_mask_b64,
            pen_whitening=c.pen_whitening,
            pen_sharpness=c.pen_sharpness,
            pen_angle=c.pen_angle,
            pen_radius=c.pen_radius,
            whitening_unreliable=c.whitening_unreliable,
        ) for c in cr.corners
    ]


def _centering_detail(c: Optional[CenteringResult]) -> Optional[CenteringDetail]:
    if not c:
        return None
    return CenteringDetail(
        left_px=c.left_px, right_px=c.right_px,
        top_px=c.top_px, bottom_px=c.bottom_px,
        left_mm=c.left_mm, right_mm=c.right_mm,
        top_mm=c.top_mm, bottom_mm=c.bottom_mm,
        lr_ratio=c.lr_ratio, tb_ratio=c.tb_ratio,
        lr_percent=c.lr_percent, tb_percent=c.tb_percent,
        centering_score=c.centering_score,
        confidence=c.confidence,
        frame_uncertain=c.frame_uncertain,
    )


def _generate_summary(psa_grade: int, psa_label: str, sub,
                      front_centering: Optional[CenteringResult]) -> str:
    grade_desc = (
        "Gem-Mint-Zentrierung" if psa_grade == 10 else
        "sehr gute Zentrierung" if psa_grade == 9 else
        "gute Zentrierung" if psa_grade >= 7 else
        "moderate Zentrierung" if psa_grade >= 5 else
        "starke Dezentrierung"
    )
    cent_part = ""
    if front_centering:
        cent_part = (
            f" Zentrierung L/R {front_centering.lr_percent}, "
            f"O/U {front_centering.tb_percent}."
        )
    return (
        f"Vorgrading: PSA {psa_grade} ({psa_label}) — {grade_desc}.{cent_part} "
        "Bewertung basiert auf Zentrierung + Ecken (Whitening, Radius)."
    )


def _error_result(session_id: str, msg: str) -> AnalysisResult:
    from backend.models.response import BGSSubgrades
    return AnalysisResult(
        session_id=session_id,
        subgrades=SubgradeResult(centering=0, corners=None, edges=None, surface=None),
        grades=GradeResult(
            psa=1, psa_label="Poor",
            bgs=BGSSubgrades(centering=1, corners=1, edges=1, surface=1,
                             composite=1, black_label=False),
            cgc=1.0, cgc_label="Poor",
            tag=1.0,
        ),
        warnings=[msg],
        summary=msg,
    )
