import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

/**
 * GRAPHICS V2 SPRINT C-2 — the real `RAINFALL_EVENT_TYPE` scenario, once it has actually fired,
 * must produce a VISIBLE rendering change (denser fog, wetter-looking road surfaces), not just a
 * world-model boolean nobody ever draws. Uses the same real-`init()` + fake-canvas stubbing
 * convention as `genesisScientificCitySimEnvironment.test.ts` (this scene's `init()` loads real
 * procedural textures via `document.createElement('canvas')`, which vitest's default environment
 * doesn't provide).
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

function buildInitializedSim(): { sim: GenesisScientificCitySim; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const sim = new GenesisScientificCitySim();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  return { sim, scene, camera };
}

/** The two road-strip meshes `addCityContext` builds directly on `asphalt`: plain (non-instanced)
 * `PlaneGeometry` meshes at the exact `roadWidth` (9) x `roadLength` (150) footprint that method
 * hard-codes — the most direct real surface to check for the "wet" roughness drop, without reaching
 * into the sim's private fields or accidentally matching unrelated PBR geometry (the shared ground
 * plane, the dashed road-marking InstancedMesh, or any other kit's own PlaneGeometry use) that
 * happens to share a roughness value. */
function findRoadMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const roads: THREE.Mesh[] = [];
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    if (!(mesh.geometry instanceof THREE.PlaneGeometry)) return;
    const { width, height } = mesh.geometry.parameters as { width: number; height: number };
    if ((width === 9 && height === 150) || (width === 150 && height === 9)) roads.push(mesh);
  });
  return roads;
}

describe('GenesisScientificCitySim — SPRINT C-2 rainfall rendering response', () => {
  it('before rainfall: fog stays at the dry baseline and the rendering has not applied a rain state', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.syncScene(scene, camera);
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(0.0075, 6);
    expect(sim.getStats().rainfallVisualApplied).toBe(0);
  });

  it('once the REAL rainfall scenario fires, the next syncScene call makes fog denser and road surfaces wetter', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.syncScene(scene, camera); // establish the dry baseline first, like a real running scene would
    const roadsBefore = findRoadMeshes(scene).map((m) => (m.material as THREE.MeshStandardMaterial).roughness);
    expect(roadsBefore.length).toBeGreaterThan(0);

    const outcome = sim.triggerRainfallScenario();
    expect(outcome.tripped).toBe(true); // sanity: this really is the real scenario, not a stub
    sim.syncScene(scene, camera);

    expect((scene.fog as THREE.FogExp2).density).toBeGreaterThan(0.0075);
    expect(sim.getStats().rainfallVisualApplied).toBe(1);
    const roadsAfter = findRoadMeshes(scene).map((m) => (m.material as THREE.MeshStandardMaterial).roughness);
    for (let i = 0; i < roadsAfter.length; i++) expect(roadsAfter[i]).toBeLessThan(roadsBefore[i]);
  });

  it('is idempotent across repeated frames — does not keep re-darkening or re-fogging every tick', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.triggerRainfallScenario();
    sim.syncScene(scene, camera);
    const densityAfterFirst = (scene.fog as THREE.FogExp2).density;
    const colorAfterFirst = (findRoadMeshes(scene)[0].material as THREE.MeshStandardMaterial).color.clone();
    for (let i = 0; i < 5; i++) sim.syncScene(scene, camera);
    expect((scene.fog as THREE.FogExp2).density).toBeCloseTo(densityAfterFirst, 6);
    expect((findRoadMeshes(scene)[0].material as THREE.MeshStandardMaterial).color.equals(colorAfterFirst)).toBe(true);
  });

  it('this is a rendering response to a real event, not the intensity solver — that answer now comes from runRainfallIntensityCounterfactual (C3 Phase 5 + C1 fix, made real after this sprint branched)', () => {
    const { sim } = buildInitializedSim();
    sim.triggerRainfallScenario();
    const counterfactual = sim.runRainfallIntensityCounterfactual(30);
    expect(counterfactual).not.toBeNull();
    expect(counterfactual?.tripped).toBe(true);
  });
});
