"""
Pydantic response models for Meck-Grade API.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class UploadResponse(BaseModel):
    session_id: str
    front_saved: bool
    back_saved: bool
    front_dpi_estimate: Optional[int] = None
    back_dpi_estimate: Optional[int] = None
    warnings: List[str] = []


class CenteringDetail(BaseModel):
    left_px: int
    right_px: int
    top_px: int
    bottom_px: int
    # Real-world distances in mm (added v2 — uses pixels_per_mm calibration)
    left_mm: float = 0.0
    right_mm: float = 0.0
    top_mm: float = 0.0
    bottom_mm: float = 0.0
    lr_ratio: float
    tb_ratio: float
    lr_percent: str       # e.g. "55/45"
    tb_percent: str
    centering_score: float
    # Confidence + frame-detection flag (added v2)
    confidence: float = 1.0
    frame_uncertain: bool = False


class CornerDetail(BaseModel):
    position: str
    whitening_ratio: float
    sharpness_score: float
    angle_deviation: float
    corner_score: float
    radius_mm: Optional[float] = None
    radius_match: Optional[float] = None
    # Visualisation payload
    crop_b64: str = ""
    crop_w: int = 0
    crop_h: int = 0
    measured_radius_px: float = 0.0
    expected_radius_px: float = 0.0
    whitening_mask_b64: str = ""
    pen_whitening: float = 0.0
    pen_sharpness: float = 0.0
    pen_angle: float = 0.0
    pen_radius: float = 0.0
    whitening_unreliable: bool = False


class EdgeDetail(BaseModel):
    position: str
    chip_count: int
    fray_intensity: float
    whitening_ratio: float
    edge_score: float


class DefectInfo(BaseModel):
    defect_type: str         # "scratch" | "dent"
    shape_class: str         # "linear" | "punctual" | "irregular"
    zone: str                # "corner_zone" | "edge_zone" | "center"
    cx: int
    cy: int
    area_px: int
    severity: float
    weighted_severity: float


class SurfaceDetail(BaseModel):
    scratch_pixel_count: int
    scratch_ratio: float
    dent_region_count: int
    holo_detected: bool
    holo_damage_score: float
    ssim_score: float
    print_defect_score: float
    surface_score: float
    defects: List[DefectInfo] = []


class SubgradeResult(BaseModel):
    centering: float
    corners: Optional[float] = None
    edges: Optional[float] = None
    surface: Optional[float] = None


class BGSSubgrades(BaseModel):
    centering: float
    corners: float
    edges: float
    surface: float
    composite: float
    black_label: bool


class GradeResult(BaseModel):
    psa: int
    psa_label: str
    bgs: BGSSubgrades
    cgc: float
    cgc_label: str
    tag: float
    # Confidence band (added v1.4)
    confidence_pct: int = 0
    grade_low: int = 0
    grade_high: int = 0
    limiting_factor: str = ""   # "centering" | "corners" | "edges" | "surface"
    # Explainability
    top_defect_type: str = ""   # "scratch" | "dent" | ""
    top_defect_zone: str = ""   # "corner_zone" | "edge_zone" | "center" | ""
    grade_without_top_defect: int = 0


class CardInfo(BaseModel):
    """Card identification result from external APIs."""
    game: str = ""
    id: str = ""                  # canonical card id, e.g. "me02.5-290" (tcgdex)
    name: str = ""
    set_name: str = ""
    set_id: str = ""
    number: str = ""
    rarity: str = ""
    image_url: str = ""
    tcgplayer_url: str = ""
    cardmarket_url: str = ""
    raw_nm_price: Optional[float] = None
    currency: str = "USD"
    prices: List[dict] = []       # [{grade, price_str}]
    psa_pop_url: str = ""         # link to PSA population report (v1.4)


class AnalysisResult(BaseModel):
    session_id: str
    subgrades: SubgradeResult
    grades: GradeResult
    annotated_front_b64: Optional[str] = None
    annotated_back_b64: Optional[str] = None
    clean_front_b64: Optional[str] = None
    clean_back_b64: Optional[str] = None
    relief_front_b64: Optional[str] = None
    centering_front: Optional[CenteringDetail] = None
    centering_back: Optional[CenteringDetail] = None
    corners: List[CornerDetail] = []
    edges: List[EdgeDetail] = []
    surface: Optional[SurfaceDetail] = None
    card_info: Optional[CardInfo] = None
    warnings: List[str] = []
    summary: str = ""
    processing_time_ms: int = 0
    dpi_warning: bool = False
    card_detection_method: str = "fallback"
    # While corners/edges/surface analyzers are being rebuilt, this is True
    # and the frontend hides their (placeholder) subscores.
    analyzers_quarantined: bool = True
    # Card-with-margin geometry (for the centering editor — clean_*_b64 is
    # the warped card surrounded by `card_margin_px` of real scan content)
    card_margin_px: int = 0
    card_w_px: int = 0     # native warped card width  (without margin)
    card_h_px: int = 0     # native warped card height (without margin)
