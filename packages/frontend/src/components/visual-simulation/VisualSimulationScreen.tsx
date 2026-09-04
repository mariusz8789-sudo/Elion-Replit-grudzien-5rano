import { useEffect, useMemo, useRef, useState } from 'react';
import { EpidemicCitySimulation, DEFAULT_CITY_PARAMS, type EpidemicCityParams } from '../../core/simulation/epidemicCity';
import { SimulationClock, CLOCK_SPEEDS, type ClockSpeed } from '../../core/simulationClock/clock';
import { renderCity } from '../../core/simulationRenderer/cityRenderer';
import {
  defaultCamera, computeTransform, screenToWorld, worldToScreen, zoomAt, panBy, type Camera,
} from '../../core/simulationRenderer/camera';
import { consumePendingComparison } from '../../core/compareBridge';
import { computeField, ANALYSIS_MODES, type AnalysisMode } from '../../core/simulation/analysis';
import { createSpatialWorldOverlay, type SpatialWorldOverlay } from '../../core/simulationRenderer/spatialOverlay';
import { getToken } from '../../core/backend/session';
import { getProjectSpatialDataset } from '../../core/backend/client';
import { getActiveSpatialOverlay, subscribeActiveSpatialOverlay } from '../../core/backend/spatialOverlayContext';
import { projectWorldState } from '../../core/simulation/worldEngineContract';
import { projectEpidemicScreenState } from '../../core/world/epidemicVirtualLabAdapter';
import { createVirtualLabIntegration } from '../../core/world/virtualLabIntegration';
import type { WorldCaptureTimeline } from '../../core/world/worldCapture';

/**
 * VISUAL SIMULATION SCREEN — żywa scena „Epidemia w małym mieście" z warstwą
 * VISUAL FIDELITY: agenci to animowani ludzie (AgentVisual), kamera (zoom/pan/
 * follow), klik→karta osoby, oś czasu. SCENA jest główna; wykres podrzędny.
 * Pętla rAF pędzi niezależnie od cyklu Reacta: zegar → sim.tick() → renderer.
 */

const SLIDERS: { key: keyof EpidemicCityParams; label: string; min: number; max: number; step: number; unit?: string; scale?: number }[] = [
  { key: 'r0', label: 'R₀', min: 0, max: 6, step: 0.1 },
  { key: 'infectiousDays', label: 'Czas zakażenia', min: 2, max: 14, step: 1, unit: 'dni' },
  { key: 'transmissionScale', label: 'Prawd. transmisji', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'restrictions', label: 'Restrykcje', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'mobility', label: 'Mobilność', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'severeRate', label: 'Ciężkie przypadki', min: 0, max: 60, step: 5, unit: '%', scale: 100 },
  { key: 'contactRadius', label: 'Zasięg kontaktu', min: 6, max: 30, step: 1, unit: 'px' },
  { key: 'nAgents', label: 'Liczba agentów', min: 100, max: 500, step: 20 },
];

const STATE_LEGEND: [string, string, string][] = [
  ['S', '#54d98c', 'zdrowy'], ['E', '#e8b34a', 'narażony'], ['I', '#f05555', 'zakażony'],
  ['R', '#5aa2ff', 'odporny'], ['D', '#6b7280', 'zgon'],
];

export function VisualSimulationScreen() {
  const sim = useMemo(() => {
    const pending = consumePendingComparison();
    const r0 = pending?.a.params.r0 ?? DEFAULT_CITY_PARAMS.r0;
    return new EpidemicCitySimulation({ r0 });
  }, []);
  const clock = useMemo(() => new SimulationClock(), []);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>(defaultCamera(sim.worldWidth, sim.worldHeight));
  const followId = useRef<number>(-1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const worldStatesRef = useRef<ReturnType<typeof projectEpidemicScreenState>[]>([]);
  const completedRunsRef = useRef<ReturnType<typeof projectEpidemicScreenState>[][]>([]);
  const lastWorldTickRef = useRef(-1);
  const labIntegration = useMemo(() => createVirtualLabIntegration({
    createEntity: () => {}, updateEntity: () => {}, removeEntity: () => {}, reset: () => {}, dispose: () => {},
  }, (decision) => {
    const zoomByMode = { MACRO: 1.8, SCIENTIFIC: 1.35, WIDE: 0.8, CINEMATIC: 1.1, HUMAN_EYE: 1 } as const;
    cam.current.zoom = zoomByMode[decision.mode];
    setZoomLabel(Math.round(cam.current.zoom * 10) / 10);
  }), [sim]);

  const [params, setParams] = useState<EpidemicCityParams>(() => sim.getParams() as unknown as EpidemicCityParams);
  const [speed, setSpeedState] = useState<ClockSpeed>(1);
  const [running, setRunning] = useState(false);
  const [debug, setDebug] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [selectedId, setSelectedId] = useState(-1);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('none');
  const [stats, setStats] = useState<Record<string, number>>(() => sim.stats());
  const [spatialOverlayLabel, setSpatialOverlayLabel] = useState<string | null>(null);
  const [captureTimeline, setCaptureTimeline] = useState<WorldCaptureTimeline | null>(null);
  const [replayActive, setReplayActive] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [compareText, setCompareText] = useState<string | null>(null);
  const spatialOverlayRef = useRef<SpatialWorldOverlay | null>(null);

  const debugRef = useRef(debug); debugRef.current = debug;
  const showChartRef = useRef(showChart); showChartRef.current = showChart;
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const analysisRef = useRef(analysisMode); analysisRef.current = analysisMode;
  const replayActiveRef = useRef(replayActive); replayActiveRef.current = replayActive;
  const replayIndexRef = useRef(replayIndex); replayIndexRef.current = replayIndex;

  useEffect(() => {
    let cancelled = false;
    const loadSelectedOverlay = async () => {
      const selected = getActiveSpatialOverlay();
      if (!selected) {
        spatialOverlayRef.current = null;
        setSpatialOverlayLabel(null);
        return;
      }
      const token = getToken();
      if (!token) {
        spatialOverlayRef.current = null;
        setSpatialOverlayLabel(null);
        return;
      }
      const result = await getProjectSpatialDataset(token, selected.projectId, selected.datasetId);
      if (cancelled) return;
      if (!result.ok) {
        spatialOverlayRef.current = null;
        setSpatialOverlayLabel(null);
        return;
      }
      spatialOverlayRef.current = createSpatialWorldOverlay(result.data.dataset, sim.worldWidth, sim.worldHeight);
      setSpatialOverlayLabel(result.data.label);
    };
    void loadSelectedOverlay();
    const unsubscribe = subscribeActiveSpatialOverlay(() => { void loadSelectedOverlay(); });
    return () => { cancelled = true; unsubscribe(); };
  }, [sim]);

  useEffect(() => {
    let raf = 0; let last = performance.now(); let statAcc = 0;
    const frame = (now: number) => {
      const dtSec = Math.min(0.1, (now - last) / 1000); last = now;
      if (!replayActiveRef.current) clock.advance(dtSec, (dtDays) => sim.tick(dtDays));
      const worldState = projectEpidemicScreenState(projectWorldState(sim));
      if (!replayActiveRef.current) labIntegration.sync(worldState);
      if (!replayActiveRef.current && worldState.tick !== lastWorldTickRef.current) {
        lastWorldTickRef.current = worldState.tick;
        worldStatesRef.current = [...worldStatesRef.current, worldState];
        setCaptureTimeline(labIntegration.capture(null, worldStatesRef.current));
      }
      const canvas = sceneRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const cssW = canvas.clientWidth || 900, cssH = canvas.clientHeight || 620;
          if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          // Follow: kamera podąża za wybranym agentem.
          if (followId.current >= 0) {
            const a = sim.agents().find((x) => x.id === followId.current);
            if (a) { cam.current.cx = a.x; cam.current.cy = a.y; }
          }
          const transform = computeTransform(cam.current, sim.worldWidth, sim.worldHeight, cssW, cssH);
          const analysis = analysisRef.current !== 'none'
            ? computeField(sim.agents(), sim.worldWidth, sim.worldHeight, analysisRef.current)
            : null;
          renderCity(ctx, sim, cssW, cssH, {
            transform, debug: debugRef.current, focusId: selectedRef.current,
            contactRadius: Number(sim.getParams().contactRadius), analysis,
            spatialOverlay: spatialOverlayRef.current,
          });
          if (replayActiveRef.current) drawReplaySnapshot(ctx, worldStatesRef.current[replayIndexRef.current], transform);
        }
      }
      if (showChartRef.current) drawChart(chartRef.current, sim);
      statAcc += dtSec;
      if (statAcc >= 0.25) { statAcc = 0; setStats(sim.stats()); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); labIntegration.dispose(); };
  }, [sim, clock, labIntegration]);

  const applySpeed = (s: ClockSpeed) => { clock.setSpeed(s); setSpeedState(s); setRunning(clock.running); };
  const play = () => { clock.play(); if (clock.speed === 0) applySpeed(1); setRunning(true); };
  const pause = () => { clock.pause(); setRunning(false); };
  const step = () => { clock.singleStep((dt) => sim.tick(dt)); setStats(sim.stats()); };
  const restart = () => {
    if (worldStatesRef.current.length > 0) completedRunsRef.current = [...completedRunsRef.current, worldStatesRef.current];
    sim.reset(); clock.reset(); setRunning(false); followId.current = -1; setSelectedId(-1); setStats(sim.stats()); setParams(sim.getParams() as unknown as EpidemicCityParams);
    worldStatesRef.current = []; lastWorldTickRef.current = -1; setCaptureTimeline(null); setReplayActive(false); setReplayIndex(0); setCompareText(null);
  };
  const replayCaptured = () => { if (worldStatesRef.current.length === 0) return; labIntegration.replay([worldStatesRef.current[0]!]); setReplayIndex(0); setReplayActive(true); setRunning(false); clock.pause(); };
  const scrubReplay = (index: number) => { const state = worldStatesRef.current[index]; if (!state) return; labIntegration.replay([state]); setReplayIndex(index); };
  const exitReplay = () => { setReplayActive(false); setReplayIndex(0); };
  const compareCaptured = () => {
    const previous = completedRunsRef.current.at(-1);
    const current = worldStatesRef.current;
    if (!previous || current.length === 0) { setCompareText('Brak dwóch rzeczywistych przebiegów do porównania.'); return; }
    const a = labIntegration.capture(null, previous), b = labIntegration.capture(null, current);
    setCompareText(a.snapshots.at(-1)?.fingerprint === b.snapshots.at(-1)?.fingerprint ? 'MATCH: fingerprinty przebiegów są identyczne.' : 'DRIFT: fingerprinty przebiegów różnią się.');
  };

  const onSlider = (key: keyof EpidemicCityParams, raw: number, scale?: number) => {
    const value = scale ? raw / scale : raw;
    sim.setParam(key, value);
    setParams((p) => ({ ...p, [key]: value }));
    if (key === 'nAgents') { clock.reset(); setRunning(false); followId.current = -1; setSelectedId(-1); }
    setStats(sim.stats());
  };
  const toggleIsolate = () => { const v = !params.isolate; sim.setParam('isolate', v); setParams((p) => ({ ...p, isolate: v })); };

  // --- Kamera ---
  const viewSize = () => { const c = sceneRef.current; return { w: c?.clientWidth || 900, h: c?.clientHeight || 620 }; };
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = viewSize();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    cam.current = zoomAt(cam.current, factor, e.clientX - rect.left, e.clientY - rect.top, sim.worldWidth, sim.worldHeight, w, h);
    setZoomLabel(Math.round(cam.current.zoom * 10) / 10);
  };
  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const { w, h } = viewSize();
    const tr = computeTransform(cam.current, sim.worldWidth, sim.worldHeight, w, h);
    const dxWorld = (e.clientX - drag.current.x) / tr.scale;
    const dyWorld = (e.clientY - drag.current.y) / tr.scale;
    cam.current = panBy(cam.current, dxWorld, dyWorld, sim.worldWidth, sim.worldHeight);
    drag.current = { x: e.clientX, y: e.clientY };
    followId.current = -1; // ręczny pan wyłącza śledzenie
  };
  const onUp = () => { drag.current = null; };
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drag.current && (Math.abs(e.clientX - drag.current.x) > 3)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = viewSize();
    const tr = computeTransform(cam.current, sim.worldWidth, sim.worldHeight, w, h);
    const world = screenToWorld(tr, e.clientX - rect.left, e.clientY - rect.top);
    let best = -1, bestD = Infinity;
    for (const a of sim.agents()) { const d = (a.x - world.x) ** 2 + (a.y - world.y) ** 2; if (d < bestD) { bestD = d; best = a.id; } }
    const maxDist = 25 / tr.scale; // tolerancja kliknięcia
    if (best >= 0 && Math.sqrt(bestD) <= maxDist) { setSelectedId(best); followId.current = best; }
    else { setSelectedId(-1); followId.current = -1; }
  };
  const zoomBtn = (factor: number) => {
    const { w, h } = viewSize();
    cam.current = zoomAt(cam.current, factor, w / 2, h / 2, sim.worldWidth, sim.worldHeight, w, h);
    setZoomLabel(Math.round(cam.current.zoom * 10) / 10);
  };
  const resetView = () => { cam.current = defaultCamera(sim.worldWidth, sim.worldHeight); followId.current = -1; setZoomLabel(1); };

  const person = selectedId >= 0 ? sim.debugInfo(selectedId) : null;

  return (
    <main id="main-content" tabIndex={-1} className="home visual-sim">
      <div className="honesty-row">
        <span className="honesty educational">Model edukacyjny</span>
        <span className="honesty-note">
          Żywa symulacja agentowa: agenci to animowani ludzie, a każda animacja wynika ze STANU MODELU (ruch → chód, izolacja/szpital → zmiana trajektorii, kontakt → transmisja).
          Wirtualne punkty modelu, patogen abstrakcyjny „Pathogen X" — symulacja EDUKACYJNA, nie prognoza.
        </span>
        {spatialOverlayLabel && <span className="honesty spatial">GIS: {spatialOverlayLabel} · bbox → świat scenariusza, bez georeferencji</span>}
      </div>

      <div className="sim-transport">
        <button className="chip-btn" onClick={running ? pause : play}>{running ? '⏸ Pauza' : '▶ Start'}</button>
        <button className="chip-btn" onClick={step}>⏭ Krok</button>
        <button className="chip-btn" onClick={restart}>↺ Restart</button>
        <button className="chip-btn" onClick={replayCaptured} disabled={!captureTimeline}>↻ Replay</button>
        <button className="chip-btn" onClick={compareCaptured}>⇄ Compare</button>
        <span className="sim-speed" role="group" aria-label="Prędkość symulacji">
          {CLOCK_SPEEDS.map((s) => (
            <button key={s} className="chip-btn" aria-pressed={speed === s} onClick={() => applySpeed(s)}>{s}×</button>
          ))}
        </span>
        <span className="sim-speed" role="group" aria-label="Kamera">
          <button className="chip-btn" onClick={() => zoomBtn(1.3)} aria-label="Przybliż">＋</button>
          <button className="chip-btn" onClick={() => zoomBtn(1 / 1.3)} aria-label="Oddal">－</button>
          <button className="chip-btn" onClick={resetView}>Widok</button>
        </span>
        <label className="sim-toggle"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Debug</label>
        <label className="sim-toggle"><input type="checkbox" checked={showChart} onChange={(e) => setShowChart(e.target.checked)} /> Wykres</label>
        <label className="sim-toggle"><input type="checkbox" checked={params.isolate} onChange={toggleIsolate} /> Izolacja</label>
        <label className="sim-toggle">Analiza:
          <select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value as AnalysisMode)} aria-label="Warstwa analizy">
            {ANALYSIS_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <span className="sim-daylabel">dzień {stats.dzien ?? 0} · zoom {zoomLabel}×{followId.current >= 0 ? ` · śledzę #${followId.current}` : ''}</span>
      </div>

      {/* Oś czasu (żywa) */}
      <div className="sim-timeline" aria-label="Oś czasu">
        <div className="sim-timeline-fill" style={{ width: `${Math.min(100, ((stats.dzien ?? 0) / 120) * 100)}%` }} />
        <span className="sim-timeline-label">DZIEŃ {stats.dzien ?? 0} / ~120 · szczyt zakażeń w dniu, gdy I było najwyższe</span>
      </div>
      {captureTimeline && (
        <div className="sim-capture" aria-label="Timeline eksperymentu">
          <span>Capture: {captureTimeline.snapshots.length} snapshotów · {captureTimeline.events.length} eventów · {captureTimeline.observations.length} obserwacji</span>
          {replayActive && <>
            <span> · Replay klatka {replayIndex + 1}/{worldStatesRef.current.length}</span>
            <input type="range" min="0" max={Math.max(0, worldStatesRef.current.length - 1)} step="1" value={replayIndex} onChange={(e) => scrubReplay(Number(e.target.value))} aria-label="Pozycja replay" />
            <button className="chip-btn" onClick={exitReplay}>Wyjdź z replay</button>
          </>}
          {compareText && <span> · {compareText}</span>}
        </div>
      )}

      <div className="sim-stage-wrap">
        <canvas
          ref={sceneRef} className="sim-scene"
          onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onClick={onClick}
          aria-label="Żywa scena symulacji: miasto z animowanymi ludźmi"
        />
        <div className="sim-legend">
          {STATE_LEGEND.map(([k, c, label]) => (
            <span key={k}><i style={{ background: c }} /> {label} ({stats[k] ?? 0})</span>
          ))}
          <span>🏥 hosp.: {stats.hospitalizowani ?? 0}</span>
        </div>
        {person && (
          <div className="sim-person-card">
            <strong>👤 Osoba #{selectedId}</strong>
            <div className="sim-person-grid">
              <span>wiek: <b>{String(person.wiek)}</b></span>
              <span>rola: <b>{String(person.rola)}</b></span>
              <span>stan: <b>{String(person.stan)}</b></span>
              <span>aktywność: <b>{String(person.zachowanie)}</b></span>
              <span>izolacja: <b>{String(person.izolowany)}</b></span>
              <span>szpital: <b>{String(person.hospitalizowany)}</b></span>
              <span>zakażony przez: <b>{String(person.zarazony_przez)}</b></span>
              <span>pozycja: <b>{String(person.x)},{String(person.y)}</b></span>
            </div>
            <button className="chip-btn" onClick={() => { setSelectedId(-1); followId.current = -1; }}>Przestań śledzić</button>
          </div>
        )}
      </div>

      <div className="sim-secondary">
        <div className="sim-stats">
          <div><span>Szczyt zakażonych</span><strong>{stats.szczyt_I ?? 0}</strong></div>
          <div><span>Hospitalizowani</span><strong>{stats.hospitalizowani ?? 0}</strong></div>
          <div><span>W izolacji</span><strong>{stats.izolowani ?? 0}</strong></div>
          <div><span>Zgony</span><strong>{stats.D ?? 0}</strong></div>
        </div>
        {showChart && <canvas ref={chartRef} className="sim-chart" aria-label="Wykres pomocniczy S/E/I/R/D w czasie" />}
      </div>

      <div className="section-label">Parametry (świat reaguje natychmiast)</div>
      <div className="sim-controls">
        {SLIDERS.map((s) => {
          const raw = s.scale ? Math.round((params[s.key] as number) * s.scale) : (params[s.key] as number);
          return (
            <label className="sim-control" key={s.key}>
              <span>{s.label}: <b>{raw}{s.unit ? ` ${s.unit}` : ''}</b></span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={raw}
                aria-label={s.label} onChange={(e) => onSlider(s.key, Number(e.target.value), s.scale)} />
            </label>
          );
        })}
      </div>

      <p className="footer-note">
        Kliknij osobę, aby ją śledzić i zobaczyć jej dane. Kółko myszy = zoom, przeciąganie = przesuwanie kamery.
        Test akceptacyjny: R₀=1.5 vs R₀=3.0 — różnicę widać na scenie, zanim spojrzysz na wykres.
      </p>
    </main>
  );
}

function drawReplaySnapshot(
  ctx: CanvasRenderingContext2D,
  state: ReturnType<typeof projectEpidemicScreenState> | undefined,
  transform: ReturnType<typeof computeTransform>,
): void {
  if (!state) return;
  for (const entity of state.entities) {
    if (entity.ref.kind !== 'agent') continue;
    const x = Number(entity.properties.find((p) => p.key === 'x')?.value);
    const y = Number(entity.properties.find((p) => p.key === 'y')?.value);
    const health = String(entity.properties.find((p) => p.key === 'health')?.value ?? 'S');
    const point = worldToScreen(transform, x, y);
    ctx.fillStyle = ({ S: '#54d98c', E: '#e8b34a', I: '#f05555', R: '#5aa2ff', D: '#6b7280' } as Record<string, string>)[health] ?? '#fff';
    ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(2, transform.scale * 2.2), 0, Math.PI * 2); ctx.fill();
  }
}

function drawChart(canvas: HTMLCanvasElement | null, sim: EpidemicCitySimulation): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 360, cssH = canvas.clientHeight || 140;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const hist = sim.history();
  if (hist.length < 2) return;
  const N = Number(sim.getParams().nAgents) || 1;
  const days = Math.max(1, hist[hist.length - 1].t);
  const colors = sim.stateColors;
  const xAt = (t: number) => (t / days) * (cssW - 6) + 3;
  const yAt = (v: number) => cssH - 4 - (v / N) * (cssH - 8);
  for (const key of ['S', 'R', 'E', 'D', 'I']) {
    ctx.strokeStyle = colors[key] ?? '#ccc'; ctx.lineWidth = key === 'I' ? 2 : 1.2; ctx.beginPath();
    hist.forEach((p, i) => { const x = xAt(p.t), y = yAt(p[key] ?? 0); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
  }
}
