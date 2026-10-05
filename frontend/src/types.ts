export interface Keypoint {
  name: string;
  x: number; // 0.0 - 1.0 (normalized)
  y: number; // 0.0 - 1.0 (normalized)
  conf: number;
}

export interface PointerCoords {
  norm_x: number; // 0.0 - 1.0
  norm_y: number; // 0.0 - 1.0
  raw_x: number;
  raw_y: number;
}

export interface GestureDetectionResult {
  is_active: boolean;
  active_hand: 'left' | 'right' | null;
  pointer: PointerCoords | null;
  nose: Keypoint | null;
  left_wrist: Keypoint | null;
  right_wrist: Keypoint | null;
  landmarks: Keypoint[];
  hand_landmarks?: Keypoint[];
  is_pinching?: boolean;
  fps: number;
  processing_ms: number;
  annotated_frame_base64?: string | null;
  status_text: string;
}

export interface TrackerConfig {
  alpha: number;
  dwell_threshold: number;
  send_debug_frame: boolean;
  min_confidence: number;
  y_reach_top: number;
  y_reach_bottom: number;
}

export interface KeyboardItem {
  id: string;
  text: string;
  category: 'sujetos' | 'verbos' | 'modificadores' | 'lugares' | 'acciones' | string;
  action?: 'delete' | 'clear' | 'speak' | 'space' | 'copy' | null;
  color: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ==============================================================================
// Tipos de Redes Complejas y Análisis Estructural
// ==============================================================================

export interface NodeCentralityItem {
  id: string;
  label: string;
  category: string;
  color: string;
  role?: string;
  degree_raw: number;
  in_degree: number;
  out_degree: number;
  degree_centrality: number;
  in_degree_centrality: number;
  out_degree_centrality: number;
  closeness_centrality: number;
  betweenness_centrality: number;
  pagerank: number;
  eigenvector_centrality: number;
  community: number;
}

export interface GlobalTopologyMetrics {
  num_nodes: number;
  num_edges: number;
  avg_degree: number;
  density: number;
  avg_clustering: number;
  avg_shortest_path: number;
  diameter: number;
  small_world_sigma: number;
  is_small_world: boolean;
  modularity_q: number;
  num_communities: number;
  fiedler_eigenvalue: number;
  reciprocity: number;
  degree_assortativity: number;
}

export interface NullModelMetrics {
  C: number;
  L: number;
  Q: number;
}

export interface NullModelsComparison {
  empirical: NullModelMetrics;
  erdos_renyi: NullModelMetrics;
  watts_strogatz: NullModelMetrics;
  barabasi_albert: NullModelMetrics;
  small_world_sigma: number;
}

export interface PercolationPoint {
  fraction_removed: number;
  giant_component_ratio_random: number;
  giant_component_ratio_betweenness: number;
  giant_component_ratio_degree: number;
}

export interface DiffusionTopItem {
  id: string;
  label: string;
  category: string;
  color: string;
  intensity: number;
  global_energy?: number;
  prob_adjusted?: number;
  prob_global?: number;
}

export interface DiffusionStepItem {
  time: number;
  activations: Record<string, number>;
  top_activated: DiffusionTopItem[];
}

export interface DiffusionForecast {
  source_node: string;
  source_label: string;
  fiedler_eigenvalue: number;
  characteristic_diffusion_time_s: number;
  diffusion_steps: DiffusionStepItem[];
}

export interface MessageEvolutionStep {
  step_index: number;
  selected_token: string;
  label: string;
  num_nodes: number;
  num_edges: number;
  density: number;
  avg_clustering: number;
  entropy: number;
}

export interface GraphNodePayload {
  id: string;
  label: string;
  category: string;
  color: string;
  in_degree: number;
  out_degree: number;
  community: number;
}

export interface GraphEdgePayload {
  source: string;
  target: string;
  weight: number;
}

export interface MessageNetworkAnalysisResult {
  message_text: string;
  message_tokens: string[];
  total_words: number;
  graph_nodes: GraphNodePayload[];
  graph_edges: GraphEdgePayload[];
  evolution_steps: MessageEvolutionStep[];
  message_metrics: GlobalTopologyMetrics;
  topological_centralities: NodeCentralityItem[];
  communities: {
    modularity_q: number;
    num_communities: number;
    communities: Record<number, string[]>;
    node_community_map: Record<string, number>;
  };
  resilience_curve: PercolationPoint[];
  diffusion_forecast: DiffusionForecast;
  semantic_coherence_percentage: number;
  fitts_reduction_percentage: number;
}

export interface StaticNetworkAnalysisResult {
  status: string;
  global_metrics: GlobalTopologyMetrics;
  null_models: NullModelsComparison;
  centralities: NodeCentralityItem[];
  communities: {
    modularity_q: number;
    num_communities: number;
    communities: Record<number, string[]>;
    node_community_map: Record<string, number>;
  };
  resilience_curve: PercolationPoint[];
}
