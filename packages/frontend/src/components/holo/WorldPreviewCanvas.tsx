import { useEffect, useRef } from 'react';
import type React from 'react';
import { drawPreview, type PreviewKind } from './worldPreviews';

/**
 * WORLD PREVIEW CANVAS — the live procedural preview on a Worlds hub card.
 * A cheap 2D canvas (≈30 fps, dpr ≤ 1.5) that draws `worldPreviews.ts`;
 * it pauses when the card leaves the viewport (IntersectionObserver), while
 * the tab is hidden, and under `prefers-reduced-motion` (one static frame).
 *
 * Decorative by contract: `aria-hidden`, and the card already carries the
 * REAL / WIZUALIZACJA badges that say what a scene is. Renders an empty canvas
 * where there is no DOM (static markup / jsdom without canvas) and never
 * throws — the hub must work without it.
 */

const MAX_DPR = 1.5;
const FRAME_MS = 1000 / 30;

export function WorldPreviewCanvas({ kind, className = '' }: { readonly kind: PreviewKind; readonly className?: string }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    let c2d: CanvasRenderingContext2D | null;
    try { c2d = canvas.getContext('2d'); } catch { c2d = null; }
    if (!c2d) return;

    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, dpr = 1;
    const resize = (): void => {
      const host = canvas.parentElement ?? canvas;
      w = Math.max(1, host.clientWidth || canvas.clientWidth || 320);
      h = Math.max(1, host.clientHeight || canvas.clientHeight || 160);
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    let last = 0;
    let raf = 0;
    let visible = true;
    let running = false;

    const frame = (now: number): void => {
      try {
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPreview(kind, c2d, w, h, (now - t0) / 1000);
      } catch { /* a broken context must never break the card */ }
    };
    const loop = (now: number): void => {
      if (!running) return;
      if (now - last >= FRAME_MS) { last = now; frame(now); }
      raf = window.requestAnimationFrame(loop);
    };
    const play = (): void => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      raf = window.requestAnimationFrame(loop);
    };
    const pause = (): void => {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };

    resize();
    frame(t0 + 0.5);
    play();

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) play(); else pause();
      }, { threshold: 0.05 });
      io.observe(canvas);
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => { resize(); frame(performance.now()); });
      ro.observe(canvas.parentElement ?? canvas);
    }
    const onVis = (): void => { if (document.hidden) pause(); else play(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      pause();
      io?.disconnect();
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [kind]);

  return <canvas ref={canvasRef} className={`world-preview-canvas ${className}`.trim()} aria-hidden="true" data-preview={kind} />;
}

export default WorldPreviewCanvas;
