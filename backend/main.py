import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.models import GestureDetectionResult, KeyboardItem, TrackerConfig
from backend.pose_tracker import PoseTracker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fastapi_hands")

# Global tracker instance
tracker: Optional[PoseTracker] = None

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT_DIR / "yolov8n-pose.pt"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

# Default Keyboard buttons layout (5-6 columnas por fila)
DEFAULT_KEYBOARD_ITEMS: List[KeyboardItem] = [
    # 1. Sujetos / Pronombres (6 botones)
    KeyboardItem(id="yo", text="Yo", category="sujetos", color="#2563eb"),
    KeyboardItem(id="tu", text="Tú", category="sujetos", color="#2563eb"),
    KeyboardItem(id="el_ella", text="Él / Ella", category="sujetos", color="#2563eb"),
    KeyboardItem(id="nosotros", text="Nosotros", category="sujetos", color="#2563eb"),
    KeyboardItem(id="ellos", text="Ellos", category="sujetos", color="#2563eb"),
    KeyboardItem(id="familia", text="Familia", category="sujetos", color="#2563eb"),
    # 2. Verbos / Acciones (6 botones)
    KeyboardItem(id="estudio", text="estudio", category="verbos", color="#d97706"),
    KeyboardItem(id="trabajo", text="trabajo", category="verbos", color="#d97706"),
    KeyboardItem(id="quiero", text="quiero", category="verbos", color="#d97706"),
    KeyboardItem(id="necesito", text="necesito", category="verbos", color="#d97706"),
    KeyboardItem(id="voy", text="voy", category="verbos", color="#d97706"),
    KeyboardItem(id="tengo", text="tengo", category="verbos", color="#d97706"),
    # 3. Adverbios / Tiempo / Estados (6 botones)
    KeyboardItem(id="mucho", text="mucho", category="modificadores", color="#7c3aed"),
    KeyboardItem(id="poco", text="poco", category="modificadores", color="#7c3aed"),
    KeyboardItem(id="hoy", text="hoy", category="modificadores", color="#7c3aed"),
    KeyboardItem(id="manana", text="mañana", category="modificadores", color="#7c3aed"),
    KeyboardItem(id="ahora", text="ahora", category="modificadores", color="#7c3aed"),
    KeyboardItem(id="bien", text="bien", category="modificadores", color="#7c3aed"),
    # 4. Lugares / Conectores (6 botones)
    KeyboardItem(id="en", text="en", category="lugares", color="#0d9488"),
    KeyboardItem(id="con", text="con", category="lugares", color="#0d9488"),
    KeyboardItem(id="Lima", text="Lima", category="lugares", color="#0d9488"),
    KeyboardItem(id="Piura", text="Piura", category="lugares", color="#0d9488"),
    KeyboardItem(id="casa", text="casa", category="lugares", color="#0d9488"),
    KeyboardItem(
        id="universidad", text="universidad", category="lugares", color="#0d9488"
    ),
    # 5. Respuestas Rápidas & Cortesía (6 botones)
    KeyboardItem(id="si", text="Sí", category="cortesia", color="#059669"),
    KeyboardItem(id="no", text="No", category="cortesia", color="#059669"),
    KeyboardItem(
        id="por_favor", text="Por favor", category="cortesia", color="#059669"
    ),
    KeyboardItem(id="gracias", text="Gracias", category="cortesia", color="#059669"),
    KeyboardItem(id="hola", text="Hola", category="cortesia", color="#059669"),
    KeyboardItem(id="ayuda", text="Ayuda", category="cortesia", color="#059669"),
    # Acciones de control (Columna Lateral)
    KeyboardItem(
        id="hablar",
        text="Escuchar",
        category="acciones",
        action="speak",
        color="#2563eb",
    ),
    KeyboardItem(
        id="borrar",
        text="Borrar",
        category="acciones",
        action="delete",
        color="#dc2626",
    ),
    KeyboardItem(
        id="limpiar",
        text="Limpiar",
        category="acciones",
        action="clear",
        color="#475569",
    ),
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    global tracker
    model_file = str(MODEL_PATH) if MODEL_PATH.exists() else "yolov8n-pose.pt"
    logger.info(f"Iniciando PoseTracker YOLOv8 desde {model_file}...")
    tracker = PoseTracker(model_path=model_file)
    logger.info("PoseTracker listo para recibir streaming.")
    yield
    logger.info("Apagando backend...")


app = FastAPI(
    title="OpenCV & YOLO-Pose Gesture Streaming API",
    description="Backend de alta velocidad con WebSocket y FastAPI para análisis de gestos y puntero.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    global tracker
    device = tracker.device if tracker else "unknown"
    return {
        "status": "healthy",
        "service": "gesture_stream_backend",
        "device": device,
        "model": "yolov8n-pose.pt",
    }


@app.get("/api/config")
async def get_config():
    global tracker
    cfg = tracker.config if tracker else TrackerConfig()
    return {
        "tracker_config": cfg.model_dump(),
        "keyboard_items": [item.model_dump() for item in DEFAULT_KEYBOARD_ITEMS],
    }


@app.post("/api/config")
async def update_config(config: TrackerConfig):
    global tracker
    if tracker:
        tracker.update_config(config)
    return {"status": "updated", "config": config.model_dump()}


@app.websocket("/ws/stream")
async def websocket_stream_endpoint(websocket: WebSocket):
    global tracker
    await websocket.accept()
    logger.info("Cliente conectado a /ws/stream")

    if tracker is None:
        model_file = str(MODEL_PATH) if MODEL_PATH.exists() else "yolov8n-pose.pt"
        tracker = PoseTracker(model_path=model_file)

    try:
        while True:
            # Esperar mensaje: Puede ser binario (imagen JPEG/WebP) o texto (JSON de control)
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                logger.info("Cliente cerró la conexión WebSocket.")
                break

            if "bytes" in message and message["bytes"]:
                # 1. Procesar Frame Binario
                image_bytes = message["bytes"]
                np_arr = np.frombuffer(image_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is not None and frame.size > 0:
                    result: GestureDetectionResult = tracker.process_frame(
                        frame,
                        flip_horizontal=True,
                    )
                    await websocket.send_text(result.model_dump_json())
                else:
                    await websocket.send_text(
                        json.dumps({"error": "No se pudo decodificar la imagen"})
                    )

            elif "text" in message and message["text"]:
                text_data = message["text"]
                try:
                    payload = json.loads(text_data)
                    msg_type = payload.get("type")

                    if msg_type == "config":
                        new_cfg = TrackerConfig(**payload.get("data", {}))
                        tracker.update_config(new_cfg)
                        await websocket.send_text(
                            json.dumps(
                                {"type": "config_ack", "config": new_cfg.model_dump()}
                            )
                        )

                    elif msg_type == "set_active":
                        tracker.is_active = bool(payload.get("active", True))
                        await websocket.send_text(
                            json.dumps(
                                {"type": "state_ack", "is_active": tracker.is_active}
                            )
                        )

                    elif msg_type == "ping":
                        await websocket.send_text(
                            json.dumps(
                                {"type": "pong", "timestamp": payload.get("timestamp")}
                            )
                        )

                except Exception as e:
                    logger.warning(f"Error parseando mensaje de texto JSON: {e}")

    except WebSocketDisconnect:
        logger.info("Cliente desconectado de /ws/stream")
    except Exception as e:
        logger.error(f"Error inesperado en WebSocket: {e}", exc_info=True)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# Montaje de archivos estáticos del frontend construido (dist)
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # No interceptar endpoints de API o WebSocket
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.is_file():
            return FileResponse(str(file_path))

        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))

        return JSONResponse(
            {
                "detail": "Frontend index.html not found. Run 'npm run build' in frontend directory."
            },
            status_code=404,
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
