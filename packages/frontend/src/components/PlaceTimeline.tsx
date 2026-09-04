import { useEffect, useRef, useState } from 'react';
import { PLACE_EPOCHS, type PlaceEpoch } from '../data/placeTimeline';
import { placeProgress, renderPlaceScene } from './placeTimelineScenes';
import {
  advancePlaceScene,
  createPlaceSceneState,
  resetPlaceScene,
  seekPlaceScene,
  setPlacePlayback,
  setPlaceTimeScale,
  type PlaceSceneState,
} from '../core/reality/placeTimeState';
import { CONFIRMATION_LABELS } from '../core/citation';
import { HonestyBadge } from './HonestyBadge';
import { NarratorPanel } from './NarratorPanel';
import { track } from '../core/analytics';

const MIN_YEAR = 0;
const MAX_YEAR = 1_000_000;
const SPEED_PRESETS = [-1000, -10, 10, 1000] as const;

function formatYear(year: number): string {
  if (year === 0) return 'punkt startowy';
  if (year < 1_000) return `+${Math.round(year)} lat`;
  if (year < 1_000_000) return `+${Math.round(year / 1_000)} tys. lat`;
  return `+${(year / 1_000_000).toFixed(1)} mln lat`;
}

function yearForIndex(index: number): number {
  return PLACE_EPOCHS[index]?.year ?? MIN_YEAR;
}

export function PlaceTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sceneState, setSceneState] = useState<PlaceSceneState>(() => createPlaceSceneState());
  const [displayEpoch, setDisplayEpoch] = useState<PlaceEpoch>(PLACE_EPOCHS[0]);
  const sceneStateRef = useRef(sceneState);
  const displayEpochIdRef = useRef(displayEpoch.id);
  sceneStateRef.current = sceneState;

  useEffect(() => {
    track('experiment_open', { lab: 'place-timeline', experiment: 'observer-at-the-junction' });
  }, []);

  useEffect(() => {
    if (sceneState.playback === 'paused') return;
    const id = window.setInterval(() => {
      setSceneState((state) => advancePlaceScene(state, 32));
    }, 32);
    return () => window.clearInterval(id);
  }, [sceneState.playback]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let clock = 0;
    let last = performance.now();
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.fillStyle = '#050817';
      ctx.fillRect(0, 0, w, h);
      const currentYear = sceneStateRef.current.displayTimeYears;
      renderPlaceScene(ctx, w, h, clock, placeProgress(currentYear, PLACE_EPOCHS));
      const nearest = PLACE_EPOCHS.reduce((best, epoch) =>
        Math.abs(epoch.year - currentYear) < Math.abs(best.year - currentYear) ? epoch : best,
      PLACE_EPOCHS[0]);
      if (nearest.id !== displayEpochIdRef.current) {
        displayEpochIdRef.current = nearest.id;
        setDisplayEpoch(nearest);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const setPlayback = (playback: PlaceSceneState['playback']) => {
    setSceneState((state) => setPlacePlayback(state, playback));
  };

  const setSpeed = (timeScaleYearsPerSecond: number) => {
    setSceneState((state) => setPlacePlayback(setPlaceTimeScale(state, timeScaleYearsPerSecond), 'playing'));
  };

  return (
    <main className="timeline-view place-timeline-view" id="main-content" tabIndex={-1}>
      <div className="hero-canvas-wrap timeline-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Observer at the Junction: jedno miejsce przez epoki" />
        <div className="hero-overlay">
          <span className="brand">Observer at the Junction</span>
          <h2>{displayEpoch.name}</h2>
          <p className="scene-subtitle">Jeden punkt obserwacji · czas steruje światem</p>
        </div>
        <div className="timeline-readout">
          <div className="obj" style={{ color: displayEpoch.color }}>CZAS SCENY</div>
          <div className="val">{formatYear(sceneState.displayTimeYears)}</div>
          <div className="timeline-time-meta">{sceneState.playback === 'playing' ? 'PLAY' : 'PAUSE'} · {Math.abs(sceneState.timeScaleYearsPerSecond)} lat/s</div>
        </div>
      </div>
      <div className="timeline-controls">
        <div className="timeline-transport" role="group" aria-label="Sterowanie sceną czasu">
          {SPEED_PRESETS.map((preset) => (
            <button key={preset} className="chip-btn" aria-pressed={sceneState.playback === 'playing' && sceneState.timeScaleYearsPerSecond === preset} onClick={() => setSpeed(preset)}>
              {preset < 0 ? '◀' : '▶'} {Math.abs(preset)}×
            </button>
          ))}
          <button className="chip-btn" aria-pressed={sceneState.playback === 'paused'} onClick={() => setPlayback('paused')}>❚❚ Pauza</button>
          <button className="chip-btn" onClick={() => setSceneState((state) => resetPlaceScene(state))}>↺ Reset</button>
        </div>
        <div className="timeline-scrubber">
          <label htmlFor="place-time-slider">Oś czasu jednego miejsca: od punktu startowego do miliona lat</label>
          <input id="place-time-slider" type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={sceneState.displayTimeYears} onChange={(event) => setSceneState((state) => seekPlaceScene(state, Number(event.target.value)))} />
        </div>
        <div className="timeline-epochs" role="group" aria-label="Skocz do epoki miejsca">
          {PLACE_EPOCHS.map((epoch, index) => (
            <button key={epoch.id} className="timeline-epoch-chip" style={{ ['--accent' as string]: epoch.color }} aria-pressed={displayEpoch.id === epoch.id} onClick={() => setSceneState((state) => seekPlaceScene(state, yearForIndex(index)))}>
              {epoch.name}
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-detail">
        <div className="honesty-row">
          <span className="honesty confirmation-fiction">{CONFIRMATION_LABELS[displayEpoch.confirmation]}</span>
          <span className="honesty-note">SCENARIO/CINEMATIC — ta scena nie jest cyfrowym bliźniakiem konkretnego miejsca ani prognozą.</span>
        </div>
        <HonestyBadge level="cinematic" note="Kamera i proceduralne przemiany służą doświadczeniu narracyjnemu. Nie są pomiarem historii ani dowodem fizycznego multiwersum." />
        <NarratorPanel blocks={[{ title: displayEpoch.name, body: displayEpoch.summary }]} askContext={{ labId: 'place-timeline', lab: 'Observer at the Junction', experiment: displayEpoch.name, honesty: 'SCENARIO/CINEMATIC', honestyNote: displayEpoch.teaser, params: { year: sceneState.displayTimeYears, timeScaleYearsPerSecond: sceneState.timeScaleYearsPerSecond }, stats: {}, narration: [{ title: displayEpoch.name, body: displayEpoch.summary }] }} />
      </div>
    </main>
  );
}
