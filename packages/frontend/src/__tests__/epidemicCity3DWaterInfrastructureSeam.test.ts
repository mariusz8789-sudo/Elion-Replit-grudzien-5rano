import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 2.0: proves the water-infrastructure C3 integration
 * seam (graphics/waterInfrastructureBridge.ts) is wired into the REAL production city scene, and
 * proves it the way this mission phase explicitly requires: the pump is visible, real, and
 * positioned near the real hospital — but it is NEVER presented as a queryable CityWorld location
 * and NEVER shows a fabricated failure/warning state, because no real C1/C3 water entity exists yet.
 *
 * Same canvas/document stub convention as epidemicCity3DExtras.test.ts.
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

describe('EpidemicCity3DSim — water-infrastructure C3 integration seam', () => {
  it('renders a real pump object near the real hospital building', () => {
    const { scene } = buildInitializedScene();
    const pump = scene.getObjectByName('genesis-water-pump');
    expect(pump).toBeDefined();
    let hospitalGroup: THREE.Object3D | undefined;
    scene.traverse((node) => { if (!hospitalGroup && node.userData?.worldSelection?.label === 'HOSPITAL') hospitalGroup = node; });
    expect(hospitalGroup).toBeDefined();
    // "near" — same order of magnitude distance as this scene's own building footprints, not on
    // the other side of the map.
    const dx = pump!.position.x - hospitalGroup!.position.x;
    const dz = pump!.position.z - hospitalGroup!.position.z;
    expect(Math.hypot(dx, dz)).toBeLessThan(3);
  });

  it('the pump carries no worldSelection — it is not a queryable CityWorld location', () => {
    const { scene } = buildInitializedScene();
    const pump = scene.getObjectByName('genesis-water-pump')!;
    expect(pump.userData.worldSelection).toBeUndefined();
  });

  it('the pump is tagged notModeled — no real C1/C3 entity backs it yet', () => {
    const { scene } = buildInitializedScene();
    const pump = scene.getObjectByName('genesis-water-pump')!;
    expect(pump.userData.notModeled).toBe(true);
  });

  it('the pump never shows a FAILED/WARNING look — its status light stays at the NORMAL default across multiple syncs', () => {
    const { sim, scene } = buildInitializedScene();
    const pump = scene.getObjectByName('genesis-water-pump')!;
    let light: THREE.Mesh | null = null;
    pump.traverse((node) => { if (node instanceof THREE.Mesh && node.geometry instanceof THREE.SphereGeometry) light = node; });
    const material = (light! as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const initialIntensity = material.emissiveIntensity;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    for (let i = 0; i < 5; i++) {
      sim.step();
      sim.syncScene(scene, camera);
    }
    expect(material.emissiveIntensity).toBe(initialIntensity);
  });

  it('the pump is not in the click-selectable set — raycasting the scene never resolves it as a world selection', () => {
    const { scene } = buildInitializedScene();
    const pump = scene.getObjectByName('genesis-water-pump')!;
    let sawSelectionTag = false;
    pump.traverse((node) => { if (node.userData.worldSelection !== undefined) sawSelectionTag = true; });
    expect(sawSelectionTag).toBe(false);
  });

  it('a decorative pipe run connects the pump toward the hospital, tagged visual-only', () => {
    const { scene } = buildInitializedScene();
    const pipe = scene.children.find((c) => c.name === 'genesis-water-pipe-network');
    expect(pipe).toBeDefined();
    expect(pipe!.userData.visualOnlyContext).toBe(true);
  });

  it('dispose() tears down the infrastructure renderer without throwing', () => {
    const { sim } = buildInitializedScene();
    expect(() => sim.dispose?.()).not.toThrow();
  });
});
