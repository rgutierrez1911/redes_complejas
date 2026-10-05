import { createSignal, createEffect, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { useWebcamStream } from './hooks/useWebcamStream';
import type { KeyboardItem, DiffusionTopItem } from './types';
import { Header } from './components/Header';
import { CameraStream } from './components/CameraStream';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { SentenceBuilder } from './components/SentenceBuilder';
import { SettingsModal } from './components/SettingsModal';
import { NetworkDashboard } from './components/NetworkDashboard';
import { sounds } from './utils/sound';
import './App.css';

const DEFAULT_KEYBOARD: KeyboardItem[] = [
  // 1. Sujetos / Pronombres (6 botones)
  { id: 'yo', text: 'Yo', category: 'sujetos', color: '#2563eb' },
  { id: 'tu', text: 'Tú', category: 'sujetos', color: '#2563eb' },
  { id: 'el_ella', text: 'Él / Ella', category: 'sujetos', color: '#2563eb' },
  { id: 'nosotros', text: 'Nosotros', category: 'sujetos', color: '#2563eb' },
  { id: 'ellos', text: 'Ellos', category: 'sujetos', color: '#2563eb' },
  { id: 'familia', text: 'Familia', category: 'sujetos', color: '#2563eb' },
  // 2. Verbos / Acciones (6 botones)
  { id: 'estudio', text: 'estudio', category: 'verbos', color: '#d97706' },
  { id: 'trabajo', text: 'trabajo', category: 'verbos', color: '#d97706' },
  { id: 'quiero', text: 'quiero', category: 'verbos', color: '#d97706' },
  { id: 'necesito', text: 'necesito', category: 'verbos', color: '#d97706' },
  { id: 'voy', text: 'voy', category: 'verbos', color: '#d97706' },
  { id: 'tengo', text: 'tengo', category: 'verbos', color: '#d97706' },
  // 3. Adverbios / Tiempo / Estados (6 botones)
  { id: 'mucho', text: 'mucho', category: 'modificadores', color: '#7c3aed' },
  { id: 'poco', text: 'poco', category: 'modificadores', color: '#7c3aed' },
  { id: 'hoy', text: 'hoy', category: 'modificadores', color: '#7c3aed' },
  { id: 'manana', text: 'mañana', category: 'modificadores', color: '#7c3aed' },
  { id: 'ahora', text: 'ahora', category: 'modificadores', color: '#7c3aed' },
  { id: 'bien', text: 'bien', category: 'modificadores', color: '#7c3aed' },
  // 4. Lugares / Conectores (6 botones)
  { id: 'en', text: 'en', category: 'lugares', color: '#0d9488' },
  { id: 'con', text: 'con', category: 'lugares', color: '#0d9488' },
  { id: 'Lima', text: 'Lima', category: 'lugares', color: '#0d9488' },
  { id: 'Piura', text: 'Piura', category: 'lugares', color: '#0d9488' },
  { id: 'casa', text: 'casa', category: 'lugares', color: '#0d9488' },
  { id: 'universidad', text: 'universidad', category: 'lugares', color: '#0d9488' },
  // 5. Respuestas Rápidas & Cortesía (6 botones)
  { id: 'si', text: 'Sí', category: 'cortesia', color: '#059669' },
  { id: 'no', text: 'No', category: 'cortesia', color: '#059669' },
  { id: 'por_favor', text: 'Por favor', category: 'cortesia', color: '#059669' },
  { id: 'gracias', text: 'Gracias', category: 'cortesia', color: '#059669' },
  { id: 'hola', text: 'Hola', category: 'cortesia', color: '#059669' },
  { id: 'ayuda', text: 'Ayuda', category: 'cortesia', color: '#059669' },
  // Acciones (Columna Lateral)
  { id: 'hablar', text: 'Escuchar', category: 'acciones', action: 'speak', color: '#2563eb' },
  { id: 'borrar', text: 'Borrar', category: 'acciones', action: 'delete', color: '#dc2626' },
  { id: 'limpiar', text: 'Limpiar', category: 'acciones', action: 'clear', color: '#475569' },
];

const DEFAULT_SUGGESTIONS: DiffusionTopItem[] = [
  { id: 'quiero', label: 'quiero', category: 'verbos', color: '#d97706', intensity: 0.35, prob_adjusted: 35.0, prob_global: 5.2, global_energy: 0.052 },
  { id: 'necesito', label: 'necesito', category: 'verbos', color: '#d97706', intensity: 0.26, prob_adjusted: 26.0, prob_global: 4.1, global_energy: 0.041 },
  { id: 'voy', label: 'voy', category: 'verbos', color: '#d97706', intensity: 0.18, prob_adjusted: 18.0, prob_global: 3.2, global_energy: 0.032 },
  { id: 'casa', label: 'casa', category: 'lugares', color: '#0d9488', intensity: 0.12, prob_adjusted: 12.0, prob_global: 2.1, global_energy: 0.021 },
  { id: 'hoy', label: 'hoy', category: 'modificadores', color: '#7c3aed', intensity: 0.09, prob_adjusted: 9.0, prob_global: 1.5, global_energy: 0.015 },
];

export const App: Component = () => {
  const [keyboardItems, setKeyboardItems] = createSignal<KeyboardItem[]>(DEFAULT_KEYBOARD);
  const [sentenceWords, setSentenceWords] = createSignal<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = createSignal<boolean>(false);
  const [isNetworksOpen, setIsNetworksOpen] = createSignal<boolean>(false);
  const [showCamera, setShowCamera] = createSignal<boolean>(true);
  const [isMuted, setIsMuted] = createSignal<boolean>(false);
  const [speechLang, setSpeechLang] = createSignal<string>('es-ES');
  const [suggestedWords, setSuggestedWords] = createSignal<DiffusionTopItem[]>(DEFAULT_SUGGESTIONS);

  const {
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
    startCamera,
    stopCamera,
    setSelectedDeviceId,
    toggleActiveState,
    updateConfig,
    connectWebSocket,
  } = useWebcamStream();

  onMount(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.keyboard_items && data.keyboard_items.length > 0) {
          setKeyboardItems(data.keyboard_items);
        }
        if (data.tracker_config) {
          updateConfig(data.tracker_config);
        }
      })
      .catch((err) => {
        console.warn('Usando configuración por defecto de teclado:', err);
      });

    // Carga inicial de difusión
    fetch('/api/network/diffusion?source_id=yo&time_s=0.5')
      .then((res) => res.json())
      .then((data) => {
        if (data.diffusion_steps && data.diffusion_steps.length > 0) {
          const top = data.diffusion_steps[0]?.top_activated ?? [];
          if (top.length > 0) {
            setSuggestedWords(top.slice(0, 5));
          }
        }
      })
      .catch(() => {});
  });

  // Cada vez que cambia la frase, obtener predicción de difusión continua
  createEffect(() => {
    const words = sentenceWords();
    const source = words.length > 0 ? words[words.length - 1].toLowerCase() : 'yo';

    fetch(`/api/network/diffusion?source_id=${encodeURIComponent(source)}&time_s=0.5`)
      .then((res) => res.json())
      .then((data) => {
        if (data.diffusion_steps && data.diffusion_steps.length > 0) {
          const top = data.diffusion_steps[0]?.top_activated ?? [];
          if (top.length > 0) {
            setSuggestedWords(top.slice(0, 5));
          }
        }
      })
      .catch(() => {});
  });

  const handleToggleMute = () => {
    const nextState = !isMuted();
    setIsMuted(nextState);
    sounds.setMuted(nextState);
  };

  const handleSelectItem = (item: KeyboardItem) => {
    setSentenceWords((prev) => [...prev, item.text]);
  };

  const handleSelectWordDirect = (wordText: string) => {
    setSentenceWords((prev) => [...prev, wordText]);
    sounds.playSelectSound(false);
  };

  const handleDeleteWord = () => {
    setSentenceWords((prev) => prev.slice(0, -1));
  };

  const handleRemoveWordAtIndex = (index: number) => {
    setSentenceWords((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearSentence = () => {
    setSentenceWords([]);
  };

  const handleSpeakSentence = () => {
    const textToSpeak = sentenceWords().join(' ');
    sounds.speak(textToSpeak, speechLang());
  };

  return (
    <div class="app-main-layout">
      {/* Top Header */}
      <Header
        connectionStatus={connectionStatus()}
        isActive={detectionResult()?.is_active ?? false}
        onToggleActive={() => toggleActiveState()}
        clientFps={clientFps()}
        serverFps={Math.round(detectionResult()?.fps ?? 0)}
        latencyMs={latencyMs()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNetworks={() => setIsNetworksOpen(true)}
        showCamera={showCamera()}
        onToggleCamera={() => setShowCamera(!showCamera())}
      />

      {/* Main Content Workspace */}
      <main class="app-workspace">
        <div class="workspace-grid">
          {/* Virtual Keyboard Main Stage */}
          <section class="keyboard-stage">
            <VirtualKeyboard
              items={keyboardItems()}
              suggestedWords={suggestedWords()}
              pointer={detectionResult()?.pointer ?? null}
              isActive={detectionResult()?.is_active ?? false}
              isPinching={detectionResult()?.is_pinching ?? false}
              dwellThreshold={config().dwell_threshold}
              onSelectItem={handleSelectItem}
              onSelectWordDirect={handleSelectWordDirect}
              onOpenNetworks={() => setIsNetworksOpen(true)}
              onDeleteItem={handleDeleteWord}
              onClearSentence={handleClearSentence}
              onSpeakSentence={handleSpeakSentence}
            />

            {/* Sentence Builder at Bottom */}
            <SentenceBuilder
              words={sentenceWords()}
              onRemoveWord={handleRemoveWordAtIndex}
              onClear={handleClearSentence}
              onSpeak={handleSpeakSentence}
            />
          </section>

          {/* Floating/Docked Camera Preview Panel */}
          <Show when={showCamera()}>
            <aside class="camera-docked-panel">
              <CameraStream
                videoRefSetter={setVideoRef}
                isCameraRunning={isCameraRunning()}
                onStartCamera={() => startCamera(selectedDeviceId())}
                onStopCamera={stopCamera}
                detectionResult={detectionResult()}
                errorMessage={errorMessage()}
                onRetryConnection={connectWebSocket}
              />
            </aside>
          </Show>
        </div>
      </main>

      {/* Network Metrics Exploration Modal */}
      <NetworkDashboard
        isOpen={isNetworksOpen()}
        onClose={() => setIsNetworksOpen(false)}
        sentenceWords={sentenceWords()}
        keyboardItems={keyboardItems()}
        onSelectWord={handleSelectWordDirect}
      />

      {/* Settings Dialog Modal */}
      <SettingsModal
        isOpen={isSettingsOpen()}
        onClose={() => setIsSettingsOpen(false)}
        config={config()}
        onUpdateConfig={updateConfig}
        videoDevices={videoDevices()}
        selectedDeviceId={selectedDeviceId()}
        onSelectDevice={(id) => {
          setSelectedDeviceId(id);
          startCamera(id);
        }}
        isMuted={isMuted()}
        onToggleMute={handleToggleMute}
        speechLang={speechLang()}
        onSelectSpeechLang={setSpeechLang}
      />
    </div>
  );
};

export default App;
