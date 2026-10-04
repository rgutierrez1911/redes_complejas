# AeroHand AI - Teclado Virtual por Gestos & Streaming OpenCV

Sistema desacoplado de reconocimiento de gestos corporales y tracking de dedos en tiempo real utilizando **YOLOv8-Pose (`yolov8n-pose.pt`)**, **MediaPipe HandLandmarker (GPU/WebGL)**, **FastAPI** con WebSockets y una interfaz web ultrarrápida en **SolidJS + TypeScript + Vite**.

---

## 🚀 Arquitectura Híbrida Inteligente

- **Tracking del Dedo Índice (MediaPipe 21 Keypoints)**:
  - Seguimiento milimétrico de la **punta del dedo índice (Landmark #8)** como puntero láser.
  - Detección de gesto de **Pellizco / Clic Inmediato (Pinch)** entre dedo índice y pulgar para seleccionar teclas al instante sin esperar el temporizador.
  - Renderizado del esqueleto completo de la mano (21 articulaciones).

- **Backend (`backend/`)**:
  - FastAPI + WebSockets (`/ws/stream`)
  - YOLOv8-Pose con aceleración GPU (CUDA)
  - Filtro EMA `SmoothPointer` para eliminar temblores de la mano
  - Lógica de activación ergonómica (mano izquierda arriba de la nariz = iniciar, mano derecha arriba = detener)
  - API REST de configuración (`/api/config`, `/api/health`)

- **Frontend (`frontend/`)**:
  - **SolidJS** + TypeScript + Vite (reactividad por señales sin sobrecarga de Virtual DOM)
  - Captura de cámara web con `navigator.mediaDevices.getUserMedia`
  - Transmisión en tiempo real de frames JPEG al backend vía WebSocket
  - Renderizado de puntero láser interactivo sobre el teclado virtual
  - Temporizador de retención (Dwell Time) + Clic por pellizco
  - Columna lateral dedicada para acciones (**🔊 Escuchar / TTS**, **⌫ Borrar**, **🗑 Limpiar**)
  - Constructor de frases y síntesis de voz (Text-to-Speech)
  - Overlay de esqueleto anatómico y de mano en la cámara en vivo

- **Frontend Alternativo Streamlit (`streamlit_app.py`)**:
  - **100% Python** con interfaz en Streamlit + WebRTC / OpenCV local
  - Teclado virtual translúcido HUD con detección de tiempo de fijación (*Dwell time*)
  - Constructor de oraciones con chips categorizados
  - Síntesis de voz (TTS) con `gTTS`
  - Controles deslizantes para calibración en tiempo real (EMA alpha, reach thresholds, dwell threshold)

---

## 🛠️ Cómo Iniciar

### Opción 1: Frontend Principal (SolidJS + FastAPI)
En la raíz del proyecto con el entorno virtual activo:
```bash
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Abre en tu navegador **`http://localhost:8000`**.

Para desarrollo en caliente del frontend SolidJS:
```bash
npm run dev
# Accede a http://localhost:5173
```

### Opción 2: Frontend Alternativo (Streamlit)
En la raíz del proyecto con el entorno virtual activo:
```bash
source .venv/bin/activate
streamlit run streamlit_app.py --server.port 8501
```
Abre en tu navegador **`http://localhost:8501`**.

---

## 🖐️ Controles por Gestos

| Gesto | Acción |
|---|---|
| **Mano Izquierda arriba de la Nariz** | **Activar Puntero** (Modo escritura habilitado) |
| **Mano Derecha arriba de la Nariz** | **Detener Puntero** (Pausa el seguimiento) |
| **Dedo Índice apuntando (#8)** | Mueve el puntero láser sobre el teclado virtual |
| **Pellizco (Índice + Pulgar) 👌** | **Clic Inmediato** sobre la tecla apuntada (SolidJS) |
| **Retención (Dwell 0.8s)** | Selecciona la palabra manteniendo el dedo sobre la tecla |

