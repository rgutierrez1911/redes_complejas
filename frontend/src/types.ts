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
