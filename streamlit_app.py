"""
AeroHand AI - Streamlit Web Application (Frontend Alternativo)
=============================================================
Interfaz interactiva basada en Python y Streamlit que coexiste con el frontend
en SolidJS. Permite captura por WebRTC o cámara local, seguimiento de posturas
YOLOv8-Pose, teclado virtual por tiempo de fijación (Dwell Time), telemetría en
tiempo real y síntesis de voz (TTS).
"""

import io
import queue
import time
from typing import Dict, List, Optional, Tuple

import av
import cv2
import numpy as np
import streamlit as st
from gtts import gTTS

try:
    from streamlit_webrtc import (
        ClientSettings,
        WebRtcMode,
        webrtc_streamer,
        VideoTransformerBase,
        VideoProcessorBase,
    )
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False

from backend.models import KeyboardItem, TrackerConfig
from backend.pose_tracker import PoseTracker

# ==============================================================================
# 1. Configuración de la Página y Estilos Visuales Premium
# ==============================================================================
st.set_page_config(
    page_title="AeroHand AI - Streamlit Interface",
    page_icon="🖐️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Inyección de estilos CSS modernos (Glassmorphism, Dark Neon Theme)
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

    html, body, [class*="css"] {
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .main {
        background: radial-gradient(circle at 10% 20%, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 1));
        color: #f8fafc;
    }

    /* Tarjetas de métricas */
    .metric-card {
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        margin-bottom: 12px;
        transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .metric-card:hover {
        border-color: rgba(6, 182, 212, 0.4);
        transform: translateY(-2px);
    }
    .metric-title {
        font-size: 0.8rem;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
        margin-bottom: 4px;
    }
    .metric-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #f1f5f9;
        font-family: 'JetBrains Mono', monospace;
    }

    /* Badges de estado */
    .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.85rem;
        font-weight: 600;
    }
    .badge-active {
        background: rgba(16, 185, 129, 0.2);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .badge-stopped {
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .badge-info {
        background: rgba(6, 182, 212, 0.2);
        color: #38bdf8;
        border: 1px solid rgba(6, 182, 212, 0.4);
    }

    /* Chips de palabras de la frase */
    .word-chip {
        display: inline-block;
        padding: 6px 14px;
        margin: 4px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1.05rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        animation: fadeIn 0.3s ease;
    }

    .sentence-box {
        background: rgba(15, 23, 42, 0.85);
        border: 2px dashed rgba(6, 182, 212, 0.3);
        border-radius: 14px;
        padding: 20px;
        min-height: 80px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        margin: 12px 0 16px 0;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
    }
    </style>
    """,
    unsafe_allow_html=True,
)

# ==============================================================================
# 2. Catálogo de Teclas y Colores (Sincronizado con el Backend y SolidJS)
# ==============================================================================
KEYBOARD_ITEMS: List[KeyboardItem] = [
    # Sujetos
    KeyboardItem(id="yo", text="Yo", category="sujetos", color="#10b981"),
    KeyboardItem(id="tu", text="Tú", category="sujetos", color="#06b6d4"),
    KeyboardItem(id="el_ella", text="Él / Ella", category="sujetos", color="#3b82f6"),
    KeyboardItem(id="nosotros", text="Nosotros", category="sujetos", color="#6366f1"),
    KeyboardItem(id="ellos", text="Ellos", category="sujetos", color="#8b5cf6"),
    KeyboardItem(id="familia", text="Familia", category="sujetos", color="#14b8a6"),
    # Verbos
    KeyboardItem(id="estudio", text="estudio", category="verbos", color="#f59e0b"),
    KeyboardItem(id="trabajo", text="trabajo", category="verbos", color="#ef4444"),
    KeyboardItem(id="quiero", text="quiero", category="verbos", color="#ec4899"),
    KeyboardItem(id="necesito", text="necesito", category="verbos", color="#f43f5e"),
    KeyboardItem(id="voy", text="voy", category="verbos", color="#fb923c"),
    KeyboardItem(id="tengo", text="tengo", category="verbos", color="#eab308"),
    # Modificadores
    KeyboardItem(id="mucho", text="mucho", category="modificadores", color="#8b5cf6"),
    KeyboardItem(id="poco", text="poco", category="modificadores", color="#a855f7"),
    KeyboardItem(id="hoy", text="hoy", category="modificadores", color="#6366f1"),
    KeyboardItem(id="manana", text="mañana", category="modificadores", color="#3b82f6"),
    KeyboardItem(id="ahora", text="ahora", category="modificadores", color="#06b6d4"),
    KeyboardItem(id="bien", text="bien", category="modificadores", color="#10b981"),
    # Lugares
    KeyboardItem(id="en", text="en", category="lugares", color="#14b8a6"),
    KeyboardItem(id="con", text="con", category="lugares", color="#0ea5e9"),
    KeyboardItem(id="Lima", text="Lima", category="lugares", color="#64748b"),
    KeyboardItem(id="Piura", text="Piura", category="lugares", color="#22c55e"),
    KeyboardItem(id="casa", text="casa", category="lugares", color="#84cc16"),
    KeyboardItem(id="universidad", text="universidad", category="lugares", color="#e11d48"),
    # Cortesía
    KeyboardItem(id="si", text="Sí", category="cortesia", color="#10b981"),
    KeyboardItem(id="no", text="No", category="cortesia", color="#ef4444"),
    KeyboardItem(id="por_favor", text="Por favor", category="cortesia", color="#06b6d4"),
    KeyboardItem(id="gracias", text="Gracias", category="cortesia", color="#f59e0b"),
    KeyboardItem(id="hola", text="Hola", category="cortesia", color="#ec4899"),
    KeyboardItem(id="ayuda", text="Ayuda", category="cortesia", color="#dc2626"),
    # Acciones de Control
    KeyboardItem(id="hablar", text="🔊 Escuchar", category="acciones", action="speak", color="#0284c7"),
    KeyboardItem(id="borrar", text="⌫ Borrar", category="acciones", action="delete", color="#dc2626"),
    KeyboardItem(id="limpiar", text="🗑 Limpiar", category="acciones", action="clear", color="#9333ea"),
]

HEX_TO_BGR: Dict[str, Tuple[int, int, int]] = {
    "#10b981": (129, 185, 16),
    "#06b6d4": (212, 182, 6),
    "#3b82f6": (246, 130, 59),
    "#6366f1": (241, 102, 99),
    "#8b5cf6": (246, 92, 139),
    "#14b8a6": (166, 184, 20),
    "#f59e0b": (11, 158, 245),
    "#ef4444": (68, 68, 239),
    "#ec4899": (153, 72, 236),
    "#f43f5e": (94, 63, 244),
    "#fb923c": (60, 146, 251),
    "#eab308": (8, 179, 234),
    "#a855f7": (247, 85, 168),
    "#0ea5e9": (233, 165, 14),
    "#64748b": (139, 116, 100),
    "#22c55e": (94, 197, 34),
    "#84cc16": (22, 204, 132),
    "#e11d48": (72, 29, 225),
    "#dc2626": (38, 38, 220),
    "#0284c7": (199, 132, 2),
    "#9333ea": (234, 51, 147),
}

# ==============================================================================
# 3. Inicialización del Estado de Sesión en Streamlit
# ==============================================================================
if "sentence" not in st.session_state:
    st.session_state.sentence = []  # Lista de objetos KeyboardItem

if "history" not in st.session_state:
    st.session_state.history = []  # Lista de strings con frases anteriores

if "audio_bytes" not in st.session_state:
    st.session_state.audio_bytes = None

if "action_queue" not in st.session_state:
    st.session_state.action_queue = queue.Queue()

if "pose_tracker" not in st.session_state:
    st.session_state.pose_tracker = PoseTracker()


# ==============================================================================
# 4. Motor de Dwell Time y Renderizador de HUD para OpenCV / Streamlit
# ==============================================================================
class DwellHUDOverlay:
    """Calcula la interacción del puntero sobre el teclado virtual y renderiza el HUD."""

    def __init__(self, items: List[KeyboardItem], dwell_threshold: float = 0.8):
        self.items = items
        self.dwell_threshold = dwell_threshold
        self.current_hover_id: Optional[str] = None
        self.hover_start_time: float = 0.0
        self.last_triggered_time: float = 0.0
        self.debounce_duration: float = 1.0  # Segundos entre selecciones consecutivas

    def compute_grid_boxes(self, width: int, height: int) -> List[Tuple[KeyboardItem, Tuple[int, int, int, int]]]:
        """Calcula rectángulos (x1, y1, x2, y2) para una cuadrícula ergonómica."""
        boxes = []
        rows = 6
        cols = 6
        
        # El teclado ocupa la parte inferior y derecha para dejar visibilidad al usuario
        margin_x = 20
        margin_y = 70
        grid_w = width - 2 * margin_x
        grid_h = height - margin_y - 20
        
        cell_w = grid_w // cols
        cell_h = grid_h // rows
        
        for idx, item in enumerate(self.items):
            if idx >= rows * cols:
                break
            r = idx // cols
            c = idx % cols
            x1 = margin_x + c * cell_w + 4
            y1 = margin_y + r * cell_h + 4
            x2 = x1 + cell_w - 8
            y2 = y1 + cell_h - 8
            boxes.append((item, (x1, y1, x2, y2)))
        return boxes

    def process_and_draw(
        self,
        frame: np.ndarray,
        pointer_norm: Optional[Tuple[float, float]],
        is_active: bool,
        show_keyboard_overlay: bool = True,
    ) -> Tuple[np.ndarray, Optional[KeyboardItem], float]:
        """Dibuja el overlay del teclado, puntero láser y calcula el progreso del dwell time."""
        h, w, _ = frame.shape
        triggered_item: Optional[KeyboardItem] = None
        dwell_progress = 0.0

        boxes = self.compute_grid_boxes(w, h)
        now = time.time()

        # Puntero en píxeles
        pointer_px: Optional[Tuple[int, int]] = None
        if pointer_norm and is_active:
            px = int(np.clip(pointer_norm[0] * w, 0, w - 1))
            py = int(np.clip(pointer_norm[1] * h, 0, h - 1))
            pointer_px = (px, py)

        # Detectar tecla bajo el puntero
        hovered_item: Optional[KeyboardItem] = None
        if pointer_px and is_active:
            px, py = pointer_px
            for item, (x1, y1, x2, y2) in boxes:
                if x1 <= px <= x2 and y1 <= py <= y2:
                    hovered_item = item
                    break

        # Lógica de Dwell Time
        if hovered_item and is_active:
            if self.current_hover_id == hovered_item.id:
                elapsed = now - self.hover_start_time
                dwell_progress = min(1.0, elapsed / max(0.2, self.dwell_threshold))
                
                # Disparar selección si se completa el dwell time y pasó el debounce
                if dwell_progress >= 1.0 and (now - self.last_triggered_time) > self.debounce_duration:
                    triggered_item = hovered_item
                    self.last_triggered_time = now
                    self.hover_start_time = now
            else:
                self.current_hover_id = hovered_item.id
                self.hover_start_time = now
                dwell_progress = 0.0
        else:
            self.current_hover_id = None
            self.hover_start_time = 0.0
            dwell_progress = 0.0

        # Dibujar Teclado Translúcido
        if show_keyboard_overlay:
            overlay = frame.copy()
            for item, (x1, y1, x2, y2) in boxes:
                bgr = HEX_TO_BGR.get(item.color, (180, 180, 180))
                is_hovered = (hovered_item and hovered_item.id == item.id)
                
                # Fondo de la tecla
                bg_color = (min(255, bgr[0] + 50), min(255, bgr[1] + 50), min(255, bgr[2] + 50)) if is_hovered else (20, 26, 38)
                cv2.rectangle(overlay, (x1, y1), (x2, y2), bg_color, -1)
                
                # Borde de la tecla
                border_color = (0, 255, 255) if is_hovered else bgr
                border_thick = 2 if is_hovered else 1
                cv2.rectangle(overlay, (x1, y1), (x2, y2), border_color, border_thick)

                # Texto de la tecla
                font_scale = 0.45
                thickness = 1
                (tw, th), _ = cv2.getTextSize(item.text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
                tx = x1 + (x2 - x1 - tw) // 2
                ty = y1 + (y2 - y1 + th) // 2
                cv2.putText(overlay, item.text, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

            # Mezclar capa translúcida
            cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

        # Dibujar Puntero Láser y Anillo de Progreso de Dwell Time
        if pointer_px and is_active:
            px, py = pointer_px
            # Resplandor exterior
            cv2.circle(frame, (px, py), 18, (0, 200, 255), 2)
            cv2.circle(frame, (px, py), 6, (0, 255, 255), -1)

            # Anillo de progreso de fijación
            if dwell_progress > 0:
                angle = int(dwell_progress * 360)
                cv2.ellipse(frame, (px, py), (24, 24), 0, -90, -90 + angle, (0, 255, 100), 3)

        return frame, triggered_item, dwell_progress


# ==============================================================================
# 5. Funciones Utilitarias de Texto y Síntesis de Voz (TTS)
# ==============================================================================
def synthesize_speech(text: str) -> Optional[bytes]:
    """Genera audio MP3 en memoria utilizando gTTS en idioma español."""
    if not text.strip():
        return None
    try:
        tts = gTTS(text=text, lang="es", slow=False)
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        return fp.read()
    except Exception as e:
        st.warning(f"Error generando síntesis de voz: {e}")
        return None


def execute_action(item: KeyboardItem):
    """Ejecuta una acción sobre la frase construida."""
    if item.action == "delete":
        if st.session_state.sentence:
            st.session_state.sentence.pop()
    elif item.action == "clear":
        st.session_state.sentence.clear()
    elif item.action == "speak":
        full_text = " ".join([i.text for i in st.session_state.sentence])
        if full_text:
            if full_text not in st.session_state.history:
                st.session_state.history.append(full_text)
            st.session_state.audio_bytes = synthesize_speech(full_text)
    else:
        st.session_state.sentence.append(item)


# ==============================================================================
# 6. Barra Lateral de Configuración y Telemetría
# ==============================================================================
with st.sidebar:
    st.markdown("### 🖐️ **AeroHand AI - Panel de Control**")
    st.markdown("---")

    # Estado del modelo y aceleración
    tracker: PoseTracker = st.session_state.pose_tracker
    device_label = "⚡ GPU (CUDA)" if tracker.device == "cuda" else "🖥️ CPU"
    st.markdown(f"**Dispositivo Activo:** `{device_label}`")

    st.subheader("⚙️ Calibración del Puntero")
    alpha = st.slider(
        "Suavizado EMA (Alpha)",
        min_value=0.05,
        max_value=0.95,
        value=0.35,
        step=0.05,
        help="Valores más bajos proporcionan mayor suavidad; valores más altos mayor reactividad.",
    )

    dwell_threshold = st.slider(
        "Tiempo de Fijación (Dwell Time)",
        min_value=0.2,
        max_value=2.5,
        value=0.8,
        step=0.1,
        help="Tiempo en segundos que el puntero debe mantenerse sobre una tecla para seleccionarla.",
    )

    min_confidence = st.slider(
        "Confianza Mínima de Detección",
        min_value=0.10,
        max_value=0.90,
        value=0.35,
        step=0.05,
        help="Filtra detecciones con baja certeza visual.",
    )

    y_reach_top = st.slider(
        "Alcance Superior (Ergonomía)",
        min_value=0.10,
        max_value=0.50,
        value=0.28,
        step=0.02,
        help="Nivel de altura de la mano para llegar al borde superior de la pantalla.",
    )

    y_reach_bottom = st.slider(
        "Alcance Inferior (Ergonomía)",
        min_value=0.55,
        max_value=0.95,
        value=0.80,
        step=0.02,
        help="Nivel de altura de la mano para llegar al borde inferior.",
    )

    # Actualizar configuración del tracker
    cfg = TrackerConfig(
        alpha=alpha,
        dwell_threshold=dwell_threshold,
        min_confidence=min_confidence,
        y_reach_top=y_reach_top,
        y_reach_bottom=y_reach_bottom,
        send_debug_frame=False,
    )
    tracker.update_config(cfg)

    st.markdown("---")
    st.subheader("🎨 Opciones de Visualización")
    show_overlay = st.checkbox("Mostrar Teclado HUD en Video", value=True)
    flip_cam = st.checkbox("Efecto Espejo (Flip Horizontal)", value=True)

    st.markdown("---")
    st.subheader("📖 Guía de Gestos")
    st.markdown(
        """
        - 🟢 **Mano Izquierda arriba de la Nariz:** Activar puntero.
        - 🔴 **Mano Derecha arriba de la Nariz:** Detener puntero.
        - 🎯 **Mover Mano:** Desplaza el puntero por la pantalla.
        - ⏱️ **Fijar 0.8s:** Selecciona la tecla apuntada.
        """
    )

# ==============================================================================
# 7. Cabecera y Barra de Frase en Construcción
# ==============================================================================
col_title, col_status = st.columns([3, 1])

with col_title:
    st.title("🖐️ AeroHand AI")
    st.caption("Sistema de Comunicación Aumentativa y Alternativa (AAC) por Gestos y Visión Artificial")

with col_status:
    is_active = tracker.is_active
    status_html = (
        '<div class="status-badge badge-active">🟢 PUNTERO ACTIVO</div>'
        if is_active
        else '<div class="status-badge badge-stopped">🔴 PUNTERO DETENIDO</div>'
    )
    st.markdown(status_html, unsafe_allow_html=True)
    if st.button("Alternar Estado (Activar/Pausar)"):
        tracker.is_active = not tracker.is_active
        st.rerun()

# ------------------------------------------------------------------------------
# Frase Actual en Construcción
# ------------------------------------------------------------------------------
st.markdown("#### 💬 Frase en Construcción")

# Renderizar Chips de Palabras
if st.session_state.sentence:
    chips_html = '<div class="sentence-box">'
    for item in st.session_state.sentence:
        chips_html += f'<span class="word-chip" style="background-color: {item.color}; color: #ffffff;">{item.text}</span>'
    chips_html += "</div>"
    st.markdown(chips_html, unsafe_allow_html=True)
else:
    st.markdown(
        '<div class="sentence-box" style="color: #64748b; font-style: italic;">Apunte y fije la mirada/puntero en las palabras o selecciónelas abajo para armar una frase...</div>',
        unsafe_allow_html=True,
    )

# Botones de Acción Rápida para la Frase
col_act1, col_act2, col_act3, col_act4 = st.columns([2, 1, 1, 1])

with col_act1:
    if st.button("🔊 Escuchar Frase (TTS)", use_container_width=True, type="primary"):
        execute_action(KeyboardItem(id="hablar", text="hablar", category="acciones", action="speak", color="#0284c7"))
        st.rerun()

with col_act2:
    if st.button("⌫ Borrar Palabra", use_container_width=True):
        execute_action(KeyboardItem(id="borrar", text="borrar", category="acciones", action="delete", color="#dc2626"))
        st.rerun()

with col_act3:
    if st.button("🗑 Limpiar Frase", use_container_width=True):
        execute_action(KeyboardItem(id="limpiar", text="limpiar", category="acciones", action="clear", color="#9333ea"))
        st.rerun()

with col_act4:
    current_phrase = " ".join([i.text for i in st.session_state.sentence])
    if current_phrase:
        st.download_button(
            "💾 Guardar Frase",
            data=current_phrase,
            file_name="frase_aerohand.txt",
            mime="text/plain",
            use_container_width=True,
        )

# Reproductor de Audio TTS si se ha generado voz
if st.session_state.audio_bytes is not None:
    st.audio(st.session_state.audio_bytes, format="audio/mp3", autoplay=True)

st.markdown("---")

# ==============================================================================
# 8. Modos de Video y Captura de Gestos
# ==============================================================================
tab_webrtc, tab_local, tab_keyboard, tab_history = st.tabs(
    ["📹 Cámara WebRTC (Navegador)", "📷 Cámara Local OpenCV", "⌨️ Teclado Táctil / Virtual", "📜 Historial de Frases"]
)

# ------------------------------------------------------------------------------
# TAB 1: Streamlit WebRTC (Procesamiento en tiempo real)
# ------------------------------------------------------------------------------
with tab_webrtc:
    if not WEBRTC_AVAILABLE:
        st.error("⚠️ La librería `streamlit-webrtc` no está disponible en este entorno.")
    else:
        st.markdown(
            "Captura en vivo desde la cámara web de tu navegador. El procesamiento de posturas y el tiempo de fijación (*Dwell time*) se ejecutan en tiempo real."
        )

        hud_overlay = DwellHUDOverlay(KEYBOARD_ITEMS, dwell_threshold=dwell_threshold)

        class WebRTCVideoProcessor(VideoProcessorBase):
            def __init__(self):
                self.tracker = tracker
                self.hud = hud_overlay

            def recv(self, frame: av.VideoFrame) -> av.VideoFrame:
                img = frame.to_ndarray(format="bgr24")

                # Inferencia YOLOv8 Pose
                res = self.tracker.process_frame(img, flip_horizontal=flip_cam)

                # Procesar Puntero y Teclado
                pointer_coords = (res.pointer.norm_x, res.pointer.norm_y) if res.pointer else None
                annotated, triggered, _ = self.hud.process_and_draw(
                    img if not flip_cam else cv2.flip(img, 1),
                    pointer_coords,
                    res.is_active,
                    show_keyboard_overlay=show_overlay,
                )

                if triggered:
                    st.session_state.action_queue.put(triggered)

                return av.VideoFrame.from_ndarray(annotated, format="bgr24")

        col_cam, col_info = st.columns([3, 1])

        with col_cam:
            webrtc_ctx = webrtc_streamer(
                key="aerohand-stream",
                mode=WebRtcMode.SENDRECV,
                video_processor_factory=WebRTCVideoProcessor,
                media_stream_constraints={"video": True, "audio": False},
                async_processing=True,
            )

        with col_info:
            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown('<div class="metric-title">FPS Estimado</div>', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{tracker.fps:.1f}</div>', unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)

            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown('<div class="metric-title">Mano que Apunta</div>', unsafe_allow_html=True)
            hand_name = tracker.pointer_filter.active_hand.capitalize() if tracker.is_active else "En espera"
            st.markdown(f'<div class="metric-value">{hand_name}</div>', unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)

            st.markdown('<div class="metric-card">', unsafe_allow_html=True)
            st.markdown('<div class="metric-title">Dispositivo</div>', unsafe_allow_html=True)
            st.markdown(f'<div class="metric-value">{tracker.device.upper()}</div>', unsafe_allow_html=True)
            st.markdown("</div>", unsafe_allow_html=True)

        # Despachar acciones generadas por gestos
        while not st.session_state.action_queue.empty():
            item_triggered = st.session_state.action_queue.get()
            execute_action(item_triggered)
            st.rerun()

# ------------------------------------------------------------------------------
# TAB 2: Cámara Local OpenCV (Para ejecuciones en local)
# ------------------------------------------------------------------------------
with tab_local:
    st.markdown("Ejecuta la captura directa mediante `cv2.VideoCapture` de tu equipo local.")
    cam_index = st.number_input("Índice de Cámara Local", min_value=0, max_value=5, value=0, step=1)
    run_local_cam = st.toggle("Iniciar Captura Local OpenCV", value=False)

    if run_local_cam:
        image_placeholder = st.empty()
        cap = cv2.VideoCapture(int(cam_index))
        local_hud = DwellHUDOverlay(KEYBOARD_ITEMS, dwell_threshold=dwell_threshold)

        if not cap.isOpened():
            st.error(f"No se pudo acceder a la cámara en el índice {cam_index}.")
        else:
            try:
                while run_local_cam:
                    ret, frame = cap.read()
                    if not ret:
                        st.warning("No se recibieron fotogramas de la cámara.")
                        break

                    res = tracker.process_frame(frame, flip_horizontal=flip_cam)
                    ptr_coords = (res.pointer.norm_x, res.pointer.norm_y) if res.pointer else None
                    annotated, trig, _ = local_hud.process_and_draw(
                        frame if not flip_cam else cv2.flip(frame, 1),
                        ptr_coords,
                        res.is_active,
                        show_keyboard_overlay=show_overlay,
                    )

                    if trig:
                        execute_action(trig)
                        st.rerun()

                    rgb_frame = cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB)
                    image_placeholder.image(rgb_frame, channels="RGB", use_container_width=True)
                    time.sleep(0.01)
            finally:
                cap.release()

# ------------------------------------------------------------------------------
# TAB 3: Teclado Táctil / Clic Manual (Categorizado)
# ------------------------------------------------------------------------------
with tab_keyboard:
    st.markdown("Selecciona manualmente las palabras para construir oraciones de forma complementaria:")

    categories = [
        ("👤 Sujetos & Personas", "sujetos"),
        ("⚡ Verbos & Acciones", "verbos"),
        ("🕒 Adverbios & Tiempo", "modificadores"),
        ("📍 Lugares & Conectores", "lugares"),
        ("💬 Cortesía & Respuestas", "cortesia"),
    ]

    for cat_title, cat_key in categories:
        st.markdown(f"##### {cat_title}")
        items = [it for it in KEYBOARD_ITEMS if it.category == cat_key]
        cols = st.columns(len(items))
        for col, it in zip(cols, items):
            with col:
                btn_style = f"background-color: {it.color}; color: white; font-weight: bold; border-radius: 8px; width: 100%;"
                if st.button(it.text, key=f"btn_manual_{it.id}", use_container_width=True):
                    execute_action(it)
                    st.rerun()
        st.write("")

# ------------------------------------------------------------------------------
# TAB 4: Historial de Frases Expresadas
# ------------------------------------------------------------------------------
with tab_history:
    st.markdown("##### 📜 Registro de Oraciones Expresadas")
    if st.session_state.history:
        for idx, sentence_text in enumerate(reversed(st.session_state.history), 1):
            col_h1, col_h2 = st.columns([4, 1])
            with col_h1:
                st.info(f"**#{idx}:** {sentence_text}")
            with col_h2:
                if st.button("🔊 Re-escuchar", key=f"replay_{idx}"):
                    st.session_state.audio_bytes = synthesize_speech(sentence_text)
                    st.rerun()

        if st.button("🗑 Borrar Todo el Historial"):
            st.session_state.history.clear()
            st.rerun()
    else:
        st.write("Aún no se han expresado frases en esta sesión.")
