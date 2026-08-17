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

/**
 * Główna ścieżka 3D miasta. Canvas 2D nadal pozostaje pod #/city jako tryb
 * wydajnościowy / fallback, lecz ten ekran renderuje ten sam EpidemicCitySimulation
 * przez Three.js. Nie ma tu drugiego modelu ani nagranej animacji.
 */
export function City3DWebGLScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sim = useMemo(() => new EpidemicCity3DSim({}, { onAgentSelected: setSelectedId }), []);
  const [params, setParams] = useState<SimParams>(() => sim.getSim().getParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<ClockSpeed>(1);
  const [analysis, setAnalysis] = useState<AnalysisMode>('none');
  const [stats, setStats] = useState<Record<string, number>>(() => sim.getStats());
  const paramsRef = useRef(params);
  const statsRef = useRef(stats);
  paramsRef.current = params;
  statsRef.current = stats;

  const renderParams = useMemo<SimParams>(() => ({ ...params, clockSpeed: running ? speed : 0 }), [params, running, speed]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, renderParams, true, setStats);

  useEffect(() => {
    sim.setAnalysisMode(analysis);
  }, [analysis, sim]);

  const updateParam = (key: string, value: number | boolean) => {
    sim.setParam(key, value);
    setParams((previous) => ({ ...previous, [key]: value }));
    setStats(sim.getStats());
  };

  const play = () => setRunning(true);
  const pause = () => setRunning(false);
  const step = () => {
    sim.step();
    setStats(sim.getStats());
  };
  const reset = () => {
    sim.reset();
    setRunning(false);
    setSelectedId(null);
    setParams(sim.getSim().getParams());
    setStats(sim.getStats());
  };

  useEffect(() => registerActiveSimControls({ toggleRunning: () => setRunning((value) => !value), reset }), [sim]);
  useEffect(() => registerSimContext({
    labId: 'visual-city',
    experimentId: 'epidemic-city-3d',
    experimentName: 'Epidemia w małym mieście — WebGL',
    honesty: 'educational',
    honestyNote: 'Fikcyjne miasto i abstrakcyjny Pathogen X. Trójwymiarowa scena tylko odczytuje wynik rzeczywistego modelu agentowego; nie jest prognozą.',
    paramDefs: CITY_PARAM_DEFS,
    getParams: () => paramsRef.current,
    getStats: () => statsRef.current,
    setParam: (key, value) => updateParam(key, value as number | boolean),
  }), [sim]);

  const person = selectedId === null ? null : sim.getSim().debugInfo(selectedId);
  const displayedAgentCount = Number(params.nAgents ?? 0);
  const renderBudget = Number(stats.webgl_total_humanoids ?? 0);

  return (
    <main id="main-content" tabIndex={-1} className="home city-3d-screen">
      <div className="honesty-row">
        <span className="honesty educational">Model edukacyjny · WebGL</span>
        <span className="honesty-note">
          Każdy człowiek w scenie 3D odczytuje bieżący stan istniejącego EpidemicCitySimulation: pozycję, prędkość, gait, stan, zachowanie, izolację i hospitalizację.
          Canvas 2D pozostaje pod #/city jako tryb wydajnościowy; ten widok nie zmienia równań ani wyników modelu.
        </span>
      </div>

      <div className="sim-transport city-3d-transport">
        <button className="chip-btn" onClick={running ? pause : play}>{running ? '⏸ Pauza' : '▶ Start'}</button>
        <button className="chip-btn" onClick={step}>⏭ Krok</button>
        <button className="chip-btn" onClick={reset}>↺ Restart</button>
        <span className="sim-speed" role="group" aria-label="Prędkość symulacji">
          {CLOCK_SPEEDS.filter((value) => value > 0).map((value) => (
            <button key={value} className="chip-btn" aria-pressed={speed === value} onClick={() => { setSpeed(value); setRunning(true); }}>{value}×</button>
          ))}
        </span>
        <label className="sim-toggle">Analiza:
          <select value={analysis} onChange={(event) => setAnalysis(event.target.value as AnalysisMode)} aria-label="Warstwa analizy 3D">
            {ANALYSIS_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
          </select>
        </label>
        <button className="chip-btn" onClick={() => { window.location.hash = '#/city'; }}>Tryb wydajnościowy 2D</button>
        <span className="sim-daylabel">dzień {stats.dzien ?? 0} · {renderBudget}/{displayedAgentCount} widocznych humanoidów 3D</span>
      </div>

      <div className="city-3d-stage-wrap">
        <canvas ref={canvasRef} className="city-3d-canvas" aria-label="Żywa scena Three.js miasta z humanoidami sterowanymi przez model epidemii" />
        {loading && <div className="route-loading" role="status">Ładowanie miasta 3D…</div>}
        {failed && (
          <div className="empty-state">
            WebGL nie uruchomił się w tej przeglądarce. Użyj <button className="link-button" onClick={() => { window.location.hash = '#/city'; }}>trybu wydajnościowego Canvas 2D</button>.
          </div>
        )}
        <div className="city-3d-overlay" aria-live="polite">
          <span>pełne rigu: {stats.webgl_detailed_humanoids ?? 0}</span>
          <span>instanced crowd: {stats.webgl_instanced_humanoids ?? 0}</span>
          <span>kontakty: {stats.kontakty ?? 0}</span>
          <span>hosp.: {stats.hospitalizowani ?? 0}</span>
          <span>{Math.round(stats.webgl_fps ?? 0)} FPS · {Math.round(stats.webgl_draw_calls ?? 0)} draw calls</span>
          <span>tick {Number(stats.sim_tick_ms ?? 0).toFixed(2)} ms · render {Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</span>
          <span>geom.: {stats.webgl_geometries ?? 0} · tex.: {stats.webgl_textures ?? 0}</span>
        </div>
        {person && (
          <aside className="city-3d-person-card">
            <strong>Osoba #{selectedId}</strong>
            <span>wiek: {String(person.wiek)}</span>
            <span>rola: {String(person.rola)}</span>
            <span>stan: {String(person.stan)}</span>
            <span>zachowanie: {String(person.zachowanie)}</span>
            <span>izolacja: {String(person.izolowany)}</span>
            <span>szpital: {String(person.hospitalizowany)}</span>
            <span>źródło zakażenia: {String(person.zarazony_przez)}</span>
            <button className="chip-btn" onClick={() => sim.clearSelection()}>Przestań śledzić</button>
          </aside>
        )}
      </div>

      <div className="sim-secondary">
        <div className="sim-stats">
          <div><span>Zdrowi</span><strong>{stats.S ?? 0}</strong></div>
          <div><span>Zakażeni</span><strong>{stats.I ?? 0}</strong></div>
          <div><span>Hospitalizowani</span><strong>{stats.hospitalizowani ?? 0}</strong></div>
          <div><span>W izolacji</span><strong>{stats.izolowani ?? 0}</strong></div>
        </div>
      </div>

      <div className="section-label">Parametry modelu (to samo źródło prawdy co Canvas)</div>
      <div className="sim-controls">
        {SLIDERS.map((definition) => {
          const raw = Number(params[definition.key] ?? definition.default);
          const percentage = ['transmissionScale', 'restrictions', 'mobility', 'severeRate'].includes(definition.key);
          const shown = percentage ? Math.round(raw * 100) : raw;
          return (
            <label className="sim-control" key={definition.key}>
              <span>{definition.label}: <b>{shown}{percentage ? '%' : definition.unit ? ` ${definition.unit}` : ''}</b></span>
              <input
                type="range"
                min={percentage ? Number(definition.min) * 100 : definition.min}
                max={percentage ? Number(definition.max) * 100 : definition.max}
                step={percentage ? Number(definition.step) * 100 : definition.step}
                value={shown}
                aria-label={definition.label}
                onChange={(event) => updateParam(definition.key, percentage ? Number(event.target.value) / 100 : Number(event.target.value))}
              />
            </label>
          );
        })}
        <label className="sim-toggle"><input type="checkbox" checked={Boolean(params.isolate)} onChange={(event) => updateParam('isolate', event.target.checked)} /> Izolacja objawowych</label>
      </div>

      <p className="footer-note">
        Kliknij człowieka, aby odczytać dane bezpośrednio z symulacji i śledzić go kamerą. Przeciągnij scenę, aby obrócić kamerę; użyj kółka do zoomu.
        Dla większej populacji do 10 agentów otrzymuje pełny rig proceduralny, a pozostałe osoby są renderowane jako instanced 3D humanoids z tymi samymi pozycjami i stanami modelu.
      </p>
    </main>
  );
}
