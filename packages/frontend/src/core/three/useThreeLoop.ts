import { useEffect, useRef, useState } from 'react';
import type { SimParams } from '../types';
import type { Sim3D } from './types';

/**
 * Pętla symulacji 3D — lustro core/useSimLoop.ts (DPR, resize, rAF, pauza w
 * tle, wskaźnik), ale renderuje przez WebGL (Three.js) zamiast Canvas 2D.
 *
 * Three.js jest importowany DYNAMICZNIE (import('three')) — Vite tworzy
 * dla niego osobny chunk, więc laboratoria bez scen 3D nie płacą ani bajta
 * za tę zależność w głównym bundlu. Chunk trafia do cache Service Workera
 * dopiero po pierwszym wejściu do sceny 3D (patrz public/sw.js: cache-first
 * dla zasobów tej samej domeny) — pierwsza wizyta w takim eksperymencie
 * wymaga więc sieci, kolejne działają offline jak reszta PWA.
 */
export function useThreeLoop(
  sim: Sim3D | null,
  params: SimParams,
  running: boolean,
  onStats?: (stats: Record<string, number>) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  const runningRef = useRef(running);
  paramsRef.current = params;
  runningRef.current = running;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sim) return;
    let disposed = false;
    let raf = 0;
    let renderer: import('three').WebGLRenderer | undefined;
    let controls: { update: () => void; dispose: () => void } | undefined;

    setLoading(true);
    setFailed(false);

    Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js')])
      .then(([THREE, { OrbitControls }]) => {
        if (disposed) return;
        setLoading(false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        renderer.setClearColor(0x02030a, 1);

        controls = new OrbitControls(camera, canvas);
        (controls as import('three/examples/jsm/controls/OrbitControls.js').OrbitControls).enableDamping = true;
        (controls as import('three/examples/jsm/controls/OrbitControls.js').OrbitControls).dampingFactor = 0.08;

        let w = 0;
        let h = 0;
        const fit = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          w = rect.width;
          h = rect.height;
          if (w === 0 || h === 0) return;
          renderer!.setPixelRatio(dpr);
          renderer!.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          sim.onResize?.(w, h);
        };

        sim.init(THREE, scene, camera, canvas.clientWidth || 300, canvas.clientHeight || 300);
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(canvas);

        const toLocal = (e: PointerEvent) => {
          const r = canvas.getBoundingClientRect();
          return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        const down = (e: PointerEvent) => { const p = toLocal(e); sim.pointer?.(p.x, p.y, 'down'); };
        const move = (e: PointerEvent) => { const p = toLocal(e); sim.pointer?.(p.x, p.y, 'move'); };
        const up = (e: PointerEvent) => { const p = toLocal(e); sim.pointer?.(p.x, p.y, 'up'); };
        canvas.addEventListener('pointerdown', down);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);

        let last = performance.now();
        let statsAt = 0;
        const loop = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          if (runningRef.current) sim.update(dt, paramsRef.current);
          sim.syncScene(scene, camera);
          controls?.update();
          renderer!.render(scene, camera);
          if (onStats && sim.getStats && now - statsAt > 250) {
            statsAt = now;
            onStats(sim.getStats());
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);

        const onVisibility = () => {
          if (document.hidden) {
            cancelAnimationFrame(raf);
          } else {
            last = performance.now();
            raf = requestAnimationFrame(loop);
          }
        };
        document.addEventListener('visibilitychange', onVisibility);

        (canvas as HTMLCanvasElement & { __disposeThree?: () => void }).__disposeThree = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          document.removeEventListener('visibilitychange', onVisibility);
          canvas.removeEventListener('pointerdown', down);
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
        };
      })
      .catch((err) => {
        console.error('Nie udało się załadować silnika 3D (Three.js):', err);
        if (!disposed) {
          setLoading(false);
          setFailed(true);
        }
      });

    return () => {
      disposed = true;
      (canvas as HTMLCanvasElement & { __disposeThree?: () => void }).__disposeThree?.();
      sim.dispose?.();
      controls?.dispose();
      renderer?.dispose();
    };
  }, [sim, onStats]);

  return { canvasRef, loading, failed };
}
