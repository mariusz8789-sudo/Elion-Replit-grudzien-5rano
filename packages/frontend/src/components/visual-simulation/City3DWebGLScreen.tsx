import { useEffect, useMemo, useRef, useState } from 'react';
import { registerActiveSimControls } from '../../core/activeSimControls';
import { registerSimContext } from '../../core/simContext';
import { ANALYSIS_MODES, type AnalysisMode } from '../../core/simulation/analysis';
import { CLOCK_SPEEDS, type ClockSpeed } from '../../core/simulationClock/clock';
import { EpidemicCity3DSim, type CityCameraPreset, type CityWorldSelection } from '../../core/three/epidemicCity3D';
import { consumePendingExperimentWorld } from '../../core/experimentFabric/worldHandoff';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import type { ParamDef, SimParams } from '../../core/types';
import { DEFAULT_HOSPITAL_CAPACITY } from '../../core/simulation/hospitalResource';
import { projectWorldState } from '../../core/simulation/worldEngineContract';
import type { EarthquakeCityOverlayProjection } from '../../core/simulationRenderer/earthquakeCoordinateMapping';
import { consumePendingEarthquakeOverlay } from '../../core/simulationRenderer/earthquakeChatBridge';
import { EarthquakeScenarioPanel } from './EarthquakeScenarioPanel';
import { EvidenceReplayPanel } from './EvidenceReplayPanel';
import { ScenarioCommandCenterPanel } from './ScenarioCommandCenterPanel';

/** Command Center reads existing model and World Engine state only; it does not generate epidemic data or agent routes. */
/** Musi zgadzać się z EpidemicCity3DSim.hospitalStatusCode — indeks, nie liczba wyniku. */
const HOSPITAL_STATUS_LABELS = ['NORMAL', 'WARNING', 'HIGH', 'CRITICAL'] as const;

const CITY_PARAM_DEFS: ParamDef[] = [
  { key: 'r0', label: 'R₀', type: 'slider', default: 2.5, min: 0, max: 6, step: 0.1 },
  { key: 'infectiousDays', label: 'Czas zakażenia', type: 'slider', default: 6, min: 2, max: 14, step: 1, unit: 'dni' },
  { key: 'transmissionScale', label: 'Prawd. transmisji', type: 'slider', default: 1, min: 0, max: 1, step: 0.05 },
  { key: 'restrictions', label: 'Restrykcje', type: 'slider', default: 0, min: 0, max: 1, step: 0.05 },
  { key: 'mobility', label: 'Mobilność', type: 'slider', default: 0.85, min: 0, max: 1, step: 0.05 },
  { key: 'severeRate', label: 'Ciężkie przypadki', type: 'slider', default: 0.15, min: 0, max: 0.6, step: 0.05 },
  { key: 'contactRadius', label: 'Zasięg kontaktu', type: 'slider', default: 14, min: 6, max: 30, step: 1, unit: 'px' },
  { key: 'nAgents', label: 'Liczba agentów', type: 'slider', default: 260, min: 1, max: 1000, step: 1 },
  { key: 'isolate', label: 'Izolacja objawowych', type: 'toggle', default: false },
];

const SLIDERS = CITY_PARAM_DEFS.filter((def) => def.type === 'slider');
const EPIDEMIC_LEGEND = [
  ['S', 'podatny', '#54d98c'], ['E', 'narażony', '#e8b34a'], ['I', 'zakażony', '#f05555'], ['R', 'ozdrowiały', '#5aa2ff'], ['D', 'nieaktywny', '#6b7280'],
] as const;
const CAMERA_PRESETS: Array<{ id: CityCameraPreset; label: string }> = [
  { id: 'city', label: 'CITY' }, { id: 'district', label: 'DISTRICT' }, { id: 'street', label: 'STREET' }, { id: 'agent', label: 'AGENT' },
];
const MINIMAP_COLORS: Record<string, string> = {
  S: '#54d98c', E: '#e8b34a', I: '#f05555', R: '#5aa2ff', D: '#6b7280',
};
const MINIMAP_OBJECT_COLORS: Record<string, string> = {
  home: '#6689aa', shop: '#d4a15e', school: '#7fc0d8', hospital: '#e7edf4', isolation: '#968bac', park: '#3d855d',
};

/**
 * Główna ścieżka 3D miasta. Canvas 2D pozostaje pod #/city jako fallback,
 * a wszystkie dane sceny nadal pochodzą z istniejącego EpidemicCitySimulation.
 */
export function City3DWebGLScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [worldSelection, setWorldSelection] = useState<CityWorldSelection | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CityCameraPreset>('city');
  // Consumed exactly once on mount, mirroring HighFidelitySliceScreen's own
  // handoff pattern: a Science-Chat-confirmed epidemic-city run hands off its
  // already-computed EpidemicCitySimulation instance here instead of City3D
  // silently starting a second, disconnected simulation.
  const [experimentWorld] = useState(() => consumePendingExperimentWorld());
  const sim = useMemo(() => new EpidemicCity3DSim({}, {
    onAgentSelected: (id) => {
      setSelectedId(id);
      if (id !== null) setCameraPreset('agent');
    },
    onWorldSelected: setWorldSelection,
  }, experimentWorld?.simulation), [experimentWorld]);
  const [params, setParams] = useState<SimParams>(() => sim.getSim().getParams());
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<ClockSpeed>(1);
  const [analysis, setAnalysis] = useState<AnalysisMode>('none');
  const [showTransmissions, setShowTransmissions] = useState(true);
  // Design reminder: Earthquake is an immutable SCENARIO overlay, never epidemic WorldState.
  const [earthquakeOverlay, setEarthquakeOverlay] = useState<EarthquakeCityOverlayProjection | null>(null);
  const [stats, setStats] = useState<Record<string, number>>(() => sim.getStats());
  const paramsRef = useRef(params);
  const statsRef = useRef(stats);
  paramsRef.current = params;
  statsRef.current = stats;

  const renderParams = useMemo<SimParams>(() => ({ ...params, clockSpeed: running ? speed : 0 }), [params, running, speed]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, renderParams, true, setStats);

  useEffect(() => { sim.setAnalysisMode(analysis); }, [analysis, sim]);
  useEffect(() => { sim.setShowTransmissions(showTransmissions); }, [showTransmissions, sim]);
  useEffect(() => { sim.setEarthquakeScenarioOverlay(earthquakeOverlay); }, [earthquakeOverlay, sim]);
  useEffect(() => {
    const applyPending = () => {
      const pending = consumePendingEarthquakeOverlay();
      if (pending) setEarthquakeOverlay(pending);
    };
    applyPending();
    window.addEventListener('genesis:earthquake-overlay-ready', applyPending);
    return () => window.removeEventListener('genesis:earthquake-overlay-ready', applyPending);
  }, []);

  const updateParam = (key: string, value: number | boolean) => {
    sim.setParam(key, value);
    setParams((previous) => ({ ...previous, [key]: value }));
    setStats(sim.getStats());
  };
  const play = () => setRunning(true);
  const pause = () => setRunning(false);
  const step = () => { sim.step(); setStats(sim.getStats()); };
  const reset = () => {
    sim.reset(); setRunning(false); setSelectedId(null); setWorldSelection(null); setCameraPreset('city');
    setParams(sim.getSim().getParams()); setStats(sim.getStats());
  };
  const changeCamera = (preset: CityCameraPreset) => {
    sim.setCameraPreset(preset);
    setCameraPreset(preset);
    setStats(sim.getStats());
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
  const latestTransmission = sim.getLatestTransmissionView();
  const modelObjects = sim.getSim().objects();
  const modelAgents = sim.getSim().agents();
  const worldWidth = sim.getSim().worldWidth;
  const worldHeight = sim.getSim().worldHeight;
  const roadNetwork = useMemo(() => sim.getSim().roadNetworkView(), [sim]);
  const topologyCounts = useMemo(() => roadNetwork.segments.reduce<Record<string, number>>((counts, segment) => {
    counts[segment.segmentType] = (counts[segment.segmentType] ?? 0) + 1;
    return counts;
  }, {}), [roadNetwork]);
  const percentageKeys = ['transmissionScale', 'restrictions', 'mobility', 'severeRate'];
  // Ta sama projekcja World Engine Contract, którą dostaje każdy zewnętrzny konsument (SC2) — brak drugiego liczenia hotspotów/klastrów.
  const worldState = useMemo(() => projectWorldState(sim.getSim()), [sim, stats]);
  useEffect(() => { sim.setWorldState(worldState); }, [sim, worldState]);
  const topHotspots = worldState.hotspots.slice(0, 3);
  const topClusters = [...worldState.clusters.household, ...worldState.clusters.location]
    .sort((a, b) => b.transmissions - a.transmissions)
    .slice(0, 3);

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
        <span className="city-camera-control" role="group" aria-label="Poziom obserwacji świata">
          {CAMERA_PRESETS.map((preset) => <button key={preset.id} className="world-speed" aria-pressed={cameraPreset === preset.id} onClick={() => changeCamera(preset.id)}>{preset.label}</button>)}
        </span>
        <button className="world-action accent" onClick={() => { sim.focusFirstInfected(); setCameraPreset(sim.getCameraPreset()); setStats(sim.getStats()); }}>◉ Śledź zakażonego</button>
        <button className="world-action" onClick={() => { sim.focusLatestTransmission(); setCameraPreset(sim.getCameraPreset()); setStats(sim.getStats()); }}>↗ Ostatnia transmisja</button>
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

          <div className="world-panel hospital-panel">
            <div className="world-panel-heading">
              <span>SZPITAL</span>
              <small>{HOSPITAL_STATUS_LABELS[stats.hosp_status_code ?? 0]}</small>
            </div>
            <div className="epidemic-summary">
              <div className="epidemic-summary-row"><span>łóżka ogólne</span><strong>{stats.hosp_occupied_beds ?? 0} / {stats.hosp_total_beds ?? 0}</strong></div>
              <div className="epidemic-summary-row"><span>ICU</span><strong>{stats.hosp_occupied_icu ?? 0} / {stats.hosp_icu_beds ?? 0}</strong></div>
              <div className="epidemic-summary-row"><span>obłożenie ogólne</span><strong>{(stats.hosp_bed_occupancy_pct ?? 0).toFixed(1)}%</strong></div>
              <div className="epidemic-summary-row"><span>obłożenie ICU</span><strong>{(stats.hosp_icu_occupancy_pct ?? 0).toFixed(1)}%</strong></div>
              <div className={`epidemic-summary-row ${(stats.hosp_unmet_care ?? 0) > 0 ? 'accent-row' : ''}`}>
                <span>bez opieki</span><strong>{stats.hosp_unmet_care ?? 0}</strong>
              </div>
            </div>
            <p className="hospital-panel-note">
              Pojemność {DEFAULT_HOSPITAL_CAPACITY.totalBeds} łóżek / {DEFAULT_HOSPITAL_CAPACITY.icuBeds} ICU — ta sama
              stała co w Scientific Core (<code>hospitalResource.ts</code>). Sprzężenie śmiertelności wyłączone: ta
              warstwa liczy obciążenie, nie zmienia przebiegu epidemii.
            </p>
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
              <span>model aktywny</span><strong>dzień {stats.dzien ?? 0}</strong><span>widok: {cameraPreset}</span><span>{analysis === 'none' ? 'widok normalny' : `warstwa: ${analysisLabel}`}</span>
            </div>
            {person && (
              <aside className="city-3d-person-card city-agent-inspector">
                <div className="agent-inspector-heading"><span>AGENT #{selectedId}</span><button onClick={() => { sim.clearSelection(); setCameraPreset('city'); }} aria-label="Zamknij inspekcję">×</button></div>
                <div className="agent-inspector-grid">
                  <span>wiek<b>{String(person.wiek)}</b></span><span>rola<b>{String(person.rola)}</b></span>
                  <span>stan<b>{String(person.stan)}</b></span><span>zachowanie<b>{String(person.zachowanie)}</b></span>
                  <span>izolacja<b>{String(person.izolowany)}</b></span><span>szpital<b>{String(person.hospitalizowany)}</b></span>
                  <span>zakażony przez<b>#{String(person.zarazony_przez)}</b></span>
                </div>
                <button className="world-action accent" onClick={() => { sim.clearSelection(); setCameraPreset('city'); }}>Przestań śledzić</button>
              </aside>
            )}
            {worldSelection && (
              <aside className="city-3d-person-card city-world-object-card">
                <div className="agent-inspector-heading"><span>{worldSelection.kind.toUpperCase()}</span><button onClick={() => { sim.clearSelection(); setCameraPreset('city'); }} aria-label="Zamknij inspekcję świata">×</button></div>
                <strong>{worldSelection.label}</strong>
                <p>{worldSelection.detail}</p>
                <button className="world-action accent" onClick={() => { sim.clearSelection(); setCameraPreset('city'); }}>Wyczyść fokus</button>
              </aside>
            )}
          </div>
          <div className="city-event-timeline" aria-label="Bieżący punkt osi symulacji">
            <div className="timeline-heading"><span>OŚ SYMULACJI</span><small>zdarzenia wynikają z modelu</small></div>
            <div className="timeline-track"><i /><b style={{ left: `${Math.min(96, 8 + Number(stats.dzien ?? 0) * 2)}%` }} /></div>
            <div className="timeline-labels"><span>start</span><span>dzień {stats.dzien ?? 0}</span><span>{stats.kontakty ?? 0} kontaktów · {stats.hospitalizowani ?? 0} hosp.</span></div>
          </div>
          <section className="city-world-analytics-rail" aria-label="Skrócona analityka World State">
            <div><span>HOTSPOTY</span><strong>{worldState.hotspots.length}</strong><small>komórki z zakaźnymi</small></div>
            <div><span>KLASTRY</span><strong>{worldState.clusters.household.length + worldState.clusters.location.length}</strong><small>realne transmisje</small></div>
            <div><span>HOSPITAL</span><strong>{worldState.hospital.status}</strong><small>{worldState.hospital.unmetCare} bez opieki</small></div>
            <div><span>MOBILITY</span><strong>{Math.round(worldState.mobility.effectiveMobility * 100)}%</strong><small>efektywna mobilność</small></div>
            <div className="analytics-rail-not-modeled"><span>ROUTES</span><strong>NOT_MODELED</strong><small>atrybucja kontaktów</small></div>
          </section>
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
          <div className="world-panel hotspot-panel">
            <div className="world-panel-heading"><span>OGNISKA</span><small>World Engine Contract</small></div>
            <div className="epidemic-summary">
              <div className="epidemic-summary-row"><span>aktywne ogniska (siatka)</span><strong>{worldState.hotspots.length}</strong></div>
              <div className="epidemic-summary-row"><span>klastry gospodarstw</span><strong>{worldState.clusters.household.length}</strong></div>
              <div className="epidemic-summary-row"><span>klastry miejsc</span><strong>{worldState.clusters.location.length}</strong></div>
            </div>
            {topHotspots.length > 0 ? (
              <ul className="hotspot-list">
                {topHotspots.map((hotspot, index) => (
                  <li key={`hotspot-${index}`}><span>({Math.round(hotspot.x)}, {Math.round(hotspot.y)})</span><strong>{hotspot.infectious} zakaźnych</strong></li>
                ))}
              </ul>
            ) : <p className="world-panel-empty">Brak ognisk — za mało jednoczesnych zakażeń w jednej komórce siatki.</p>}
            {topClusters.length > 0 && (
              <ul className="hotspot-list hotspot-cluster-list">
                {topClusters.map((cluster) => (
                  <li key={cluster.clusterId}><span>{cluster.kind === 'household' ? 'gospodarstwo' : cluster.contactType} · dzień {Math.round(cluster.firstDay)}–{Math.round(cluster.lastDay)}</span><strong>{cluster.transmissions} transmisji</strong></li>
                ))}
              </ul>
            )}
            <p className="hospital-panel-note">
              Ognisko = komórka siatki z realnymi zakaźnymi agentami; klaster = realne krawędzie transmisji w tym
              samym gospodarstwie lub miejscu (<code>clusterAnalysis.ts</code>). Bez wykrywania heurystycznego —
              pusty wynik jest wynikiem.
            </p>
          </div>
          <div className="world-panel route-network-panel">
            <div className="world-panel-heading"><span>SIEĆ MIEJSKA</span><small>World Engine · topologia</small></div>
            <div className="epidemic-summary">
              <div className="epidemic-summary-row"><span>jezdnie</span><strong>{topologyCounts.ROAD ?? 0}</strong></div>
              <div className="epidemic-summary-row"><span>chodniki</span><strong>{topologyCounts.SIDEWALK ?? 0}</strong></div>
              <div className="epidemic-summary-row"><span>przejścia</span><strong>{topologyCounts.CROSSING ?? 0}</strong></div>
            </div>
            <p className="hospital-panel-note">Topologia pochodzi z tego samego układu miasta co renderer. Przypisanie agentów do tras i segmentów kontaktu pozostaje <code>NOT_MODELED</code>.</p>
          </div>
          <EarthquakeScenarioPanel onOverlayChange={setEarthquakeOverlay} />
          <ScenarioCommandCenterPanel params={params} />
          <div className="world-panel event-feed-panel">
            <div className="world-panel-heading"><span>OSTATNIE ZDARZENIE</span><small>odczyt modelu</small></div>
            {latestTransmission ? (
              <div className="event-feed-item event-feed-transmission">
                <i /><div><b>Transmisja A → B</b><span>dzień {Number(latestTransmission.day.toFixed(2))} · #{latestTransmission.from} → #{latestTransmission.to}</span></div>
                <button className="world-action" onClick={() => { sim.focusLatestTransmission(); setCameraPreset(sim.getCameraPreset()); }}>Pokaż</button>
              </div>
            ) : <p className="world-panel-empty">Brak potwierdzonej transmisji w bieżącym przebiegu.</p>}
          </div>
          <div className="world-panel minimap-panel">
            <div className="world-panel-heading"><span>MINIMAPA ŚWIATA</span><small>{modelAgents.length} agentów modelu</small></div>
            <svg className="city-minimap" viewBox={`0 0 ${worldWidth} ${worldHeight}`} role="img" aria-label="Minimapa miasta z obiektami i agentami modelu">
              <rect width={worldWidth} height={worldHeight} fill="#173126" />
              {modelObjects.map((object, index) => <rect key={`object-${index}`} x={object.x} y={object.y} width={object.w} height={object.h} rx="4" fill={MINIMAP_OBJECT_COLORS[object.kind] ?? '#718096'} opacity={object.closed ? 0.34 : 0.92} />)}
              {modelAgents.map((agent) => <circle key={agent.id} cx={agent.x} cy={agent.y} r="4.1" fill={MINIMAP_COLORS[agent.state] ?? '#cbd5e1'} opacity={agent.isolated ? 0.50 : 0.92} />)}
            </svg>
            <div className="minimap-key"><span><i className="minimap-building-key" /> obiekty</span><span><i className="minimap-agent-key" /> S/E/I/R/D</span></div>
          </div>
          <div className="world-panel science-chat-world-panel">
            <div className="world-panel-heading"><span>SCIENCE CHAT</span><small>aktywny kontekst</small></div>
            <p>Jeden punkt sterowania dla parametrów, pytań i zapisu aktualnego eksperymentu.</p>
            <button className="world-action accent" onClick={() => window.dispatchEvent(new Event('genesis:open-science-chat'))}>Otwórz panel</button>
          </div>
          <div className="world-panel observability-panel">
            <div className="world-panel-heading"><span>OBSERWOWALNOŚĆ</span><small>renderer</small></div>
            <div><span>FPS</span><b>{Math.round(stats.webgl_fps ?? 0)}</b></div>
            <div><span>frame</span><b>{Number(stats.webgl_frame_ms ?? 0).toFixed(2)} ms</b></div>
            <div><span>render</span><b>{Number(stats.webgl_render_ms ?? 0).toFixed(2)} ms</b></div>
            <div><span>draw calls</span><b>{Math.round(stats.webgl_draw_calls ?? 0)}</b></div>
            <div><span>triangles</span><b>{Math.round(stats.webgl_triangles ?? 0)}</b></div>
          </div>
          <EvidenceReplayPanel />
        </aside>
      </section>

      <footer className="city-world-note">Fikcyjne miasto i abstrakcyjny patogen. Kolor ubrania, znaczniki, heatmapa i transmisje są odczytem modelu edukacyjnego, nie diagnozą ani prognozą.</footer>
    </main>
  );
}
