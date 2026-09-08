import { useEffect, useRef, useState } from 'react';
import type { SimParams } from '../types';
import type { PostProcessor, Sim3D } from './types';
import { detectRenderTier, tierDpr } from './quality';
import { getSettings } from '../settings';
import { estimateSceneTextureMemory } from './graphics/diagnostics';
import { lerp, orbitFollowDesiredPosition } from './orbitFollow';

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
 *
 * Moduły postprocessingu (EffectComposer/RenderPass/UnrealBloomPass/
 * OutputPass) są ładowane RAZEM z `three` dla KAŻDEJ sceny 3D (nie tylko
 * tych, które go używają) — świadomy kompromis: jeden wspólny cykl
 * ładowania jest prostszy niż per-Sim dynamiczny import, a moduły są małe
 * względem samego `three`. Faktycznie używa ich tylko Sim3D, który
 * implementuje `setupPostProcessing`.
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
    let post: PostProcessor | undefined;

    setLoading(true);
    setFailed(false);

    Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/ShaderPass.js'),
      import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
      import('three/examples/jsm/postprocessing/GTAOPass.js'),
      import('three/examples/jsm/postprocessing/BokehPass.js'),
      import('three/examples/jsm/postprocessing/SSRPass.js'),
    ])
      .then(([THREE, { OrbitControls }, { EffectComposer }, { RenderPass }, { ShaderPass }, { UnrealBloomPass }, { OutputPass }, { GTAOPass }, { BokehPass }, { SSRPass }]) => {
        if (disposed) return;
        setLoading(false);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        // EffectComposer wykonuje kilka passów; reset raz na pełną klatkę zachowuje uczciwe calls/triangles całego renderu.
        renderer.info.autoReset = false;
        renderer.setClearColor(0x02030a, 1);

        const orbitControls = new OrbitControls(camera, canvas);
        controls = orbitControls;
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.08;

        // Kinowy auto-obrót wokół celu, dopóki użytkownik nie zacznie
        // przeciągać — wbudowana funkcja OrbitControls, więc nie "walczy"
        // z jej własną obsługą gestów (patrz Sim3D.cameraAutoRotateSpeed).
        const tier = detectRenderTier();
        let idleResume: ReturnType<typeof setTimeout> | undefined;
        if (sim.cameraAutoRotateSpeed && !getSettings().reducedMotion) {
          orbitControls.autoRotate = true;
          orbitControls.autoRotateSpeed = sim.cameraAutoRotateSpeed;
          orbitControls.addEventListener('start', () => {
            orbitControls.autoRotate = false;
            if (idleResume) clearTimeout(idleResume);
          });
          orbitControls.addEventListener('end', () => {
            idleResume = setTimeout(() => {
              orbitControls.autoRotate = true;
            }, 2500);
          });
        }

        let w = 0;
        let h = 0;
        const fit = () => {
          const rect = canvas.getBoundingClientRect();
          const dpr = tierDpr(tier);
          w = rect.width;
          h = rect.height;
          if (w === 0 || h === 0) return;
          renderer!.setPixelRatio(dpr);
          renderer!.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          post?.setSize(w, h);
          sim.onResize?.(w, h);
        };

        sim.init(THREE, scene, camera, canvas.clientWidth || 300, canvas.clientHeight || 300);
        post = sim.setupPostProcessing?.(
          { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, GTAOPass, BokehPass, SSRPass },
          renderer,
          scene,
          camera,
          canvas.clientWidth || 300,
          canvas.clientHeight || 300,
        );
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
        // GRAPHICS V3 — `estimateSceneTextureMemory` walks the whole scene graph, so it is sampled
        // on an interval (same convention as `onStats` above) rather than every frame; the cached
        // value fills `textureBytesEstimate` on every OTHER frame's metrics.
        let textureMemAt = 0;
        let cachedTextureBytes = 0;
        const loop = (now: number) => {
          const dt = Math.min((now - last) / 1000, 0.05);
          last = now;
          if (runningRef.current) sim.update(dt, paramsRef.current);
          sim.syncScene(scene, camera);
          if (sim.getOrbitTarget) {
            const target = sim.getOrbitTarget();
            if (target) {
              const focusDistance = sim.getOrbitFocusDistance?.();
              if (focusDistance && focusDistance > 0) {
                const offset = camera.position.clone().sub(orbitControls.target);
                if (offset.lengthSq() > 1e-5) {
                  const desired = target.clone().add(offset.normalize().multiplyScalar(focusDistance));
                  camera.position.lerp(desired, 0.09);
                }
                orbitControls.target.lerp(target, 0.14);
              } else orbitControls.target.copy(target);
            }
          }
          if (!sim.disableOrbitControls) controls?.update();
          // OrbitControls aktualizuje pozycję w swojej pętli; finalny focus jest nakładany
          // po update, aby wybrany obiekt rzeczywiście otrzymał drugi poziom kamery.
          //
          // C2 FULL VISUAL TAKEOVER — this used to be a HARD `camera.position.copy(...)` snap, run
          // unconditionally every frame. Since `getOrbitTarget`/`getOrbitFocusDistance` stay populated
          // for the entire lifetime of any scene that ever sets them (not just the frame a NEW target
          // is chosen), that snap fired on literally every frame from the moment a target existed —
          // discarding the lerp the block above computes and reaching the final framing in ~1-2
          // frames (imperceptible, ~16-33ms) regardless of how far away the camera started. Every
          // documented "establish -> push in over a couple seconds" / "smooth follow" cinematic beat
          // in this engine (genesisScientificCitySim.ts's SPRINT C-3/D, moleculeScene3D.ts's atom
          // follow, epidemicCity3D.ts's/highFidelitySlice3D.ts's observation focus) rode on this exact
          // path, so all of them were cutting instantly instead of moving smoothly — a real, shared,
          // cross-scene bug, not a per-scene one. Lerping here (same 0.09 factor as the block above,
          // for one consistent easing feel) keeps this block's actual job — a GUARANTEED fixed
          // viewing angle/distance, not preserving whatever direction the user last orbited to, which
          // is what makes this block different from the one above — while finally making the approach
          // gradual.
          if (sim.getOrbitTarget) {
            const target = sim.getOrbitTarget();
            const focusDistance = sim.getOrbitFocusDistance?.();
            if (target && focusDistance && focusDistance > 0) {
              const desired = orbitFollowDesiredPosition(target, sim.getOrbitCameraDirection?.() ?? undefined, focusDistance);
              camera.position.set(
                lerp(camera.position.x, desired.x, 0.09),
                lerp(camera.position.y, desired.y, 0.09),
                lerp(camera.position.z, desired.z, 0.09),
              );
              camera.lookAt(target);
            }
          }
          const renderStartedAt = performance.now();
          renderer!.info.reset();
          if (post) post.render();
          else renderer!.render(scene, camera);
          const renderMs = performance.now() - renderStartedAt;
          if (now - textureMemAt > 1000) {
            textureMemAt = now;
            cachedTextureBytes = estimateSceneTextureMemory(scene).totalBytes;
          }
          sim.onRenderMetrics?.({
            fps: 1 / Math.max(0.001, dt),
            frameMs: dt * 1000,
            renderMs,
            drawCalls: renderer!.info.render.calls,
            triangles: renderer!.info.render.triangles,
            geometries: renderer!.info.memory.geometries,
            textures: renderer!.info.memory.textures,
            textureBytesEstimate: cachedTextureBytes,
          });
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
      post?.dispose?.();
      controls?.dispose();
      renderer?.dispose();
    };
  }, [sim, onStats]);

  return { canvasRef, loading, failed };
}
