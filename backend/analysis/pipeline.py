"""
Analysis pipeline orchestrator.
Provides both a synchronous wrapper (run_pipeline) and a
generator-based version (run_pipeline_stream) for SSE progress streaming.
"""
import os
import time
import json
from glob import glob
from typing import Optional, Generator, Any

from backend.analysis.preprocessor import preprocess, PreprocessResult
from backend.analysis.centering import analyze_centering, CenteringResult
from backend.analysis.corners import analyze_corners, CornerResult
from backend.analysis.edges import analyze_edges, EdgeResult
from backend.analysis.surface import analyze_surface, SurfaceResult
from backend.analysis.annotator import annotate
from backend.grading.scorer import compute_subscores
from backend.grading.psa import compute_psa_grade
from backend.grading.bgs import compute_bgs_grade
from backend.grading.cgc import compute_cgc_grade
from backend.grading.tag import compute_tag_grade
from backend.grading.confidence import compute_confidence
from backend.models.response import (
    AnalysisResult, SubgradeResult, GradeResult,
    CenteringDetail, CornerDetail, EdgeDetail, SurfaceDetail,
)
from backend.utils.image_io import encode_image_b64
from backend.config import MIN_DPI_WARNING

UPLOADS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads"
)


def _progress(pct: int, msg: str) -> dict:
    return {"pct": pct, "msg": msg, "done": False}


def _done(result: AnalysisResult) -> dict:
    return {"pct": 100, "msg": "Done.", "done": True, "result": result.model_dump()}


def run_pipeline_stream(session_id: str) -> Generator[dict, None, None]:
    """
    Generator-based pipeline. Yields progress dicts and finally a done dict.
    Each yielded dict has: {pct, msg, done, [result]}.
    """
    start_ms = int(time.time() * 1000)
    warnings: list[str] = []

    yield _progress(5, "Locating uploaded scans…")

    front_path = _find_file(session_id, "front")
    back_path  = _find_file(session_id, "back")

    if not front_path:
        result = _error_result(session_id, "Front image not found for this session.")
        yield _done(result)
        return

    # --- Preprocess ---
    yield _progress(12, "Detecting card boundaries (front)…")
    front_pre = preprocess(front_path)

    yield _progress(20, "Detecting card boundaries (back)…" if back_path else "Processing front scan…")
    back_pre = preprocess(back_path) if back_path else None

    if front_pre.detection_method == "fallback":
        warnings.append(
            "Card boundaries could not be detected automatically — using full image. "
            "For best results, place the card on a dark OR white background with no other objects."
        )
    if front_pre.error or front_pre.regions is None:
        warnings.append("Could not process front scan. Please check the file is a valid image.")

    dpi_warning = False
    if front_pre.dpi_used < MIN_DPI_WARNING:
        warnings.append(
            f"Scan resolution appears low ({front_pre.dpi_used} DPI). "
            "Scan at 300+ DPI for best accuracy."
        )
        dpi_warning = True

    # --- Centering ---
    yield _progress(30, "Measuring centering…")
    front_centering: Optional[CenteringResult] = None
    back_centering:  Optional[CenteringResult] = None

    if front_pre.regions:
        front_centering = analyze_centering(front_pre.regions, is_back=False)
    if back_pre and back_pre.regions:
        back_centering = analyze_centering(back_pre.regions, is_back=True)

    # --- Corners ---
    yield _progress(45, "Analyzing corners…")
    front_corners: Optional[CornerResult] = None
    if front_pre.regions:
        front_corners = analyze_corners(front_pre.regions)

    # --- Edges ---
    yield _progress(58, "Checking edges for chips and fraying…")
    front_edges: Optional[EdgeResult] = None
    if front_pre.regions:
        front_edges = analyze_edges(front_pre.regions)

    # --- Surface ---
    yield _progress(70, "Scanning surface for scratches and dents…")
    front_surface: Optional[SurfaceResult] = None
    if front_pre.regions:
        front_surface = analyze_surface(front_pre.regions)

    # --- Grading ---
    yield _progress(85, "Computing grade estimates…")
    centering_score = _avg_centering(front_centering, back_centering)
    corner_score    = front_corners.corner_score  if front_corners  else 85.0
    edge_score      = front_edges.edge_score      if front_edges    else 85.0
    surface_score   = front_surface.surface_score if front_surface  else 85.0

    sub = compute_subscores(centering_score, corner_score, edge_score, surface_score)
    lr_ratio = front_centering.lr_ratio if front_centering else 0.5
    psa_grade, psa_label = compute_psa_grade(sub, lr_ratio)
    bgs_grade = compute_bgs_grade(sub)
    cgc_grade, cgc_label = compute_cgc_grade(sub)
    tag_grade = compute_tag_grade(sub)
    confidence = compute_confidence(
        {"centering": sub.centering, "corners": sub.corners,
         "edges": sub.edges, "surface": sub.surface},
        sub.composite if hasattr(sub, "composite") else (
            sub.centering * 0.25 + sub.corners * 0.30 +
            sub.edges * 0.25 + sub.surface * 0.20),
        psa_grade,
    )

    # --- Annotate ---
    yield _progress(93, "Generating annotated images…")
    annotated_front_b64 = None
    clean_front_b64     = None
    annotated_back_b64  = None
    clean_back_b64      = None

    if front_pre.regions:
        annotated_front = annotate(
            front_pre.regions, front_centering, front_corners, front_edges, front_surface
        )
        annotated_front_b64 = encode_image_b64(annotated_front)
        clean_front_b64     = encode_image_b64(front_pre.regions.card)

    if back_pre and back_pre.regions:
        annotated_back = annotate(back_pre.regions, back_centering, None, None, None)
        annotated_back_b64 = encode_image_b64(annotated_back)
        clean_back_b64     = encode_image_b64(back_pre.regions.card)

    # --- Assemble result ---
    corners_detail = []
    if front_corners:
        for c in front_corners.corners:
            corners_detail.append(CornerDetail(
                position=c.position,
                whitening_ratio=c.whitening_ratio,
                sharpness_score=c.sharpness_score,
                angle_deviation=c.angle_deviation,
                corner_score=c.corner_score,
            ))

    edges_detail = []
    if front_edges:
        for e in front_edges.edges:
            edges_detail.append(EdgeDetail(
                position=e.position,
                chip_count=e.chip_count,
                fray_intensity=e.fray_intensity,
                whitening_ratio=e.whitening_ratio,
                edge_score=e.edge_score,
            ))

    surface_detail = None
    if front_surface:
        surface_detail = SurfaceDetail(
            scratch_pixel_count=front_surface.scratch_pixel_count,
            scratch_ratio=front_surface.scratch_ratio,
            dent_region_count=front_surface.dent_region_count,
            holo_detected=front_surface.holo_detected,
            holo_damage_score=front_surface.holo_damage_score,
            ssim_score=front_surface.ssim_score,
            print_defect_score=front_surface.print_defect_score,
            surface_score=front_surface.surface_score,
        )

    warnings += _generate_warnings(
        front_centering, back_centering, front_corners, front_edges, front_surface
    )
    summary = _generate_summary(psa_grade, psa_label, sub, warnings)
    elapsed = int(time.time() * 1000) - start_ms

    result = AnalysisResult(
        session_id=session_id,
        subgrades=SubgradeResult(
            centering=sub.centering,
            corners=sub.corners,
            edges=sub.edges,
            surface=sub.surface,
        ),
        grades=GradeResult(
            psa=psa_grade,
            psa_label=psa_label,
            bgs=bgs_grade,
            cgc=cgc_grade,
            cgc_label=cgc_label,
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
        corners=corners_detail,
        edges=edges_detail,
        surface=surface_detail,
        warnings=warnings,
        summary=summary,
        processing_time_ms=elapsed,
        dpi_warning=dpi_warning,
        card_detection_method=front_pre.detection_method,
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
        result = _error_result(session_id, "Pipeline produced no result.")
    return result


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _find_file(session_id: str, side: str) -> Optional[str]:
    pattern = os.path.join(UPLOADS_DIR, f"{session_id}_{side}.*")
    matches = glob(pattern)
    return matches[0] if matches else None


def _avg_centering(
    front: Optional[CenteringResult], back: Optional[CenteringResult]
) -> float:
    if front and back:
        return (front.centering_score + back.centering_score) / 2.0
    elif front:
        return front.centering_score
    elif back:
        return back.centering_score
    return 85.0


def _centering_detail(c: Optional[CenteringResult]):
    if not c:
        return None
    return CenteringDetail(
        left_px=c.left_px,
        right_px=c.right_px,
        top_px=c.top_px,
        bottom_px=c.bottom_px,
        lr_ratio=c.lr_ratio,
        tb_ratio=c.tb_ratio,
        lr_percent=c.lr_percent,
        tb_percent=c.tb_percent,
        centering_score=c.centering_score,
    )


def _generate_warnings(front_c, back_c, corners, edges, surface) -> list[str]:
    msgs = []

    if front_c:
        if front_c.lr_ratio > 0.60:
            msgs.append(
                f"Centering (L/R): {front_c.lr_percent} — exceeds PSA 9 tolerance (60/40)."
            )
        elif front_c.lr_ratio > 0.55:
            msgs.append(
                f"Centering (L/R): {front_c.lr_percent} — misses PSA 10 requirement (55/45)."
            )
        if front_c.tb_ratio > 0.60:
            msgs.append(
                f"Centering (T/B): {front_c.tb_percent} — exceeds PSA 9 tolerance."
            )

    if corners:
        for c in corners.corners:
            if c.corner_score < 85:
                pos = c.position.replace("_", " ").title()
                msgs.append(
                    f"{pos} corner shows damage (score {c.corner_score:.0f}/100). "
                    f"Whitening: {c.whitening_ratio * 100:.1f}%."
                )

    if edges:
        for e in edges.edges:
            if e.edge_score < 85:
                details = []
                if e.chip_count > 0:
                    details.append(f"{e.chip_count} chip(s)")
                if e.fray_intensity > 0.2:
                    details.append("fraying")
                if e.whitening_ratio > 0.1:
                    details.append("ink wear")
                if details:
                    msgs.append(f"{e.position.title()} edge: {', '.join(details)} detected.")

    if surface:
        if surface.scratch_ratio > 0.005:
            msgs.append(
                f"Surface scratches detected ({surface.scratch_pixel_count:,} affected pixels)."
            )
        if surface.dent_region_count > 0:
            msgs.append(
                f"{surface.dent_region_count} dent/indentation region(s) detected on surface."
            )
        if surface.holo_detected and surface.holo_damage_score > 0.2:
            msgs.append(
                "Holo layer damage detected. Scratches in holo foil significantly affect grade."
            )

    return msgs


def _generate_summary(psa_grade: int, psa_label: str, sub, warnings: list) -> str:
    if not warnings:
        condition = "no significant defects detected"
    elif len(warnings) == 1:
        condition = "one issue identified"
    else:
        condition = f"{len(warnings)} issues identified"

    grade_desc = (
        "Gem Mint condition" if psa_grade == 10 else
        "near-perfect condition" if psa_grade == 9 else
        "very good condition" if psa_grade >= 7 else
        "moderate condition" if psa_grade >= 5 else
        "significant wear"
    )

    return (
        f"This card is estimated at PSA {psa_grade} ({psa_label}) — {grade_desc}. "
        f"Analysis found {condition}. "
        f"Subscores: Centering {sub.centering:.0f}, Corners {sub.corners:.0f}, "
        f"Edges {sub.edges:.0f}, Surface {sub.surface:.0f}."
    )


def _error_result(session_id: str, msg: str) -> AnalysisResult:
    from backend.models.response import BGSSubgrades
    return AnalysisResult(
        session_id=session_id,
        subgrades=SubgradeResult(centering=0, corners=0, edges=0, surface=0),
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
