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
    lr_ratio: float       # larger side / total (0.5 = perfect)
    tb_ratio: float
    lr_percent: str       # e.g. "55/45"
    tb_percent: str
    centering_score: float


class CornerDetail(BaseModel):
    position: str         # "top_left", "top_right", "bottom_left", "bottom_right"
    whitening_ratio: float
    sharpness_score: float
    angle_deviation: float
    corner_score: float


class EdgeDetail(BaseModel):
    position: str         # "top", "bottom", "left", "right"
    chip_count: int
    fray_intensity: float
    whitening_ratio: float
    edge_score: float


class SurfaceDetail(BaseModel):
    scratch_pixel_count: int
    scratch_ratio: float
    dent_region_count: int
    holo_detected: bool
    holo_damage_score: float
    ssim_score: float
    print_defect_score: float
    surface_score: float


class SubgradeResult(BaseModel):
    centering: float
    corners: float
    edges: float
    surface: float


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


class AnalysisResult(BaseModel):
    session_id: str
    subgrades: SubgradeResult
    grades: GradeResult
    annotated_front_b64: Optional[str] = None
    annotated_back_b64: Optional[str] = None
    clean_front_b64: Optional[str] = None
    clean_back_b64: Optional[str] = None
    centering_front: Optional[CenteringDetail] = None
    centering_back: Optional[CenteringDetail] = None
    corners: List[CornerDetail] = []
    edges: List[EdgeDetail] = []
    surface: Optional[SurfaceDetail] = None
    warnings: List[str] = []
    summary: str = ""
    processing_time_ms: int = 0
    dpi_warning: bool = False
