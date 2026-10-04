import { For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { TrackerConfig } from '../types';
import { Sliders, Volume2, VolumeX, X } from 'lucide-solid';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TrackerConfig;
  onUpdateConfig: (newConfig: Partial<TrackerConfig>) => void;
  videoDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  speechLang: string;
  onSelectSpeechLang: (lang: string) => void;
}

export const SettingsModal: Component<SettingsModalProps> = (props) => {
  return (
    <Show when={props.isOpen}>
      <div class="modal-backdrop" onClick={props.onClose}>
        <div class="modal-dialog" onClick={(e) => e.stopPropagation()}>
          <div class="modal-header">
            <div class="modal-title-wrap">
              <Sliders size={20} class="text-blue" />
              <h2 class="modal-title">Ajustes de Puntero y Ergonomía</h2>
            </div>
            <button class="btn-modal-close" onClick={props.onClose} title="Cerrar">
              <X size={18} />
            </button>
          </div>

          <div class="modal-body">
            {/* Top Reach Ergonomics Slider */}
            <div class="setting-group">
              <div class="setting-label-row">
                <label class="setting-label">Tope de Alcance Superior (Ergonomía de Mano)</label>
                <span class="setting-value text-blue">
                  {Math.round((props.config.y_reach_top ?? 0.28) * 100)}% altura
                </span>
              </div>
              <p class="setting-desc">
                Define qué tan abajo puedes tener la mano para llegar al tope superior de la pantalla. Valores más altos (ej. 35%) permiten alcanzar las palabras superiores sin levantar la mano por encima del pecho.
              </p>
              <input
                type="range"
                min="0.15"
                max="0.45"
                step="0.02"
                value={props.config.y_reach_top ?? 0.28}
                onInput={(e) =>
                  props.onUpdateConfig({ y_reach_top: parseFloat(e.currentTarget.value) })
                }
                class="slider-input"
              />
            </div>

            {/* Dwell Threshold */}
            <div class="setting-group">
              <div class="setting-label-row">
                <label class="setting-label">Tiempo de Retención (Dwell Time)</label>
                <span class="setting-value text-amber">
                  {props.config.dwell_threshold.toFixed(2)}s
                </span>
              </div>
              <p class="setting-desc">
                Tiempo requerido manteniendo el puntero sobre una tecla para seleccionarla.
              </p>
              <input
                type="range"
                min="0.3"
                max="2.0"
                step="0.05"
                value={props.config.dwell_threshold}
                onInput={(e) =>
                  props.onUpdateConfig({ dwell_threshold: parseFloat(e.currentTarget.value) })
                }
                class="slider-input"
              />
            </div>

            {/* Smoothing Alpha */}
            <div class="setting-group">
              <div class="setting-label-row">
                <label class="setting-label">Suavizado del Puntero (Alpha EMA)</label>
                <span class="setting-value text-blue">
                  {props.config.alpha.toFixed(2)}
                </span>
              </div>
              <p class="setting-desc">
                Valores menores eliminan más temblor; valores mayores ofrecen menor latencia.
              </p>
              <input
                type="range"
                min="0.10"
                max="0.85"
                step="0.05"
                value={props.config.alpha}
                onInput={(e) =>
                  props.onUpdateConfig({ alpha: parseFloat(e.currentTarget.value) })
                }
                class="slider-input"
              />
            </div>

            {/* Min Confidence */}
            <div class="setting-group">
              <div class="setting-label-row">
                <label class="setting-label">Confianza Mínima de Muñecas</label>
                <span class="setting-value text-emerald">
                  {Math.round(props.config.min_confidence * 100)}%
                </span>
              </div>
              <p class="setting-desc">
                Umbral para descartar detecciones con baja certeza visual.
              </p>
              <input
                type="range"
                min="0.15"
                max="0.80"
                step="0.05"
                value={props.config.min_confidence}
                onInput={(e) =>
                  props.onUpdateConfig({ min_confidence: parseFloat(e.currentTarget.value) })
                }
                class="slider-input"
              />
            </div>

            {/* Camera Selection */}
            <Show when={props.videoDevices.length > 1}>
              <div class="setting-group">
                <label class="setting-label">Dispositivo de Cámara</label>
                <select
                  class="select-input"
                  value={props.selectedDeviceId}
                  onChange={(e) => props.onSelectDevice(e.currentTarget.value)}
                >
                  <For each={props.videoDevices}>
                    {(d, index) => (
                      <option value={d.deviceId}>
                        {d.label || `Cámara ${index() + 1}`}
                      </option>
                    )}
                  </For>
                </select>
              </div>
            </Show>

            {/* Voice Language */}
            <div class="setting-group">
              <label class="setting-label">Idioma de Lectura por Voz (TTS)</label>
              <select
                class="select-input"
                value={props.speechLang}
                onChange={(e) => props.onSelectSpeechLang(e.currentTarget.value)}
              >
                <option value="es-ES">Español (España)</option>
                <option value="es-MX">Español (México / Latinoamérica)</option>
                <option value="en-US">Inglés (US)</option>
              </select>
            </div>

            {/* Sound Toggle */}
            <div class="setting-toggle-row">
              <div class="setting-toggle-info">
                <span class="setting-label">Efectos de Sonido Táctiles</span>
                <p class="setting-desc">Sonidos al pasar el puntero y pulsar teclas</p>
              </div>
              <button
                class={`btn-toggle-switch ${!props.isMuted ? 'toggle-on' : ''}`}
                onClick={props.onToggleMute}
              >
                <Show when={!props.isMuted} fallback={<VolumeX size={16} />}>
                  <Volume2 size={16} />
                </Show>
                <span>{!props.isMuted ? 'Activado' : 'Silenciado'}</span>
              </button>
            </div>
          </div>

          <div class="modal-footer">
            <button
              class="btn-secondary"
              onClick={() =>
                props.onUpdateConfig({
                  alpha: 0.35,
                  dwell_threshold: 0.8,
                  min_confidence: 0.35,
                  y_reach_top: 0.28,
                  y_reach_bottom: 0.80,
                })
              }
            >
              Restaurar Valores por Defecto
            </button>
            <button class="btn-primary" onClick={props.onClose}>
              Guardar y Cerrar
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
