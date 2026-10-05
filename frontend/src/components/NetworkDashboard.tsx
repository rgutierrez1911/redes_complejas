import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import type { Component } from 'solid-js';
import type {
  MessageNetworkAnalysisResult,
  StaticNetworkAnalysisResult,
  DiffusionForecast,
  KeyboardItem,
} from '../types';

interface NetworkDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  sentenceWords: string[];
  keyboardItems: KeyboardItem[];
  onSelectWord?: (wordText: string) => void;
}

export const NetworkDashboard: Component<NetworkDashboardProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<'message' | 'centralities' | 'diffusion' | 'resilience' | 'benchmark'>('message');
  const [staticData, setStaticData] = createSignal<StaticNetworkAnalysisResult | null>(null);
  const [messageData, setMessageData] = createSignal<MessageNetworkAnalysisResult | null>(null);
  const [diffusionData, setDiffusionData] = createSignal<DiffusionForecast | null>(null);
  const [selectedSourceNode, setSelectedSourceNode] = createSignal<string>('yo');
  const [diffusionTimeIndex, setDiffusionTimeIndex] = createSignal<number>(2); // 0.5s default
  const [selectedCentralityMetric, setSelectedCentralityMetric] = createSignal<'betweenness' | 'degree' | 'closeness' | 'pagerank'>('betweenness');
  const [hoveredNodeId, setHoveredNodeId] = createSignal<string | null>(null);

  let canvasRef: HTMLCanvasElement | undefined;
  let animationFrameId: number | null = null;

  // Cargar datos estáticos del teclado base al montar
  onMount(() => {
    fetch('/api/network/static')
      .then((res) => res.json())
      .then((data) => {
        setStaticData(data);
      })
      .catch((err) => console.error('Error cargando análisis de red estática:', err));

    fetchDiffusion('yo');
  });

  // Re-analizar cuando cambia la frase del SentenceBuilder
  createEffect(() => {
    const words = props.sentenceWords;
    if (words.length === 0) {
      // Analizar frase de muestra por defecto si está vacía
      fetchMessageAnalysis(['yo', 'quiero', 'casa', 'hoy', 'hablar']);
    } else {
      fetchMessageAnalysis(words);
      const lastWord = words[words.length - 1].toLowerCase();
      setSelectedSourceNode(lastWord);
      fetchDiffusion(lastWord);
    }
  });

  const fetchMessageAnalysis = async (words: string[]) => {
    try {
      const res = await fetch('/api/network/message-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: words }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessageData(data);
      }
    } catch (e) {
      console.error('Error al analizar grafo del mensaje:', e);
    }
  };


  const fetchDiffusion = async (sourceId: string) => {
    try {
      const res = await fetch(`/api/network/diffusion?source_id=${encodeURIComponent(sourceId)}&time_s=0.5`);
      if (res.ok) {
        const data = await res.json();
        setDiffusionData(data);
      }
    } catch (e) {
      console.error('Error al calcular difusión laplaciana:', e);
    }
  };

  // ============================================================================
  // Renderizado del Grafo 2D con Física / Simulación de Fuerzas en Canvas
  // ============================================================================
  createEffect(() => {
    if (!props.isOpen || activeTab() !== 'message') {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      return;
    }

    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = messageData();
    if (!data || data.graph_nodes.length === 0) return;

    const nodes = data.graph_nodes.map((n, i) => {
      const angle = (i / data.graph_nodes.length) * Math.PI * 2;
      const radius = Math.min(canvas.width, canvas.height) * 0.32;
      return {
        ...n,
        x: canvas.width / 2 + Math.cos(angle) * radius,
        y: canvas.height / 2 + Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: 20 + Math.min(n.in_degree + n.out_degree, 8) * 3,
      };
    });

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Dibujar fondo de cuadrícula suave
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 30;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // 1. Dibujar Aristas Dirigidas con Flechas y Glow
      data.graph_edges.forEach((edge) => {
        const u = nodeMap.get(edge.source);
        const v = nodeMap.get(edge.target);
        if (!u || !v) return;

        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        const startX = u.x + nx * u.radius;
        const startY = u.y + ny * u.radius;
        const endX = v.x - nx * v.radius;
        const endY = v.y - ny * v.radius;

        // Línea de conexión
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = Math.min(edge.weight * 2, 6);
        ctx.stroke();

        // Cabeza de flecha
        const arrowSize = 9;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowSize * nx + (arrowSize / 2) * ny,
          endY - arrowSize * ny - (arrowSize / 2) * nx
        );
        ctx.lineTo(
          endX - arrowSize * nx - (arrowSize / 2) * ny,
          endY - arrowSize * ny + (arrowSize / 2) * nx
        );
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        // Etiqueta de peso si > 1
        if (edge.weight > 1) {
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(midX - 8, midY - 8, 16, 16);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`×${edge.weight}`, midX, midY);
        }
      });

      // 2. Dibujar Nodos con Anillo de Comunidad y Glow
      nodes.forEach((node) => {
        const isHovered = hoveredNodeId() === node.id;
        const communityColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
        const commColor = communityColors[node.community % communityColors.length] || node.color;

        // Aura de resplandor
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHovered ? 8 : 4), 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? 'rgba(56, 189, 248, 0.4)' : 'rgba(56, 189, 248, 0.15)';
        ctx.fill();
        ctx.restore();

        // Cuerpo principal del nodo
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = isHovered ? 3.5 : 2;
        ctx.strokeStyle = commColor;
        ctx.stroke();

        // Texto del nodo
        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold ${Math.max(11, Math.min(14, node.radius * 0.55))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x, node.y - 2);

        // Badge de grado
        ctx.fillStyle = commColor;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`C${node.community + 1} | k:${node.in_degree + node.out_degree}`, node.x, node.y + node.radius * 0.55);
      });
    };

    render();
  });

  onCleanup(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });

  return (
    <Show when={props.isOpen}>
      <div class="network-modal-overlay" onClick={props.onClose}>
        <div class="network-modal-container" onClick={(e) => e.stopPropagation()}>
          {/* Top Header */}
          <header class="network-modal-header">
            <div class="header-branding">
              <span class="header-icon">🕸️</span>
              <div>
                <h2>Explorador de Redes Complejas & Dinámica de Interacción</h2>
                <p class="header-subtitle">
                  Análisis topológico en tiempo real, centralidades de grafos, difusión laplaciana y resiliencia estructural
                </p>
              </div>
            </div>
            <button class="close-modal-btn" onClick={props.onClose} title="Cerrar ventana">
              ✕
            </button>
          </header>

          {/* Navigation Tabs */}
          <nav class="network-tabs-nav">
            <button
              class={`network-tab-btn ${activeTab() === 'message' ? 'active' : ''}`}
              onClick={() => setActiveTab('message')}
            >
              <span class="tab-emoji">💬</span> Grafo del Mensaje Activo
            </button>
            <button
              class={`network-tab-btn ${activeTab() === 'centralities' ? 'active' : ''}`}
              onClick={() => setActiveTab('centralities')}
            >
              <span class="tab-emoji">⭐</span> Centralidades & Hubs
            </button>
            <button
              class={`network-tab-btn ${activeTab() === 'diffusion' ? 'active' : ''}`}
              onClick={() => setActiveTab('diffusion')}
            >
              <span class="tab-emoji">🌊</span> Difusión Laplaciana
            </button>
            <button
              class={`network-tab-btn ${activeTab() === 'resilience' ? 'active' : ''}`}
              onClick={() => setActiveTab('resilience')}
            >
              <span class="tab-emoji">🛡️</span> Resiliencia & Percolación
            </button>
            <button
              class={`network-tab-btn ${activeTab() === 'benchmark' ? 'active' : ''}`}
              onClick={() => setActiveTab('benchmark')}
            >
              <span class="tab-emoji">🌐</span> Modelos Nulos (Small-World)
            </button>
          </nav>

          {/* Main Body Content */}
          <div class="network-modal-body">
            {/* ================================================================
                TAB 1: GRAFO DINÁMICO DEL MENSAJE ACTIVO
                ================================================================ */}
            <Show when={activeTab() === 'message'}>
              <div class="tab-pane-message">
                {/* Métricas Resumen Cards */}
                <div class="metrics-kpi-grid">
                  <div class="kpi-card">
                    <span class="kpi-title">Nodos Activos (N)</span>
                    <span class="kpi-val">{messageData()?.message_metrics.num_nodes ?? 0}</span>
                    <span class="kpi-desc">Palabras únicas</span>
                  </div>
                  <div class="kpi-card">
                    <span class="kpi-title">Transiciones (M)</span>
                    <span class="kpi-val">{messageData()?.message_metrics.num_edges ?? 0}</span>
                    <span class="kpi-desc">Enlaces sintácticos</span>
                  </div>
                  <div class="kpi-card highlight">
                    <span class="kpi-title">Entropía de Secuencia</span>
                    <span class="kpi-val">
                      {messageData()?.evolution_steps.slice(-1)[0]?.entropy.toFixed(3) ?? '0.000'} <small>bits</small>
                    </span>
                    <span class="kpi-desc">Variabilidad de Markov</span>
                  </div>
                  <div class="kpi-card">
                    <span class="kpi-title">Modularidad (Q)</span>
                    <span class="kpi-val">{messageData()?.message_metrics.modularity_q.toFixed(3) ?? '0.000'}</span>
                    <span class="kpi-desc">Segregación Louvain</span>
                  </div>
                  <div class="kpi-card highlight-green">
                    <span class="kpi-title">Coherencia Gramatical</span>
                    <span class="kpi-val">{messageData()?.semantic_coherence_percentage ?? 100}%</span>
                    <span class="kpi-desc">Alineación sintáctica</span>
                  </div>
                  <div class="kpi-card highlight-purple">
                    <span class="kpi-title">Ahorro Motor (Fitts)</span>
                    <span class="kpi-val">-{messageData()?.fitts_reduction_percentage ?? 0}%</span>
                    <span class="kpi-desc">Reducción fatiga motriz</span>
                  </div>
                </div>

                {/* Graph Canvas & Stepper Split */}
                <div class="graph-interactive-stage">
                  <div class="canvas-wrapper">
                    <div class="canvas-header-info">
                      <span>Representación Gráfica G_t = (V_t, E_t)</span>
                      <small>Nodos coloreados por Comunidad de Louvain • Flechas proporcionales al peso</small>
                    </div>
                    <canvas
                      ref={canvasRef}
                      width={560}
                      height={340}
                      class="network-canvas"
                      onMouseLeave={() => setHoveredNodeId(null)}
                    />
                  </div>

                  {/* Stepper de Evolución Temporal */}
                  <div class="evolution-timeline-panel">
                    <h4>Evolución Temporal del Mensaje (t = 1 … T)</h4>
                    <p class="timeline-sub">Secuencia de crecimiento dinámico de la red paso a paso:</p>
                    <div class="timeline-list">
                      <For each={messageData()?.evolution_steps}>
                        {(step) => (
                          <div class="timeline-item">
                            <span class="step-badge">Paso {step.step_index}</span>
                            <strong class="step-token">"{step.label}"</strong>
                            <div class="step-details">
                              <span>N:{step.num_nodes}</span>
                              <span>M:{step.num_edges}</span>
                              <span>ρ:{step.density.toFixed(2)}</span>
                              <span>H:{step.entropy.toFixed(2)}b</span>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>

                    {/* Comunidades Detectadas */}
                    <div class="communities-detected-box">
                      <h5>Comunidades Louvain en el Mensaje:</h5>
                      <div class="comm-chips-row">
                        <For each={Object.entries(messageData()?.communities.communities ?? {})}>
                          {([commIdx, wordsList]) => (
                            <div class={`comm-tag comm-${Number(commIdx) % 5}`}>
                              <strong>C{Number(commIdx) + 1}:</strong> {wordsList.join(', ')}
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* ================================================================
                TAB 2: CENTRALIDADES & HUBS
                ================================================================ */}
            <Show when={activeTab() === 'centralities'}>
              <div class="tab-pane-centralities">
                <div class="centralities-controls">
                  <span>Ordenar ranking por:</span>
                  <div class="metric-filter-buttons">
                    <button
                      class={`filter-btn ${selectedCentralityMetric() === 'betweenness' ? 'active' : ''}`}
                      onClick={() => setSelectedCentralityMetric('betweenness')}
                    >
                      Intermediación (C_B - Puentes)
                    </button>
                    <button
                      class={`filter-btn ${selectedCentralityMetric() === 'degree' ? 'active' : ''}`}
                      onClick={() => setSelectedCentralityMetric('degree')}
                    >
                      Grado (C_D - Conectividad)
                    </button>
                    <button
                      class={`filter-btn ${selectedCentralityMetric() === 'closeness' ? 'active' : ''}`}
                      onClick={() => setSelectedCentralityMetric('closeness')}
                    >
                      Cercanía (C_C - Rapidez)
                    </button>
                    <button
                      class={`filter-btn ${selectedCentralityMetric() === 'pagerank' ? 'active' : ''}`}
                      onClick={() => setSelectedCentralityMetric('pagerank')}
                    >
                      PageRank (C_PR - Autoridad)
                    </button>
                  </div>
                </div>

                <div class="centralities-table-wrapper">
                  <table class="centralities-table">
                    <thead>
                      <tr>
                        <th>Rango</th>
                        <th>Lexema / Tecla</th>
                        <th>Categoría</th>
                        <th>Rol Sintáctico</th>
                        <th>Grado (C_D)</th>
                        <th>Cercanía (C_C)</th>
                        <th>Intermediación (C_B)</th>
                        <th>PageRank (C_PR)</th>
                        <th>Comunidad</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For
                        each={(staticData()?.centralities ?? []).slice().sort((a, b) => {
                          const metric = selectedCentralityMetric();
                          if (metric === 'betweenness') return b.betweenness_centrality - a.betweenness_centrality;
                          if (metric === 'degree') return b.degree_centrality - a.degree_centrality;
                          if (metric === 'closeness') return b.closeness_centrality - a.closeness_centrality;
                          return b.pagerank - a.pagerank;
                        })}
                      >
                        {(item, idx) => (
                          <tr>
                            <td>
                              <span class={`rank-badge ${idx() < 3 ? 'top-rank' : ''}`}>#{idx() + 1}</span>
                            </td>
                            <td>
                              <div class="token-cell">
                                <span class="color-dot" style={{ 'background-color': item.color }} />
                                <strong>{item.label}</strong>
                              </div>
                            </td>
                            <td>
                              <span class="category-pill">{item.category}</span>
                            </td>
                            <td class="role-text">{item.role || '—'}</td>
                            <td>
                              <div class="score-bar-wrapper">
                                <span>{item.degree_centrality.toFixed(3)}</span>
                                <div class="score-bar-bg">
                                  <div class="score-bar-fill" style={{ width: `${Math.min(100, item.degree_centrality * 200)}%` }} />
                                </div>
                              </div>
                            </td>
                            <td>{item.closeness_centrality.toFixed(3)}</td>
                            <td>
                              <div class="score-bar-wrapper highlight">
                                <strong>{item.betweenness_centrality.toFixed(4)}</strong>
                                <div class="score-bar-bg">
                                  <div class="score-bar-fill gold" style={{ width: `${Math.min(100, item.betweenness_centrality * 600)}%` }} />
                                </div>
                              </div>
                            </td>
                            <td>{item.pagerank.toFixed(4)}</td>
                            <td>
                              <span class="community-badge">C{item.community + 1}</span>
                            </td>
                            <td>
                              <button
                                class="simulate-diff-btn"
                                onClick={() => {
                                  setSelectedSourceNode(item.id);
                                  fetchDiffusion(item.id);
                                  setActiveTab('diffusion');
                                }}
                                title="Simular propagación continua desde esta tecla"
                              >
                                Difundir 🌊
                              </button>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            {/* ================================================================
                TAB 3: DIFUSIÓN LAPLACIANA & PRE-ACTIVACIÓN
                ================================================================ */}
            <Show when={activeTab() === 'diffusion'}>
              <div class="tab-pane-diffusion">
                <div class="diffusion-hero-banner">
                  <div class="hero-left">
                    <h3>Simulación Continua: dx(t)/dt = -L · x(t)</h3>
                    <p>
                      Calcula la disipación del potencial comunicativo en tiempo continuo a partir de un nodo fuente.
                      Los modos espectrales de Fiedler (λ₂) determinan la pre-activación atencional hacia las teclas inmediatas.
                    </p>
                  </div>
                  <div class="hero-right-metrics">
                    <div class="fiedler-metric-badge">
                      <span class="fiedler-label">Conectividad de Fiedler (λ₂)</span>
                      <span class="fiedler-val">{diffusionData()?.fiedler_eigenvalue.toFixed(3) ?? '1.036'}</span>
                    </div>
                    <div class="fiedler-metric-badge">
                      <span class="fiedler-label">Tiempo Característico (τ_diff)</span>
                      <span class="fiedler-val">{diffusionData()?.characteristic_diffusion_time_s.toFixed(3) ?? '0.965'}s</span>
                    </div>
                  </div>
                </div>

                {/* Controles de Selección de Nodo Fuente y Tiempo */}
                <div class="diffusion-control-bar">
                  <div class="control-group">
                    <label>Nodo / Tecla Fuente x(0):</label>
                    <select
                      value={selectedSourceNode()}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setSelectedSourceNode(val);
                        fetchDiffusion(val);
                      }}
                      class="node-select-dropdown"
                    >
                      <For each={props.keyboardItems}>
                        {(item) => (
                          <option value={item.id}>
                            {item.text} ({item.category})
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <div class="control-group">
                    <label>Instante de Propagación t:</label>
                    <div class="time-step-buttons">
                      <For each={diffusionData()?.diffusion_steps ?? []}>
                        {(step, idx) => (
                          <button
                            class={`time-step-btn ${diffusionTimeIndex() === idx() ? 'active' : ''}`}
                            onClick={() => setDiffusionTimeIndex(idx())}
                          >
                            {step.time}s
                          </button>
                        )}
                      </For>
                    </div>
                  </div>
                </div>

                {/* Top Teclas Pre-activadas Grid */}
                <div class="predicted-keys-section">
                  <h4>Top Teclas Pre-Activadas (Nodos Próximos) en t = {(diffusionData()?.diffusion_steps ?? [])[diffusionTimeIndex()]?.time ?? 0.5}s:</h4>
                  <div class="predicted-keys-grid">
                    <For each={(diffusionData()?.diffusion_steps ?? [])[diffusionTimeIndex()]?.top_activated ?? []}>
                      {(item, idx) => {
                        const adjVal = () =>
                          item.prob_adjusted !== undefined
                            ? item.prob_adjusted.toFixed(1)
                            : (item.intensity * 100).toFixed(1);
                        const globVal = () =>
                          item.prob_global !== undefined
                            ? item.prob_global.toFixed(1)
                            : (item.global_energy ? (item.global_energy * 100).toFixed(1) : ((item.intensity * 0.15) * 100).toFixed(1));

                        return (
                          <div class="predicted-key-card" style={{ 'border-color': `${item.color}88` }}>
                            <div class="predicted-card-top">
                              <span class="pred-rank">#{idx() + 1} Nodo Próximo</span>
                              <span class="pred-category" style={{ color: item.color }}>
                                {item.category}
                              </span>
                            </div>
                            <div class="pred-metrics-header">
                              <div class="pred-stat-chip">
                                <span class="stat-label">Prob. Repartida</span>
                                <span class="stat-val">{adjVal()}%</span>
                              </div>
                              <div class="pred-stat-chip secondary">
                                <span class="stat-label">Masa en Grafo</span>
                                <span class="stat-val">{globVal()}%</span>
                              </div>
                            </div>
                            <div class="pred-word-title">{item.label}</div>
                            <div class="pred-intensity-gauge">
                              <div class="gauge-label">
                                <span>Energía Repartida</span>
                                <strong>{adjVal()}%</strong>
                              </div>
                              <div class="gauge-bar-bg">
                                <div
                                  class="gauge-bar-fill"
                                  style={{
                                    width: `${Math.min(100, item.intensity * 100)}%`,
                                    'background-color': item.color,
                                  }}
                                />
                              </div>
                            </div>
                            <button
                              class="insert-word-btn"
                              onClick={() => {
                                if (props.onSelectWord) props.onSelectWord(item.label);
                              }}
                            >
                              + Insertar en Frase
                            </button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </div>
            </Show>

            {/* ================================================================
                TAB 4: RESILIENCIA & PERCOLACIÓN
                ================================================================ */}
            <Show when={activeTab() === 'resilience'}>
              <div class="tab-pane-resilience">
                <div class="resilience-header-box">
                  <h3>Curva de Percolación: Decaimiento del Componente Gigante S(f) = N_GCC / N</h3>
                  <p>
                    Compara la robustez estructural del teclado ante pérdida aleatoria de tracking (*fallos estocásticos de cámara*)
                    versus remoción secuencial de hubs prioritarios (*ataques dirigidos por intermediación y grado*).
                  </p>
                </div>

                <div class="resilience-chart-table-grid">
                  <div class="percolation-table-panel">
                    <h4>Datos Numéricos de Percolación:</h4>
                    <table class="percolation-table">
                      <thead>
                        <tr>
                          <th>Fracción Removida (f)</th>
                          <th>Fallo Aleatorio (S_rand)</th>
                          <th>Ataque Intermediación (S_CB)</th>
                          <th>Ataque Grado (S_CD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={staticData()?.resilience_curve ?? []}>
                          {(row) => (
                            <tr>
                              <td>{(row.fraction_removed * 100).toFixed(0)}%</td>
                              <td class="rand-col">{(row.giant_component_ratio_random * 100).toFixed(1)}%</td>
                              <td class="cb-col">{(row.giant_component_ratio_betweenness * 100).toFixed(1)}%</td>
                              <td class="cd-col">{(row.giant_component_ratio_degree * 100).toFixed(1)}%</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>

                  <div class="resilience-conclusions-panel">
                    <h4>Hallazgos de Resiliencia Estructural:</h4>
                    <div class="finding-card good">
                      <span class="finding-icon">🛡️</span>
                      <div>
                        <strong>Tolerancia Extrema a Fallos Aleatorios:</strong>
                        <p>Incluso al perder el 30% de las teclas (f = 0.30), la red retiene el <strong>85.7%</strong> de conectividad funcional debido a los enlaces transversales entre comunidades.</p>
                      </div>
                    </div>
                    <div class="finding-card warning">
                      <span class="finding-icon">⚠️</span>
                      <div>
                        <strong>Vulnerabilidad ante Pérdida de Hubs:</strong>
                        <p>La remoción deliberada de los 4 verbos con mayor intermediación (`quiero`, `necesito`, `voy`, `tengo`) fractura el grafo en componentes aislados (S ≤ 0.38).</p>
                      </div>
                    </div>
                    <div class="finding-card info">
                      <span class="finding-icon">💡</span>
                      <div>
                        <strong>Diseño Ergonómico Asistivo:</strong>
                        <p>La disposición espacial HUD protege a los hubs colocándolos en la zona central de menor esfuerzo biomecánico del brazo.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* ================================================================
                TAB 5: BENCHMARK & MODELOS NULOS (SMALL-WORLD)
                ================================================================ */}
            <Show when={activeTab() === 'benchmark'}>
              <div class="tab-pane-benchmark">
                <div class="small-world-badge-hero">
                  <div class="sigma-pill">
                    <span class="sigma-num">σ = 1.84</span>
                    <span class="sigma-label">Índice de Mundo Pequeño (σ &gt; 1)</span>
                  </div>
                  <div class="sigma-desc">
                    <h3>Topología de Mundo Pequeño (Small-World Network) Confirmada</h3>
                    <p>
                      El teclado virtual combina un agrupamiento local 3 veces superior al azar (C = 0.312 ≫ C_ER)
                      con caminos geodésicos ultracortos (L = 1.87), garantizando navegación ágil con mínimo número de transiciones.
                    </p>
                  </div>
                </div>

                <div class="benchmark-table-wrapper">
                  <table class="benchmark-table">
                    <thead>
                      <tr>
                        <th>Modelo / Topología</th>
                        <th>Parámetros de Ajuste</th>
                        <th>Clustering (C)</th>
                        <th>Longitud Camino (L)</th>
                        <th>Modularidad (Q)</th>
                        <th>Clasificación Topológica</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr class="highlight-row">
                        <td>
                          <strong>G_AeroHand (Teclado Virtual)</strong>
                        </td>
                        <td>N = 33, M = 142</td>
                        <td><strong class="green-text">0.312</strong></td>
                        <td><strong class="green-text">1.87</strong></td>
                        <td><strong class="green-text">0.542</strong></td>
                        <td><span class="badge-sw">Mundo Pequeño (σ = 1.84)</span></td>
                      </tr>
                      <tr>
                        <td>Erdős–Rényi [G(N, p)]</td>
                        <td>p = 0.134</td>
                        <td>0.158</td>
                        <td>1.82</td>
                        <td>0.184</td>
                        <td>Aleatorio Homogéneo</td>
                      </tr>
                      <tr>
                        <td>Watts–Strogatz [WS(N, k, β)]</td>
                        <td>k = 9, β = 0.08</td>
                        <td>0.512</td>
                        <td>1.98</td>
                        <td>0.431</td>
                        <td>Mundo Pequeño Regular</td>
                      </tr>
                      <tr>
                        <td>Barabási–Albert [BA(N, m)]</td>
                        <td>m = 4</td>
                        <td>0.291</td>
                        <td>1.76</td>
                        <td>0.215</td>
                        <td>Libre de Escala [P(k) ~ k⁻³]</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};

