# Architecture Index & Context Cache (`ARCH.md`)

## 1. High-Level System Architecture & Flow
AeroHand AI is a real-time, contactless assistive Augmentative and Alternative Communication (AAC) system that translates hand and body gestures into virtual keyboard input and synthetic speech. The architecture couples a browser-based frontend (SolidJS + MediaPipe) with a Python computer vision backend (FastAPI + YOLOv8-Pose) over bidirectional WebSockets for low-latency gesture tracking, ergonomic pointer normalization, dwell-time typing, and text-to-speech output.

```
[Webcam Feed] 
      │
      ├──> [Client: MediaPipe HandLandmarker (GPU/WASM)] ──> Fingertip (#8) Pointer & Pinch Click
      │                                                                  │
      └──> [WebSocket Binary JPEG Stream]                                │
                  │                                                      ▼
                  ▼                                            [Virtual Keyboard Engine]
           [FastAPI Server]                                    - Dwell-time / Pinch Trigger
                  │                                            - Word Chip Aggregation
                  ▼                                                      │
         [YOLOv8-Pose Tracker]                                           ▼
         - Body Keypoint Extraction                            [Sentence Builder & TTS]
         - Left/Right Hand Activation Gesture                  - Web Audio Synthesizer
         - EMA Coordinate Smoothing Filter                     - Web Speech API SpeechSynthesis
                  │
                  ▼
         [WebSocket JSON Result] ──> State & Telemetry Sync
```

---

## 2. Directory & Module Map

- `/`: Root workspace containing configurations, ML weight files, and orchestration scripts.
  - `streamlit_app.py`: Alternative full-stack Streamlit frontend (100% Python) with WebRTC & OpenCV local stream modes.
  - `build.sh`: Build automation script for Python `.venv` setup and frontend compilation.
  - `requirements.txt`: Python runtime dependency specifications.
  - `package.json`: NPM workspace definition managing the frontend package.
  - `yolov8n-pose.pt`: Pre-trained YOLOv8 nano pose model weights.
  - `hand_landmarker.task`: MediaPipe hand tracking binary model task.
- `backend/`: FastAPI application, computer vision processing, and complex network analysis module.
  - `backend/main.py`: Application entry point, HTTP REST endpoints, WebSocket streaming handler, static file server, and network analysis endpoints.
  - `backend/models.py`: Pydantic schemas for keypoints, pointer coordinates, telemetry, tracker configurations, and complex network graph metrics.
  - `backend/network_analysis.py`: Complex Networks analytical engine (topological metrics, null models, spectral centralities, Louvain communities, percolation resilience, message evolution, and continuous Laplacian diffusion).
  - `backend/pose_tracker.py`: YOLOv8-Pose inference pipeline, ergonomic pointer mapping, and exponential moving average (EMA) filter.
- `frontend/`: Single-page client application built with SolidJS, TypeScript, and Vite.
  - `frontend/vite.config.ts`: Vite build config with Solid plugin and `/api` + `/ws` reverse proxy definitions.
  - `frontend/src/main.tsx`: Frontend bootstrap entry point.
  - `frontend/src/App.tsx`: Root dashboard orchestrator managing layout, state, keyboard items, and settings modal.
  - `frontend/src/types.ts`: TypeScript type definitions matching backend data contracts.
  - `frontend/src/hooks/useWebcamStream.ts`: Custom hook managing camera capture, MediaPipe HandLandmarker client inference, WebSocket lifecycle, and frame streaming loop.
  - `frontend/src/components/CameraStream.tsx`: Video stream monitor with Canvas 2D overlay rendering pose skeletons and hand bones.
  - `frontend/src/components/VirtualKeyboard.tsx`: Interactive AAC keyboard with category grouping, laser pointer HUD, and dwell-time/pinch trigger engine.
  - `frontend/src/components/SentenceBuilder.tsx`: Accumulated sentence bar with word removal, clipboard copy, and TTS trigger.
  - `frontend/src/components/Header.tsx`: Top telemetry bar showing connection status, FPS, latency, and activation toggle.
  - `frontend/src/components/SettingsModal.tsx`: Ergonomic sensitivity, dwell time, EMA alpha, camera device, and language configuration dialog.
  - `frontend/src/utils/sound.ts`: Zero-dependency Web Audio API tactile feedback synthesizer and Web Speech API TTS wrapper.

---

## 3. Public Interfaces, Types & API Contracts

### Backend Data Schemas (`backend/models.py`)
```python
class Keypoint(BaseModel):
    name: str
    x: float  # 0.0 - 1.0 (normalized)
    y: float  # 0.0 - 1.0 (normalized)
    conf: float

class PointerCoords(BaseModel):
    norm_x: float  # [0.0, 1.0] screen space
    norm_y: float  # [0.0, 1.0] screen space
    raw_x: float
    raw_y: float

class TrackerConfig(BaseModel):
    alpha: float = Field(default=0.35, ge=0.05, le=0.95)
    min_confidence: float = Field(default=0.35, ge=0.1, le=1.0)
    send_debug_frame: bool = Field(default=False)
    dwell_threshold: float = Field(default=0.8, ge=0.2, le=3.0)
    y_reach_top: float = Field(default=0.28, ge=0.10, le=0.60)
    y_reach_bottom: float = Field(default=0.80, ge=0.50, le=0.95)

class KeyboardItem(BaseModel):
    id: str
    text: str
    category: str
    action: Optional[str] = None
    color: str

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
```

### Backend REST & WebSocket Endpoints (`backend/main.py`)
```
GET  /api/health            -> {"status": str, "service": str, "device": str, "model": str}
GET  /api/config            -> {"tracker_config": TrackerConfig, "keyboard_items": List[KeyboardItem]}
POST /api/config            -> In: TrackerConfig | Out: {"status": "updated", "config": dict}
GET  /api/network/static    -> Global topology metrics, null models, centralities, Louvain communities & resilience
POST /api/network/message-analysis -> In: MessageAnalysisRequest | Out: MessageAnalysisResponse (dynamic sequence evolution, Louvain, diffusion forecast, Fitts law reduction)
GET  /api/network/diffusion -> In: ?source_id=str&time_s=float | Out: Laplacian continuous diffusion steps
GET  /api/network/resilience -> In: ?steps=int | Out: Percolation curves (random vs betweenness vs degree attack)
POST /api/network/session/record -> In: SessionRecordRequest | Out: Dynamic live session tracking update
GET  /api/network/session/summary -> Accumulated live session network analysis
POST /api/network/session/clear   -> Resets live session graph
WS   /ws/stream             -> Bidirectional frame/state/network streaming
  Inbound Binary:           JPEG/WebP raw image buffer
  Inbound Text JSON:        {"type": "config", "data": TrackerConfig}
                          | {"type": "set_active", "active": bool}
                          | {"type": "word_selected", "token": str}
                          | {"type": "analyze_sentence", "tokens": List[str]}
                          | {"type": "ping", "timestamp": number}
  Outbound Text JSON:       GestureDetectionResult
                          | {"type": "config_ack", "config": dict}
                          | {"type": "state_ack", "is_active": bool}
                          | {"type": "network_diffusion_update", "data": dict}
                          | {"type": "message_network_analysis_result", "data": dict}
                          | {"type": "pong", "timestamp": number}
                          | {"error": str}
GET  /{full_path:path}      -> Serves SPA static files from frontend/dist
```

### Backend Classes (`backend/pose_tracker.py`)
```python
class SmoothPointer:
    def __init__(self, alpha: float = 0.35) -> None: ...
    def set_alpha(self, alpha: float) -> None: ...
    def update(self, target_norm: Optional[Tuple[float, float]]) -> Optional[Tuple[float, float]]: ...
    def reset(self) -> None: ...

class PoseTracker:
    def __init__(self, model_path: str = "yolov8n-pose.pt", config: Optional[TrackerConfig] = None) -> None: ...
    def update_config(self, new_config: TrackerConfig) -> None: ...
    def process_frame(self, frame_bgr: np.ndarray, flip_horizontal: bool = True, request_debug_frame: Optional[bool] = None) -> GestureDetectionResult: ...
```

### Frontend Type Contracts (`frontend/src/types.ts`)
```typescript
export interface Keypoint { name: string; x: number; y: number; conf: number; }
export interface PointerCoords { norm_x: number; norm_y: number; raw_x: number; raw_y: number; }
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
```

### Frontend Public Utilities & Hooks
- `useWebcamStream(options?: UseWebcamStreamOptions)` (`frontend/src/hooks/useWebcamStream.ts`):
  - Returns: `{ setVideoRef, connectionStatus, isCameraRunning, detectionResult, errorMessage, clientFps, latencyMs, config, videoDevices, selectedDeviceId, isMediaPipeReady, startCamera, stopCamera, setSelectedDeviceId, toggleActiveState, updateConfig, connectWebSocket }`
- `sounds` (`frontend/src/utils/sound.ts`):
  - `setMuted(muted: boolean): void`
  - `playHoverTick(): void`
  - `playSelectSound(isAction?: boolean): void`
  - `playDeleteSound(): void`
  - `playToggleActive(active: boolean): void`
  - `speak(text: string, lang?: string): void`

---

## 4. Key Dependencies & Side Effects

### External Services & APIs
- **MediaPipe Tasks Vision WASM CDN**: `@mediapipe/tasks-vision` loaded via `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`.
- **MediaPipe Hand Model Asset**: Remote float16 task loaded from `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.
- **Browser Web APIs**:
  - `MediaDevices.getUserMedia()`: Camera capture stream.
  - `AudioContext` (Web Audio API): Procedural sine/sawtooth sound synthesis.
  - `SpeechSynthesis` (Web Speech API): Client-side multilingual text-to-speech engine.
  - `Clipboard API`: Copying sentence text.

### State Stores & Persistence
- **Backend State**: In-memory singleton `PoseTracker` holding model weights, active status flag, FPS timers, and pointer EMA coordinate history.
- **Frontend State**: Reactive SolidJS signals (`createSignal`) managing UI words list, device ID selections, websocket connection state, and telemetry metrics. No persistent DB required.

### Runtime Environment & Hardware
- **Python**: Python 3.12 managed via virtual environment at `.venv/`.
- **PyTorch Device**: Automatically selects CUDA GPU (`cuda`) if available, falling back to CPU.
- **Vite Dev Server**: Port 5173 (proxies `/api` and `/ws` to port 8000).
- **FastAPI / Uvicorn**: Port 8000 (serves REST, WebSockets, and static frontend build `frontend/dist`).

---

## 5. File Locator Rules for AI Agents

- **Auth & Middleware**: `backend/main.py` (CORSMiddleware setup and static dist route fallback).
- **Computer Vision & Pose Estimation Logic**: `backend/pose_tracker.py` (YOLO keypoints, gesture thresholds, EMA filter) and `frontend/src/hooks/useWebcamStream.ts` (MediaPipe hand landmarker & pinch detection).
- **Data Models & Contracts**:
  - Backend: `backend/models.py`
  - Frontend: `frontend/src/types.ts`
- **Virtual Keyboard UI & Dwell Interaction Engine**: `frontend/src/components/VirtualKeyboard.tsx`
- **Sentence Accumulation & Copy/TTS Actions**: `frontend/src/components/SentenceBuilder.tsx`
- **Audio & Speech Synthesis**: `frontend/src/utils/sound.ts`
- **Video Rendering & Overlay Canvas**: `frontend/src/components/CameraStream.tsx`
- **Application Layout & Global Styles**: `frontend/src/App.tsx`, `frontend/src/App.css`, `frontend/src/index.css`
- **Build Scripts & Configuration**: `build.sh`, `package.json`, `frontend/package.json`, `requirements.txt`, `frontend/vite.config.ts`
