import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { isSuppressed } from './MatrixDataStream';
import { pushHoloPoint } from '../core/holoTelemetry';
import { buildMatrixStage, isMatrixRoute, type MatrixStage } from './holo/MatrixStage';

/**
 * GENESIS HOLO BACKDROP — the black cyber-space behind the whole shell.
 *
 * One fixed 100vw × 100vh WebGL canvas that every piece of UI floats over as
 * a borderless HUD. It runs the Matrix engine (`holo/MatrixStage`): a
 * procedural volumetric rain of glyphs over a black mirror floor with a
 * hairline grid, pure black distance fog, ACES tone mapping and a restrained
 * bloom that lifts only the rain heads. On `#/matrix` the stage group —
 * cyber-armoured figures on dark pedestals and the word columns — is shown;
 * everywhere else it is hidden and the camera looks down the code space.
 *
 * Budget discipline (this is atmosphere, the solvers own the CPU):
 *   - device-pixel-ratio capped (1.5 desktop, 1 phone); the rain is computed
 *     entirely on the GPU from uTime, so the CPU does no per-frame work;
 *   - the rAF loop is CANCELLED (not skipped) when the tab is hidden, when
 *     `prefers-reduced-motion` is set, or on a heavy-3D route — `isSuppressed`
 *     from MatrixDataStream is THE list, so this layer never drifts from it;
 *   - lazy-loaded by AppShell (React.lazy + Suspense).
 *
 * Determinism: no Math.random — a seeded mulberry32 places every column,
 * figure and word. Safety: the renderer is created inside try/catch; on
 * failure NOTHING is allocated and the component renders an inert hidden
 * canvas. Everything it allocates is disposed on unmount.
 */

/** Pure decision: should the loop be running right now? */
export function shouldAnimate(state: { hidden: boolean; reducedMotion: boolean; hash: string }): boolean {
  return !state.hidden && !state.reducedMotion && !isSuppressed(state.hash);
}

export interface HoloBackdropOptions {
  /** Upper bound for the device pixel ratio actually used (default 1.5). */
  maxPixelRatio?: number;
  /** Skip the post-processing composer and shrink the rain/mirror (phones). */
  lowPower?: boolean;
  /** Seed for the deterministic world layout (default GENESIS). */
  seed?: number;
}

/** Deterministic PRNG (mulberry32) — the world layout must not depend on Math.random. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ABERRATION_SHADER = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uAmount: { value: 0.0012 } },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAmount;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - 0.5) * uAmount * length(vUv - 0.5) * 4.0;
  float r = texture2D(tDiffuse, vUv + d).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - d).b;
  float a = texture2D(tDiffuse, vUv).a;
  gl_FragColor = vec4(r, g, b, a);
}
`,
};

/**
 * Builds the engine against a canvas and starts the loop. Returns the dispose
 * function, or `null` when a WebGL renderer could not be created — in which
 * case NOTHING was allocated. Split out of the React component so it can be
 * exercised without a DOM: a fake canvas with no WebGL context must yield
 * `null`, never a throw.
 */
export function mountHoloBackdrop(
  canvas: HTMLCanvasElement,
  win: Window & typeof globalThis,
  options: HoloBackdropOptions = {},
): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }

  const doc = canvas.ownerDocument;
  const lowPower = options.lowPower ?? false;
  const dpr = Math.min(options.maxPixelRatio ?? 1.5, win.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  let stage: MatrixStage;
  try {
    stage = buildMatrixStage(renderer, doc, mulberry32(options.seed ?? 0x47454e45), lowPower);
  } catch {
    renderer.dispose();
    return null;
  }

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (!lowPower) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(dpr);
    composer.addPass(new RenderPass(stage.scene, stage.camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.3, 0.85);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass(ABERRATION_SHADER));
    composer.addPass(new OutputPass());
  }

  const motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let raf = 0;
  let last = 0;
  let width = 1;
  let height = 1;
  let parallaxX = 0;
  let parallaxY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let lastSample = 0;
  const FRAME_MS = lowPower ? 1000 / 30 : 0;
  const SAMPLE_MS = 250;

  const state = (): { hidden: boolean; reducedMotion: boolean; hash: string } => ({
    hidden: doc.hidden,
    reducedMotion: motionQuery?.matches ?? false,
    hash: win.location.hash,
  });

  const layout = (): void => {
    width = Math.max(1, win.innerWidth);
    height = Math.max(1, win.innerHeight);
    stage.layout(width, height);
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    bloom?.setSize(width, height);
  };

  const frame = (now: number): void => {
    if (!shouldAnimate(state())) { raf = 0; return; }
    raf = win.requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    const dt = last === 0 ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now * 0.001;
    const onStage = isMatrixRoute(win.location.hash);
    stage.setStage(onStage);
    parallaxX += (pointerX * 0.6 - parallaxX) * 0.04;
    parallaxY += (pointerY * 0.35 - parallaxY) * 0.04;
    stage.update(t, dt, parallaxX, parallaxY);
    if (now - lastSample >= SAMPLE_MS) {
      lastSample = now;
      const c = stage.camera.position;
      pushHoloPoint({ x: c.x, y: c.y, z: c.z, temporalT: t, hyperspaceW: onStage ? 1 : 0 });
    }
    renderer.setRenderTarget(null);
    if (composer) composer.render(); else renderer.render(stage.scene, stage.camera);
  };

  const kick = (): void => {
    const allowed = shouldAnimate(state());
    canvas.style.opacity = isSuppressed(win.location.hash) ? '0' : '';
    if (allowed && raf === 0) { last = 0; raf = win.requestAnimationFrame(frame); }
  };

  const onVisibility = (): void => kick();
  const onHashChange = (): void => kick();
  const onMotionChange = (): void => kick();
  const onResize = (): void => { layout(); kick(); };
  const onPointer = (e: PointerEvent): void => {
    pointerX = (e.clientX / width - 0.5) * 2;
    pointerY = -(e.clientY / height - 0.5) * 2;
  };

  layout();
  kick();
  win.addEventListener('resize', onResize);
  win.addEventListener('hashchange', onHashChange);
  win.addEventListener('pointermove', onPointer, { passive: true });
  doc.addEventListener('visibilitychange', onVisibility);
  motionQuery?.addEventListener?.('change', onMotionChange);

  return () => {
    if (raf !== 0) win.cancelAnimationFrame(raf);
    raf = 0;
    win.removeEventListener('resize', onResize);
    win.removeEventListener('hashchange', onHashChange);
    win.removeEventListener('pointermove', onPointer);
    doc.removeEventListener('visibilitychange', onVisibility);
    motionQuery?.removeEventListener?.('change', onMotionChange);
    stage.dispose();
    composer?.dispose();
    bloom?.dispose();
    renderer.setRenderTarget(null);
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

export function GenesisHoloBackdrop(): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const phone = window.innerWidth < 720;
    const dispose = mountHoloBackdrop(canvas, window, { maxPixelRatio: phone ? 1 : 1.5, lowPower: phone });
    if (dispose === null) {
      // No WebGL here (jsdom, a blocked GPU, a very old device): render nothing.
      canvas.hidden = true;
      return;
    }
    return dispose;
  }, []);

  return <canvas ref={canvasRef} className="holo-backdrop" aria-hidden="true" data-testid="holo-backdrop" />;
}

export default GenesisHoloBackdrop;
