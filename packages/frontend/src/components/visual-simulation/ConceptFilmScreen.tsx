import { useEffect, useMemo, useRef, useState } from 'react';
import { EpidemicCitySimulation } from '../../core/simulation/epidemicCity';
import { renderCity } from '../../core/simulationRenderer/cityRenderer';
import { computeTransform, type Camera } from '../../core/simulationRenderer/camera';
import { computeField, type AnalysisMode } from '../../core/simulation/analysis';

/**
 * CONCEPT FILM — „TARGET VISUALIZATION FOR GENESIS OS 2030".
 *
 * To NIE nagrany klip i NIE deklaracja gotowej funkcji: to REŻYSER, który
 * uruchamia PRAWDZIWY silnik (EpidemicCitySimulation) i przeprowadza kamerę
 * przez sekwencję scen. Każde zdarzenie na ekranie (kontakt, transmisja,
 * izolacja, hospitalizacja, reakcja na interwencję) wynika ze STANU MODELU —
 * zgodnie z zasadą „wizualizujemy proces symulacji, nie gotowy wynik".
 * Plansza końcowa jawnie oznacza film jako KONCEPT.
 */

interface Shot {
  t: number;                 // czas startu [s]
  caption: string;
  target: (sim: EpidemicCitySimulation) => { cx: number; cy: number; zoom: number };
  dayRate: number;           // dni symulacji / s
  apply?: (sim: EpidemicCitySimulation) => void;
  analysis?: AnalysisMode;
  followId?: number;
  finale?: boolean;
}

const buildingCenter = (sim: EpidemicCitySimulation, kind: string) => {
  const b = sim.objects().find((o) => o.kind === kind);
  return b ? { cx: b.x + b.w / 2, cy: b.y + b.h / 2 } : { cx: sim.worldWidth / 2, cy: sim.worldHeight / 2 };
};
const whole = (sim: EpidemicCitySimulation) => ({ cx: sim.worldWidth / 2, cy: sim.worldHeight / 2, zoom: 1 });

const SHOTS: Shot[] = [
  { t: 0, caption: 'GENESIS OS — żywa symulacja naukowa. Nie kropki: agenci to animowani ludzie.', target: whole, dayRate: 2 },
  { t: 9, caption: 'Każdy agent to obiekt symulacji: pozycja, cel, zachowanie, stan, historia.', dayRate: 2, target: (s) => ({ ...buildingCenter(s, 'shop'), zoom: 3.4 }) },
  { t: 18, caption: 'Model epidemiczny: index case → KONTAKT → TRANSMISJA. Każde zdarzenie z zachowania agentów.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'park'), zoom: 2.6 }), apply: (s) => { s.setParam('r0', 3.6); } },
  { t: 30, caption: 'Stany: zdrowy · narażony · zakażony · odporny · izolacja · szpital.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'hospital'), zoom: 2.4 }) },
  { t: 40, caption: 'Interwencja 70%: świat reaguje — zamknięta szkoła, mniejsza mobilność, mniej kontaktów.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'school'), zoom: 2.6 }), apply: (s) => { s.setParam('restrictions', 0.7); s.setParam('isolate', true); } },
  { t: 52, caption: 'Follow agent — kamera podąża za konkretną osobą; panel pokazuje jej dane.', dayRate: 3, followId: 0, target: (s) => ({ ...whole(s), zoom: 3.6 }) },
  { t: 60, caption: 'Analiza: ciśnienie transmisji jako heatmapa — wprost ze stanu modelu.', dayRate: 4, analysis: 'risk', target: (s) => ({ ...whole(s), zoom: 1.15 }) },
  { t: 69, caption: '', dayRate: 1, target: (s) => ({ ...whole(s), zoom: 0.9 }), analysis: 'none', finale: true },
];
const TOTAL = 80;

// Oryginalna adaptacja języka filmu: pytanie → model → obserwacja → Evidence.
// To nadal ten sam żywy silnik epidemiczny, nie gotowy klip ani kopia materiału.
const PHILOSOPHER_SHOTS: Shot[] = [
  { t: 0, caption: 'PYTANIE: Czy wynik świata wynika z modelu, danych i założeń?', target: whole, dayRate: 2 },
  { t: 9, caption: 'MODEL: agenci, kontakty i transmisja — stan zmienia się w czasie rzeczywistym.', dayRate: 2, target: (s) => ({ ...buildingCenter(s, 'shop'), zoom: 3.4 }) },
  { t: 18, caption: 'RÓWNANIE: parametr R₀ steruje oczekiwaną liczbą wtórnych transmisji.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'park'), zoom: 2.6 }), apply: (s) => { s.setParam('r0', 3.6); } },
  { t: 30, caption: 'OBSERWACJA MODELU: zdrowy · narażony · zakażony · odporny · izolacja · szpital.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'hospital'), zoom: 2.4 }) },
  { t: 40, caption: 'INTERWENCJA: zmień założenie i obserwuj, jak zmienia się trajektoria.', dayRate: 6, target: (s) => ({ ...buildingCenter(s, 'school'), zoom: 2.6 }), apply: (s) => { s.setParam('restrictions', 0.7); s.setParam('isolate', true); } },
  { t: 52, caption: 'PYTANIE NASTĘPNE: który agent i które zdarzenie zmieniły wynik?', dayRate: 3, followId: 0, target: (s) => ({ ...whole(s), zoom: 3.6 }) },
  { t: 60, caption: 'EVIDENCE: heatmapa wynika ze stanu symulacji, nie z wcześniej nagranego obrazu.', dayRate: 4, analysis: 'risk', target: (s) => ({ ...whole(s), zoom: 1.15 }) },
  { t: 69, caption: 'WYNIK: model, założenia, ograniczenia i kolejny eksperyment.', dayRate: 1, target: (s) => ({ ...whole(s), zoom: 0.9 }), analysis: 'none', finale: true },
];

export function ConceptFilmScreen() {
  const philosopherMode = typeof window !== 'undefined' && window.location.hash.includes('mode=philosopher');
  const activeShots = philosopherMode ? PHILOSOPHER_SHOTS : SHOTS;
  const sim = useMemo(() => new EpidemicCitySimulation({ nAgents: 340, initialInfected: 3, r0: 2.4, severeRate: 0.22, restrictions: 0, isolate: false }), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cam = useRef<Camera>({ zoom: 1, cx: sim.worldWidth / 2, cy: sim.worldHeight / 2 });
  const [caption, setCaption] = useState(activeShots[0].caption);
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(true);
  const runRef = useRef(running); runRef.current = running;
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    sim.reset(); sim.setParam('r0', 2.4); sim.setParam('restrictions', 0); sim.setParam('isolate', false);
    cam.current = { zoom: 1, cx: sim.worldWidth / 2, cy: sim.worldHeight / 2 };
    let raf = 0; let last = performance.now(); let time = 0; let shotIdx = -1;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (runRef.current && time < TOTAL) time += dt;
      // Aktywna scena.
        let i = 0; for (let k = 0; k < activeShots.length; k++) if (time >= activeShots[k].t) i = k;
      const shot = activeShots[i];
      if (i !== shotIdx) { shotIdx = i; shot.apply?.(sim); setCaption(shot.caption); }

      // Symulacja pędzi tempem sceny.
      if (runRef.current) { let rem = dt * shot.dayRate; const step = 0.05; while (rem > 1e-6) { const h = Math.min(step, rem); sim.tick(h); rem -= h; } }

      // Kamera: cel sceny (follow → pozycja agenta), płynne dojście.
      let target = shot.target(sim);
      if (shot.followId !== undefined) { const a = sim.agents().find((x) => x.id === shot.followId); if (a) target = { cx: a.x, cy: a.y, zoom: target.zoom }; }
      const k = Math.min(1, dt * 2.2);
      cam.current.cx += (target.cx - cam.current.cx) * k;
      cam.current.cy += (target.cy - cam.current.cy) * k;
      cam.current.zoom += (target.zoom - cam.current.zoom) * k;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const cssW = canvas.clientWidth || 960, cssH = canvas.clientHeight || 600;
          if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) { canvas.width = cssW * dpr; canvas.height = cssH * dpr; }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const transform = computeTransform(cam.current, sim.worldWidth, sim.worldHeight, cssW, cssH);
          const analysis = shot.analysis && shot.analysis !== 'none' ? computeField(sim.agents(), sim.worldWidth, sim.worldHeight, shot.analysis) : null;
          renderCity(ctx, sim, cssW, cssH, { transform, focusId: shot.followId ?? -1, debug: shot.followId !== undefined, contactRadius: Number(sim.getParams().contactRadius), analysis });
          drawOverlay(ctx, cssW, cssH, time, shot, sim);
        }
      }
      setT(time);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sim, replayKey, activeShots]);

  return (
    <main id="main-content" tabIndex={-1} className="home concept-film">
      <div className="concept-stage">
          <canvas ref={canvasRef} className="concept-canvas" aria-label={philosopherMode ? 'Genesis — Simulation Question, żywa symulacja' : 'Genesis OS — film koncepcyjny (żywa symulacja)'} />
      </div>
      <div className="concept-bar">
        <button className="chip-btn" onClick={() => setRunning((r) => !r)}>{running ? '⏸ Pauza' : '▶ Odtwórz'}</button>
        <button className="chip-btn" onClick={() => { setReplayKey((k) => k + 1); setRunning(true); }}>↺ Od początku</button>
        <div className="concept-progress"><div className="concept-progress-fill" style={{ width: `${Math.min(100, (t / TOTAL) * 100)}%` }} /></div>
        <span className="concept-time">{Math.floor(t)}s / {TOTAL}s</span>
      </div>
      <p className="footer-note">{caption || (philosopherMode ? 'SCENARIO — SIMULATION QUESTION' : 'CONCEPT — TARGET VISUALIZATION FOR GENESIS OS 2030')}</p>
    </main>
  );
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, shot: Shot, sim: EpidemicCitySimulation): void {
  // Watermark + dzień.
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(235,240,250,0.55)';
  ctx.fillText('CONCEPT · Genesis OS 2030', 12, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`DZIEŃ ${sim.stats().dzien}`, w - 12, 20);
  ctx.textAlign = 'left';

  // Napis sceny (dół), z delikatnym tłem.
  if (shot.caption) {
    ctx.font = '600 15px system-ui, sans-serif';
    const pad = 10; const tw = ctx.measureText(shot.caption).width;
    const bx = (w - tw) / 2 - pad, by = h - 46;
    ctx.fillStyle = 'rgba(6,10,18,0.6)'; ctx.fillRect(bx, by, tw + pad * 2, 30);
    ctx.fillStyle = '#eef2fb'; ctx.textAlign = 'center';
    ctx.fillText(shot.caption, w / 2, by + 20); ctx.textAlign = 'left';
  }

  // Finał: przyciemnienie + plansze tytułowe.
  if (shot.finale) {
    const f = Math.min(1, (time - shot.t) / 3);
    ctx.fillStyle = `rgba(3,6,12,${0.15 + f * 0.8})`; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    const local = time - shot.t;
    if (f > 0.4) {
      ctx.fillStyle = '#eaf1ff'; ctx.font = '700 40px system-ui, sans-serif';
      ctx.fillText('GENESIS OS', w / 2, h * 0.38);
    }
    if (local > 2.5) {
      ctx.fillStyle = 'rgba(120,200,255,0.9)'; ctx.font = '600 16px ui-monospace, monospace';
      ctx.fillText('SCIENCE · SIMULATION · AI · COLLABORATION · DISCOVERY', w / 2, h * 0.48);
    }
    if (local > 5) {
      ctx.fillStyle = '#cfe0ff'; ctx.font = '500 20px system-ui, sans-serif';
      ctx.fillText('One scientific world. Millions of experiments.', w / 2, h * 0.58);
    }
    if (local > 7.5) {
      ctx.fillStyle = 'rgba(232,179,74,0.95)'; ctx.font = '600 13px ui-monospace, monospace';
      ctx.fillText('CONCEPT — TARGET VISUALIZATION FOR GENESIS OS 2030', w / 2, h * 0.68);
    }
    ctx.textAlign = 'left';
  }
}
