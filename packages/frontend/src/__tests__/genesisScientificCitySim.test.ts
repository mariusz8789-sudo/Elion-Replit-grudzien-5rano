import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';
import { createWaterInfrastructureAdapter } from '../core/three/graphics/waterInfrastructureBridge';
import type { WorldFrameEntity } from '../core/three/graphics/worldFrame';
import type { EntityVisualSpec } from '../core/three/graphics/worldFrameRenderer';

/**
 * CITY INFRASTRUCTURE INTEGRATION 1.0 — the real pump-pipe-system -> hospital cross-domain object.
 * The full `init()` loads real procedural textures (`createPBRMaterial`) via `document.
 * createElement('canvas')`, which this test environment doesn't provide — same reason
 * `highFidelitySlice3DOrbitDirection.test.ts` bypasses `init()` for `HighFidelityStreetSlice3D`.
 * None of the methods under test here (target resolution, camera framing math, the failure fork,
 * causal explanation, branch comparison) touch materials/textures, so this sets only the one field
 * `applyObservationTarget` needs (`THREE`, for a plain `Vector3`) without building the scene.
 */
function initializedSim(): GenesisScientificCitySim {
  const sim = new GenesisScientificCitySim();
  Object.assign(sim as unknown as Record<string, unknown>, { THREE });
  return sim;
}

describe('GenesisScientificCitySim.resolveNamedWorldTarget — a real graph scan, not a hardcoded id', () => {
  it('resolves every real pump synonym to the SAME real pump-pipe-system entity', () => {
    const sim = initializedSim();
    const ids = sim.getIds();
    for (const query of ['pump', 'the water pump', 'hospital pump', 'pump station', 'pipe', 'the water pipe', 'pompa']) {
      const match = sim.resolveNamedWorldTarget(query);
      expect(match?.id, `query "${query}"`).toBe(ids.pumpPipeId);
      expect(match?.kind).toBe('pump-pipe-system');
    }
  });

  it('REGRESSION: resolves every real Polish inflection of "pompa" — found live via "Pokaż pompę."', () => {
    // Polish nouns decline; a whole-word check against the nominative "pompa" alone silently
    // failed on "Pokaż pompę." (accusative) and "Wyłącz pompę." — both real Scientific Control
    // Loop sentences from the mission itself.
    const sim = initializedSim();
    const ids = sim.getIds();
    for (const form of ['pompę', 'pompy', 'pompie', 'pompą', 'Pokaż pompę.', 'Wyłącz pompę.']) {
      expect(sim.resolveNamedWorldTarget(form)?.id, `form "${form}"`).toBe(ids.pumpPipeId);
    }
  });

  it('resolves "hospital"/"szpital" (and its declined forms) to the real hospital building', () => {
    const sim = initializedSim();
    expect(sim.resolveNamedWorldTarget('the hospital')?.id).toBe(sim.getIds().hospitalBuildingId);
    expect(sim.resolveNamedWorldTarget('szpital')?.id).toBe(sim.getIds().hospitalBuildingId);
    expect(sim.resolveNamedWorldTarget('szpitala')?.id).toBe(sim.getIds().hospitalBuildingId);
  });

  it('honestly returns null for something that does not exist in this world', () => {
    const sim = initializedSim();
    expect(sim.resolveNamedWorldTarget('the reactor core')).toBeNull();
    expect(sim.resolveNamedWorldTarget('')).toBeNull();
  });
});

describe('GenesisScientificCitySim.applyObservationTarget — real camera framing', () => {
  it('found: true sets a real orbit target and a positive standoff derived from CameraRig math', () => {
    const sim = initializedSim();
    const outcome = sim.applyObservationTarget('the pump', 'SCIENTIFIC');
    expect(outcome.found).toBe(true);
    expect(sim.getOrbitTarget()).not.toBeNull();
    expect(sim.getOrbitFocusDistance()).toBeGreaterThan(0);
  });

  it('a WIDE intent produces a larger standoff than MACRO for the same target', () => {
    const wideSim = initializedSim();
    wideSim.applyObservationTarget('the hospital', 'WIDE');
    const wideDistance = wideSim.getOrbitFocusDistance()!;

    const macroSim = initializedSim();
    macroSim.applyObservationTarget('the hospital', 'MACRO');
    const macroDistance = macroSim.getOrbitFocusDistance()!;

    expect(wideDistance).toBeGreaterThan(macroDistance);
  });

  it('found: false for an unknown target — camera is never moved on a guess', () => {
    const sim = initializedSim();
    const outcome = sim.applyObservationTarget('the reactor core', 'SCIENTIFIC');
    expect(outcome.found).toBe(false);
    expect(sim.getOrbitTarget()).toBeNull();
  });
});

describe('GenesisScientificCitySim.triggerPumpFailure — the real solver + cascade, not a fake flag', () => {
  it('the pump stays healthy on the untouched baseline before any failure is triggered', () => {
    const sim = initializedSim();
    sim.step(2);
    const stats = sim.getStats();
    expect(stats.pumpFlow).toBeGreaterThan(0);
    expect(stats.hospitalInterrupted).toBe(0);
  });

  it('forking and raising pump flow trips the REAL overload cascade end to end', () => {
    const sim = initializedSim();
    const outcome = sim.triggerPumpFailure();
    expect(outcome.tripped).toBe(true);
    expect(outcome.hospitalInterrupted).toBe(true);

    const stats = sim.getStats();
    expect(stats.viewingFailureBranch).toBe(1);
    expect(stats.pumpFlow).toBe(0); // tripped -> volumetricFlow patched to 0 by the REAL cascade rule
    expect(stats.hospitalInterrupted).toBe(1);
  });

  it('the baseline branch is untouched by the fork — real branch isolation, not a shared mutation', () => {
    const sim = initializedSim();
    sim.triggerPumpFailure();
    sim.setViewingBranch('BASELINE');
    const baselineStats = sim.getStats();
    expect(baselineStats.pumpFlow).toBeGreaterThan(0);
    expect(baselineStats.hospitalInterrupted).toBe(0);
  });
});

describe('GenesisScientificCitySim.explainWaterServiceLoss — the real causal chain', () => {
  it('is null before any failure has been triggered — never a guessed explanation', () => {
    const sim = initializedSim();
    expect(sim.explainWaterServiceLoss()).toBeNull();
  });

  it('walks the real chain: population access impaired <- hospital service interrupted <- pump tripped <- the real solver step', () => {
    const sim = initializedSim();
    sim.triggerPumpFailure();
    const chain = sim.explainWaterServiceLoss();
    expect(chain).not.toBeNull();
    const types = chain!.map((step) => step.type);
    expect(types).toContain('hydraulics.pumppipe.tripped');
    expect(types).toContain('building.waterservice.interrupted');
    expect(types).toContain('population.hospitalaccess.impaired');
    // Root-first ordering: the trip must appear before the hospital interruption, which
    // must appear before the population-access event.
    expect(types.indexOf('hydraulics.pumppipe.tripped')).toBeLessThan(types.indexOf('building.waterservice.interrupted'));
    expect(types.indexOf('building.waterservice.interrupted')).toBeLessThan(types.indexOf('population.hospitalaccess.impaired'));
  });
});

describe('GenesisScientificCitySim.getComparison — WORLD A vs WORLD B, the real branch diff', () => {
  it('is null before any failure has been triggered', () => {
    const sim = initializedSim();
    expect(sim.getComparison()).toBeNull();
  });

  it('shows a real, non-trivial difference in pump and hospital state between branches', () => {
    const sim = initializedSim();
    sim.triggerPumpFailure();
    const rows = sim.getComparison();
    expect(rows).not.toBeNull();
    const pumpRow = rows!.find((r) => r.label === 'Pump')!;
    const hospitalRow = rows!.find((r) => r.label === 'Hospital')!;
    expect(pumpRow.equal).toBe(false);
    expect(pumpRow.baseline?.volumetricFlow).toBeGreaterThan(0);
    expect(pumpRow.failure?.volumetricFlow).toBe(0);
    expect(hospitalRow.equal).toBe(false);
    expect(hospitalRow.failure?.waterServiceInterrupted).toBe(1);
  });
});

describe('GenesisScientificCitySim — TRINITY INTEGRATION 3.0: the pump renders through C2\'s real bridge, not a duplicate system', () => {
  function simWithWaterAdapter(): GenesisScientificCitySim {
    const sim = initializedSim();
    const adapter = createWaterInfrastructureAdapter(THREE, { housingMaterial: new THREE.MeshStandardMaterial() });
    Object.assign(sim as unknown as Record<string, unknown>, { waterAdapter: adapter });
    return sim;
  }

  it('resolveVisual for the pump\'s own visualHint delegates to C2\'s createWaterInfrastructureAdapter — the returned object is literally C2\'s createPump group', () => {
    const sim = simWithWaterAdapter();
    const pumpEntity: WorldFrameEntity = {
      id: sim.getIds().pumpPipeId, position: [0, 0, 0], status: 'NORMAL', grounding: 'MODELED', visualHint: 'object:water-pump',
    };
    const spec: EntityVisualSpec = (sim as unknown as { resolveVisual(entity: WorldFrameEntity): EntityVisualSpec }).resolveVisual(pumpEntity);
    expect(spec.kind).toBe('object');
    // 'genesis-water-pump' is the exact name C2's own createPump() (graphics/waterInfrastructure.ts)
    // assigns its group — proof this is really their object, not a look-alike built independently.
    expect(spec.kind === 'object' ? spec.object.name : null).toBe('genesis-water-pump');
  });

  it('a real FAILED status (from the real solver output) drives the bridge\'s own visual state, not this file\'s own mapping', () => {
    const sim = simWithWaterAdapter();
    const pumpEntity: WorldFrameEntity = {
      id: sim.getIds().pumpPipeId, position: [0, 0, 0], status: 'NORMAL', grounding: 'MODELED', visualHint: 'object:water-pump',
    };
    const spec = (sim as unknown as { resolveVisual(entity: WorldFrameEntity): EntityVisualSpec }).resolveVisual(pumpEntity);
    const object = spec.kind === 'object' ? spec.object : null;
    expect(object).not.toBeNull();
    const failedEntity: WorldFrameEntity = { ...pumpEntity, status: 'FAILED' };
    (sim as unknown as { updateVisual(entity: WorldFrameEntity, object: THREE.Object3D): void }).updateVisual(failedEntity, object!);
    // The bridge tags notModeled itself; a real recognized status on a MODELED entity must clear it.
    expect(object!.userData.notModeled).toBe(false);
  });

  it('an entity with NOT_MODELED grounding never gets a fabricated status through the bridge', () => {
    const sim = simWithWaterAdapter();
    const pumpEntity: WorldFrameEntity = {
      id: sim.getIds().pumpPipeId, position: [0, 0, 0], status: 'FAILED', grounding: 'NOT_MODELED', visualHint: 'object:water-pump',
    };
    const spec = (sim as unknown as { resolveVisual(entity: WorldFrameEntity): EntityVisualSpec }).resolveVisual(pumpEntity);
    expect(spec.kind === 'object' ? spec.object.userData.notModeled : null).toBe(true);
  });

});

describe('GenesisScientificCitySim — replay determinism (mission section 11)', () => {
  it('the same seed and the same intervention produce the same hydraulic result and the same causal chain', () => {
    const run = () => {
      const sim = initializedSim();
      const outcome = sim.triggerPumpFailure();
      const chain = sim.explainWaterServiceLoss();
      return { outcome: { tripped: outcome.tripped, hospitalInterrupted: outcome.hospitalInterrupted }, chain: chain!.map((s) => s.type), stats: sim.getStats() };
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});

describe('GenesisScientificCitySim.triggerRainfallScenario — C1 SCIENTIFIC DIRECTOR: the real scripted event on the LIVE baseline', () => {
  it('is a no-op status before it is triggered', () => {
    const sim = initializedSim();
    expect(sim.isRainfallScenarioActive()).toBe(false);
    expect(sim.describeCurrentState().pumpTripped).toBe(false);
  });

  it('schedules the REAL rainfall event and lets the REAL cascade trip the pump, on the baseline (not a fork)', () => {
    const sim = initializedSim();
    const outcome = sim.triggerRainfallScenario();
    expect(outcome.tripped).toBe(true);
    expect(outcome.hospitalInterrupted).toBe(true);
    expect(sim.isRainfallScenarioActive()).toBe(true);
    // Still the baseline branch — this establishes the scenario, it is not a counterfactual fork.
    expect(sim.getViewingBranch()).toBe('BASELINE');
    expect(sim.getStats().hasFailureBranch).toBe(0);
  });

  it('is idempotent — a second call returns the already-computed real outcome, does not re-fork or re-advance', () => {
    const sim = initializedSim();
    const first = sim.triggerRainfallScenario();
    const tickAfterFirst = sim.getStats().tick;
    const second = sim.triggerRainfallScenario();
    expect(second).toEqual(first);
    expect(sim.getStats().tick).toBe(tickAfterFirst);
  });

  it('explainWaterServiceLoss works on the rainfall-triggered BASELINE — the same real causal chain as the fork-based failure path', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const chain = sim.explainWaterServiceLoss();
    expect(chain).not.toBeNull();
    const types = chain!.map((step) => step.type);
    expect(types).toContain('hydraulics.pumppipe.tripped');
    expect(types).toContain('building.waterservice.interrupted');
    expect(types).toContain('population.hospitalaccess.impaired');
  });

  it('describeCurrentState reports the real tripped/interrupted state, grounded in real solver output', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const summary = sim.describeCurrentState();
    expect(summary.pumpTripped).toBe(true);
    expect(summary.pumpFlow).toBe(0);
    expect(summary.hospitalInterrupted).toBe(true);
    expect(summary.narration.toLowerCase()).toContain('tripped');
  });
});

describe('GenesisScientificCitySim — describeScenarioLimitations (Genesis Urban Resilience Engine success criterion 8)', () => {
  it('before any scenario has run: nothing scenario-specific to disclose', () => {
    const sim = initializedSim();
    expect(sim.describeScenarioLimitations()).toEqual([]);
  });

  it('after the real scenario runs: surfaces the REAL provenance notes already on the fired events, not invented text', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const notes = sim.describeScenarioLimitations();
    expect(notes.length).toBeGreaterThan(0);
    // The rainfall event's own real provenance note (genesisScientificCity3.ts's rainfallSchedule).
    expect(notes.some((note) => note.includes('Scripted scenario trigger'))).toBe(true);
    // The pump trip cascade rule's own real provenance note (pumpOverloadTripRule).
    expect(notes.some((note) => note.includes('Engineering-judgment overload threshold'))).toBe(true);
  });

  it('is deduplicated — asking after multiple ticks does not repeat the same note', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const notes = sim.describeScenarioLimitations();
    expect(new Set(notes).size).toBe(notes.length);
  });
});

describe('GenesisScientificCitySim — rainfall-intensity counterfactual (REAL as of C3 Phase 5)', () => {
  it('before any scenario has run: honestly asks for a baseline first, not a permanent refusal', () => {
    const sim = initializedSim();
    expect(sim.runRainfallIntensityCounterfactual(30)).toBeNull();
    const gap = sim.getRainfallCounterfactualGap();
    expect(gap.toLowerCase()).toContain('baseline');
    expect(gap.toLowerCase()).not.toContain('not_modelled');
  });

  it('after the real scenario runs: a real, lower-intensity fork can genuinely fail to trip the pump', () => {
    const sim = initializedSim();
    const baseline = sim.triggerRainfallScenario();
    expect(baseline.tripped).toBe(true);

    const outcome = sim.runRainfallIntensityCounterfactual(30);
    expect(outcome).not.toBeNull();
    expect(outcome!.percentChange).toBe(30);
    expect(outcome!.adjustedIntensityMmPerHour).toBeCloseTo(56, 5); // 80 * 0.7
    expect(outcome!.baselineTripped).toBe(true);
    expect(outcome!.baselineHospitalInterrupted).toBe(true);
    // 56mm/h is still well above the ~18.3mm/h trip threshold, so this specific
    // percentage still trips — the point is that it's REALLY solved, not scripted.
    expect(outcome!.tripped).toBe(true);
  });

  it('a low enough intensity genuinely avoids tripping the pump — the real point of this counterfactual', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const outcome = sim.runRainfallIntensityCounterfactual(90); // 80 * 0.1 = 8mm/h, well under the trip threshold
    expect(outcome).not.toBeNull();
    expect(outcome!.tripped).toBe(false);
    expect(outcome!.hospitalInterrupted).toBe(false);
    expect(outcome!.baselineTripped).toBe(true); // the real baseline is unaffected by asking a hypothetical
  });

  it('a negative percentChange genuinely raises intensity — the "what if rainfall is higher" direction', () => {
    // percentChange is signed: positive lowers intensity, negative raises it. This is the exact
    // gap the Genesis Urban Resilience Engine audit found -- observationIntent.ts previously had no
    // way to express "30% higher" at all, only "lower". The sim-level math already supported it.
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const outcome = sim.runRainfallIntensityCounterfactual(-30);
    expect(outcome).not.toBeNull();
    expect(outcome!.percentChange).toBe(-30);
    expect(outcome!.adjustedIntensityMmPerHour).toBeCloseTo(104, 5); // 80 * 1.3
    expect(outcome!.tripped).toBe(true); // more rain than the already-tripping baseline still trips
  });

  it('is idempotent per percentage — asking the same percentage twice returns the cached outcome, not a second fork', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const first = sim.runRainfallIntensityCounterfactual(30);
    const second = sim.runRainfallIntensityCounterfactual(30);
    expect(second).toEqual(first);
  });

  it('does not mutate the real baseline outcome', () => {
    const sim = initializedSim();
    const baseline = sim.triggerRainfallScenario();
    sim.runRainfallIntensityCounterfactual(90);
    expect(sim.describeCurrentState().pumpTripped).toBe(baseline.tripped);
  });
});

describe('GenesisScientificCitySim.getChallengeAction — "Challenge this result" (Layered World Dashboard)', () => {
  it('is null before any baseline scenario has run — nothing to challenge yet', () => {
    const sim = initializedSim();
    expect(sim.getChallengeAction()).toBeNull();
  });

  it('names the rainfall-higher-30% counterfactual first, right after the baseline runs', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    expect(sim.getChallengeAction()).toEqual({ kind: 'RAINFALL_HIGHER_30', label: 'What if rainfall were 30% higher?' });
  });

  it('names the pump-failure fork next, once the rainfall-higher-30% counterfactual has run', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    sim.runRainfallIntensityCounterfactual(-30);
    expect(sim.getChallengeAction()).toEqual({ kind: 'PUMP_FAILURE_FORK', label: 'What if the pump fails outright?' });
  });

  it('is null once both real counterfactuals this scoped MVP names have run', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    sim.runRainfallIntensityCounterfactual(-30);
    sim.triggerPumpFailure();
    expect(sim.getChallengeAction()).toBeNull();
  });

  it('does not treat a DIFFERENT percentage counterfactual as satisfying the named 30%-higher challenge', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    sim.runRainfallIntensityCounterfactual(30); // 30% LOWER, not the +30 (higher) this challenge names
    expect(sim.getChallengeAction()).toEqual({ kind: 'RAINFALL_HIGHER_30', label: 'What if rainfall were 30% higher?' });
  });
});

describe('GenesisScientificCitySim — replay (real history, via getFrameState\'s own timestamp param)', () => {
  it('returns null when there is nothing yet to replay', () => {
    const sim = initializedSim();
    expect(sim.startReplay()).toBeNull();
    expect(sim.isReplaying()).toBe(false);
  });

  it('replays the real interval from the rainfall trigger to the present, one real tick at a time', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    const toTick = sim.getStats().tick;
    const window = sim.startReplay();
    expect(window).not.toBeNull();
    expect(window!.toTick).toBe(toTick);
    expect(sim.isReplaying()).toBe(true);
    expect(sim.getReplayTick()).toBe(window!.fromTick);

    let steps = 0;
    while (sim.advanceReplay()) steps += 1;
    expect(steps).toBeGreaterThan(0);
    expect(sim.isReplaying()).toBe(false);
    expect(sim.getReplayTick()).toBeNull();
  });

  it('replaying a fork starts from its own real forkedAtTick, not tick 0', () => {
    const sim = initializedSim();
    sim.step(5);
    const forkTick = sim.getStats().tick;
    sim.triggerPumpFailure();
    const window = sim.startReplay();
    expect(window!.fromTick).toBe(forkTick);
  });

  it('stopReplay hands control back to the live view immediately', () => {
    const sim = initializedSim();
    sim.triggerRainfallScenario();
    sim.startReplay();
    sim.stopReplay();
    expect(sim.isReplaying()).toBe(false);
  });
});
