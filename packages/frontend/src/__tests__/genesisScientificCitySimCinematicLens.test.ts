import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

/**
 * GRAPHICS V2 SPRINT D — cinematic lens polish. `cinematicCamera.ts`'s `configureCinematicCamera`/
 * `FocusPuller` are already proven in `labScene3D.ts`; this scene reuses the exact same primitives
 * (no second camera or lens system) to give the SPRINT C-3 establish->hero camera move a matching
 * lens change (wide FOV -> a real cinematic 40deg hero lens) and a rack focus, instead of the
 * generic fixed 50deg FOV every `Sim3D` camera starts with.
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
  const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.1, 500);
  sim.init(THREE, scene, camera, 1280, 800);
  return { sim, scene, camera };
}

describe('GenesisScientificCitySim — SPRINT D cinematic lens', () => {
  it('init() sets the wide establishing lens (68deg), not the generic 50deg every Sim3D camera starts with', () => {
    const { camera } = buildInitializedSim();
    expect(camera.fov).toBeCloseTo(68, 5);
  });

  it('once the camera has actually arrived at the hero standoff, syncScene swaps to the tighter HERO_CLOSE_UP lens (40deg)', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const target = sim.getOrbitTarget()!;
    const standoff = sim.getOrbitFocusDistance()!;
    // Simulate the converged resting camera useThreeLoop.ts's own lerp settles onto.
    const direction = new THREE.Vector3(1, 0.72, 1).normalize();
    camera.position.copy(target).addScaledVector(direction, standoff);
    camera.lookAt(target);

    sim.syncScene(scene, camera);
    expect(camera.fov).toBeCloseTo(40, 5);
  });

  it('stays on the wide lens while the camera is still far from the target (mid push-in)', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const target = sim.getOrbitTarget()!;
    const standoff = sim.getOrbitFocusDistance()!;
    const direction = new THREE.Vector3(1, 0.72, 1).normalize();
    // Deliberately still far away — more than the 1.4x threshold `updateCinematicFraming` uses.
    camera.position.copy(target).addScaledVector(direction, standoff * 3);
    camera.lookAt(target);

    sim.syncScene(scene, camera);
    expect(camera.fov).toBeCloseTo(68, 5);
  });

  it('the rack focus starts at the wide establishing distance and eases toward the hero standoff over time', () => {
    const { sim } = buildInitializedSim();
    const standoff = sim.getOrbitFocusDistance()!;
    const establishingDistance = sim.getStats().cinematicFocusDistance;
    // The wide establishing shot is real distance from the pair — always farther than the hero
    // standoff `frameCameraOn` resolves, so the puller has real ground to cover.
    expect(establishingDistance).toBeGreaterThan(standoff);

    for (let i = 0; i < 200; i++) sim.update(0.05);
    const settled = sim.getStats().cinematicFocusDistance;
    expect(settled).toBeLessThan(establishingDistance);
    expect(settled).toBeCloseTo(standoff, 0);
    expect(() => sim.dispose()).not.toThrow();
  });
});
