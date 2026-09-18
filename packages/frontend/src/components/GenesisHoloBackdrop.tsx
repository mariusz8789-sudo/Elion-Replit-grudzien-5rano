import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { isSuppressed } from './MatrixDataStream';

/**
 * GENESIS HOLO BACKDROP — the ambient 3D layer of the 2040 shell.
 *
 * A fixed, full-viewport, pointer-events:none WebGL canvas that sits BELOW
 * the Matrix data stream (z-index -1 vs 0) and below every piece of content:
 * a slow-rotating wireframe torus-knot inside two thin instrument rings in
 * the lower-right, a sparse additive points nebula, exponential fog and one
 * soft violet light that orbits the rings. It is atmosphere, not content, so
 * it never competes with the solvers for frame budget:
 *
 *   - device-pixel-ratio capped at 1.5 (1 on phones), ~30 fps cap;
 *   - the rAF loop is CANCELLED (not just skipped) whenever the tab is
 *     hidden, `prefers-reduced-motion` is set, or the route is one of the
 *     heavy-3D screens — `isSuppressed` from MatrixDataStream is THE list, so
 *     this layer can never drift from the one the data stream already uses;
 *   - lazy-loaded by AppShell (React.lazy + Suspense), so the initial bundle
 *     does not carry three.js for the sake of a decoration.
 *
 * It is also safe where there is no GPU or no DOM at all: the renderer is
 * created inside try/catch and on failure the component renders an inert
 * canvas and nothing else. Everything it allocates is disposed on unmount.
 */

/** Pure decision: should the loop be running right now? */
export function shouldAnimate(state: { hidden: boolean; reducedMotion: boolean; hash: string }): boolean {
  return !state.hidden && !state.reducedMotion && !isSuppressed(state.hash);
}

export interface HoloBackdropOptions {
  /** Upper bound for the device pixel ratio actually used (default 1.5). */
  maxPixelRatio?: number;
  /** Number of nebula points (default 900; halved on phones by the caller). */
  points?: number;
}

/**
 * Builds the scene against a canvas and starts the loop. Returns the dispose
 * function, or `null` when a WebGL renderer could not be created — in which
 * case NOTHING was allocated and the caller renders nothing.
 *
 * Split out of the React component so it can be exercised without a DOM: a
 * fake canvas with no WebGL context must yield `null`, never a throw.
 */
export function mountHoloBackdrop(
  canvas: HTMLCanvasElement,
  win: Window & typeof globalThis,
  options: HoloBackdropOptions = {},
): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch {
    return null;
  }

  const doc = canvas.ownerDocument;
  const maxDpr = options.maxPixelRatio ?? 1.5;
  const pointCount = options.points ?? 900;

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(maxDpr, win.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070f, 0.07);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
  camera.position.set(0, 0, 9);

  // --- instrument group: torus-knot + two thin rings, lower-right ---------
  const instrument = new THREE.Group();
  const knotGeometry = new THREE.TorusKnotGeometry(1.35, 0.36, 140, 14, 2, 3);
  const knotMaterial = new THREE.MeshBasicMaterial({
    color: 0x8ee8f5, wireframe: true, transparent: true, opacity: 0.075,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const knot = new THREE.Mesh(knotGeometry, knotMaterial);
  instrument.add(knot);

  const ringGeometry = new THREE.TorusGeometry(2.5, 0.014, 6, 180);
  const ringMaterialA = new THREE.MeshStandardMaterial({
    color: 0x8ee8f5, emissive: 0x1c5f6b, roughness: 0.25, metalness: 0.9, transparent: true, opacity: 0.45,
  });
  const ringMaterialB = new THREE.MeshStandardMaterial({
    color: 0xa78bfa, emissive: 0x3b2a7a, roughness: 0.25, metalness: 0.9, transparent: true, opacity: 0.38,
  });
  const ringA = new THREE.Mesh(ringGeometry, ringMaterialA);
  const ringB = new THREE.Mesh(ringGeometry, ringMaterialB);
  ringA.rotation.x = Math.PI / 2.6;
  ringB.rotation.x = Math.PI / 2.6; ringB.rotation.y = Math.PI / 3; ringB.scale.setScalar(1.22);
  instrument.add(ringA, ringB);
  scene.add(instrument);

  // --- nebula: sparse additive points, cyan/violet mix ---------------------
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);
  const cyan = new THREE.Color(0x8ee8f5);
  const violet = new THREE.Color(0xa78bfa);
  const mixed = new THREE.Color();
  for (let i = 0; i < pointCount; i++) {
    // Uniform-ish in a flattened sphere so the field reads as depth, not a wall.
    const r = 4 + Math.cbrt(Math.random()) * 14;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi) - 6;
    mixed.copy(cyan).lerp(violet, Math.random());
    colors[i * 3] = mixed.r; colors[i * 3 + 1] = mixed.g; colors[i * 3 + 2] = mixed.b;
  }
  const nebulaGeometry = new THREE.BufferGeometry();
  nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const nebulaMaterial = new THREE.PointsMaterial({
    size: 0.07, vertexColors: true, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
  scene.add(nebula);

  // --- light: ambient floor + one soft violet light orbiting the rings -----
  scene.add(new THREE.AmbientLight(0x8ee8f5, 0.35));
  const orbitLight = new THREE.PointLight(0xa78bfa, 6, 14, 1.6);
  scene.add(orbitLight);

  // --- loop, guarded by shouldAnimate ---------------------------------------
  const motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let raf = 0;
  let last = 0;
  let width = 1;
  let height = 1;
  const FRAME_MS = 1000 / 30;

  const state = (): { hidden: boolean; reducedMotion: boolean; hash: string } => ({
    hidden: doc.hidden,
    reducedMotion: motionQuery?.matches ?? false,
    hash: win.location.hash,
  });

  const layout = (): void => {
    width = Math.max(1, win.innerWidth);
    height = Math.max(1, win.innerHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    // Lower-right, scaled with the viewport so the knot never covers the
    // content column on a phone.
    const narrow = width < 720;
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * camera.aspect;
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    instrument.position.set(halfW * (narrow ? 0.7 : 0.74), -halfH * (narrow ? 0.8 : 0.7), 0);
    instrument.scale.setScalar(narrow ? 0.5 : 0.72);
  };

  const frame = (now: number): void => {
    if (!shouldAnimate(state())) { raf = 0; return; }
    raf = win.requestAnimationFrame(frame);
    if (now - last < FRAME_MS) return;
    last = now;
    const t = now * 0.001;
    knot.rotation.x = t * 0.11;
    knot.rotation.y = t * 0.17;
    ringA.rotation.z = t * 0.05;
    ringB.rotation.z = -t * 0.04;
    ringB.rotation.x = Math.PI / 2.6 + Math.sin(t * 0.21) * 0.18;
    nebula.rotation.y = t * 0.012;
    nebula.rotation.x = Math.sin(t * 0.05) * 0.05;
    orbitLight.position.set(
      instrument.position.x + Math.cos(t * 0.5) * 3.2,
      instrument.position.y + Math.sin(t * 0.37) * 1.6,
      2.2 + Math.sin(t * 0.5) * 1.4,
    );
    renderer.render(scene, camera);
  };

  const kick = (): void => {
    const allowed = shouldAnimate(state());
    canvas.style.opacity = isSuppressed(win.location.hash) ? '0' : '';
    if (allowed && raf === 0) raf = win.requestAnimationFrame(frame);
  };

  const onVisibility = (): void => kick();
  const onHashChange = (): void => kick();
  const onMotionChange = (): void => kick();
  const onResize = (): void => { layout(); kick(); };

  layout();
  kick();
  win.addEventListener('resize', onResize);
  win.addEventListener('hashchange', onHashChange);
  doc.addEventListener('visibilitychange', onVisibility);
  motionQuery?.addEventListener?.('change', onMotionChange);

  return () => {
    if (raf !== 0) win.cancelAnimationFrame(raf);
    raf = 0;
    win.removeEventListener('resize', onResize);
    win.removeEventListener('hashchange', onHashChange);
    doc.removeEventListener('visibilitychange', onVisibility);
    motionQuery?.removeEventListener?.('change', onMotionChange);
    knotGeometry.dispose(); knotMaterial.dispose();
    ringGeometry.dispose(); ringMaterialA.dispose(); ringMaterialB.dispose();
    nebulaGeometry.dispose(); nebulaMaterial.dispose();
    scene.clear();
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
    const dispose = mountHoloBackdrop(canvas, window, { maxPixelRatio: phone ? 1 : 1.5, points: phone ? 420 : 900 });
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
