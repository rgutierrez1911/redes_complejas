import { createSignal, onMount, onCleanup } from 'solid-js';
import type { ConnectionStatus, GestureDetectionResult, Keypoint, PointerCoords, TrackerConfig } from '../types';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface UseWebcamStreamOptions {
  wsUrl?: string;
  targetFps?: number;
  initialConfig?: TrackerConfig;
  autoStart?: boolean;
}

export function useWebcamStream(options: UseWebcamStreamOptions = {}) {
  const wsUrl = options.wsUrl ?? '/ws/stream';
  const targetFps = options.targetFps ?? 30;
  const initialConfig = options.initialConfig ?? {
    alpha: 0.35,
    dwell_threshold: 0.8,
    send_debug_frame: false,
    min_confidence: 0.35,
    y_reach_top: 0.28,
    y_reach_bottom: 0.80,
  };
  const autoStart = options.autoStart ?? true;

  let videoElement: HTMLVideoElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let wsInstance: WebSocket | null = null;
  let streamInstance: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let lastSendTime = 0;
  let isSendingFrame = false;
  let handLandmarker: HandLandmarker | null = null;

  // Smoothing state for finger pointer
  let smoothNormX: number | null = null;
  let smoothNormY: number | null = null;

  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [isCameraRunning, setIsCameraRunning] = createSignal<boolean>(false);
  const [detectionResult, setDetectionResult] = createSignal<GestureDetectionResult | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [clientFps, setClientFps] = createSignal<number>(0);
  const [latencyMs, setLatencyMs] = createSignal<number>(0);
  const [config, setConfig] = createSignal<TrackerConfig>(initialConfig);
  const [videoDevices, setVideoDevices] = createSignal<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = createSignal<string>('');
  const [isMediaPipeReady, setIsMediaPipeReady] = createSignal<boolean>(false);

  // Initialize MediaPipe HandLandmarker for millimeter-precision Index Finger tracking
  const initMediaPipeHands = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
      setIsMediaPipeReady(true);
      console.log('✅ MediaPipe HandLandmarker cargado con éxito en GPU/WebGL.');
    } catch (err) {
      console.warn('MediaPipe HandLandmarker no se pudo inicializar en el cliente, usando YOLO fallback:', err);
    }
  };

  const loadDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(videoInputs);
      if (videoInputs.length > 0 && !selectedDeviceId()) {
        setSelectedDeviceId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('No se pudieron enumerar dispositivos de video:', err);
    }
  };

  const connectWebSocket = () => {
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let fullWsUrl = wsUrl;
    if (wsUrl.startsWith('/')) {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const port = window.location.port === '5173' ? '8000' : window.location.port;
      fullWsUrl = `${protocol}//${window.location.hostname}${port ? `:${port}` : ''}${wsUrl}`;
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(fullWsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnectionStatus('connected');
      setErrorMessage(null);
      ws.send(JSON.stringify({ type: 'config', data: config() }));
    };

    ws.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          const data = JSON.parse(event.data);
          if (data.status_text !== undefined) {
            // Merge with local finger tracking if available
            setDetectionResult((prev) => {
              const base = data as GestureDetectionResult;
              if (prev && prev.hand_landmarks && prev.hand_landmarks.length > 0) {
                return {
                  ...base,
                  pointer: prev.pointer || base.pointer,
                  hand_landmarks: prev.hand_landmarks,
                  is_pinching: prev.is_pinching,
                  active_hand: prev.active_hand || base.active_hand,
                };
              }
              return base;
            });

            const now = performance.now();
            const roundtrip = Math.max(1, Math.round(now - lastSendTime));
            setLatencyMs(roundtrip);
          }
        }
      } catch (err) {
        console.error('Error parseando mensaje de WebSocket:', err);
      } finally {
        isSendingFrame = false;
      }
    };

    ws.onerror = (err) => {
      console.error('Error en conexión WebSocket:', err);
      setConnectionStatus('error');
      setErrorMessage('Error al conectar con el backend de procesamiento (FastAPI).');
      isSendingFrame = false;
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      isSendingFrame = false;
    };

    wsInstance = ws;
  };

  const startCamera = async (deviceId?: string) => {
    try {
      setErrorMessage(null);
      if (streamInstance) {
        streamInstance.getTracks().forEach((t) => t.stop());
      }

      const targetDevice = deviceId || selectedDeviceId();
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: targetDevice ? { exact: targetDevice } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamInstance = stream;

      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play();
      }

      setIsCameraRunning(true);
      startStreamingLoop();
      await loadDevices();
    } catch (err: any) {
      console.error('Error accediendo a la cámara web:', err);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Permite el acceso para continuar.'
          : `No se pudo iniciar la cámara: ${err.message || 'Dispositivo no disponible'}`
      );
      setIsCameraRunning(false);
    }
  };

  const stopCamera = () => {
    if (streamInstance) {
      streamInstance.getTracks().forEach((track) => track.stop());
      streamInstance = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    setIsCameraRunning(false);
  };

  const toggleActiveState = (forceActive?: boolean) => {
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      const current = detectionResult();
      const targetState = forceActive !== undefined ? forceActive : !(current?.is_active ?? false);
      wsInstance.send(JSON.stringify({ type: 'set_active', active: targetState }));
    }
  };

  const updateConfig = (newConfig: Partial<TrackerConfig>) => {
    const updated = { ...config(), ...newConfig };
    setConfig(updated);
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify({ type: 'config', data: updated }));
    }
  };

  const startStreamingLoop = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    if (!canvasElement) {
      canvasElement = document.createElement('canvas');
      canvasElement.width = 640;
      canvasElement.height = 480;
    }

    const ctx = canvasElement.getContext('2d', { willReadFrequently: false });
    let frameCount = 0;
    let lastFpsCalc = performance.now();
    const frameIntervalMs = 1000 / targetFps;

    const streamLoop = (timestamp: number) => {
      const elapsed = timestamp - lastSendTime;

      frameCount++;
      if (timestamp - lastFpsCalc >= 1000) {
        setClientFps(Math.round((frameCount * 1000) / (timestamp - lastFpsCalc)));
        frameCount = 0;
        lastFpsCalc = timestamp;
      }

      if (videoElement && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        // 1. Process with MediaPipe HandLandmarker if available (Exact Index Finger Tip #8 tracking)
        if (handLandmarker) {
          try {
            const handResults = handLandmarker.detectForVideo(videoElement, timestamp);
            if (handResults && handResults.landmarks && handResults.landmarks.length > 0) {
              const hand0 = handResults.landmarks[0];
              const handLandmarksList: Keypoint[] = [];

              hand0.forEach((lm, idx) => {
                // Video is mirrored in display, so invert X: (1 - lm.x)
                handLandmarksList.push({
                  name: `hand_kp_${idx}`,
                  x: 1 - lm.x,
                  y: lm.y,
                  conf: 1.0,
                });
              });

              // Index finger tip is landmark #8
              const rawIndex = hand0[8];
              const rawThumb = hand0[4];

              // Mirrored coordinates
              const indexX = 1 - rawIndex.x;
              const indexY = rawIndex.y;

              // Detect Pinch between Thumb #4 and Index #8
              const pinchDist = Math.hypot(rawThumb.x - rawIndex.x, rawThumb.y - rawIndex.y);
              const isPinching = pinchDist < 0.058;

              // Ergonomic normalized mapping
              const curCfg = config();
              const yMin = curCfg.y_reach_top ?? 0.28;
              const yMax = curCfg.y_reach_bottom ?? 0.80;
              const normX = Math.max(0, Math.min(1, (indexX - 0.10) / 0.80));
              const normY = Math.max(0, Math.min(1, (indexY - yMin) / (yMax - yMin)));

              // EMA Smooth pointer
              const alpha = curCfg.alpha;
              if (smoothNormX === null || smoothNormY === null) {
                smoothNormX = normX;
                smoothNormY = normY;
              } else {
                smoothNormX = (1 - alpha) * smoothNormX + alpha * normX;
                smoothNormY = (1 - alpha) * smoothNormY + alpha * normY;
              }

              const fingerPointer: PointerCoords = {
                norm_x: Math.max(0, Math.min(1, smoothNormX)),
                norm_y: Math.max(0, Math.min(1, smoothNormY)),
                raw_x: indexX * 640,
                raw_y: indexY * 480,
              };

              setDetectionResult((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  pointer: fingerPointer,
                  hand_landmarks: handLandmarksList,
                  is_pinching: isPinching,
                };
              });
            } else {
              // No hand detected by mediapipe
              smoothNormX = null;
              smoothNormY = null;
              setDetectionResult((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  hand_landmarks: [],
                  is_pinching: false,
                };
              });
            }
          } catch (e) {
            // Ignore landmark frame drop
          }
        }

        // 2. Stream frame to FastAPI WebSocket for YOLO Pose analysis & State Machine
        if (
          elapsed >= frameIntervalMs &&
          !isSendingFrame &&
          wsInstance &&
          wsInstance.readyState === WebSocket.OPEN &&
          wsInstance.bufferedAmount < 65536
        ) {
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0 && ctx && canvasElement) {
            ctx.drawImage(videoElement, 0, 0, 640, 480);
            isSendingFrame = true;
            lastSendTime = performance.now();

            canvasElement.toBlob(
              (blob) => {
                if (blob && wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                  blob
                    .arrayBuffer()
                    .then((buffer) => {
                      if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                        wsInstance.send(buffer);
                      } else {
                        isSendingFrame = false;
                      }
                    })
                    .catch(() => {
                      isSendingFrame = false;
                    });
                } else {
                  isSendingFrame = false;
                }
              },
              'image/jpeg',
              0.65
            );
          }
        }
      }

      if (isCameraRunning()) {
        animationFrameId = requestAnimationFrame(streamLoop);
      }
    };

    animationFrameId = requestAnimationFrame(streamLoop);
  };

  const setVideoRef = (el: HTMLVideoElement | null) => {
    videoElement = el;
    if (el && streamInstance && el.srcObject !== streamInstance) {
      el.srcObject = streamInstance;
      el.play().catch(console.warn);
    }
  };

  onMount(() => {
    initMediaPipeHands();
    connectWebSocket();
    loadDevices();
    if (autoStart) {
      startCamera();
    }
  });

  onCleanup(() => {
    stopCamera();
    if (wsInstance) {
      wsInstance.close();
    }
  });

  return {
    setVideoRef,
    connectionStatus,
    isCameraRunning,
    detectionResult,
    errorMessage,
    clientFps,
    latencyMs,
    config,
    videoDevices,
    selectedDeviceId,
    isMediaPipeReady,
    startCamera,
    stopCamera,
    setSelectedDeviceId,
    toggleActiveState,
    updateConfig,
    connectWebSocket,
  };
}
