from typing import List, Optional
from pydantic import BaseModel, Field


class Keypoint(BaseModel):
    name: str
    x: float
    y: float
    conf: float


class PointerCoords(BaseModel):
    # Normalized coordinates in [0.0, 1.0] representing screen/canvas space
    norm_x: float = Field(..., ge=0.0, le=1.0)
    norm_y: float = Field(..., ge=0.0, le=1.0)
    # Raw pixel coordinates on the source frame
    raw_x: float
    raw_y: float


class GestureDetectionResult(BaseModel):
    is_active: bool
    active_hand: Optional[str] = None  # "left" | "right" | None
    pointer: Optional[PointerCoords] = None
    nose: Optional[Keypoint] = None
    left_wrist: Optional[Keypoint] = None
    right_wrist: Optional[Keypoint] = None
    landmarks: List[Keypoint] = Field(default_factory=list)
    fps: float = 0.0
    processing_ms: float = 0.0
    annotated_frame_base64: Optional[str] = None
    status_text: str = "DETENIDO"


class TrackerConfig(BaseModel):
    alpha: float = Field(default=0.35, ge=0.05, le=0.95, description="EMA smoothing factor")
    min_confidence: float = Field(default=0.35, ge=0.1, le=1.0)
    send_debug_frame: bool = Field(default=False)
    dwell_threshold: float = Field(default=0.8, ge=0.2, le=3.0)
    y_reach_top: float = Field(default=0.28, ge=0.10, le=0.60, description="Nivel superior ergonómico de la mano para alcanzar el tope de la pantalla")
    y_reach_bottom: float = Field(default=0.80, ge=0.50, le=0.95, description="Nivel inferior ergonómico de la mano")


class KeyboardItem(BaseModel):
    id: str
    text: str
    category: str
    action: Optional[str] = None
    color: str
