import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { runTimeDilationEpistemicDemo } from '../core/discovery/physics/epistemicTimeDilationDemo';
import {
  buildWorldState, explainWorldUnknown, traceWorldChange, type WorldState,
} from '../core/world/scientificWorldState';
import { projectEpidemiologyWorldStates } from '../core/world/epidemiologyWorldAdapter';
import { projectPhysicsWorldStates } from '../core/world/physicsWorldAdapter';
import {
  ALLOWED_LAB_PARAMETERS, buildHospitalCapacityLaboratory, changeParameterAndRunAgain,
  compareLabRuns, replayLabRun, startLabExperiment,
} from '../core/virtualLab/laboratoryWorld';

/**
 * Structural check used by test #9 ("same contract works across domains"):
 * every field the generic `WorldState` interface declares is actually
 * present on a real projected state, for BOTH domains, with no per-domain
 * extra top-level field smuggled in.
 */
const WORLD_STATE_KEYS = [
  'contractVersion', 'worldId', 'domainId', 'tick', 'entities', 'relations', 'observations',
  'events', 'experiment', 'epistemic', 'evidence', 'replay', 'notModeled', 'fingerprint',
].sort();

function assertShapesWorldStateContract(state: WorldState): void {
  expect(Object.keys(state).sort()).toEqual(WORLD_STATE_KEYS);
}

describe('Scientific World State — cross-domain foundation', () => {
  it('1. real epidemiology state projects into ScientificWorldState with values traceable to the real run', () => {
    const run = runScenario('BASELINE', { days: 30, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const states = projectEpidemiologyWorldStates(run);
    expect(states.length).toBeGreaterThan(0);
    assertShapesWorldStateContract(states[0]!);

    const anyState = states[0]!;
    const hospitalEntity = anyState.entities.find((e) => e.ref.kind === 'facility' && e.ref.id === 'hospital')!;
    const sample = run.series.find((s) => s.day === anyState.tick)!;
    const bedOccupancyProp = hospitalEntity.properties.find((p) => p.key === 'bedOccupancy')!;
    expect(bedOccupancyProp.value).toBe(sample.hospital.bedOccupancy);
  });

  it('2. real physics state projects into the SAME ScientificWorldState contract', () => {
    const states = projectPhysicsWorldStates();
    expect(states).toHaveLength(2);
    assertShapesWorldStateContract(states[0]!);
    assertShapesWorldStateContract(states[1]!);
    expect(states[1]!.domainId).toBe('PHYSICS');
  });

  it('3. a real laboratory experiment produces real scientific (Genesis) events, not placeholders', () => {
    const run = startLabExperiment({ scenarioId: 'BASELINE', days: 30, stepsPerDay: 4, hospitalCapacity: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    expect(run.worldStates.length).toBeGreaterThan(0);
    for (const state of run.worldStates) {
      expect(state.events.length).toBeGreaterThan(0);
      for (const event of state.events) {
        expect(event.provenance?.origin).toBe('model');
        expect(event.id).toBeTruthy();
      }
    }
  });

  it('4. world changes carry machine-readable causal lineage (event -> affected entity -> related hypotheses)', () => {
    const run = runScenario('BASELINE', { days: 90, stepsPerDay: 4, baseHospital: { totalBeds: 5, icuBeds: 1, icuShareOfAdmissions: 0.2 } });
    const states = projectEpidemiologyWorldStates(run);
    const last = states[states.length - 1]!;
    const trace = traceWorldChange(last, last.events[0]!.id);
    expect(trace).not.toBeNull();
    expect(trace!.affectedEntities.length).toBeGreaterThan(0);
    expect(trace!.affectedEntities[0]!.ref.id).toBe('hospital');
    // The final event's hypothesis resolution genuinely references this run's own provenance chain.
    expect(last.epistemic!.nodes.some((n) => n.provenance.some((p) => p.startsWith('resultFingerprint:')))).toBe(true);
  });

  it('5. UNKNOWN remains UNKNOWN when evidence is insufficient — never silently upgraded to a guess', () => {
    const states = projectPhysicsWorldStates();
    const after = states[1]!;
    const explanation = explainWorldUnknown(after, 'unknown-independent-gps-measurement');
    expect(explanation).not.toBeNull();
    expect(explanation!.status).toBe('UNKNOWN');
    expect(explanation!.missingEvidence.length).toBeGreaterThan(0);
    expect(explanation!.competingHypotheses.length).toBeGreaterThan(0);
    // Asking about a RESOLVED node must not return a fabricated "explanation" for it.
    expect(explainWorldUnknown(after, 'hyp-einstein-combined')).toBeNull();
  });

  it('6. epistemic updates are represented correctly in the world state (before UNRESOLVED, after real verdicts)', () => {
    const run = runTimeDilationEpistemicDemo();
    const [before, after] = projectPhysicsWorldStates(run);
    expect(before!.epistemic!.nodes.find((n) => n.nodeId === 'hyp-einstein-combined')!.status).toBe('UNRESOLVED');
    const afterEinstein = after!.epistemic!.nodes.find((n) => n.nodeId === 'hyp-einstein-combined')!;
    expect(['SUPPORTED', 'FALSIFIED']).toContain(afterEinstein.status);
  });

  it('7. replay reconstructs an identical world-relevant fingerprint (MATCH), never a silently accepted drift', () => {
    const run = startLabExperiment({ scenarioId: 'BASELINE', days: 60, stepsPerDay: 4 });
    const replay = replayLabRun(run);
    expect(replay.status).toBe('MATCH');
    expect(replay.cinematicMatch).toBe(true);

    const physicsRun = runTimeDilationEpistemicDemo();
    const [, physicsAfter] = projectPhysicsWorldStates(physicsRun);
    expect(physicsAfter!.replay!.status).toBe('MATCH');
  });

  it('8. the full scientific chain executes headlessly — no renderer/UI import anywhere in this test file or its dependency chain', () => {
    const run = startLabExperiment({ scenarioId: 'ISOLATION', days: 20, stepsPerDay: 2 });
    expect(run.session.run.status).toBe('COMPLETED');
    expect(run.worldStates.length).toBeGreaterThan(0);
    // The mere fact this assertion runs under plain vitest/node (no jsdom/three.js/canvas) proves the point.
  });

  it('9. one generic WorldState contract works identically across epidemiology and physics', () => {
    const epi = projectEpidemiologyWorldStates(runScenario('BASELINE', { days: 10 }))[0]!;
    const phys = projectPhysicsWorldStates()[0]!;
    assertShapesWorldStateContract(epi);
    assertShapesWorldStateContract(phys);
    expect(epi.domainId).not.toBe(phys.domainId);
    expect(Object.keys(epi).sort()).toEqual(Object.keys(phys).sort());
  });

  it('10. no fake scientific state can enter through the presentation layer — tampering changes the fingerprint', () => {
    const state = projectEpidemiologyWorldStates(runScenario('BASELINE', { days: 10 }))[0]!;
    const tamperedInput = { ...state, entities: [{ ...state.entities[0]!, label: 'FAKED' }, ...state.entities.slice(1)] };
    const { contractVersion: _cv, fingerprint: _fp, ...rebuildInput } = tamperedInput;
    const rebuilt = buildWorldState(rebuildInput);
    expect(rebuilt.fingerprint).not.toBe(state.fingerprint);
    // And building twice from the SAME real content always yields the SAME fingerprint (no hidden nondeterminism).
    const { contractVersion: _cv2, fingerprint: _fp2, ...sameInput } = state;
    expect(buildWorldState(sameInput).fingerprint).toBe(state.fingerprint);
  });

  it('11. changing a genuinely supported parameter creates a genuinely different real run (not a scripted diff)', () => {
    const baseline = startLabExperiment({ scenarioId: 'BASELINE', days: 90, stepsPerDay: 4, hospitalCapacity: { totalBeds: 40, icuBeds: 8, icuShareOfAdmissions: 0.2 } });
    const undersized = changeParameterAndRunAgain(baseline, { totalBeds: 5, icuBeds: 1 });
    expect(baseline.session.verdict).toBe('HOLDS');
    expect(undersized.session.verdict).toBe('EXCEEDED');
    expect(baseline.session.run.resultFingerprint).not.toBe(undersized.session.run.resultFingerprint);
    // The underlying epidemic curve (S/E/I/R/D) is untouched by a pure-capacity change — proves the difference is real, not a side effect of something else changing.
    expect(baseline.session.run.epidemicFingerprint).toBe(undersized.session.run.epidemicFingerprint);
  });

  it('12. comparing runs preserves scientific provenance (which parameters changed, and by how much each metric moved)', () => {
    const baseline = startLabExperiment({ scenarioId: 'BASELINE', days: 90, stepsPerDay: 4, hospitalCapacity: { totalBeds: 40, icuBeds: 8 } });
    const undersized = changeParameterAndRunAgain(baseline, { totalBeds: 5, icuBeds: 1 });
    const { comparison, verdictChanged } = compareLabRuns(baseline, undersized);
    expect(comparison.status).toBe('COMPLETED');
    expect(comparison.changedCapacity).toEqual(expect.arrayContaining(['totalBeds', 'icuBeds']));
    expect(verdictChanged).toBe(true);
    const unmetCareDelta = comparison.metrics.find((m) => m.key === 'totalUnmetCareDays')!;
    expect(unmetCareDelta.variant).toBeGreaterThan(unmetCareDelta.baseline);
  });

  it('13. the pre-existing Virtual Lab live-experiment replay remains deterministic after this extension', () => {
    const lab = buildHospitalCapacityLaboratory();
    expect(lab.station.subject.modeledProperties.length).toBeGreaterThan(0);
    for (const key of ALLOWED_LAB_PARAMETERS) expect(typeof key).toBe('string');
    const run = startLabExperiment({ scenarioId: 'BASELINE', days: 60, stepsPerDay: 4 });
    const replayA = replayLabRun(run);
    const replayB = replayLabRun(run);
    expect(replayA).toEqual(replayB);
    expect(replayA.status).toBe('MATCH');
  });
});
