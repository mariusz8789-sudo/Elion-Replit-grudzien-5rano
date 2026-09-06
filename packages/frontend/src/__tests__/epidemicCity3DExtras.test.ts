import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0 quality gate: proves the new building/street/
 * vehicle/vegetation kits are ACTUALLY INSTANTIATED by the real production city scene's `init()`
 * (via the private `addCityExtras()` it now calls), not just imported-but-dead code or proven only
 * in an isolated `graphics/examples/*.ts` file. This is the "ENGINE MODULE -> PRODUCTION SCENE ->
 * VISIBLE RESULT" evidence this mission phase explicitly requires.
 *
 * `EpidemicCity3DSim.init()` is otherwise untested at the vitest level in this codebase (see
 * `sims.test.ts`'s own doc: Sim3D rendering is normally verified by Playwright/Chromium, not vitest,
 * because a real `WebGLRenderer` needs a real GPU canvas). `init()` itself never constructs a
 * `WebGLRenderer` though — it only builds plain `THREE.Object3D` graphs into a caller-supplied
 * `THREE.Scene`, which works in plain Node exactly like `graphicsWorldFrameBenchmark.test.ts`
 * already proves for `WorldFrameRenderer`. The only real environment gap is `document` (procedural
 * canvas textures in `materials.ts`, and three.js's own `TextureLoader`/`ImageLoader`), stubbed
 * below with the same minimal fake-canvas convention `graphicsWorldEnvironmentExample.test.ts`
 * already uses, plus a fake `<img>` element so `TextureLoader.load()`'s synchronous DOM calls don't
 * throw (the network load itself is never awaited — this test only inspects the scene graph
 * `init()` builds synchronously).
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

function buildInitializedScene(): { sim: EpidemicCity3DSim; scene: THREE.Scene } {
  const sim = new EpidemicCity3DSim({ nAgents: 48, seed: 7 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  return { sim, scene };
}

function namesOf(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((node) => { if (node.name) names.push(node.name); });
  return names;
}

describe('EpidemicCity3DSim — Visual World Build 1.0 kits are real in the production scene', () => {
  it('the real city scene adds a visual-world-build-city-extras group to the actual scene graph', () => {
    const { scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras');
    expect(extras).toBeDefined();
    expect(extras!.children.length).toBeGreaterThan(0);
  });

  it('the hospital gets a real ambulance bay, a parked ambulance, rooftop equipment, and a service building — anchored to the real CityWorld hospital', () => {
    const { scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras')!;
    const names = namesOf(extras);
    expect(names).toContain('genesis-ambulance-bay');
    expect(names).toContain('genesis-vehicle-ambulance');
    expect(names).toContain('genesis-rooftop-equipment');
    expect(names).toContain('genesis-industrial-building');
    expect(names).toContain('genesis-tree-field');
  });

  it('decorative street furniture (hydrants/utility boxes) and parked cars/vans are present', () => {
    const { scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras')!;
    const names = namesOf(extras);
    expect(names).toContain('genesis-street-hydrant');
    expect(names).toContain('genesis-street-utility-box');
    expect(names).toContain('genesis-vehicle-car');
  });

  it('decorative extras never claim to be a CityWorld location (no worldSelection userData)', () => {
    const { scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras')!;
    extras.traverse((node) => {
      expect(node.userData.worldSelection).toBeUndefined();
    });
  });

  it('rebuilding twice from the same seed produces the same extras child count (deterministic, no Math.random)', () => {
    const first = buildInitializedScene().scene.getObjectByName('visual-world-build-city-extras')!;
    const second = buildInitializedScene().scene.getObjectByName('visual-world-build-city-extras')!;
    expect(namesOf(first)).toEqual(namesOf(second));
  });

  it('dispose() releases the extras\' own geometry/material resources (same lifecycle as every other city mesh)', () => {
    const { sim, scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras')!;
    let firstMesh: THREE.Mesh | null = null;
    extras.traverse((node) => { if (!firstMesh && node instanceof THREE.Mesh) firstMesh = node; });
    expect(firstMesh).not.toBeNull();
    const geometry = (firstMesh as unknown as THREE.Mesh).geometry;
    const realDispose = geometry.dispose.bind(geometry);
    let disposed = false;
    geometry.dispose = () => { disposed = true; realDispose(); };
    expect(() => sim.dispose()).not.toThrow();
    expect(disposed).toBe(true);
  });
});
