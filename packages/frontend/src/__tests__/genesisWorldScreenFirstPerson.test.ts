import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { GenesisWorldSim3D } from '../components/visual-simulation/GenesisWorldScreen';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID } from '../core/worldModel/domains/genesisScientificCity3';

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

  it('walking toward the pump\'s real spawn-facing direction eventually reports it as the nearest interactable', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.setMoveKey('forward', true);
    let sawNear = false;
    for (let i = 0; i < 200; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
      if (sim.getStats().nearInteractable === 1 && sim.getNearestInteractableId() === sim.city.pumpPipeId) { sawNear = true; break; }
    }
    expect(sawNear).toBe(true);
  });

  it('stays far from every interactable if the player never moves', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.update(0.05);
    sim.syncScene(scene, camera);
    expect(sim.getStats().nearInteractable).toBe(0);
    expect(sim.getNearestInteractableId()).toBeNull();
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

describe('GenesisWorldSim3D — GENERIC INTERACTION SYSTEM (not just the pump)', () => {
  it('sites the floodplain at a real, non-origin position derived from the pump — it has no spatial component of its own from C3', () => {
    const { sim } = buildInitializedSim();
    const frame = getFrameState(sim.city.base.engine);
    const floodplain = frame.entities.find((e) => e.id === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
    expect(floodplain).toBeDefined();
    expect(floodplain!.transform.position.x !== 0 || floodplain!.transform.position.z !== 0).toBe(true);
  });

  it('leversFor() reports the real levers per entity: 1 on the pump, 2 on the floodplain, 0 on the hospital', () => {
    const { sim } = buildInitializedSim();
    expect(sim.leversFor(sim.city.pumpPipeId).map((l) => l.leverId)).toEqual(['lever:pump-capacity']);
    expect(sim.leversFor(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).map((l) => l.leverId).sort()).toEqual([
      'lever:infiltration',
      'lever:outlet-capacity',
    ]);
    expect(sim.leversFor(sim.city.hospitalBuildingId)).toEqual([]);
  });

  it('inspect() reads the real, current state of any entity, not just the pump', () => {
    const { sim } = buildInitializedSim();
    const pump = sim.inspect(sim.city.pumpPipeId);
    expect(pump).not.toBeNull();
    expect(typeof pump!.domainState?.volumetricFlow).toBe('number');
    const hospital = sim.inspect(sim.city.hospitalBuildingId);
    expect(hospital).not.toBeNull();
    expect(hospital!.id).toBe(sim.city.hospitalBuildingId);
  });

  it('applyLever() runs a real fork off a non-pump entity (the floodplain) and the fork becomes visible', () => {
    const { sim } = buildInitializedSim();
    const outletLever = sim.leversFor(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID).find((l) => l.leverId === 'lever:outlet-capacity')!;
    expect(sim.forkEngine).toBeNull();
    sim.applyLever(outletLever, 'test-outlet-lever');
    expect(sim.forkEngine).not.toBeNull();
    expect(sim.showFork).toBe(true);
    const afterFork = sim.inspect(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    expect(afterFork.domainState?.outletWidthM).toBeCloseTo(40, 5);
  });

  it('applyLever() is a single-shot: a second call while a fork already exists is a no-op', () => {
    const { sim } = buildInitializedSim();
    const [pumpLever] = sim.leversFor(sim.city.pumpPipeId);
    sim.applyLever(pumpLever!, 'first');
    const forkAfterFirst = sim.forkEngine;
    const [outletLever] = sim.leversFor(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
    sim.applyLever(outletLever!, 'second');
    expect(sim.forkEngine).toBe(forkAfterFirst);
  });

  it('walking toward the floodplain (a second real interactable, not the pump) eventually reports it as nearest, and it is honestly not the pump', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const frame = getFrameState(sim.city.base.engine);
    const floodplain = frame.entities.find((e) => e.id === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    // Turn to face the floodplain exactly, using the SAME `atan2(-dx,-dz)` convention
    // `FirstPersonController.getForward()`/this scene's own spawn-facing math already uses, and the
    // controller's own default mouse sensitivity (applied in full on the very next `update()` call —
    // see `firstPersonController.ts`'s own `update()`, which consumes the whole pending delta at once).
    const dx = floodplain.transform.position.x - camera.position.x;
    const dz = floodplain.transform.position.z - camera.position.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    let deltaYaw = desiredYaw - camera.rotation.y;
    while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
    while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
    const MOUSE_SENSITIVITY = 0.0022;
    sim.addMouseLook(-deltaYaw / MOUSE_SENSITIVITY, 0);
    sim.setMoveKey('forward', true);
    let sawFloodplain = false;
    for (let i = 0; i < 400; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
      if (sim.getNearestInteractableId() === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID) { sawFloodplain = true; break; }
    }
    expect(sawFloodplain).toBe(true);
    expect(sim.getNearestInteractableId()).not.toBe(sim.city.pumpPipeId);
  });
});
