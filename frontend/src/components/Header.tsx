import type { Component } from 'solid-js';
import type { ConnectionStatus } from '../types';
import { Activity, Camera, Hand, Settings, Wifi, WifiOff } from 'lucide-solid';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  isActive: boolean;
  onToggleActive: () => void;
  clientFps: number;
  serverFps: number;
  latencyMs: number;
  onOpenSettings: () => void;
  onOpenNetworks?: () => void;
  showCamera: boolean;
  onToggleCamera: () => void;
}

export const Header: Component<HeaderProps> = (props) => {
  return (
    <header class="app-header">
      <div class="header-left">
        <div class="brand-logo">
          <div class="logo-glow-icon">
            <Hand size={20} />
          </div>
          <div class="brand-titles">
            <h1 class="brand-name">
              AeroHand <span class="brand-highlight">AI</span>
            </h1>
            <span class="brand-subtitle">Comunicación Asistiva por Detección de Gestos & Redes Complejas</span>
          </div>
        </div>
      </div>

      <div class="header-center">
        {/* Status Toggle Badge */}
        <button
          class={`status-badge-btn ${props.isActive ? 'badge-active' : 'badge-inactive'}`}
          onClick={props.onToggleActive}
          title="Haz clic o levanta la mano izquierda arriba de la nariz para activar"
        >
          <span class="status-ping" />
          <span class="status-text">
            {props.isActive ? 'SISTEMA ACTIVO' : 'EN ESPERA (Pausado)'}
          </span>
          <span class="status-hint">
            {props.isActive ? 'Mano Der. arriba: Pausar' : 'Mano Izq. arriba: Activar'}
          </span>
        </button>
      </div>

      <div class="header-right">
        {/* Network Metrics Trigger Button */}
        <button
          class="btn-network-metrics"
          onClick={() => props.onOpenNetworks && props.onOpenNetworks()}
          title="Explorar Métricas de Redes Complejas, Centralidades y Difusión Laplaciana"
        >
          <span class="network-icon-glow">🕸️</span>
          <span class="network-btn-text">Redes Complejas</span>
          <span class="badge-mini-sw">σ = 1.84</span>
        </button>

        {/* Telemetry Chips */}
        <div class="telemetry-bar">
          <div class="telemetry-chip" title="Latencia de WebSocket con el servidor FastAPI">
            <Activity size={14} class="telemetry-icon text-cyan" />
            <span>{props.latencyMs} ms</span>
          </div>
          <div class="telemetry-chip" title="FPS de captura y procesamiento">
            <span class="telemetry-label">FPS:</span>
            <span class="text-emerald">{props.clientFps || props.serverFps || 0}</span>
          </div>
          <div
            class={`connection-chip ${props.connectionStatus}`}
            title={`WebSocket: ${props.connectionStatus}`}
          >
            {props.connectionStatus === 'connected' ? (
              <>
                <Wifi size={14} class="text-emerald" />
                <span>En Línea</span>
              </>
            ) : props.connectionStatus === 'connecting' ? (
              <>
                <Wifi size={14} class="text-amber" />
                <span>Conectando</span>
              </>
            ) : (
              <>
                <WifiOff size={14} class="text-rose" />
                <span>Desconectado</span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div class="header-actions">
          <button
            class={`btn-icon ${props.showCamera ? 'btn-icon-active' : ''}`}
            onClick={props.onToggleCamera}
            title={props.showCamera ? 'Ocultar cámara' : 'Mostrar cámara'}
          >
            <Camera size={18} />
          </button>
          <button
            class="btn-icon"
            onClick={props.onOpenSettings}
            title="Ajustes de sensibilidad y puntero"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};
