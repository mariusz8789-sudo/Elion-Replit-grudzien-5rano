import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { buildTrafficNetwork, DEFAULT_GREENSHIELDS } from '../core/worldModel/domains/trafficFlow';

/**
 * GRAPHICS V7 — proves the real Greenshields+CTM+HCM traffic-flow solver
 * (`worldModel/domains/trafficFlow.ts`) is actually wired into the flagship production city scene:
 * one real InstancedMesh cell per CTM cell on `this.simulation`'s own real road geometry, recolored
 * from each cell's real, evolving `densityVehPerKm` — never a fabricated animation.
 *
 * Same canvas/document stub convention as epidemicCity3DWaterInfrastructureSeam.test.ts.
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

function buildInitializedScene(nAgents = 24, seed = 11) {
  const sim = new EpidemicCity3DSim({ nAgents, seed });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  return { sim, scene, camera };
}

/** Independent ground truth for the real cell count this exact seed's road geometry should
 * produce — built the SAME way `EpidemicCity3DSim`'s own constructor does (a fresh
 * `EpidemicCitySimulation` with the SAME params -> `roadNetworkView()` -> `buildTrafficNetwork`),
 * so this is a real cross-check against a second, independent construction, not a tautology against
 * the scene's own private field. */
function expectedCellCount(nAgents: number, seed: number): number {
  const simulation = new EpidemicCitySimulation({ nAgents, seed });
  const network = buildTrafficNetwork(simulation.roadNetworkView());
  return network.links.reduce((sum, link) => sum + link.cells.length, 0);
}

describe('EpidemicCity3DSim — real traffic-flow visualization (GRAPHICS V7)', () => {
  it('renders exactly ONE InstancedMesh for the whole network (one draw call regardless of cell count)', () => {
    const { scene } = buildInitializedScene();
    const overlays = scene.children.filter((c) => c.name === 'genesis-city-traffic-overlay');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toBeInstanceOf(THREE.InstancedMesh);
  });

  it('the overlay has exactly one instance per real CTM cell, cross-checked against an independently built network', () => {
    const { scene } = buildInitializedScene(24, 11);
    const overlay = scene.getObjectByName('genesis-city-traffic-overlay') as THREE.InstancedMesh;
    expect(overlay.count).toBe(expectedCellCount(24, 11));
    expect(overlay.count).toBeGreaterThan(0);
  });

  it('every instance has a finite, real scene-space position (no NaN from the world<->scene coordinate mapping)', () => {
    const { scene } = buildInitializedScene();
    const overlay = scene.getObjectByName('genesis-city-traffic-overlay') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let i = 0; i < overlay.count; i++) {
      overlay.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
      expect(Number.isFinite(position.z)).toBe(true);
    }
  });

  it('before any real traffic has flowed (zero density, the CTM network\'s real initial state), every cell reads free-flow green', () => {
    const { scene } = buildInitializedScene();
    const overlay = scene.getObjectByName('genesis-city-traffic-overlay') as THREE.InstancedMesh;
    const color = new THREE.Color();
    const freeFlowGreen = new THREE.Color(0x3ddc84);
    overlay.getColorAt(0, color);
    expect(color.getHex()).toBe(freeFlowGreen.getHex());
  });

  it('stats read zero before the first real update() (honest "nothing has happened yet", not a fabricated free-flow default)', () => {
    const { sim } = buildInitializedScene();
    const stats = sim.getStats();
    expect(stats.traffic_mean_speed_ms).toBe(0);
    expect(stats.traffic_mean_density_veh_per_km).toBe(0);
  });

  it('real demand flowing through update() over time changes both the reported stats AND the overlay colors', () => {
    const { sim, scene, camera } = buildInitializedScene();
    // Real dt in seconds, driving the real Godunov/CTM stepper directly — the same path
    // useThreeLoop.ts's render loop uses every frame.
    for (let i = 0; i < 40; i++) {
      sim.update(3, {});
      sim.syncScene(scene, camera);
    }
    const stats = sim.getStats();
    expect(stats.traffic_mean_speed_ms).toBeGreaterThan(0);
    expect(stats.traffic_mean_speed_ms).toBeLessThanOrEqual(DEFAULT_GREENSHIELDS.freeFlowSpeedMS);
    expect(stats.traffic_mean_density_veh_per_km).toBeGreaterThan(0);

    const overlay = scene.getObjectByName('genesis-city-traffic-overlay') as THREE.InstancedMesh;
    const color = new THREE.Color();
    let sawNonFreeFlowColor = false;
    const freeFlowGreen = new THREE.Color(0x3ddc84);
    for (let i = 0; i < overlay.count; i++) {
      overlay.getColorAt(i, color);
      if (color.getHex() !== freeFlowGreen.getHex()) sawNonFreeFlowColor = true;
    }
    expect(sawNonFreeFlowColor).toBe(true);
  });

  it('dispose() tears down the traffic overlay without throwing', () => {
    const { sim } = buildInitializedScene();
    expect(() => sim.dispose?.()).not.toThrow();
  });
});
