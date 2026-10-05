import { createSignal, createEffect, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { KeyboardItem, PointerCoords, DiffusionTopItem } from '../types';
import { sounds } from '../utils/sound';
import { CornerDownLeft, Layers, Trash2, Volume2 } from 'lucide-solid';

interface VirtualKeyboardProps {
  items: KeyboardItem[];
  suggestedWords?: DiffusionTopItem[];
  pointer: PointerCoords | null;
  isActive: boolean;
  isPinching?: boolean;
  dwellThreshold: number;
  onSelectItem: (item: KeyboardItem) => void;
  onSelectWordDirect?: (wordText: string) => void;
  onOpenNetworks?: () => void;
  onDeleteItem: () => void;
  onClearSentence: () => void;
  onSpeakSentence: () => void;
}

export const VirtualKeyboard: Component<VirtualKeyboardProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [hoveredItemId, setHoveredItemId] = createSignal<string | null>(null);
  const [dwellProgress, setDwellProgress] = createSignal<number>(0);

  let hoverStartTime = 0;
  let currentHoverId: string | null = null;
  let isDebouncing = false;
  const btnRefs = new Map<string, HTMLButtonElement>();

  const handleTriggerAction = (item: KeyboardItem) => {
    if (item.action === 'delete') {
      sounds.playDeleteSound();
      props.onDeleteItem();
    } else if (item.action === 'clear') {
      sounds.playDeleteSound();
      props.onClearSentence();
    } else if (item.action === 'speak') {
      sounds.playSelectSound(true);
      props.onSpeakSentence();
    } else {
      sounds.playSelectSound(false);
      props.onSelectItem(item);
    }
  };

  createEffect(() => {
    const active = props.isActive;
    const ptr = props.pointer;
    const threshold = props.dwellThreshold;

    if (!active || !ptr || !containerRef || isDebouncing) {
      if (hoveredItemId() !== null) {
        setHoveredItemId(null);
        setDwellProgress(0);
        currentHoverId = null;
      }
      return;
    }

    const containerRect = containerRef.getBoundingClientRect();
    const pointerPixelX = containerRect.left + ptr.norm_x * containerRect.width;
    const pointerPixelY = containerRect.top + ptr.norm_y * containerRect.height;

    let hitId: string | null = null;
    let hitAction: (() => void) | null = null;

    // 1. Hit-test suggested words chips
    for (const item of props.suggestedWords ?? []) {
      const sugKey = `sug_${item.id}`;
      const btnEl = btnRefs.get(sugKey);
      if (btnEl) {
        const rect = btnEl.getBoundingClientRect();
        if (
          pointerPixelX >= rect.left &&
          pointerPixelX <= rect.right &&
          pointerPixelY >= rect.top &&
          pointerPixelY <= rect.bottom
        ) {
          hitId = sugKey;
          hitAction = () => {
            sounds.playSelectSound(false);
            props.onSelectWordDirect?.(item.label);
          };
          break;
        }
      }
    }

    // 2. Hit-test open networks drawer button
    if (!hitId) {
      const openBtnEl = btnRefs.get('btn_open_networks');
      if (openBtnEl) {
        const rect = openBtnEl.getBoundingClientRect();
        if (
          pointerPixelX >= rect.left &&
          pointerPixelX <= rect.right &&
          pointerPixelY >= rect.top &&
          pointerPixelY <= rect.bottom
        ) {
          hitId = 'btn_open_networks';
          hitAction = () => {
            sounds.playSelectSound(true);
            props.onOpenNetworks?.();
          };
        }
      }
    }

    // 3. Hit-test standard virtual keyboard tiles
    if (!hitId) {
      for (const item of props.items) {
        const btnEl = btnRefs.get(item.id);
        if (btnEl) {
          const rect = btnEl.getBoundingClientRect();
          if (
            pointerPixelX >= rect.left &&
            pointerPixelX <= rect.right &&
            pointerPixelY >= rect.top &&
            pointerPixelY <= rect.bottom
          ) {
            hitId = item.id;
            hitAction = () => handleTriggerAction(item);
            break;
          }
        }
      }
    }

    const now = performance.now();

    if (hitId && hitAction) {
      // Instant click if pinch gesture is detected
      if (props.isPinching) {
        hitAction();
        isDebouncing = true;
        setDwellProgress(0);
        setHoveredItemId(null);
        currentHoverId = null;

        setTimeout(() => {
          isDebouncing = false;
        }, 350);
        return;
      }

      if (currentHoverId === hitId) {
        const elapsedSec = (now - hoverStartTime) / 1000;
        const progress = Math.min(1.0, elapsedSec / threshold);
        setDwellProgress(progress);

        if (progress >= 1.0) {
          hitAction();
          isDebouncing = true;
          setDwellProgress(0);
          setHoveredItemId(null);
          currentHoverId = null;

          setTimeout(() => {
            isDebouncing = false;
          }, 350);
        }
      } else {
        currentHoverId = hitId;
        hoverStartTime = now;
        setHoveredItemId(hitId);
        setDwellProgress(0);
        sounds.playHoverTick();
      }
    } else {
      if (currentHoverId !== null) {
        currentHoverId = null;
        setHoveredItemId(null);
        setDwellProgress(0);
      }
    }
  });

  const wordCategories = [
    { key: 'sujetos', label: 'Sujetos / Personas', color: '#2563eb' },
    { key: 'verbos', label: 'Verbos / Acciones', color: '#d97706' },
    { key: 'modificadores', label: 'Modificadores / Tiempo', color: '#7c3aed' },
    { key: 'lugares', label: 'Lugares / Conectores', color: '#0d9488' },
    { key: 'cortesia', label: 'Respuestas & Cortesía', color: '#059669' },
  ];

  const actionItems = () => props.items.filter((i) => i.category === 'acciones' || i.action);

  return (
    <div class="virtual-keyboard-wrapper" ref={containerRef}>
      {/* Visual Laser Pointer Indicator */}
      <Show when={props.isActive && props.pointer}>
        <div
          class="virtual-laser-pointer"
          style={{
            left: `${(props.pointer?.norm_x ?? 0) * 100}%`,
            top: `${(props.pointer?.norm_y ?? 0) * 100}%`,
          }}
        >
          <div class="laser-pulse-ring" />
          <div class="laser-core-dot" />
        </div>
      </Show>

      {/* Live Network Diffusion Suggestions Strip (Integrated at Top of Keyboard) */}
      <Show when={(props.suggestedWords ?? []).length > 0}>
        <div class="diffusion-prediction-strip">
          <div class="strip-header">
            <div class="strip-header-left">
              <span class="pulse-dot-green" />
              <span class="strip-icon">🌊</span>
              <span class="strip-title">
                Difusión Laplaciana Continua <strong>[x(t) = exp(-L·t)·x₀]</strong> — Nodos Próximos Sugeridos:
              </span>
            </div>
            <button
              ref={(el) => {
                if (el) btnRefs.set('btn_open_networks', el);
                else btnRefs.delete('btn_open_networks');
              }}
              class={`btn-open-network-drawer ${hoveredItemId() === 'btn_open_networks' ? 'tile-hovered' : ''}`}
              onClick={() => props.onOpenNetworks?.()}
              title="Abrir panel completo de métricas de redes complejas"
            >
              <Show when={hoveredItemId() === 'btn_open_networks'}>
                <div
                  class="dwell-progress-fill"
                  style={{
                    width: `${dwellProgress() * 100}%`,
                    'background-color': '#a78bfa',
                  }}
                />
              </Show>
              🕸️ Métricas de Redes Complejas (σ=1.84)
            </button>
          </div>

          <div class="predicted-chips-row">
            <For each={props.suggestedWords}>
              {(item, idx) => {
                const sugId = `sug_${item.id}`;
                const isHovered = () => hoveredItemId() === sugId;
                const itemProgress = () => (isHovered() ? dwellProgress() : 0);

                const adjPct = () =>
                  item.prob_adjusted !== undefined
                    ? item.prob_adjusted.toFixed(0)
                    : (item.intensity * 100).toFixed(0);
                const globPct = () =>
                  item.prob_global !== undefined
                    ? item.prob_global.toFixed(1)
                    : (item.global_energy ? (item.global_energy * 100).toFixed(1) : ((item.intensity * 0.15) * 100).toFixed(1));

                return (
                  <button
                    ref={(el) => {
                      if (el) btnRefs.set(sugId, el);
                      else btnRefs.delete(sugId);
                    }}
                    class={`diffusion-word-chip ${isHovered() ? 'chip-hovered' : ''}`}
                    style={{
                      '--chip-color': item.color,
                      'border-color': isHovered() ? '#ffffff' : item.color,
                    }}
                    onClick={() => {
                      sounds.playSelectSound(false);
                      props.onSelectWordDirect?.(item.label);
                    }}
                    title={`Nodo Próximo #${idx() + 1}: ${item.label} | Prob. Repartida: ${adjPct()}% | Masa Global en Grafo: ${globPct()}% | Categoría: ${item.category}`}
                  >
                    <Show when={isHovered()}>
                      <div
                        class="dwell-progress-fill chip-dwell-fill"
                        style={{
                          width: `${itemProgress() * 100}%`,
                          'background-color': item.color,
                        }}
                      />
                    </Show>

                    <div class="chip-top-metric">
                      <span class="chip-rank-tag">#{idx() + 1}</span>
                      <div class="chip-metric-group">
                        <span class="chip-adjusted-pct">{adjPct()}%</span>
                        <span class="chip-global-pct">({globPct()}%)</span>
                      </div>
                    </div>
                    <div class="chip-bottom-row">
                      <strong class="chip-label">{item.label}</strong>
                      <span class="chip-plus">+</span>
                    </div>

                    <Show when={isHovered()}>
                      <div class="dwell-ring-badge chip-dwell-badge">
                        {Math.round(itemProgress() * 100)}%
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Main Split Layout: Words Grid on Left/Center + Actions Column on Right */}
      <div class="keyboard-columns-layout">
        {/* Words Sections Grid (Left/Center) */}
        <div class="keyboard-words-grid">
          <For each={wordCategories}>
            {(cat) => {
              const categoryItems = () =>
                props.items.filter((i) => i.category === cat.key && !i.action);

              return (
                <Show when={categoryItems().length > 0}>
                  <div class={`category-section section-${cat.key}`}>
                    <div class="category-header">
                      <span class="category-tag-dot" style={{ "background-color": cat.color }} />
                      <span class="category-label">{cat.label}</span>
                    </div>

                    <div class="category-tiles-container">
                      <For each={categoryItems()}>
                        {(item) => {
                          const isHovered = () => hoveredItemId() === item.id;
                          const itemProgress = () => (isHovered() ? dwellProgress() : 0);

                          return (
                            <button
                              ref={(el) => {
                                if (el) btnRefs.set(item.id, el);
                                else btnRefs.delete(item.id);
                              }}
                              class={`keyboard-tile ${isHovered() ? 'tile-hovered' : ''} tile-word`}
                              style={{
                                '--tile-accent': item.color,
                                'border-color': isHovered() ? item.color : undefined,
                              }}
                              onClick={() => handleTriggerAction(item)}
                            >
                              <Show when={isHovered()}>
                                <div
                                  class="dwell-progress-fill"
                                  style={{
                                    width: `${itemProgress() * 100}%`,
                                    'background-color': item.color,
                                  }}
                                />
                              </Show>

                              <div class="tile-content">
                                <span class="tile-text">{item.text}</span>
                              </div>

                              <Show when={isHovered()}>
                                <div class="dwell-ring-badge">
                                  {Math.round(itemProgress() * 100)}%
                                </div>
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </Show>
              );
            }}
          </For>
        </div>

        {/* Dedicated Actions Sidebar Column (Right Side) */}
        <div class="keyboard-actions-sidebar">
          <div class="actions-column-header">
            <Layers size={14} class="text-blue" />
            <span class="actions-column-label">Acciones & Control</span>
          </div>

          <div class="actions-column-tiles">
            <For each={actionItems()}>
              {(item) => {
                const isHovered = () => hoveredItemId() === item.id;
                const itemProgress = () => (isHovered() ? dwellProgress() : 0);

                return (
                  <button
                    ref={(el) => {
                      if (el) btnRefs.set(item.id, el);
                      else btnRefs.delete(item.id);
                    }}
                    class={`keyboard-tile action-sidebar-tile ${
                      isHovered() ? 'tile-hovered' : ''
                    } tile-action-${item.action ?? 'default'}`}
                    style={{
                      '--tile-accent': item.color,
                      'border-color': isHovered() ? item.color : undefined,
                    }}
                    onClick={() => handleTriggerAction(item)}
                  >
                    <Show when={isHovered()}>
                      <div
                        class="dwell-progress-fill"
                        style={{
                          width: `${itemProgress() * 100}%`,
                          'background-color': item.color,
                        }}
                      />
                    </Show>

                    <div class="action-tile-inner">
                      <div class="action-tile-icon-box" style={{ color: item.color }}>
                        <Show when={item.action === 'speak'}>
                          <Volume2 size={20} />
                        </Show>
                        <Show when={item.action === 'delete'}>
                          <CornerDownLeft size={20} />
                        </Show>
                        <Show when={item.action === 'clear'}>
                          <Trash2 size={20} />
                        </Show>
                        <Show when={!item.action}>
                          <Layers size={18} />
                        </Show>
                      </div>
                      <div class="action-tile-meta">
                        <span class="action-tile-title">{item.text}</span>
                        <span class="action-tile-desc">
                          {item.action === 'speak'
                            ? 'Sintetizar voz'
                            : item.action === 'delete'
                            ? 'Borrar última palabra'
                            : item.action === 'clear'
                            ? 'Limpiar texto'
                            : 'Ejecutar'}
                        </span>
                      </div>
                    </div>

                    <Show when={isHovered()}>
                      <div class="dwell-ring-badge">
                        {Math.round(itemProgress() * 100)}%
                      </div>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
