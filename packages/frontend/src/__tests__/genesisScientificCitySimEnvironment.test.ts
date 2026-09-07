import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0 (Priority 1): proves `sceneEnvironment.ts` is
 * actually wired into `GenesisScientificCitySim.init()` by calling the REAL `init()` and asserting
 * the shared ground/sky/lighting objects exist in the real scene graph — the same "engine module ->
 * production scene -> visible result" gate every other kit in this build was held to.
 *
 * `genesisScientificCitySim.test.ts` deliberately bypasses `init()` (its own module doc explains
 * why: the full `init()` loads real procedural textures via `document.createElement('canvas')`,
 * which that test's plain-field setup doesn't provide). This file supplies that document/canvas
 * stub instead, so it CAN exercise the real `init()` — the same stubbing convention used by
 * `epidemicCity3DExtras.test.ts` and friends.
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

function buildInitializedScene(): THREE.Scene {
  const sim = new GenesisScientificCitySim();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  return scene;
}

describe('GenesisScientificCitySim.init() — shared scene environment wiring', () => {
  it('creates the shared ground plane, sun, and fill light from createSceneEnvironment in the real scene graph', () => {
    const scene = buildInitializedScene();
    const ground = scene.getObjectByName('genesis-scene-environment-ground');
    expect(ground).toBeDefined();
    expect((ground as THREE.Mesh).geometry).toBeInstanceOf(THREE.PlaneGeometry);

    const lightTypes = scene.children.filter((c) => (c as THREE.Light).isLight).map((c) => c.type);
    expect(lightTypes).toContain('DirectionalLight');
    expect(lightTypes).toContain('HemisphereLight');
  });

  it('REGRESSION: the sun light sits above the horizon and is bright enough to actually light the scene', () => {
    // Found via this scene's own first Chromium screenshot of this wiring: `hourOfDay: 21` (9pm)
    // puts computeSunState's sun direction below the horizon (negative y) AND floors its intensity
    // at a physically-dim 0.15 — a plain DirectionalLight shines FROM its position TOWARD the
    // origin, so with the sun below the horizon it lit the underside of the ground/buildings, not
    // the top faces the camera sees, and even after fixing the angle the floor-dim intensity left
    // the scene barely visible. `sunPosition`/`sunColor`/`sunIntensity` are explicitly overridden
    // back to this scene's own original key light; this locks that fix in.
    const scene = buildInitializedScene();
    const sun = scene.children.find((c) => (c as THREE.Light).isLight && c.type === 'DirectionalLight') as THREE.DirectionalLight;
    expect(sun).toBeDefined();
    expect(sun.position.y).toBeGreaterThan(0);
    expect(sun.intensity).toBeGreaterThanOrEqual(2);
  });

  it('sets a dark, night-appropriate fog and background — the scene keeps its original mood', () => {
    const scene = buildInitializedScene();
    expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
    const bg = scene.background as THREE.Color;
    expect(bg).toBeInstanceOf(THREE.Color);
    // Night-dark: well below a daylight blue, consistent with this scene's original 0x0c1420 pick.
    expect(bg.r + bg.g + bg.b).toBeLessThan(0.2);
  });

  it('dispose() removes the shared environment objects from the scene without throwing', () => {
    const sim = new GenesisScientificCitySim();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    sim.init(THREE, scene, camera, 400, 300);
    expect(scene.getObjectByName('genesis-scene-environment-ground')).toBeDefined();
    expect(() => sim.dispose()).not.toThrow();
    expect(scene.getObjectByName('genesis-scene-environment-ground')).toBeUndefined();
  });
});
