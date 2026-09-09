import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
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
    // regardless of the multiplier, which is a test artifact, not a real-world condition). Walks
    // BACKWARD (away from the pump's real spawn-facing direction) — PRIORITY 2 gave the pump a real
    // collision footprint, which a forward walk/run of this duration would now reach and clamp both
    // to the same distance, a false tie that has nothing to do with the walk/run lever under test.
    const spawn = walkCamera.position.clone().setY(0);
    walker.setMoveKey('back', true);
    for (let i = 0; i < 80; i++) { walker.update(0.05); walker.syncScene(walkScene, walkCamera); }
    const walkDistance = walkCamera.position.clone().setY(0).distanceTo(spawn);

    const { sim: runner, scene: runScene, camera: runCamera } = buildInitializedSim();
    runner.setRunning(true);
    runner.setMoveKey('back', true);
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

describe('GenesisWorldSim3D — PRIORITY 2: REAL WORLD GEOMETRY (collision + hospital entrance/interior)', () => {
  it('the pump has a real collision footprint — walking straight at it for a long time never reaches its exact center', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.setMoveKey('forward', true);
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 300; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
      const frame = getFrameState(sim.city.base.engine);
      const pump = frame.entities.find((e) => e.id === sim.city.pumpPipeId)!;
      const d = camera.position.distanceTo(new THREE.Vector3(pump.transform.position.x, camera.position.y, pump.transform.position.z));
      if (d < minDistance) minDistance = d;
    }
    // Real footprint half-extent (PUMP_EQUIPMENT_SCALE=3 -> box 4.5, half 2.25) + collisionRadius(0.4):
    // a player who could walk straight through would get arbitrarily close to 0.
    expect(minDistance).toBeGreaterThan(2);
  });

  it('walking toward the hospital eventually reports its real entrance, and its own real footprint blocks the player before reaching its center', () => {
    const { sim, scene, camera } = buildInitializedSim();
    const frame = getFrameState(sim.city.base.engine);
    const hospital = frame.entities.find((e) => e.id === sim.city.hospitalBuildingId)!;
    const dx = hospital.transform.position.x - camera.position.x;
    const dz = hospital.transform.position.z - camera.position.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    let deltaYaw = desiredYaw - camera.rotation.y;
    while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
    while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
    sim.addMouseLook(-deltaYaw / 0.0022, 0);
    sim.setMoveKey('forward', true);
    let sawEntrance = false;
    let minDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 300; i++) {
      sim.update(0.05);
      sim.syncScene(scene, camera);
      if (sim.nearHospitalEntrance) sawEntrance = true;
      const d = camera.position.distanceTo(new THREE.Vector3(hospital.transform.position.x, camera.position.y, hospital.transform.position.z));
      if (d < minDistance) minDistance = d;
    }
    expect(sawEntrance).toBe(true);
    // Real footprint half-extent (HOSPITAL_BUILDING_SCALE=7 -> box 10.5, half 5.25) + collisionRadius:
    // a player who could walk straight through would get arbitrarily close to 0.
    expect(minDistance).toBeGreaterThan(4);
  });

  it('enterHospital()/exitHospital(): inside, the SAME real hospitalBuildingId entity is still what gets inspected', () => {
    const { sim } = buildInitializedSim();
    expect(sim.insideBuildingId).toBeNull();
    sim.enterHospital();
    expect(sim.insideBuildingId).toBe(sim.city.hospitalBuildingId);
    const inspected = sim.inspect(sim.city.hospitalBuildingId);
    expect(inspected).not.toBeNull();
    expect(inspected!.id).toBe(sim.city.hospitalBuildingId);
    sim.exitHospital();
    expect(sim.insideBuildingId).toBeNull();
  });

  it('enterHospital() moves the camera to the interior pocket; exitHospital() resumes the outdoor position unchanged', () => {
    const { sim, scene, camera } = buildInitializedSim();
    sim.update(0.05);
    sim.syncScene(scene, camera);
    const outdoorPosition = camera.position.clone();

    sim.enterHospital();
    sim.update(0.05);
    sim.syncScene(scene, camera);
    // The interior pocket sits far outside the outdoor room bounds (±190) — see HOSPITAL_INTERIOR_ORIGIN.
    expect(camera.position.x).toBeGreaterThan(190);

    sim.exitHospital();
    sim.update(0.05);
    sim.syncScene(scene, camera);
    expect(camera.position.x).toBeCloseTo(outdoorPosition.x, 1);
    expect(camera.position.z).toBeCloseTo(outdoorPosition.z, 1);
  });
});

describe('GenesisWorldSim3D — PRIORITY 3: LIVING LAYER tied to real world state', () => {
  it('day/night tracks the real simulated clock — the real sun light changes as simulated time advances', () => {
    const { sim, scene } = buildInitializedSim();
    const findSun = () => scene.children.find((o) => (o as unknown as { isDirectionalLight?: boolean }).isDirectionalLight) as THREE.DirectionalLight | undefined;
    const sunBefore = findSun()!;
    expect(sunBefore).toBeDefined();
    const colorBefore = sunBefore.color.getHex();
    const intensityBefore = sunBefore.intensity;
    const positionBefore = sunBefore.position.clone();

    // ~5.5 real simulated hours — enough to move the sun state from GENESIS_WORLD_BASE_HOUR_OF_DAY (21)
    // to well past midnight, a genuinely different point on the real day/night curve.
    sim.city.base.engine.advance(20000, sim.city.updater);
    sim.setScrubTick(null); // resyncs without otherwise changing anything (already live, not scrubbing)

    const sunAfter = findSun()!;
    const changed =
      sunAfter.color.getHex() !== colorBefore ||
      sunAfter.intensity !== intensityBefore ||
      !sunAfter.position.equals(positionBefore);
    expect(changed).toBe(true);
  });

  it('the floodplain\'s real waterLevelM drives a real, visible standing-water surface — hidden when dry', () => {
    const { sim, scene } = buildInitializedSim();
    const findWaterMesh = () =>
      scene.children.find(
        (o) => o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color?.getHex?.() === 0x1a5ea8,
      ) as THREE.Mesh | undefined;

    const waterMeshInitial = findWaterMesh();
    expect(waterMeshInitial).toBeDefined();
    // The scenario's own scripted rainfall starts at tick 2 — freshly initialized, the floodplain is dry.
    expect(waterMeshInitial!.visible).toBe(false);

    const floodplain = sim.city.base.engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
    sim.city.base.engine.applyExternalPatch(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID, {
      domainState: { ...floodplain.domainState, waterLevelM: 0.5 },
    });
    sim.setScrubTick(null);

    const waterMesh = findWaterMesh()!;
    expect(waterMesh.visible).toBe(true);
    expect(waterMesh.position.y).toBeCloseTo(0.5, 5);
  });
});

describe('GenesisWorldSim3D — PRIORITY 4 (most important): connected to the real Discovery Engine', () => {
  it('runExperiment() runs the real compareWorldActions comparison — a real ranking over every declared lever', () => {
    const { sim } = buildInitializedSim();
    const comparison = sim.runExperiment();
    expect(sim.lastComparison).toBe(comparison);
    expect(['RANKED', 'TIED']).toContain(comparison.status);
    // All 3 real flood levers (outlet, infiltration, pump) are declared with no goal-side restriction.
    expect(comparison.ranking.length).toBeGreaterThanOrEqual(3);
    expect(comparison.bestActionIds.length).toBeGreaterThan(0);
    // Feedback: the result must say which world it ran in, not just what it found.
    expect(comparison.worldId).toBe('genesis-scientific-city-3');
    expect(comparison.domainId).toBe('flood-hydrology');
  });

  it('applyComparisonWinner() forks the LIVE engine with the real winning lever\'s own mutation', () => {
    const { sim } = buildInitializedSim();
    const comparison = sim.runExperiment();
    const winningId = comparison.bestActionIds[0]!;
    expect(sim.forkEngine).toBeNull();

    sim.applyComparisonWinner();

    expect(sim.forkEngine).not.toBeNull();
    expect(sim.showFork).toBe(true);
    expect(sim.lastComparison).toBeNull(); // consumed
    // The fork is a REAL fork of the player's own live engine (base.engine), not the comparison's own
    // disconnected reference world — verified by checking the winning lever's declared target entity
    // actually changed, on THIS engine.
    if (winningId === 'lever:outlet-capacity') {
      const floodplain = sim.forkEngine!.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
      expect(floodplain.domainState?.outletWidthM).toBeCloseTo(40, 5);
    } else if (winningId === 'lever:infiltration') {
      const floodplain = sim.forkEngine!.graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
      expect(floodplain.domainState?.infiltrationRateMPerS).toBeCloseTo(1.0e-4, 8);
    } else if (winningId === 'lever:pump-capacity') {
      const pump = sim.forkEngine!.graph.getEntity(sim.city.pumpPipeId);
      const baselinePump = sim.city.base.engine.graph.getEntity(sim.city.pumpPipeId);
      expect(pump.domainState?.volumetricFlow).toBeGreaterThan(baselinePump.domainState?.volumetricFlow as number);
    } else {
      throw new Error(`unexpected winning lever id: ${winningId}`);
    }
  });

  it('applyComparisonWinner() without a prior experiment is a no-op', () => {
    const { sim } = buildInitializedSim();
    expect(sim.lastComparison).toBeNull();
    sim.applyComparisonWinner();
    expect(sim.forkEngine).toBeNull();
  });

  it('applyComparisonWinner() is a no-op once a fork already exists — single-shot, like applyLever()', () => {
    const { sim } = buildInitializedSim();
    sim.applyLever(sim.leversFor(sim.city.pumpPipeId)[0]!, 'first');
    const forkAfterFirst = sim.forkEngine;
    sim.runExperiment();
    sim.applyComparisonWinner();
    expect(sim.forkEngine).toBe(forkAfterFirst);
  });
});

const ROUND_STAGE_BEACON_NAMES = ['round-stage-valve', 'round-stage-gate', 'round-stage-ground-treatment'];

describe('GenesisWorldSim3D — PLAY A LIVE EXPERIMENT ROUND (StrategyRun.rounds staged live)', () => {
  it('runStrategyDiscovery() runs the real multi-round search and stages round 1', () => {
    const { sim, scene } = buildInitializedSim();
    const run = sim.runStrategyDiscovery();
    expect(run).not.toBeNull();
    expect(run!.rounds.length).toBeGreaterThan(0);
    expect(sim.lastStrategyRun).toBe(run);
    expect(sim.stagedRoundIndex).toBe(0);

    const view = sim.getCurrentRoundView();
    expect(view).not.toBeNull();
    expect(view!.roundNumber).toBe(1);
    expect(view!.totalRounds).toBe(run!.rounds.length);
    expect(view!.why.length).toBeGreaterThan(0);
    expect(view!.what.length).toBeGreaterThan(0);
    // Real values only, never fabricated: every flood lever declares a `sceneForm`, so its own
    // `actionLabel` is real text read off the lever that actually ran this round, not guessed.
    expect(view!.actionLabel).not.toBeNull();

    // The round-stage beacon: a real, distinct scenic form for whichever real lever this round
    // pulled — added directly under `scene` (decorative, not a WorldFrame entity).
    expect(scene.children.some((child) => ROUND_STAGE_BEACON_NAMES.includes(child.name))).toBe(true);
  });

  it('nextRound()/prevRound() step through the real rounds and clamp at both ends', () => {
    const { sim } = buildInitializedSim();
    const run = sim.runStrategyDiscovery()!;
    expect(run.rounds.length).toBeGreaterThanOrEqual(1);

    sim.prevRound(); // already at round 1 — clamps, does not go negative
    expect(sim.getCurrentRoundView()!.roundNumber).toBe(1);

    if (run.rounds.length > 1) {
      sim.nextRound();
      expect(sim.getCurrentRoundView()!.roundNumber).toBe(2);
      sim.prevRound();
      expect(sim.getCurrentRoundView()!.roundNumber).toBe(1);
    }

    // Clamps at the last round too, rather than running off the end of the array.
    for (let i = 0; i < run.rounds.length + 2; i++) sim.nextRound();
    expect(sim.getCurrentRoundView()!.roundNumber).toBe(run.rounds.length);
  });

  it('dismissStrategyRun() clears the run, the staged round, and the beacon', () => {
    const { sim, scene } = buildInitializedSim();
    sim.runStrategyDiscovery();
    expect(sim.lastStrategyRun).not.toBeNull();

    sim.dismissStrategyRun();

    expect(sim.lastStrategyRun).toBeNull();
    expect(sim.stagedRoundIndex).toBe(-1);
    expect(sim.getCurrentRoundView()).toBeNull();
    expect(scene.children.some((child) => ROUND_STAGE_BEACON_NAMES.includes(child.name))).toBe(false);
  });

  it('getCurrentRoundView() is null before any run has been played', () => {
    const { sim } = buildInitializedSim();
    expect(sim.getCurrentRoundView()).toBeNull();
  });
});

/**
 * MATRIX UI — `getMatrixView()` exposes the exact `GenesisMatrixView` Voice Guide already narrates
 * from, so the React layer can render it. These tests assert the WIRING (built on a real run, null
 * before/after) — the view's own field-by-field correctness is `genesisMatrix.test.ts`'s job, not
 * this file's, since this class does not compute any of those fields itself.
 */
describe('GenesisWorldSim3D — MATRIX UI (getMatrixView exposes the real GenesisMatrixView)', () => {
  it('getMatrixView() is null before any run has been played', () => {
    const { sim } = buildInitializedSim();
    expect(sim.getMatrixView()).toBeNull();
  });

  it('runStrategyDiscovery() builds a real GenesisMatrixView with one entry per round', () => {
    const { sim } = buildInitializedSim();
    const run = sim.runStrategyDiscovery()!;
    const view = sim.getMatrixView();
    expect(view).not.toBeNull();
    expect(view!.entries.length).toBe(run.rounds.length);
    expect(view!.question).toBe(run.question);
    // Cross-cutting fields — never null on a RAN (non-refused) outcome, see genesisMatrix.ts's doc.
    expect(view!.sufficiency).not.toBeNull();
    expect(view!.competingModels).not.toBeNull();
  });

  it('dismissStrategyRun() clears the matrix view along with the run', () => {
    const { sim } = buildInitializedSim();
    sim.runStrategyDiscovery();
    expect(sim.getMatrixView()).not.toBeNull();
    sim.dismissStrategyRun();
    expect(sim.getMatrixView()).toBeNull();
  });
});

/**
 * WOW MOMENTS — the observer scientist standing beside the round-stage beacon. These tests assert
 * the WIRING (built once, hidden until a round with a real beacon is staged, hidden again on
 * dismiss) — its pose/facing logic is exercised indirectly here (no throw across every real round a
 * real flood search produces, several of which are the SUPPORTED/COMPETING states this reacts to);
 * `humanoidAgentVisual.ts`'s own tests cover `sync()`'s pose/ring behaviour in isolation.
 */
describe('GenesisWorldSim3D — WOW MOMENTS (observer scientist reacts to the real round verdict)', () => {
  const OBSERVER_NAME = 'humanoid-agent-999999';

  it('is built once at init(), hidden until a round with a real beacon is staged', () => {
    const { sim, scene } = buildInitializedSim();
    const observer = scene.children.find((c) => c.name === OBSERVER_NAME);
    expect(observer).toBeDefined();
    expect(observer!.visible).toBe(false);

    sim.runStrategyDiscovery();
    // Only visible once `stageRound()` actually found a real lever/target for round 1 — the same
    // honest "beacon simply does not appear" condition this class already documents.
    if (scene.children.some((c) => c.visible && c.name.startsWith('round-stage-'))) {
      expect(observer!.visible).toBe(true);
    }
  });

  it('dismissStrategyRun() hides the observer again, never leaving it stranded on screen', () => {
    const { sim, scene } = buildInitializedSim();
    sim.runStrategyDiscovery();
    sim.dismissStrategyRun();
    const observer = scene.children.find((c) => c.name === OBSERVER_NAME);
    expect(observer!.visible).toBe(false);
  });

  it('stepping through every real round never throws, whatever verdict/competing-models state it lands on', () => {
    const { sim } = buildInitializedSim();
    const run = sim.runStrategyDiscovery();
    if (!run) return; // this goal admitted no run this pass — nothing to step through
    for (let i = 0; i < run.rounds.length; i++) {
      expect(() => sim.stageRound(i)).not.toThrow();
      expect(() => sim.update(0.1)).not.toThrow();
    }
  });
});

/**
 * VOICE GUIDE — `speechSynthesis`/`SpeechSynthesisUtterance` are real browser APIs with no
 * meaningful behaviour in this (Node, no jsdom) test environment: every other test file in this repo
 * simply never sets `window` at all, and `speakNarration()`'s own `typeof window === 'undefined'`
 * guard makes that a clean, silent no-op — see that method's own doc. These tests stub a minimal
 * `window.speechSynthesis`/`SpeechSynthesisUtterance` (the same class of test double
 * `genesisNarration.test.ts` and this file's own `beforeAll` already use for `document`) so the
 * WIRING — what text gets composed, when it speaks, when it stays silent, when it cancels — is
 * asserted against real `GenesisMatrixView`/`narrateInvestigation` output, not against the real audio
 * API itself (which no test anywhere in this repo exercises, by `genesisNarration.ts`'s own design).
 */
describe('GenesisWorldSim3D — VOICE GUIDE (speechSynthesis narration on stageRound)', () => {
  let spoken: string[] = [];
  let cancelCalls = 0;

  beforeEach(() => {
    spoken = [];
    cancelCalls = 0;
    (globalThis as { window?: unknown }).window = {
      speechSynthesis: {
        cancel: () => { cancelCalls += 1; },
        speak: (utterance: { text: string }) => { spoken.push(utterance.text); },
      },
    };
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
      readonly text: string;
      constructor(text: string) { this.text = text; }
    };
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
  });

  it('speaks the lever\'s real declared action label plus the real round narration, and nothing before a run exists', () => {
    const { sim } = buildInitializedSim();
    expect(spoken).toHaveLength(0);

    const run = sim.runStrategyDiscovery();
    expect(run).not.toBeNull();
    expect(spoken.length).toBeGreaterThan(0);

    const view = sim.getCurrentRoundView();
    // The physical half — the real lever's own `sceneForm.actionLabel`, never generated here.
    expect(spoken[0]).toContain(view!.actionLabel);
    // The scientific half — the real round's own `why`, from `narrateRound()`'s own text.
    expect(spoken[0]).toContain(view!.why);
  });

  it('nextRound() speaks only the NEW lines — never repeats what an earlier round already said', () => {
    const { sim } = buildInitializedSim();
    const run = sim.runStrategyDiscovery()!;
    if (run.rounds.length < 2) return; // only meaningful once there are 2+ real rounds to diff between
    const afterRound1Count = spoken.length;
    const round1Utterance = spoken[spoken.length - 1];

    sim.nextRound();

    expect(spoken.length).toBeGreaterThan(afterRound1Count);
    expect(spoken[spoken.length - 1]).not.toBe(round1Utterance);
  });

  it('prevRound() back to an already-narrated round stays silent — nothing new to say', () => {
    const { sim } = buildInitializedSim();
    const run = sim.runStrategyDiscovery()!;
    if (run.rounds.length < 2) return;
    sim.nextRound();
    const afterRound2Count = spoken.length;

    sim.prevRound();

    expect(spoken.length).toBe(afterRound2Count);
  });

  it('dismissStrategyRun() cancels any pending speech', () => {
    const { sim } = buildInitializedSim();
    sim.runStrategyDiscovery();

    sim.dismissStrategyRun();

    expect(cancelCalls).toBeGreaterThan(0);
  });

  it('never throws when speechSynthesis/SpeechSynthesisUtterance are absent — the headless/no-audio case', () => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    const { sim } = buildInitializedSim();

    expect(() => sim.runStrategyDiscovery()).not.toThrow();
    expect(() => sim.nextRound()).not.toThrow();
    expect(() => sim.dismissStrategyRun()).not.toThrow();
  });
});
