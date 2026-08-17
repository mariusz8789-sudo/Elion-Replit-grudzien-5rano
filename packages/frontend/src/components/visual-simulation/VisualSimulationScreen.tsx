import { useEffect, useMemo, useRef, useState } from 'react';
import { EpidemicCitySimulation, DEFAULT_CITY_PARAMS, type EpidemicCityParams } from '../../core/simulation/epidemicCity';
import { SimulationClock, CLOCK_SPEEDS, type ClockSpeed } from '../../core/simulationClock/clock';
import { renderCity } from '../../core/simulationRenderer/cityRenderer';
import { consumePendingComparison } from '../../core/compareBridge';

/**
 * VISUAL SIMULATION SCREEN — żywa scena „Epidemia w małym mieście".
 *
 * SCENA jest głównym elementem; wykres i liczby są PODRZĘDNE. Pętla rAF pędzi
 * niezależnie od cyklu renderu Reacta: zegar → sim.tick() → renderer. React
 * zarządza tylko UI (suwaki, przyciski) i odświeża panel ~4×/s. Zmiana suwaka
 * natychmiast wpływa na świat (sim.setParam), bo silnik jest źródłem prawdy.
 */

const SLIDERS: { key: keyof EpidemicCityParams; label: string; min: number; max: number; step: number; unit?: string; scale?: number }[] = [
  { key: 'r0', label: 'R₀', min: 0, max: 6, step: 0.1 },
  { key: 'infectiousDays', label: 'Czas zakażenia', min: 2, max: 14, step: 1, unit: 'dni' },
  { key: 'transmissionScale', label: 'Prawd. transmisji', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'restrictions', label: 'Restrykcje', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'mobility', label: 'Mobilność', min: 0, max: 100, step: 5, unit: '%', scale: 100 },
  { key: 'contactRadius', label: 'Zasięg kontaktu', min: 6, max: 30, step: 1, unit: 'px' },
  { key: 'nAgents', label: 'Liczba agentów', min: 100, max: 500, step: 20 },
  { key: 'initialInfected', label: 'Początkowo zakażeni', min: 1, max: 30, step: 1 },
];

const STATE_LEGEND: [string, string, string][] = [
  ['S', '#54d98c', 'zdrowy'], ['E', '#e8b34a', 'narażony'], ['I', '#f05555', 'zakażony'],
  ['R', '#5aa2ff', 'odporny'], ['D', '#6b7280', 'zgon'],
];

export function VisualSimulationScreen() {
  const sim = useMemo(() => {
    // Jeśli Science Chat/porównanie przekazało preset R0 — użyj go dla świata.
    const pending = consumePendingComparison();
    const r0 = pending?.a.params.r0 ?? DEFAULT_CITY_PARAMS.r0;
    return new EpidemicCitySimulation({ r0 });
  }, []);
  const clock = useMemo(() => new SimulationClock(), []);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);

  const [params, setParams] = useState<EpidemicCityParams>(() => sim.getParams() as unknown as EpidemicCityParams);
  const [speed, setSpeedState] = useState<ClockSpeed>(1);
  const [running, setRunning] = useState(false);
  const [debug, setDebug] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [focusId, setFocusId] = useState(-1);
  const [stats, setStats] = useState<Record<string, number>>(() => sim.stats());
  const [tick, setTick] = useState(0);

  const debugRef = useRef(debug); debugRef.current = debug;
  const chartRef2 = useRef(showChart); chartRef2.current = showChart;
  const focusRef = useRef(focusId); focusRef.current = focusId;

  // Pętla animacji (rAF) — niezależna od renderu Reacta.
  useEffect(() => {
    let raf = 0; let last = performance.now();
    let statAcc = 0;
    const frame = (now: number) => {
      const dtSec = Math.min(0.1, (now - last) / 1000); last = now;
      clock.advance(dtSec, (dtDays) => sim.tick(dtDays));
      const canvas = sceneRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const cssW = canvas.clientWidth || 900, cssH = canvas.clientHeight || 620;
          if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderCity(ctx, sim, cssW, cssH, { debug: debugRef.current, focusId: focusRef.current, contactRadius: Number(sim.getParams().contactRadius) });
        }
      }
      if (chartRef2.current) drawChart(chartRef.current, sim);
      statAcc += dtSec;
      if (statAcc >= 0.25) { statAcc = 0; setStats(sim.stats()); setTick((t) => t + 1); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim, clock]);

  const applySpeed = (s: ClockSpeed) => { clock.setSpeed(s); setSpeedState(s); setRunning(clock.running); };
  const play = () => { clock.play(); if (clock.speed === 0) applySpeed(1); setRunning(true); };
  const pause = () => { clock.pause(); setRunning(false); };
  const step = () => { clock.singleStep((dt) => sim.tick(dt)); setStats(sim.stats()); setTick((t) => t + 1); };
  const restart = () => { sim.reset(); clock.reset(); setRunning(false); setStats(sim.stats()); setParams(sim.getParams() as unknown as EpidemicCityParams); setTick((t) => t + 1); };

  const onSlider = (key: keyof EpidemicCityParams, raw: number, scale?: number) => {
    const value = scale ? raw / scale : raw;
    sim.setParam(key, value);
    setParams((p) => ({ ...p, [key]: value }));
    if (key === 'nAgents' || key === 'initialInfected') { clock.reset(); setRunning(false); }
    setStats(sim.stats());
  };
  const toggleIsolate = () => { const v = !params.isolate; sim.setParam('isolate', v); setParams((p) => ({ ...p, isolate: v })); };

  const onSceneClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!debug) return;
    const canvas = sceneRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const wx = ((e.clientX - rect.left) / rect.width) * sim.worldWidth;
    const wy = ((e.clientY - rect.top) / rect.height) * sim.worldHeight;
    let best = -1, bestD = Infinity;
    for (const a of sim.agents()) { const d = (a.x - wx) ** 2 + (a.y - wy) ** 2; if (d < bestD) { bestD = d; best = a.id; } }
    setFocusId(best);
  };

  const dbg = debug && focusId >= 0 ? sim.debugInfo(focusId) : null;
  void tick; // wymusza odświeżenie paneli zależnych od stanu silnika

  return (
    <main id="main-content" tabIndex={-1} className="home visual-sim">
      <div className="honesty-row">
        <span className="honesty educational">Model edukacyjny</span>
        <span className="honesty-note">
          Żywa symulacja agentowa (proces, nie nagranie): zakażenie powstaje z KONTAKTÓW na scenie, ruch i izolacja wynikają ze stanu modelu.
          Agenci to wirtualne punkty modelu, patogen abstrakcyjny „Pathogen X" — symulacja EDUKACYJNA, nie prognoza rzeczywistej epidemii.
        </span>
      </div>

      {/* Pasek transportu czasu */}
      <div className="sim-transport">
        <button className="chip-btn" onClick={running ? pause : play}>{running ? '⏸ Pauza' : '▶ Start'}</button>
        <button className="chip-btn" onClick={step}>⏭ Krok</button>
        <button className="chip-btn" onClick={restart}>↺ Restart</button>
        <span className="sim-speed" role="group" aria-label="Prędkość symulacji">
          {CLOCK_SPEEDS.map((s) => (
            <button key={s} className="chip-btn" aria-pressed={speed === s} onClick={() => applySpeed(s)}>{s}×</button>
          ))}
        </span>
        <label className="sim-toggle"><input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> Debug</label>
        <label className="sim-toggle"><input type="checkbox" checked={showChart} onChange={(e) => setShowChart(e.target.checked)} /> Wykres</label>
        <label className="sim-toggle"><input type="checkbox" checked={params.isolate} onChange={toggleIsolate} /> Izolacja objawowych</label>
        <span className="sim-daylabel">dzień {stats.dzien ?? 0}</span>
      </div>

      {/* SCENA = główny element */}
      <div className="sim-stage-wrap">
        <canvas ref={sceneRef} className="sim-scene" onClick={onSceneClick} aria-label="Żywa scena symulacji: małe miasto z agentami" />
        <div className="sim-legend">
          {STATE_LEGEND.map(([k, c, label]) => (
            <span key={k}><i style={{ background: c }} /> {label} ({stats[k] ?? 0})</span>
          ))}
        </div>
      </div>

      {/* Panel podrzędny: statystyki + wykres */}
      <div className="sim-secondary">
        <div className="sim-stats">
          <div><span>Szczyt zakażonych</span><strong>{stats.szczyt_I ?? 0}</strong></div>
          <div><span>Kontakty / tick</span><strong>{stats.kontakty ?? 0}</strong></div>
          <div><span>W izolacji</span><strong>{stats.izolowani ?? 0}</strong></div>
          <div><span>Zgony</span><strong>{stats.D ?? 0}</strong></div>
        </div>
        {showChart && <canvas ref={chartRef} className="sim-chart" aria-label="Wykres pomocniczy S/E/I/R/D w czasie" />}
      </div>

      {dbg && (
        <div className="sim-debug-card">
          <strong>Agent #{focusId}</strong>
          <div className="sim-debug-grid">
            {Object.entries(dbg).map(([k, v]) => <span key={k}>{k}: <b>{String(v)}</b></span>)}
          </div>
        </div>
      )}

      {/* Sterowanie parametrami — świat reaguje na żywo */}
      <div className="section-label">Parametry (świat reaguje natychmiast)</div>
      <div className="sim-controls">
        {SLIDERS.map((s) => {
          const raw = s.scale ? Math.round((params[s.key] as number) * s.scale) : (params[s.key] as number);
          return (
            <label className="sim-control" key={s.key}>
              <span>{s.label}: <b>{raw}{s.unit ? ` ${s.unit}` : ''}</b></span>
              <input type="range" min={s.min} max={s.max} step={s.step} value={raw}
                aria-label={s.label}
                onChange={(e) => onSlider(s.key, Number(e.target.value), s.scale)} />
            </label>
          );
        })}
      </div>

      <p className="footer-note">
        Test akceptacyjny: ustaw R₀ = 1.5, obserwuj świat; potem R₀ = 3.0 — epidemia rozlewa się wyraźnie szybciej, ZANIM spojrzysz na wykres.
        Silnik: core/simulation/epidemicCity.ts · zegar: core/simulationClock · renderer: core/simulationRenderer.
      </p>
    </main>
  );
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
