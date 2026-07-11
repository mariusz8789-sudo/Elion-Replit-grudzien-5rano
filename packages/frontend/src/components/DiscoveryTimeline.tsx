import { useEffect, useRef, useState } from 'react';
import { TIMELINE_EPOCHS, type TimelineEpoch } from '../data/timeline';
import { SCALE_MILESTONES, SCALE_LOG_MIN, SCALE_LOG_MAX } from '../data/scaleMilestones';
import { logSliderValue, logSliderPosition } from '../core/logSlider';
import { epochBlend } from '../core/timelineMath';
import { renderEpochScene } from './discoveryTimelineScenes';
import { CONFIRMATION_LABELS } from '../core/citation';
import { setPendingScenario } from '../core/scenarioBridge';
import { sci } from '../core/useSimLoop';
import { NarratorPanel } from './NarratorPanel';
import { getLab } from '../core/registry';
import { track } from '../core/analytics';
import { playTimelineTransition } from '../core/sound';

/**
 * Discovery Timeline Engine — flagowe doświadczenie Genesis OS: jedna,
 * ciągła podróż przez 15 epok od Wielkiego Wybuchu do dalekiej przyszłości
 * (data/timeline.ts), bez ekranów ładowania (core/timelineMath.ts::epochBlend
 * renderuje zawsze MIX dwóch sąsiednich scen). Druga, niezależna oś:
 * soczewka skali przestrzennej (kwark → obserwowalny Wszechświat), dokładnie
 * ta sama technika co ScaleJourney.tsx (data/scaleMilestones.ts,
 * współdzielone), tylko jako nakładka, nie osobny ekran.
 */

const TIME_LOG_MIN = Math.log10(TIMELINE_EPOCHS[0].ageSeconds) - 0.3;
const TIME_LOG_MAX = Math.log10(TIMELINE_EPOCHS[TIMELINE_EPOCHS.length - 1].ageSeconds) + 0.3;

const SPEED_PRESETS = [-1000, -10, 10, 1000] as const;

function formatAge(ageSeconds: number): string {
  const years = ageSeconds / 31_557_600;
  if (years >= 1e6) return `${sci(years, 1)} lat po Wielkim Wybuchu`;
  if (years >= 1) return `${years.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} lat po Wielkim Wybuchu`;
  return `${sci(ageSeconds, 1)} s po Wielkim Wybuchu`;
}

export function DiscoveryTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstEpochPos = 0;
  const [logT, setLogT] = useState(() => logSliderPosition(TIMELINE_EPOCHS[12].ageSeconds, TIME_LOG_MIN, TIME_LOG_MAX)); // start: "Teraz"
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [zoomLogT, setZoomLogT] = useState(() => logSliderPosition(TIMELINE_EPOCHS[12].scaleMeters, SCALE_LOG_MIN, SCALE_LOG_MAX));
  const [displayEpoch, setDisplayEpoch] = useState<TimelineEpoch>(TIMELINE_EPOCHS[12]);

  const currentLogT = useRef(logT);
  const currentZoom = useRef(zoomLogT);
  const logTRef = useRef(logT);
  const zoomRef = useRef(zoomLogT);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  logTRef.current = logT;
  zoomRef.current = zoomLogT;
  playingRef.current = playing;
  speedRef.current = speed;

  useEffect(() => {
    track('experiment_open', { lab: 'discovery-timeline', experiment: '__base' });
  }, []);

  // Autoodtwarzanie: przesuwa CEL (logT), nie bieżącą pozycję renderowania —
  // ta sama separacja target/current co ScaleJourney, tylko cel porusza się
  // sam, zamiast czekać na przeciągnięcie suwaka.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setLogT((v) => {
        const range = TIME_LOG_MAX - TIME_LOG_MIN;
        const step = (speedRef.current / range) * 0.00028;
        const nv = v + step;
        if (nv >= 1) {
          setPlaying(false);
          return 1;
        }
        if (nv <= firstEpochPos) {
          setPlaying(false);
          return 0;
        }
        return nv;
      });
    }, 16);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let clock = 0;
    let last = performance.now();

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastEpochId = '';

    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      currentLogT.current += (logTRef.current - currentLogT.current) * (reduced ? 1 : 0.09);
      currentZoom.current += (zoomRef.current - currentZoom.current) * (reduced ? 1 : 0.09);

      const ageSeconds = logSliderValue(currentLogT.current, TIME_LOG_MIN, TIME_LOG_MAX);
      const blend = epochBlend(ageSeconds, TIMELINE_EPOCHS);

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, w, h);

      ctx.globalAlpha = 1 - blend.mix;
      renderEpochScene(blend.prev.id, ctx, w, h, clock);
      if (blend.next.id !== blend.prev.id) {
        ctx.globalAlpha = blend.mix;
        renderEpochScene(blend.next.id, ctx, w, h, clock);
      }
      ctx.globalAlpha = 1;

      // Soczewka skali: dokładnie ta sama technika co ScaleJourney —
      // promień pierścienia = (rozmiar_obiektu / bieżąca_skala) × baza.
      const scaleM = logSliderValue(currentZoom.current, SCALE_LOG_MIN, SCALE_LOG_MAX);
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.36;
      for (const m of SCALE_MILESTONES) {
        const r = (m.size / scaleM) * base;
        if (r < 0.4 || r > Math.max(w, h) * 3) continue;
        const alpha = Math.max(0, Math.min(0.55, 0.75 - Math.abs(Math.log10(r / base)) * 0.45));
        if (alpha <= 0) continue;
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (alpha > 0.32 && r > 16) {
          ctx.fillStyle = m.color;
          ctx.font = '9px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(m.name, cx, cy - r - 4);
        }
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';

      const nearest = blend.mix < 0.5 ? blend.prev : blend.next;
      if (nearest.id !== lastEpochId) {
        // Bez dźwięku przy pierwszym renderze (lastEpochId==='') — to nie
        // jest "przejście", tylko epoka startowa.
        if (lastEpochId !== '') playTimelineTransition();
        lastEpochId = nearest.id;
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

  const ageSeconds = logSliderValue(logT, TIME_LOG_MIN, TIME_LOG_MAX);

  return (
    <main className="timeline-view" id="main-content" tabIndex={-1}>
      <div className="hero-canvas-wrap timeline-canvas-wrap">
        <canvas ref={canvasRef} aria-label="Discovery Timeline: podróż przez historię Wszechświata" />
        <div className="hero-overlay">
          <span className="brand">Discovery Timeline</span>
          <h2>{displayEpoch.name}</h2>
        </div>
        <div className="timeline-readout">
          <div className="obj" style={{ color: displayEpoch.color }}>{displayEpoch.name}</div>
          <div className="val">{formatAge(ageSeconds)}</div>
        </div>
      </div>

      <div className="timeline-controls">
        <div className="timeline-transport" role="group" aria-label="Sterowanie czasem">
          {SPEED_PRESETS.map((s) => (
            <button
              key={s}
              className="chip-btn"
              aria-pressed={playing && speed === s}
              onClick={() => {
                setSpeed(s);
                setPlaying(true);
                track('shortcut_used');
              }}
            >
              {s < 0 ? '◀' : '▶'} {Math.abs(s)}×
            </button>
          ))}
          <button className="chip-btn" aria-pressed={!playing} onClick={() => setPlaying(false)}>
            ❚❚ Pauza
          </button>
        </div>

        <div className="timeline-scrubber">
          <input
            type="range"
            min={0}
            max={1}
            step={0.0004}
            value={logT}
            aria-label="Oś czasu: od Wielkiego Wybuchu do dalekiej przyszłości"
            onChange={(e) => {
              setPlaying(false);
              setLogT(Number(e.target.value));
            }}
          />
        </div>

        <div className="timeline-epochs" role="group" aria-label="Skocz do epoki">
          {TIMELINE_EPOCHS.map((e) => (
            <button
              key={e.id}
              className="timeline-epoch-chip"
              style={{ ['--accent' as string]: e.color }}
              aria-pressed={displayEpoch.id === e.id}
              onClick={() => {
                setPlaying(false);
                const pos = logSliderPosition(e.ageSeconds, TIME_LOG_MIN, TIME_LOG_MAX);
                setLogT(Math.min(1, Math.max(0, pos)));
                setZoomLogT(Math.min(1, Math.max(0, logSliderPosition(e.scaleMeters, SCALE_LOG_MIN, SCALE_LOG_MAX))));
                track('shortcut_used');
              }}
            >
              {e.name}
            </button>
          ))}
        </div>

        <div className="timeline-zoom">
          <label htmlFor="timeline-zoom-slider">
            Soczewka skali: od kwarku do obserwowalnego Wszechświata
          </label>
          <input
            id="timeline-zoom-slider"
            type="range"
            min={0}
            max={1}
            step={0.0008}
            value={zoomLogT}
            onChange={(e) => setZoomLogT(Number(e.target.value))}
          />
          <button
            className="chip-btn"
            onClick={() => setZoomLogT(Math.min(1, Math.max(0, logSliderPosition(displayEpoch.scaleMeters, SCALE_LOG_MIN, SCALE_LOG_MAX))))}
          >
            🔍 Wyśrodkuj na epoce
          </button>
        </div>
      </div>

      <EpochDetail epoch={displayEpoch} />
    </main>
  );
}

function EpochDetail({ epoch }: { epoch: TimelineEpoch }) {
  const lab = epoch.linkedLab ? getLab(epoch.linkedLab.labId) : undefined;
  return (
    <div className="timeline-detail">
      <div className="honesty-row">
        <span className={`honesty confirmation-${epoch.confirmation}`}>{CONFIRMATION_LABELS[epoch.confirmation]}</span>
        <span className="honesty-note">{epoch.teaser}</span>
      </div>
      {lab && (
        <button
          className="chip-btn timeline-lab-link"
          style={{ ['--accent' as string]: lab.accent }}
          onClick={() => {
            setPendingScenario(epoch.linkedLab!.labId, epoch.linkedLab!.params ?? {}, epoch.linkedLab!.experimentId);
            track('what_if_opened');
            window.location.hash = `#/lab/${epoch.linkedLab!.labId}`;
          }}
        >
          {lab.icon} Otwórz w {lab.name}
        </button>
      )}
      <NarratorPanel
        blocks={[
          {
            title: epoch.name,
            body: epoch.summary,
            citation: epoch.citation,
          },
        ]}
        askContext={{
          labId: 'discovery-timeline',
          lab: 'Discovery Timeline',
          experiment: epoch.name,
          honesty: CONFIRMATION_LABELS[epoch.confirmation],
          honestyNote: epoch.teaser,
          params: {},
          stats: {},
          narration: [{ title: epoch.name, body: epoch.summary }],
        }}
      />
    </div>
  );
}
