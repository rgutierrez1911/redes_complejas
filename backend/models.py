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


# ==============================================================================
# Modelos de Redes Complejas y Análisis Estructural
# ==============================================================================

class NodeCentralityItem(BaseModel):
    id: str
    label: str
    category: str
    color: str
    role: Optional[str] = ""
    degree_raw: int
    in_degree: int
    out_degree: int
    degree_centrality: float
    in_degree_centrality: float
    out_degree_centrality: float
    closeness_centrality: float
    betweenness_centrality: float
    pagerank: float
    eigenvector_centrality: float
    community: int


class GlobalTopologyResponse(BaseModel):
    num_nodes: int
    num_edges: int
    avg_degree: float
    density: float
    avg_clustering: float
    avg_shortest_path: float
    diameter: int
    small_world_sigma: float
    is_small_world: bool
    modularity_q: float
    num_communities: int
    fiedler_eigenvalue: float
    reciprocity: float
    degree_assortativity: float


class PercolationPoint(BaseModel):
    fraction_removed: float
    giant_component_ratio_random: float
    giant_component_ratio_betweenness: float
    giant_component_ratio_degree: float


class DiffusionTopItem(BaseModel):
    id: str
    label: str
    category: str
    color: str
    intensity: float  # Probabilidad relativa ajustada (0.0 - 1.0)
    global_energy: Optional[float] = 0.0  # Masa de activación absoluta en la red (0.0 - 1.0)
    prob_adjusted: Optional[float] = 0.0  # Porcentaje condicional ajustado (ej. 34.5%)
    prob_global: Optional[float] = 0.0  # Porcentaje global disipado en el grafo (ej. 5.2%)


class DiffusionStepItem(BaseModel):
    time: float
    activations: dict
    top_activated: List[DiffusionTopItem]


class DiffusionResponse(BaseModel):
    source_node: str
    source_label: str
    fiedler_eigenvalue: float
    characteristic_diffusion_time_s: float
    diffusion_steps: List[DiffusionStepItem]


class MessageEvolutionStep(BaseModel):
    step_index: int
    selected_token: str
    label: str
    num_nodes: int
    num_edges: int
    density: float
    avg_clustering: float
    entropy: float


class MessageAnalysisRequest(BaseModel):
    tokens: Optional[List[str]] = None
    text: Optional[str] = None


class MessageAnalysisResponse(BaseModel):
    message_text: str
    message_tokens: List[str]
    total_words: int
    graph_nodes: List[dict]
    graph_edges: List[dict]
    evolution_steps: List[MessageEvolutionStep]
    message_metrics: GlobalTopologyResponse
    topological_centralities: List[NodeCentralityItem]
    communities: dict
    resilience_curve: List[PercolationPoint]
    diffusion_forecast: dict
    semantic_coherence_percentage: float
    fitts_reduction_percentage: float


class SessionRecordRequest(BaseModel):
    token: str
    timestamp: Optional[float] = None

