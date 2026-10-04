import { createSignal, createEffect, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type { KeyboardItem, PointerCoords } from '../types';
import { sounds } from '../utils/sound';
import { CornerDownLeft, Layers, Trash2, Volume2 } from 'lucide-solid';

interface VirtualKeyboardProps {
  items: KeyboardItem[];
  pointer: PointerCoords | null;
  isActive: boolean;
  isPinching?: boolean;
  dwellThreshold: number;
  onSelectItem: (item: KeyboardItem) => void;
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

    let hitItem: KeyboardItem | null = null;

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
          hitItem = item;
          break;
        }
      }
    }

    const now = performance.now();

    if (hitItem) {
      // Instant click if pinch gesture is detected
      if (props.isPinching) {
        handleTriggerAction(hitItem);
        isDebouncing = true;
        setDwellProgress(0);
        setHoveredItemId(null);
        currentHoverId = null;

        setTimeout(() => {
          isDebouncing = false;
        }, 350);
        return;
      }

      if (currentHoverId === hitItem.id) {
        const elapsedSec = (now - hoverStartTime) / 1000;
        const progress = Math.min(1.0, elapsedSec / threshold);
        setDwellProgress(progress);

        if (progress >= 1.0) {
          handleTriggerAction(hitItem);
          isDebouncing = true;
          setDwellProgress(0);
          setHoveredItemId(null);
          currentHoverId = null;

          setTimeout(() => {
            isDebouncing = false;
          }, 350);
        }
      } else {
        currentHoverId = hitItem.id;
        hoverStartTime = now;
        setHoveredItemId(hitItem.id);
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
