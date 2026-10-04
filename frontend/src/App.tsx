import { createSignal, onMount, Show } from 'solid-js';
import type { Component } from 'solid-js';
import { useWebcamStream } from './hooks/useWebcamStream';
import type { KeyboardItem } from './types';
import { Header } from './components/Header';
import { CameraStream } from './components/CameraStream';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { SentenceBuilder } from './components/SentenceBuilder';
import { SettingsModal } from './components/SettingsModal';
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

export const App: Component = () => {
  const [keyboardItems, setKeyboardItems] = createSignal<KeyboardItem[]>(DEFAULT_KEYBOARD);
  const [sentenceWords, setSentenceWords] = createSignal<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = createSignal<boolean>(false);
  const [showCamera, setShowCamera] = createSignal<boolean>(true);
  const [isMuted, setIsMuted] = createSignal<boolean>(false);
  const [speechLang, setSpeechLang] = createSignal<string>('es-ES');

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
  });

  const handleToggleMute = () => {
    const nextState = !isMuted();
    setIsMuted(nextState);
    sounds.setMuted(nextState);
  };

  const handleSelectItem = (item: KeyboardItem) => {
    setSentenceWords((prev) => [...prev, item.text]);
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
              pointer={detectionResult()?.pointer ?? null}
              isActive={detectionResult()?.is_active ?? false}
              isPinching={detectionResult()?.is_pinching ?? false}
              dwellThreshold={config().dwell_threshold}
              onSelectItem={handleSelectItem}
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
