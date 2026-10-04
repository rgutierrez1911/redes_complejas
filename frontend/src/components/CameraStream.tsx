import { createSignal, createEffect, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { GestureDetectionResult } from '../types';
import { Eye, EyeOff, Maximize2, Minimize2, Video, VideoOff, Hand } from 'lucide-solid';

interface CameraStreamProps {
  videoRefSetter: (el: HTMLVideoElement | null) => void;
  isCameraRunning: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  detectionResult: GestureDetectionResult | null;
  errorMessage: string | null;
  onRetryConnection: () => void;
}

const SKELETON_PAIRS: [string, string][] = [
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
];

const HAND_BONES: [number, number][] = [
  // Pulgar
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Índice
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Medio
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Anular
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Meñique
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palma
  [5, 9], [9, 13], [13, 17],
];

export const CameraStream: Component<CameraStreamProps> = (props) => {
  let canvasOverlayRef: HTMLCanvasElement | undefined;
  const [showSkeleton, setShowSkeleton] = createSignal<boolean>(true);
  const [isMinimized, setIsMinimized] = createSignal<boolean>(false);

  createEffect(() => {
    const canvas = canvasOverlayRef;
    const result = props.detectionResult;
    const skeletonVisible = showSkeleton();

    if (!canvas || !result || !skeletonVisible) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;

    // 1. Draw Body Pose Skeleton
    const kpsMap = new Map<string, { x: number; y: number; conf: number }>();
    if (result.landmarks) {
      result.landmarks.forEach((kp) => {
        kpsMap.set(kp.name, {
          x: kp.x * w,
          y: kp.y * h,
          conf: kp.conf,
        });
      });
    }

    ctx.lineWidth = 2.0;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineCap = 'round';

    SKELETON_PAIRS.forEach(([partA, partB]) => {
      const a = kpsMap.get(partA);
      const b = kpsMap.get(partB);
      if (a && b && a.conf > 0.35 && b.conf > 0.35) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });

    // 2. Draw Nose Activation Reference Line
    const nose = result.nose;
    if (nose && nose.conf > 0.4) {
      const ny = nose.y * h;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(10, ny);
      ctx.lineTo(w - 10, ny);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px JetBrains Mono';
      ctx.fillText('Línea Umbral (Nariz)', 15, ny - 6);

      const nx = nose.x * w;
      ctx.beginPath();
      ctx.arc(nx, ny, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
    }

    // 3. Draw Hand Finger Landmarks (MediaPipe 21 Keypoints)
    const handKps = result.hand_landmarks;
    if (handKps && handKps.length === 21) {
      // Draw finger bones
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = result.is_pinching ? '#dc2626' : 'rgba(52, 211, 153, 0.8)';

      HAND_BONES.forEach(([iA, iB]) => {
        const pA = handKps[iA];
        const pB = handKps[iB];
        if (pA && pB) {
          ctx.beginPath();
          ctx.moveTo(pA.x * w, pA.y * h);
          ctx.lineTo(pB.x * w, pB.y * h);
          ctx.stroke();
        }
      });

      // Draw all finger joint nodes
      handKps.forEach((kp, idx) => {
        const kx = kp.x * w;
        const ky = kp.y * h;

        ctx.beginPath();
        if (idx === 8) {
          // INDEX FINGER TIP (PUNTERO PRINCIPAL)
          ctx.arc(kx, ky, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px JetBrains Mono';
          ctx.fillText('PUNTERO (D8)', kx - 36, ky - 10);
        } else if (idx === 4) {
          // THUMB TIP
          ctx.arc(kx, ky, 5, 0, Math.PI * 2);
          ctx.fillStyle = result.is_pinching ? '#dc2626' : '#f59e0b';
          ctx.fill();
        } else {
          ctx.arc(kx, ky, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fill();
        }
      });
    } else {
      // Fallback: Draw YOLO Wrists if finger model is not tracking
      const leftWrist = result.left_wrist;
      const rightWrist = result.right_wrist;
      const isLeftActive = result.active_hand === 'left';
      const isRightActive = result.active_hand === 'right';

      if (leftWrist && leftWrist.conf > 0.35) {
        const lx = leftWrist.x * w;
        const ly = leftWrist.y * h;
        ctx.beginPath();
        ctx.arc(lx, ly, isLeftActive ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isLeftActive ? '#38bdf8' : '#059669';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.fillText(isLeftActive ? 'Mano Izq [Puntero]' : 'Mano Izq', lx - 30, ly - 8);
      }

      if (rightWrist && rightWrist.conf > 0.35) {
        const rx = rightWrist.x * w;
        const ry = rightWrist.y * h;
        ctx.beginPath();
        ctx.arc(rx, ry, isRightActive ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isRightActive ? '#38bdf8' : '#d97706';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.fillText(isRightActive ? 'Mano Der [Puntero]' : 'Mano Der', rx - 30, ry - 8);
      }
    }
  });

  return (
    <div class={`camera-panel-container ${isMinimized() ? 'camera-minimized' : ''}`}>
      <div class="camera-header">
        <div class="camera-title-wrap">
          <span class={`live-dot ${props.isCameraRunning ? 'live-on' : ''}`} />
          <span class="camera-title">Monitor de Tracking Gestual</span>
        </div>

        <div class="camera-actions">
          <button
            class="cam-ctrl-btn"
            onClick={() => setShowSkeleton(!showSkeleton())}
            title={showSkeleton() ? 'Ocultar Esqueleto' : 'Mostrar Esqueleto'}
          >
            {showSkeleton() ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            class="cam-ctrl-btn"
            onClick={props.isCameraRunning ? props.onStopCamera : props.onStartCamera}
            title={props.isCameraRunning ? 'Detener Cámara' : 'Iniciar Cámara'}
          >
            {props.isCameraRunning ? <VideoOff size={14} /> : <Video size={14} />}
          </button>
          <button
            class="cam-ctrl-btn"
            onClick={() => setIsMinimized(!isMinimized())}
            title={isMinimized() ? 'Expandir' : 'Minimizar'}
          >
            {isMinimized() ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        </div>
      </div>

      <Show when={!isMinimized()}>
        <div class="camera-viewport">
          <video
            ref={props.videoRefSetter}
            class="camera-video-feed"
            autoplay
            playsinline
            muted
          />

          <canvas
            ref={canvasOverlayRef}
            class="camera-canvas-overlay"
            width={640}
            height={480}
          />

          {/* Mode Badge (Finger Tracking / Pinch Active) */}
          <div class="camera-hand-badge">
            <Hand size={12} class="text-blue" />
            <span>
              {props.detectionResult?.is_pinching ? (
                <strong class="text-rose">Pellizco Detectado</strong>
              ) : (
                <>
                  Puntero: <strong>Índice (#8)</strong>
                </>
              )}
            </span>
          </div>

          <Show when={props.errorMessage}>
            <div class="camera-error-overlay">
              <p class="error-text">{props.errorMessage}</p>
              <button class="btn-retry" onClick={props.onRetryConnection}>
                Reintentar Conexión
              </button>
            </div>
          </Show>

          <Show when={!props.isCameraRunning && !props.errorMessage}>
            <div class="camera-placeholder-overlay">
              <VideoOff size={32} class="text-muted" />
              <p>Cámara apagada</p>
              <button class="btn-primary-sm" onClick={props.onStartCamera}>
                Encender Cámara
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
