import base64
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import torch
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    torch = None
    YOLO = None
    YOLO_AVAILABLE = False

from backend.models import GestureDetectionResult, Keypoint, PointerCoords, TrackerConfig


# COCO Pose Keypoint mapping
KEYPOINT_NAMES = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]

NOSE_IDX = 0
L_WRIST_IDX = 9   # Model's left wrist -> User's RIGHT hand in mirrored view
R_WRIST_IDX = 10  # Model's right wrist -> User's LEFT hand in mirrored view


class SmoothPointer:
    """Filtro de suavizado exponencial (EMA) para eliminar temblores y saltos."""

    def __init__(self, alpha: float = 0.35):
        self.smooth_norm_x: Optional[float] = None
        self.smooth_norm_y: Optional[float] = None
        self.alpha = alpha
        self.active_hand: str = "derecha"  # "izquierda" | "derecha"

    def set_alpha(self, alpha: float):
        self.alpha = float(np.clip(alpha, 0.05, 0.95))

    def update(self, target_norm: Optional[Tuple[float, float]]) -> Optional[Tuple[float, float]]:
        if target_norm is None:
            self.smooth_norm_x = None
            self.smooth_norm_y = None
            return None

        tx, ty = target_norm
        if self.smooth_norm_x is None or self.smooth_norm_y is None:
            self.smooth_norm_x = tx
            self.smooth_norm_y = ty
        else:
            self.smooth_norm_x = (1 - self.alpha) * self.smooth_norm_x + self.alpha * tx
            self.smooth_norm_y = (1 - self.alpha) * self.smooth_norm_y + self.alpha * ty

        return float(np.clip(self.smooth_norm_x, 0.0, 1.0)), float(np.clip(self.smooth_norm_y, 0.0, 1.0))

    def reset(self):
        self.smooth_norm_x = None
        self.smooth_norm_y = None


class PoseTracker:
    """Analizador de poses YOLOv8 y motor de gestos para control por puntero."""

    def __init__(self, model_path: str = "yolov8n-pose.pt", config: Optional[TrackerConfig] = None):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[PoseTracker] Cargando modelo YOLOv8-Pose ({model_path}) en {self.device}...")
        self.model = YOLO(model_path)
        self.config = config or TrackerConfig()
        self.pointer_filter = SmoothPointer(alpha=self.config.alpha)

        self.is_active = False
        self.last_frame_time = time.time()
        self.fps = 0.0

    def update_config(self, new_config: TrackerConfig):
        self.config = new_config
        self.pointer_filter.set_alpha(new_config.alpha)

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        flip_horizontal: bool = True,
        request_debug_frame: Optional[bool] = None,
    ) -> GestureDetectionResult:
        t_start = time.perf_counter()

        now = time.time()
        dt = now - self.last_frame_time
        if dt > 0:
            current_fps = 1.0 / dt
            self.fps = 0.85 * self.fps + 0.15 * current_fps if self.fps > 0 else current_fps
        self.last_frame_time = now

        # 1. Flip horizontal para efecto espejo si se requiere
        if flip_horizontal:
            frame = cv2.flip(frame_bgr, 1)
        else:
            frame = frame_bgr.copy()

        h, w, _ = frame.shape

        # 2. Inferencia YOLO Pose
        results = self.model(frame, device=self.device, verbose=False)

        raw_target_pos: Optional[Tuple[float, float]] = None
        active_pointing_hand_label: Optional[str] = None
        hand_id: Optional[str] = None

        nose_kp: Optional[Keypoint] = None
        left_wrist_kp: Optional[Keypoint] = None
        right_wrist_kp: Optional[Keypoint] = None
        all_landmarks: List[Keypoint] = []

        if results and len(results[0].keypoints) > 0:
            kpts_xy = results[0].keypoints.xy[0].cpu().numpy()
            kpts_conf = (
                results[0].keypoints.conf[0].cpu().numpy()
                if results[0].keypoints.conf is not None
                else np.ones(len(kpts_xy), dtype=np.float32)
            )

            # Construir lista de todos los keypoints normalizados
            for idx, (pt, conf) in enumerate(zip(kpts_xy, kpts_conf)):
                name = KEYPOINT_NAMES[idx] if idx < len(KEYPOINT_NAMES) else f"kp_{idx}"
                all_landmarks.append(
                    Keypoint(
                        name=name,
                        x=float(pt[0] / w) if w > 0 else 0.0,
                        y=float(pt[1] / h) if h > 0 else 0.0,
                        conf=float(conf),
                    )
                )

            if len(kpts_xy) > 10:
                nose = kpts_xy[NOSE_IDX]
                real_left_wrist = kpts_xy[R_WRIST_IDX]   # Mano IZQUIERDA del usuario en imagen espejada
                real_right_wrist = kpts_xy[L_WRIST_IDX]  # Mano DERECHA del usuario en imagen espejada

                nose_conf = float(kpts_conf[NOSE_IDX])
                left_wrist_conf = float(kpts_conf[R_WRIST_IDX])
                right_wrist_conf = float(kpts_conf[L_WRIST_IDX])

                nose_kp = Keypoint(name="nose", x=float(nose[0] / w), y=float(nose[1] / h), conf=nose_conf)
                left_wrist_kp = Keypoint(name="left_wrist", x=float(real_left_wrist[0] / w), y=float(real_left_wrist[1] / h), conf=left_wrist_conf)
                right_wrist_kp = Keypoint(name="right_wrist", x=float(real_right_wrist[0] / w), y=float(real_right_wrist[1] / h), conf=right_wrist_conf)

                # Gestos de activación / parada:
                # Mano IZQUIERDA cerca o arriba de la nariz -> ACTIVAR
                if nose_conf > 0.35 and left_wrist_conf > 0.35:
                    if real_left_wrist[1] < (nose[1] + 25) and real_left_wrist[1] > 0:
                        self.is_active = True

                # Mano DERECHA cerca o arriba de la nariz -> DETENER
                if nose_conf > 0.35 and right_wrist_conf > 0.35:
                    if real_right_wrist[1] < (nose[1] + 25) and real_right_wrist[1] > 0:
                        self.is_active = False

                # Detección de mano que apunta
                min_conf = self.config.min_confidence
                left_valid = left_wrist_conf > min_conf and real_left_wrist[0] > 0
                right_valid = right_wrist_conf > min_conf and real_right_wrist[0] > 0

                if left_valid and right_valid:
                    # Menor Y = mano más arriba
                    if real_left_wrist[1] < real_right_wrist[1] - 30:
                        self.pointer_filter.active_hand = "izquierda"
                    elif real_right_wrist[1] < real_left_wrist[1] - 30:
                        self.pointer_filter.active_hand = "derecha"
                elif left_valid:
                    self.pointer_filter.active_hand = "izquierda"
                elif right_valid:
                    self.pointer_filter.active_hand = "derecha"

                # Obtener coordenadas objetivo
                if self.pointer_filter.active_hand == "izquierda" and left_valid:
                    raw_target_pos = (float(real_left_wrist[0]), float(real_left_wrist[1]))
                    active_pointing_hand_label = "Mano Izquierda"
                    hand_id = "left"
                elif self.pointer_filter.active_hand == "derecha" and right_valid:
                    raw_target_pos = (float(real_right_wrist[0]), float(real_right_wrist[1]))
                    active_pointing_hand_label = "Mano Derecha"
                    hand_id = "right"

        # 3. Mapeo ergonómico del puntero
        # y_min más bajo (cuello/pecho) para que el usuario alcance la fila superior sin fatiga
        pointer_obj: Optional[PointerCoords] = None
        if raw_target_pos is not None:
            raw_px, raw_py = raw_target_pos
            x_min = w * 0.10
            x_max = w * 0.90
            px_norm = float(np.clip((raw_px - x_min) / (x_max - x_min), 0.0, 1.0))

            y_min = h * self.config.y_reach_top
            y_max = h * self.config.y_reach_bottom
            if y_max <= y_min:
                y_max = y_min + 0.10
            py_norm = float(np.clip((raw_py - y_min) / (y_max - y_min), 0.0, 1.0))

            smoothed = self.pointer_filter.update((px_norm, py_norm))
            if smoothed is not None:
                sm_x, sm_y = smoothed
                pointer_obj = PointerCoords(
                    norm_x=sm_x,
                    norm_y=sm_y,
                    raw_x=raw_px,
                    raw_y=raw_py,
                )
        else:
            self.pointer_filter.update(None)

        # 4. Generar frame anotado con OpenCV para streaming si es solicitado
        debug_frame_b64: Optional[str] = None
        should_send_debug = (
            request_debug_frame if request_debug_frame is not None else self.config.send_debug_frame
        )

        if should_send_debug:
            annotated_frame = self._render_opencv_overlay(
                frame,
                all_landmarks,
                nose_kp,
                left_wrist_kp,
                right_wrist_kp,
                pointer_obj,
                active_pointing_hand_label,
            )
            # Codificar a JPEG y base64
            _, buffer = cv2.imencode(".jpg", annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            debug_frame_b64 = base64.b64encode(buffer).decode("utf-8")

        proc_ms = (time.perf_counter() - t_start) * 1000.0

        status_str = "ACTIVO (Puntero Habilitado)" if self.is_active else "DETENIDO (Levanta mano izq)"

        return GestureDetectionResult(
            is_active=self.is_active,
            active_hand=hand_id,
            pointer=pointer_obj,
            nose=nose_kp,
            left_wrist=left_wrist_kp,
            right_wrist=right_wrist_kp,
            landmarks=all_landmarks,
            fps=round(self.fps, 1),
            processing_ms=round(proc_ms, 1),
            annotated_frame_base64=debug_frame_b64,
            status_text=status_str,
        )

    def _render_opencv_overlay(
        self,
        frame: np.ndarray,
        landmarks: List[Keypoint],
        nose: Optional[Keypoint],
        left_wrist: Optional[Keypoint],
        right_wrist: Optional[Keypoint],
        pointer: Optional[PointerCoords],
        pointing_hand_label: Optional[str],
    ) -> np.ndarray:
        h, w, _ = frame.shape
        out = frame.copy()

        # Dibujar esqueleto y keypoints
        for kp in landmarks:
            if kp.conf > 0.35:
                kx, ky = int(kp.x * w), int(kp.y * h)
                cv2.circle(out, (kx, ky), 4, (0, 240, 255), -1)

        # Resaltar nariz
        if nose and nose.conf > 0.4:
            nx, ny = int(nose.x * w), int(nose.y * h)
            cv2.circle(out, (nx, ny), 7, (0, 255, 255), -1)

        # Resaltar muñeca izquierda
        if left_wrist and left_wrist.conf > 0.35:
            lx, ly = int(left_wrist.x * w), int(left_wrist.y * h)
            is_p = self.pointer_filter.active_hand == "izquierda"
            col = (0, 255, 255) if is_p else (0, 255, 0)
            cv2.circle(out, (lx, ly), 10 if is_p else 6, col, -1)
            cv2.putText(out, "Izq [Puntero]" if is_p else "Izq (Activar)", (lx - 50, ly - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1, cv2.LINE_AA)

        # Resaltar muñeca derecha
        if right_wrist and right_wrist.conf > 0.35:
            rx, ry = int(right_wrist.x * w), int(right_wrist.y * h)
            is_p = self.pointer_filter.active_hand == "derecha"
            col = (0, 255, 255) if is_p else (0, 165, 255)
            cv2.circle(out, (rx, ry), 10 if is_p else 6, col, -1)
            cv2.putText(out, "Der [Puntero]" if is_p else "Der (Parar)", (rx - 50, ry - 12), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1, cv2.LINE_AA)

        # HUD superior
        status_color = (0, 220, 100) if self.is_active else (50, 50, 230)
        cv2.rectangle(out, (10, 10), (280, 48), (20, 24, 30), -1)
        cv2.rectangle(out, (10, 10), (280, 48), status_color, 2)
        status_txt = "ESTADO: ACTIVO" if self.is_active else "ESTADO: DETENIDO"
        cv2.putText(out, status_txt, (20, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.65, status_color, 2, cv2.LINE_AA)

        # Info puntero y FPS inferior
        hand_txt = f"Puntero: {pointing_hand_label}" if pointing_hand_label else "Puntero: [Buscando...]"
        cv2.putText(out, hand_txt, (15, h - 35), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(out, f"FPS: {self.fps:.1f}", (w - 110, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1, cv2.LINE_AA)

        return out
