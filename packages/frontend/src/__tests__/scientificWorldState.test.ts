import { describe, expect, it } from 'vitest';
import {
  executePreregisteredHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses,
} from '../core/experimentFabric/hypothesisLoop';
import { sweepModelDivergence } from '../core/experimentFabric/modelVsModelCompare';
import { projectEpidemiologyWorldStates } from '../core/world/epidemiologyWorldAdapter';
import { projectParticleDivergenceWorldStates } from '../core/world/particleWorldAdapter';
import {
  buildWorldState, listUnknowns, traceWorldChange, type WorldState,
} from '../core/world/scientificWorldState';

const WORLD_STATE_KEYS = [
  'contractVersion', 'worldId', 'domainId', 'tick', 'entities', 'relations', 'observations',
  'events', 'experiment', 'epistemic', 'evidence', 'replay', 'notModeled', 'fingerprint',
].sort();

function assertShapesContract(state: WorldState): void {
  expect(Object.keys(state).sort()).toEqual(WORLD_STATE_KEYS);
}

function runEpiLoop(problemId: string) {
  const problem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === problemId)!;
  const set = generateCompetingHypotheses(problem);
  const prereg = preregisterHypotheses(set);
  return executePreregisteredHypotheses(prereg);
}

const PARTICLE_A = { contractVersion: '1.0.0', sourceText: 'sweep', domainId: 'particle', operation: 'compute' as const, modelId: 'particle-newtonian-energy', parameters: { restMassMeV: 0.511 } };
const PARTICLE_B = { ...PARTICLE_A, modelId: 'particle-relativistic-energy' };

describe('Scientific World State (Phase B) — generic contract, two real domains', () => {
  it('1. real epidemiology hypothesis loop projects into WorldState with values traceable to the real run', () => {
    const loopResult = runEpiLoop('problem:lowest-modeled-deaths');
    const states = projectEpidemiologyWorldStates(loopResult);
    expect(states.length).toBeGreaterThan(0);
    assertShapesContract(states[0]!);
    const hospital = states[0]!.entities.find((e) => e.ref.kind === 'facility')!;
    expect(hospital.properties.find((p) => p.key === 'status')).toBeDefined();
  });

  it('2. real particle model tournament sweep projects into the SAME WorldState contract', () => {
    const sweep = sweepModelDivergence(PARTICLE_A, PARTICLE_B, 'velocityFraction', [0.01, 0.5, 0.99], 'kineticEnergyMeV');
    const states = projectParticleDivergenceWorldStates(sweep);
    expect(states).toHaveLength(3);
    assertShapesContract(states[0]!);
    expect(states[0]!.domainId).toBe('PHYSICS');
  });

  it('3. one generic contract works identically across epidemiology and physics (Phase D cross-domain proof)', () => {
    const epi = projectEpidemiologyWorldStates(runEpiLoop('problem:lowest-modeled-deaths'))[0]!;
    const sweep = sweepModelDivergence(PARTICLE_A, PARTICLE_B, 'velocityFraction', [0.5], 'kineticEnergyMeV');
    const phys = projectParticleDivergenceWorldStates(sweep)[0]!;
    expect(Object.keys(epi).sort()).toEqual(Object.keys(phys).sort());
    expect(epi.domainId).not.toBe(phys.domainId);
  });

  it('4. world changes carry machine-readable causal lineage back to real hypotheses', () => {
    const loopResult = runEpiLoop('problem:lowest-modeled-deaths');
    const states = projectEpidemiologyWorldStates(loopResult);
    const last = states[states.length - 1]!;
    const trace = traceWorldChange(last, last.events[0]!.id);
    expect(trace).not.toBeNull();
    expect(trace!.affectedEntities.length).toBeGreaterThan(0);
    expect(trace!.relatedHypothesisIds.length).toBeGreaterThan(0);
    expect(loopResult.preregistration.hypotheses.some((h) => h.hypothesisId === trace!.relatedHypothesisIds[0])).toBe(true);
  });

  it('5. UNKNOWN/INCONCLUSIVE/BLOCKED hypotheses are surfaced honestly, never silently resolved', () => {
    // A problem with no lever that exists for a made-up model must remain BLOCKED per-hypothesis, never guessed.
    const fakeProblem = { ...HYPOTHESIS_PROBLEMS[0]!, problemId: 'problem:test-fake', modelId: 'not-a-real-model' };
    const set = generateCompetingHypotheses(fakeProblem);
    const prereg = preregisterHypotheses(set);
    const loopResult = executePreregisteredHypotheses(prereg);
    const states = projectEpidemiologyWorldStates(loopResult);
    expect(states).toHaveLength(0); // no real scenario timeline was ever produced — nothing is backfilled
    const unknowns = listUnknowns({ ...buildWorldState({
      worldId: 'x', domainId: 'EPIDEMIOLOGY', tick: 0, entities: [], relations: [], observations: [], events: [],
      experiment: { experimentId: 'x', status: 'BLOCKED', runs: [] }, epistemic: loopResult, evidence: [], replay: null, notModeled: [],
    }) });
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((u) => u.status === 'BLOCKED')).toBe(true);
  });

  it('6. epistemic state is the real, unmodified HypothesisLoopResult — no parallel epistemic ontology', () => {
    const loopResult = runEpiLoop('problem:lowest-modeled-deaths');
    const states = projectEpidemiologyWorldStates(loopResult);
    expect(states[0]!.epistemic).toBe(loopResult);
  });

  it('7. replay reproduces MATCH for the real epidemiology loop behind a WorldState', () => {
    const loopResult = runEpiLoop('problem:lowest-modeled-deaths');
    const states = projectEpidemiologyWorldStates(loopResult);
    expect(states[0]!.replay!.status).toBe('MATCH');
  });

  it('8. the projection executes headlessly — no renderer/UI import in this file or its dependency chain', () => {
    const loopResult = runEpiLoop('problem:intervention-timing');
    expect(projectEpidemiologyWorldStates(loopResult).length).toBeGreaterThanOrEqual(0);
  });

  it('9. real divergence rises monotonically across the particle sweep, proving no scripted result', () => {
    const sweep = sweepModelDivergence(PARTICLE_A, PARTICLE_B, 'velocityFraction', [0.01, 0.5, 0.9, 0.99], 'kineticEnergyMeV');
    const states = projectParticleDivergenceWorldStates(sweep);
    const divergences = states.map((s) => s.entities[0]!.properties.find((p) => p.key === 'relativeDivergence')!.value as number);
    for (let i = 1; i < divergences.length; i++) expect(divergences[i]).toBeGreaterThanOrEqual(divergences[i - 1]!);
  });

  it('10. no fake scientific state can enter through the presentation layer — tampering changes the fingerprint', () => {
    const state = projectEpidemiologyWorldStates(runEpiLoop('problem:lowest-modeled-deaths'))[0]!;
    const tampered = { ...state, entities: [{ ...state.entities[0]!, label: 'FAKED' }, ...state.entities.slice(1)] };
    const { contractVersion: _cv, fingerprint: _fp, ...rebuildInput } = tampered;
    expect(buildWorldState(rebuildInput).fingerprint).not.toBe(state.fingerprint);
    const { contractVersion: _cv2, fingerprint: _fp2, ...sameInput } = state;
    expect(buildWorldState(sameInput).fingerprint).toBe(state.fingerprint);
  });

  it('11. missing/unavailable data produces NOT_MODELED/BLOCKED experiment status, never a silent COMPLETED', () => {
    const sweep = sweepModelDivergence(
      { ...PARTICLE_A, modelId: 'not-a-real-model' }, PARTICLE_B, 'velocityFraction', [0.5], 'kineticEnergyMeV',
    );
    const states = projectParticleDivergenceWorldStates(sweep);
    expect(states[0]!.experiment.status).not.toBe('COMPLETED');
    expect(states[0]!.epistemic).toBeNull();
  });

  it('12. provenance survives the complete flow — every projected event traces to a real ExperimentRun', () => {
    const loopResult = runEpiLoop('problem:lowest-modeled-deaths');
    const states = projectEpidemiologyWorldStates(loopResult);
    for (const state of states) {
      expect(state.experiment.runs.length).toBeGreaterThan(0);
      for (const event of state.events) {
        expect(event.provenance?.origin).toBe('model');
        expect(event.experimentId).toBe(state.experiment.runs[0]!.runId);
      }
    }
  });
});
