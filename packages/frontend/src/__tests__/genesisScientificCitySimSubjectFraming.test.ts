import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

/**
 * GRAPHICS V2 SPRINT C-3 — Sprint B's wide establishing shot (`init()`'s own
 * `camera.position.set(midX + 46, 34, midZ + 62)`) is a real composition improvement over the old
 * close/cropped framing, but left as the scene's PERMANENT resting camera it made the pump/hospital
 * pair — this scenario's actual subject — read as two small objects lost in a much bigger district
 * (found live via this sprint's own Chromium screenshots). `init()` now also calls the same real
 * `frameCameraOn` seam `applyObservationTarget` uses to push the camera in from that wide establish
 * onto the pair, driven by `useThreeLoop.ts`'s existing per-frame lerp toward
 * `getOrbitTarget()`/`getOrbitFocusDistance()` — no second camera mechanism.
 *
 * This test proves the RESTING framing (post-lerp — the same math `useThreeLoop.ts` converges to)
 * actually keeps both real entities inside the camera frustum, using real `THREE.Camera`
 * projection math, not a screenshot eyeball.
 */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {}, fill: () => {},
    roundRect: (() => {}) as unknown as CanvasRenderingContext2D['roundRect'],
    measureText: () => ({ width: 40 }) as TextMetrics,
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  const fakeImage = { addEventListener: () => {}, removeEventListener: () => {}, set src(_v: string) {} };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };
});

/** A bare `THREE`-only sim (same convention `genesisScientificCitySim.test.ts` uses) resolved onto
 * one real named entity — used only to read that entity's real world position back out via the
 * same real `applyObservationTarget` seam, since the sim has no direct position getter. Every
 * `GenesisScientificCitySim` is built from the same deterministic seed-1 world, so this position
 * agrees with the fully-`init()`-ed sim under test. */
function realWorldPosition(query: string): THREE.Vector3 {
  const probe = new GenesisScientificCitySim();
  Object.assign(probe as unknown as Record<string, unknown>, { THREE });
  probe.applyObservationTarget(query, 'MACRO');
  return probe.getOrbitTarget()!.clone();
}

/** Reproduces `useThreeLoop.ts`'s own converged camera pose for a sim with an active
 * `followTarget`/`observationStandoff` (no `getOrbitCameraDirection` override, so the same default
 * `(1, 0.72, 1)` direction applies) — the resting shot a real user actually sees once the push-in
 * lerp finishes. */
function restingCameraFrom(sim: GenesisScientificCitySim, aspect: number): THREE.PerspectiveCamera {
  const target = sim.getOrbitTarget()!;
  const focusDistance = sim.getOrbitFocusDistance()!;
  const direction = new THREE.Vector3(1, 0.72, 1).normalize();
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  camera.position.copy(target).addScaledVector(direction, focusDistance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera;
}

function isInFrustum(camera: THREE.PerspectiveCamera, point: THREE.Vector3): boolean {
  const ndc = point.clone().project(camera);
  return ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
}

describe('GenesisScientificCitySim — SPRINT C-3 subject framing', () => {
  it('init() leaves a real followTarget/observationStandoff active — the establishing shot is not the permanent resting camera', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);
    expect(sim.getOrbitTarget()).not.toBeNull();
    expect(sim.getOrbitFocusDistance()).toBeGreaterThan(0);
  });

  it('REGRESSION: the resting framing keeps BOTH the real pump and the real hospital inside the camera frustum', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);

    const resting = restingCameraFrom(sim, 1280 / 800);
    const pumpPosition = realWorldPosition('the pump');
    const hospitalPosition = realWorldPosition('the hospital');

    expect(isInFrustum(resting, pumpPosition)).toBe(true);
    expect(isInFrustum(resting, hospitalPosition)).toBe(true);
  });

  it('frames on the pair midpoint, not tightly cropped to the hospital alone (found live: a hospital-only radius crops the pump out of frame)', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
    sim.init(THREE, scene, camera, 1280, 800);

    const pumpPosition = realWorldPosition('the pump');
    const hospitalPosition = realWorldPosition('the hospital');
    const pairDistance = pumpPosition.distanceTo(hospitalPosition);

    // The standoff must be at least wide enough to plausibly cover the real span between the two
    // entities — a hospital-only radius (5) would not scale with a real world where they are placed
    // farther apart.
    expect(sim.getOrbitFocusDistance()!).toBeGreaterThanOrEqual(pairDistance * 0.5);
  });
});
