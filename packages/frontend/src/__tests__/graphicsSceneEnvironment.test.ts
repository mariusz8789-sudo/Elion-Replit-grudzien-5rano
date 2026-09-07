import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createSceneEnvironment } from '../core/three/graphics/sceneEnvironment';

/** materials.ts's GROUND category touches document.createElement('canvas') for procedural detail
 * textures — same minimal stub every other graphics test in this suite uses. */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

describe('createSceneEnvironment — OUTDOOR mode', () => {
  it('adds a sky dome, fog, sun, background fill, and a ground plane', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high' });
    expect(scene.fog).not.toBeNull();
    expect(handle.environment.skyDome).not.toBeNull();
    expect(scene.children).toContain(handle.environment.skyDome!);
    expect(scene.children).toContain(handle.sun);
    expect(scene.children).toContain(handle.fill);
    expect(handle.ground).not.toBeNull();
    expect(scene.children).toContain(handle.ground!);
  });

  it('the sun light color/intensity match the environment-computed SunState (no duplicated lighting decision)', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', hourOfDay: 12, tier: 'high' });
    expect(handle.sun.color.getHex()).toBe(new THREE.Color(handle.environment.sunState!.color).getHex());
    expect(handle.sun.intensity).toBeCloseTo(handle.environment.sunState!.intensity, 5);
  });

  it('skips ground when groundSize: 0', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', groundSize: 0, tier: 'high' });
    expect(handle.ground).toBeNull();
  });

  it('sunIntensity/sunColor override the environment-computed SunState, independent of sunPosition', () => {
    // A scene wanting dark night fog/sky (from `hourOfDay`) but a legible, brighter-than-physical
    // key light (this module's own night-intensity floor is 0.15) needs to override intensity/color
    // without losing the rest of the time-of-day composition — see genesisScientificCitySim.ts's own
    // real regression (a night hour's near-zero sun intensity left the scene unlit).
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, {
      mode: 'OUTDOOR', hourOfDay: 0, tier: 'high',
      sunPosition: [10, 20, 10], sunIntensity: 2, sunColor: 0xffd9a0,
    });
    expect(handle.sun.intensity).toBe(2);
    expect(handle.sun.color.getHex()).toBe(new THREE.Color(0xffd9a0).getHex());
    expect(handle.sun.position.y).toBe(20);
  });

  it('never disposes a caller-supplied ground material', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    let disposed = false;
    const realDispose = material.dispose.bind(material);
    material.dispose = () => { disposed = true; realDispose(); };
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', groundMaterial: material, tier: 'high' });
    handle.dispose();
    expect(disposed).toBe(false);
  });
});

describe('createSceneEnvironment — render-tier gating', () => {
  it('adds ambient haze at "high" tier', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high' });
    expect(handle.haze).not.toBeNull();
    expect(scene.children).toContain(handle.haze!.points);
  });

  it('skips ambient haze and shadow-casting entirely at "low" tier (matches quality.ts\'s own documented low-tier policy)', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'low' });
    expect(handle.haze).toBeNull();
    expect(handle.sun.castShadow).toBe(false);
  });

  it('ambientHaze: false opts out even at a tier that would otherwise allow it', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high', ambientHaze: false });
    expect(handle.haze).toBeNull();
  });

  it('casts shadows at "high" tier with the recommended shadow-map size', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high' });
    expect(handle.sun.castShadow).toBe(true);
    expect(handle.sun.shadow.mapSize.width).toBe(1024);
  });
});

describe('createSceneEnvironment — INDOOR mode', () => {
  it('adds no sky dome/fog but still adds lights and ground', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'INDOOR', tier: 'high' });
    expect(handle.environment.skyDome).toBeNull();
    expect(scene.fog).toBeNull();
    expect(scene.children).toContain(handle.sun);
    expect(handle.ground).not.toBeNull();
  });
});

describe('createSceneEnvironment — update/dispose lifecycle', () => {
  it('update(dt) advances the haze without throwing', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high' });
    expect(() => handle.update(1)).not.toThrow();
  });

  it('update(dt) is a safe no-op when there is no haze (e.g. low tier)', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'low' });
    expect(() => handle.update(1)).not.toThrow();
  });

  it('dispose() removes everything this module added', () => {
    const scene = new THREE.Scene();
    const handle = createSceneEnvironment(THREE, scene, { mode: 'OUTDOOR', tier: 'high' });
    expect(scene.children.length).toBeGreaterThan(0);
    handle.dispose();
    expect(scene.children).not.toContain(handle.sun);
    expect(scene.children).not.toContain(handle.fill);
    expect(scene.children).not.toContain(handle.ground!);
    expect(scene.children).not.toContain(handle.haze!.points);
    expect(scene.fog).toBeNull();
  });
});
