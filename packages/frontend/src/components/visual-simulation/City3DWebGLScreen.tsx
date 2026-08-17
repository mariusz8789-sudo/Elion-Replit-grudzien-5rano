import { useEffect, useMemo, useRef, useState } from 'react';
import { registerActiveSimControls } from '../../core/activeSimControls';
import { registerSimContext } from '../../core/simContext';
import { ANALYSIS_MODES, type AnalysisMode } from '../../core/simulation/analysis';
import { CLOCK_SPEEDS, type ClockSpeed } from '../../core/simulationClock/clock';
import { EpidemicCity3DSim } from '../../core/three/epidemicCity3D';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import type { ParamDef, SimParams } from '../../core/types';

const CITY_PARAM_DEFS: ParamDef[] = [
  { key: 'r0', label: 'R₀', type: 'slider', default: 2.5, min: 0, max: 6, step: 0.1 },
  { key: 'infectiousDays', label: 'Czas zakażenia', type: 'slider', default: 6, min: 2, max: 14, step: 1, unit: 'dni' },
  { key: 'transmissionScale', label: 'Prawd. transmisji', type: 'slider', default: 1, min: 0, max: 1, step: 0.05 },
  { key: 'restrictions', label: 'Restrykcje', type: 'slider', default: 0, min: 0, max: 1, step: 0.05 },
  { key: 'mobility', label: 'Mobilność', type: 'slider', default: 0.85, min: 0, max: 1, step: 0.05 },
  { key: 'severeRate', label: 'Ciężkie przypadki', type: 'slider', default: 0.15, min: 0, max: 0.6, step: 0.05 },
  { key: 'contactRadius', label: 'Zasięg kontaktu', type: 'slider', default: 14, min: 6, max: 30, step: 1, unit: 'px' },
  { key: 'nAgents', label: 'Liczba agentów', type: 'slider', default: 260, min: 1, max: 500, step: 1 },
  { key: 'isolate', label: 'Izolacja objawowych', type: 'toggle', default: false },
];

const SLIDERS = CITY_PARAM_DEFS.filter((def) => def.type === 'slider');
const EPIDEMIC_LEGEND = [
  ['S', 'podatny', '#54d98c'], ['E', 'narażony', '#e8b34a'], ['I', 'zakażony', '#f05555'], ['R', 'ozdrowiały', '#5aa2ff'], ['D', 'nieaktywny', '#6b7280'],
] as const;

/**
 * Główna ścieżka 3D miasta. Canvas 2D pozostaje pod #/city jako fallback,
 * a wszystkie dane sceny nadal pochodzą z istniejącego EpidemicCitySimulation.
 */
export function City3DWebGLScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sim = useMemo(() => new EpidemicCity3DSim({}, { onAgentSelected: setSelectedId }), []);
  const [params, setParams] = useState<SimParams>(() => sim.getSim().getParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<ClockSpeed>(1);
  const [analysis, setAnalysis] = useState<AnalysisMode>('none');
  const [showTransmissions, setShowTransmissions] = useState(true);
  const [stats, setStats] = useState<Record<string, number>>(() => sim.getStats());
  const paramsRef = useRef(params);
  const statsRef = useRef(stats);
  paramsRef.current = params;
  statsRef.current = stats;

  const renderParams = useMemo<SimParams>(() => ({ ...params, clockSpeed: running ? speed : 0 }), [params, running, speed]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, renderParams, true, setStats);

  useEffect(() => { sim.setAnalysisMode(analysis); }, [analysis, sim]);
  useEffect(() => { sim.setShowTransmissions(showTransmissions); }, [showTransmissions, sim]);

  const updateParam = (key: string, value: number | boolean) => {
    sim.setParam(key, value);
    setParams((previous) => ({ ...previous, [key]: value }));
    setStats(sim.getStats());
  };
  const play = () => setRunning(true);
  const pause = () => setRunning(false);
  const step = () => { sim.step(); setStats(sim.getStats()); };
  const reset = () => {
    sim.reset(); setRunning(false); setSelectedId(null);
    setParams(sim.getSim().getParams()); setStats(sim.getStats());
  };

  useEffect(() => registerActiveSimControls({ toggleRunning: () => setRunning((value) => !value), reset }), [sim]);
  useEffect(() => registerSimContext({
    labId: 'visual-city',
    experimentId: 'epidemic-city-3d',
    experimentName: 'Epidemia w małym mieście — WebGL',
    honesty: 'educational',
    honestyNote: 'Fikcyjne miasto i abstrakcyjny Pathogen X. Scena 3D odczytuje wynik modelu agentowego; nie jest prognozą.',
    paramDefs: CITY_PARAM_DEFS,
    getParams: () => paramsRef.current,
    getStats: () => statsRef.current,
    setParam: (key, value) => updateParam(key, value as number | boolean),
  }), [sim]);

  const person = selectedId === null ? null : sim.getSim().debugInfo(selectedId);
  const displayedAgentCount = Number(params.nAgents ?? 0);
  const renderBudget = Number(stats.webgl_total_humanoids ?? 0);
  const analysisLabel = ANALYSIS_MODES.find((mode) => mode.id === analysis)?.label ?? 'Brak';
  const percentageKeys = ['transmissionScale', 'restrictions', 'mobility', 'severeRate'];

  return (
    <main id="main-content" tabIndex={-1} className="home city-3d-screen city-world-shell">
      <header className="city-world-header">
        <div>
          <span className="city-world-eyebrow">GENESIS OS · ŚWIAT NAUKOWY</span>
          <h1>EPIDEMIA — MIASTO 3D</h1>
          <p>Żywy model agentowy · dane syntetyczne · WebGL</p>
        </div>
        <div className="city-world-clock">
          <span>czas symulacji</span>
          <strong>dzień {stats.dzien ?? 0}</strong>
          <small>{renderBudget}/{displayedAgentCount} widocznych agentów</small>
        </div>
      </header>

      <section className="city-world-transport" aria-label="Sterowanie czasem symulacji">
        <button className="world-action primary" onClick={running ? pause : play}>{running ? '⏸ Pauza' : '▶ Start'}</button>
        <button className="world-action" onClick={step}>⏭ Krok</button>
        <button className="world-action" onClick={reset}>↺ Restart</button>
        <span className="city-speed-control" role="group" aria-label="Prędkość symulacji">
          {CLOCK_SPEEDS.filter((value) => value > 0).map((value) => (
            <button key={value} className="world-speed" aria-pressed={speed === value} onClick={() => { setSpeed(value); setRunning(true); }}>{value}×</button>
          ))}
        </span>
        <button className="world-action accent" onClick={() => { sim.focusFirstInfected(); setStats(sim.getStats()); }}>◉ Śledź zakażonego</button>
        <button className="world-action" onClick={() => { sim.focusLatestTransmission(); setStats(sim.getStats()); }}>↗ Ostatnia transmisja</button>
        <button className="world-action ghost" onClick={() => { window.location.hash = '#/city'; }}>Tryb 2D</button>
      </section>

      <section className="city-world-layout">
        <aside className="city-world-sidebar city-world-left" aria-label="Model i parametry epidemii">
          <div className="world-panel model-panel">
            <div className="world-panel-heading"><span>SEIRDD</span><small>aktywny model</small></div>
            <div className="epidemic-summary">
              {EPIDEMIC_LEGEND.map(([id, label, color]) => (
                <div key={id} className="epidemic-summary-row"><i style={{ backgroundColor: color }} /><span>{id} · {label}</span><strong>{stats[id] ?? 0}</strong></div>
              ))}
              <div className="epidemic-summary-row accent-row"><i className="legend-hospital" /><span>hospitalizacja</span><strong>{stats.hospitalizowani ?? 0}</strong></div>
              <div className="epidemic-summary-row accent-row"><i className="legend-isolation" /><span>izolacja</span><strong>{stats.izolowani ?? 0}</strong></div>
            </div>
          </div>

          <div className="world-panel parameter-panel">
            <div className="world-panel-heading"><span>PARAMETRY MODELU</span><small>to samo źródło co Canvas</small></div>
            <div className="world-parameter-list">
              {SLIDERS.map((definition) => {
                const raw = Number(params[definition.key] ?? definition.default);
                const percentage = percentageKeys.includes(definition.key);
                const shown = percentage ? Math.round(raw * 100) : raw;
                return (
                  <label className="world-parameter" key={definition.key}>
                    <span>{definition.label}<b>{shown}{percentage ? '%' : definition.unit ? ` ${definition.unit}` : ''}</b></span>
                    <input type="range" min={percentage ? Number(definition.min) * 100 : definition.min} max={percentage ? Number(definition.max) * 100 : definition.max} step={percentage ? Number(definition.step) * 100 : definition.step} value={shown} aria-label={definition.label} onChange={(event) => updateParam(definition.key, percentage ? Number(event.target.value) / 100 : Number(event.target.value))} />
                  </label>
                );
              })}
              <label className="world-toggle"><input type="checkbox" checked={Boolean(params.isolate)} onChange={(event) => updateParam('isolate', event.target.checked)} /><span>Izolacja objawowych</span></label>
            </div>
          </div>
        </aside>

        <section className="city-world-center" aria-label="Żywa scena miasta 3D">
          <div className="city-3d-stage-wrap city-world-stage">
            <canvas ref={canvasRef} className="city-3d-canvas" aria-label="Żywa scena Three.js miasta z humanoidami sterowanymi przez model epidemii" />
            {loading && <div className="route-loading" role="status">Ładowanie miasta 3D…</div>}
            {failed && <div className="empty-state">WebGL nie uruchomił się. Użyj <button className="link-button" onClick={() => { window.location.hash = '#/city'; }}>trybu Canvas 2D</button>.</div>}
            <div className="city-scene-readout" aria-live="polite">
              <span>model aktywny</span><strong>dzień {stats.dzien ?? 0}</strong><span>{analysis === 'none' ? 'widok normalny' : `warstwa: ${analysisLabel}`}</span>
            </div>
            {person && (
              <aside className="city-3d-person-card city-agent-inspector">
                <div className="agent-inspector-heading"><span>AGENT #{selectedId}</span><button onClick={() => sim.clearSelection()} aria-label="Zamknij inspekcję">×</button></div>
                <div className="agent-inspector-grid">
                  <span>wiek<b>{String(person.wiek)}</b></span><span>rola<b>{String(person.rola)}</b></span>
                  <span>stan<b>{String(person.stan)}</b></span><span>zachowanie<b>{String(person.zachowanie)}</b></span>
                  <span>izolacja<b>{String(person.izolowany)}</b></span><span>szpital<b>{String(person.hospitalizowany)}</b></span>
                  <span>zakażony przez<b>#{String(person.zarazony_przez)}</b></span>
                </div>
                <button className="world-action accent" onClick={() => sim.clearSelection()}>Przestań śledzić</button>
              </aside>
            )}
          </div>
          <div className="city-event-timeline" aria-label="Bieżący punkt osi symulacji">
            <div className="timeline-heading"><span>OŚ SYMULACJI</span><small>zdarzenia wynikają z modelu</small></div>
            <div className="timeline-track"><i /><b style={{ left: `${Math.min(96, 8 + Number(stats.dzien ?? 0) * 2)}%` }} /></div>
            <div className="timeline-labels"><span>start</span><span>dzień {stats.dzien ?? 0}</span><span>{stats.kontakty ?? 0} kontaktów · {stats.hospitalizowani ?? 0} hosp.</span></div>
          </div>
        </section>

        <aside className="city-world-sidebar city-world-right" aria-label="Analityka i warstwy świata">
          <div className="world-panel risk-panel">
            <div className="world-panel-heading"><span>MAPA RYZYKA</span><small>warstwa świata</small></div>
            <select className="world-analysis-select" value={analysis} onChange={(event) => setAnalysis(event.target.value as AnalysisMode)} aria-label="Warstwa analizy 3D">
              {ANALYSIS_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
            <div className="risk-gradient"><span>niskie</span><i /><span>wysokie</span></div>
          </div>
          <div className="world-panel layers-panel">
            <div className="world-panel-heading"><span>WARSTWY</span><small>odczyt modelu</small></div>
            {ANALYSIS_MODES.filter((mode) => mode.id !== 'none').map((mode) => <button key={mode.id} className="world-layer" aria-pressed={analysis === mode.id} onClick={() => setAnalysis(mode.id)}><span>{mode.label}</span><i /></button>)}
            <label className="world-layer transmission-layer"><span>Ślady transmisji</span><input type="checkbox" checked={showTransmissions} onChange={(event) => setShowTransmissions(event.target.checked)} /></label>
          </div>
          <div className="world-panel observability-panel">
            <div className="world-panel-heading"><span>OBSERWOWALNOŚĆ</span><small>renderer</small></div>
            <div><span>FPS</span><b>{Math.round(stats.webgl_fps ?? 0)}</b></div>
            <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
            <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
          </div>
        </aside>
      </section>

      <footer className="city-world-note">Fikcyjne miasto i abstrakcyjny patogen. Kolor ubrania, znaczniki, heatmapa i transmisje są odczytem modelu edukacyjnego, nie diagnozą ani prognozą.</footer>
    </main>
  );
}
