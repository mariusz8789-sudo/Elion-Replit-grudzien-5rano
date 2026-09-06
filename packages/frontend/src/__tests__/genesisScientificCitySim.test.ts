import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GenesisScientificCitySim } from '../core/three/genesisScientificCitySim';

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

  it('resolves "hospital"/"szpital" to the real hospital building', () => {
    const sim = initializedSim();
    expect(sim.resolveNamedWorldTarget('the hospital')?.id).toBe(sim.getIds().hospitalBuildingId);
    expect(sim.resolveNamedWorldTarget('szpital')?.id).toBe(sim.getIds().hospitalBuildingId);
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
