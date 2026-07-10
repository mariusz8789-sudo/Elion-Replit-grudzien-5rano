import { useEffect, useRef, useState } from 'react';
import { sci } from '../core/useSimLoop';
import { SCALE_MILESTONES as MILESTONES, SCALE_LOG_MIN as LOG_MIN, SCALE_LOG_MAX as LOG_MAX } from '../data/scaleMilestones';

/**
 * Scale Journey — sygnaturowy moment Genesis OS: płynna podróż przez
 * 45 rzędów wielkości, od kwarku (10⁻¹⁸ m) do obserwowalnego Wszechświata
 * (8,8×10²⁶ m). Rozmiary obiektów są rzeczywiste; grafika jest symboliczna.
 * Kamienie milowe: data/scaleMilestones.ts (współdzielone z DiscoveryTimeline).
 */

export function ScaleJourney() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [logScale, setLogScale] = useState(0.407); // start: skala człowieka (~10⁰ m)
  const [touring, setTouring] = useState(false);
  const target = useRef(0.407);
  const current = useRef(0.407);
  const tourDir = useRef(1);
  target.current = logScale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let stars: { x: number; y: number; a: number }[] = [];

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: 90 }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        a: 0.15 + Math.random() * 0.5,
      }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const loop = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      // Płynne dążenie do celu (natychmiast przy reduced motion)
      current.current += (target.current - current.current) * (reduced ? 1 : 0.07);
      const scaleM = 10 ** (LOG_MIN + current.current * (LOG_MAX - LOG_MIN));

      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        ctx.fillStyle = `rgba(200,215,255,${s.a})`;
        ctx.fillRect(s.x, s.y, 1.3, 1.3);
      }

      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.36;

      // Każdy kamień milowy: promień = (rozmiar / bieżąca skala) × base
      for (const m of MILESTONES) {
        const r = (m.size / scaleM) * base;
        if (r < 0.4 || r > Math.max(w, h) * 3) continue;
        const alpha = Math.max(0, Math.min(0.85, 1.1 - Math.abs(Math.log10(r / base)) * 0.55));
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = r < base * 0.9 ? 1.5 : 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        if (alpha > 0.3 && r > 14) {
          ctx.fillStyle = m.color;
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(m.name, cx, cy - r - 6);
        }
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // Tryb podróży: automatyczny przelot przez skale
  useEffect(() => {
    if (!touring) return;
    const id = setInterval(() => {
      setLogScale((v) => {
        let nv = v + 0.0016 * tourDir.current;
        if (nv >= 1) { nv = 1; tourDir.current = -1; }
        if (nv <= 0) { nv = 0; tourDir.current = 1; }
        return nv;
      });
    }, 16);
    return () => clearInterval(id);
  }, [touring]);

  const scaleM = 10 ** (LOG_MIN + logScale * (LOG_MAX - LOG_MIN));
  const nearest = MILESTONES.reduce((a, b) =>
    Math.abs(Math.log10(b.size / scaleM)) < Math.abs(Math.log10(a.size / scaleM)) ? b : a,
  );

  return (
    <div className="hero-canvas-wrap">
      <canvas ref={canvasRef} aria-label="Podróż przez skale Wszechświata" />
      <div className="hero-overlay">
        <span className="brand">Genesis OS</span>
        <h2>Od kwarku do Wszechświata</h2>
      </div>
      <div className="scale-readout">
        <div className="obj" style={{ color: nearest.color }}>{nearest.name}</div>
        <div className="val">{sci(scaleM, 1)} m · {nearest.note}</div>
      </div>
      <div className="sim-actions">
        <button className="chip-btn" onClick={() => setTouring((t) => !t)} aria-pressed={touring}>
          {touring ? '❚❚ Zatrzymaj podróż' : '▶ Podróż przez skale'}
        </button>
      </div>
      <div className="scale-slider">
        <input
          type="range"
          min={0}
          max={1}
          step={0.0005}
          value={logScale}
          aria-label="Skala: od kwarku do Wszechświata"
          onChange={(e) => {
            setTouring(false);
            setLogScale(Number(e.target.value));
          }}
        />
      </div>
    </div>
  );
}
