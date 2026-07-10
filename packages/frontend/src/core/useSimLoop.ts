import { useEffect, useRef } from 'react';
import type { Sim, SimParams } from './types';

/**
 * Pętla symulacji na <canvas>: obsługa DPR, resize, rAF, pauza, wskaźnik.
 * Symulacja dostaje współrzędne w pikselach CSS.
 */
export function useSimLoop(
  sim: Sim | null,
  params: SimParams,
  running: boolean,
  onStats?: (stats: Record<string, number>) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  const runningRef = useRef(running);
  paramsRef.current = params;
  runningRef.current = running;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.init(w, h);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      const p = toLocal(e);
      sim.pointer?.(p.x, p.y, 'down');
    };
    const move = (e: PointerEvent) => {
      const p = toLocal(e);
      sim.pointer?.(p.x, p.y, 'move');
    };
    const up = (e: PointerEvent) => {
      const p = toLocal(e);
      sim.pointer?.(p.x, p.y, 'up');
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);

    let raf = 0;
    let last = performance.now();
    let statsAt = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (runningRef.current) sim.update(dt, paramsRef.current);
      sim.render(ctx, w, h);
      if (onStats && sim.getStats && now - statsAt > 250) {
        statsAt = now;
        onStats(sim.getStats());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // Oszczędzanie baterii: pełna pauza pętli, gdy aplikacja jest w tle.
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      sim.dispose?.();
    };
  }, [sim, onStats]);

  return canvasRef;
}

/** Notacja naukowa przyjazna dla ekranu telefonu, np. 3,2×10⁸. */
export function sci(v: number, digits = 1): string {
  if (v === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  if (exp >= -2 && exp <= 3) {
    return v.toLocaleString('pl-PL', { maximumFractionDigits: Math.max(0, digits - Math.min(exp, digits)) });
  }
  const mant = v / 10 ** exp;
  const sup = String(exp).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d]);
  return `${mant.toLocaleString('pl-PL', { maximumFractionDigits: digits })}×10${sup}`;
}
