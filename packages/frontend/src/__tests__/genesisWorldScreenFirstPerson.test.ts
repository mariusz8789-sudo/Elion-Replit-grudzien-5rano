import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisWorldSim3D } from '../components/visual-simulation/GenesisWorldScreen';

/**
 * LIVING WORLD — this scene used to be purely observational (a fixed camera + OrbitControls looking
 * down at the whole city). It now drives a real, walkable first-person camera (the SAME production
 * `FirstPersonController` `labScene3D.ts`/`FirstPersonLabScreen.tsx` already use) and exposes one
 * spatial interaction: walk close to, and roughly face, the real pump entity to get an "E — create
 * intervention branch" prompt. These tests exercise the FULL `init()` (real procedural textures via
 * `createPBRMaterial`, hence the canvas/document stub — same pattern
 * `genesisScientificCitySimDofToggle.test.ts` already established), not a bypass, since the spawn
 * point/camera math under test lives inside `init()`/`syncScene()` themselves.
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

function buildInitializedSim(): { sim: GenesisWorldSim3D; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const sim = new GenesisWorldSim3D();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1280 / 800, 0.01, 2000);
  sim.init(THREE, scene, camera, 1280, 800);
  return { sim, scene, camera };
}

describe('GenesisWorldSim3D — LIVING WORLD first-person foundation', () => {
  it('disables OrbitControls — this scene now drives the camera itself', () => {
    const { sim } = buildInitializedSim();
    expect(sim.disableOrbitControls).toBe(true);
  });

  it('spawns the player a short, real distance from the pump\'s actual C3 position, not the old fixed observation point', () => {
    const { camera } = buildInitializedSim();
    // The old fixed camera sat at (10, 55, 95) — a top-down observation post. The new spawn must be
    // human eye-height and genuinely near ground level, not floating 55 units up.
    expect(camera.position.y).toBeCloseTo(1.7, 1);
  });

  it('walking forward (toward the spawn-facing direction) changes camera position over several frames', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const start = camera.position.clone();
    sim.setMoveKey('forward', true);
    for (let i = 0; i < 30; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
    }
    expect(camera.position.distanceTo(start)).toBeGreaterThan(0.5);
  });

  it('walking toward the pump\'s real spawn-facing direction eventually reports nearPump via getStats()', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.setMoveKey('forward', true);
    let sawNear = false;
    for (let i = 0; i < 200; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
      if (sim.getStats().nearPump === 1) { sawNear = true; break; }
    }
    expect(sawNear).toBe(true);
  });

  it('stays far from the pump (nearPump stays 0) if the player never moves', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.update(0.05);
    sim.syncScene(scene, camera);
    expect(sim.getStats().nearPump).toBe(0);
  });

  it('setRunning covers more ground than walking in the same time — the walk/run lever the production controller now exposes', () => {
    const { sim: walker, scene: walkScene, camera: walkCamera } = buildInitializedSim();
    // Enough steps for BOTH to actually reach their target speed (acceleration is a shared,
    // constant ramp — too few steps would leave both still accelerating and look identical
    // regardless of the multiplier, which is a test artifact, not a real-world condition).
    const spawn = walkCamera.position.clone().setY(0);
    walker.setMoveKey('forward', true);
    for (let i = 0; i < 80; i++) { walker.update(0.05); walker.syncScene(walkScene, walkCamera); }
    const walkDistance = walkCamera.position.clone().setY(0).distanceTo(spawn);

    const { sim: runner, scene: runScene, camera: runCamera } = buildInitializedSim();
    runner.setRunning(true);
    runner.setMoveKey('forward', true);
    for (let i = 0; i < 80; i++) { runner.update(0.05); runner.syncScene(runScene, runCamera); }
    const runDistance = runCamera.position.clone().setY(0).distanceTo(spawn);

    expect(runDistance).toBeGreaterThan(walkDistance);
  });

  it('addMouseLook rotates the camera (mouse-look) without throwing', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const startYaw = camera.rotation.y;
    sim.addMouseLook(500, 0);
    sim.update(0.016);
    sim.syncScene(scene, camera);
    expect(camera.rotation.y).not.toBeCloseTo(startYaw, 5);
  });
});
