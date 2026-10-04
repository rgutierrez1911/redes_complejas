import { createSignal, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { Check, Copy, MessageSquare, Trash2, Volume2, X } from 'lucide-solid';
import { sounds } from '../utils/sound';

interface SentenceBuilderProps {
  words: string[];
  onRemoveWord: (index: number) => void;
  onClear: () => void;
  onSpeak: () => void;
}

export const SentenceBuilder: Component<SentenceBuilderProps> = (props) => {
  const [copied, setCopied] = createSignal<boolean>(false);

  const fullSentence = () => props.words.join(' ');

  const handleCopy = () => {
    const text = fullSentence();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="sentence-builder-container">
      <div class="sentence-builder-header">
        <div class="sentence-header-left">
          <MessageSquare size={16} class="text-blue" />
          <span class="sentence-header-title">Frase en Construcción</span>
          <span class="sentence-word-count">
            {props.words.length} {props.words.length === 1 ? 'palabra' : 'palabras'}
          </span>
        </div>

        <div class="sentence-header-actions">
          <button
            class="sentence-action-btn"
            onClick={props.onSpeak}
            disabled={props.words.length === 0}
            title="Leer frase con voz sintética (TTS)"
          >
            <Volume2 size={16} />
            <span>Escuchar</span>
          </button>
          <button
            class="sentence-action-btn"
            onClick={handleCopy}
            disabled={props.words.length === 0}
            title="Copiar texto al portapapeles"
          >
            <Show when={copied()} fallback={<Copy size={16} />}>
              <Check size={16} class="text-emerald" />
            </Show>
            <span>{copied() ? 'Copiado' : 'Copiar'}</span>
          </button>
          <button
            class="sentence-action-btn btn-danger-text"
            onClick={props.onClear}
            disabled={props.words.length === 0}
            title="Limpiar todo"
          >
            <Trash2 size={16} />
            <span>Limpiar</span>
          </button>
        </div>
      </div>

      <div class="sentence-content-area">
        <Show
          when={props.words.length > 0}
          fallback={
            <div class="sentence-empty-placeholder">
              <span class="placeholder-cursor">|</span>
              <span class="placeholder-text">
                Apunta a una palabra con tu mano y manténla durante 0.8s para escribir...
              </span>
            </div>
          }
        >
          <div class="word-chips-list">
            <For each={props.words}>
              {(word, idx) => (
                <span class="word-chip">
                  <span class="word-text">{word}</span>
                  <button
                    class="word-remove-btn"
                    onClick={() => {
                      sounds.playDeleteSound();
                      props.onRemoveWord(idx());
                    }}
                    title={`Eliminar "${word}"`}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};
