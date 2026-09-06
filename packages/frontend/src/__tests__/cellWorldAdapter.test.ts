import { describe, expect, it } from 'vitest';
import {
  executePreregisteredHypothesesAsync, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses,
} from '../core/experimentFabric/hypothesisLoop';
import { projectCellWorldStates, projectCellWorldStatesWithReplay } from '../core/world/cellWorldAdapter';
import { buildWorldState, type WorldState } from '../core/world/scientificWorldState';

/**
 * CELL / POPULATION BIOLOGY WORLD ADAPTER — the fourth domain proving
 * `ScientificWorldState` generalizes to a reference "Scientific Object"
 * (epidemiology, particle physics, molecular chemistry, now cell
 * population dynamics).
 *
 * The `biology-logistic` model is LOCAL (no `BACKEND_REAL_ENGINE`
 * capability, unlike RDKit/PySCF) — it runs the exact closed-form
 * logistic-growth solution synchronously, so unlike
 * `moleculeWorldAdapter.test.ts` these tests need no fetch mock at all.
 */
const PROBLEM_ID = 'problem:cell-population-growth-rate-fastest-to-capacity';

async function runCellLoop() {
  const problem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === PROBLEM_ID)!;
  return executePreregisteredHypothesesAsync(preregisterHypotheses(generateCompetingHypotheses(problem)));
}

describe('Cell/Population Biology World Adapter — fourth domain for ScientificWorldState', () => {
  it('1. projects the real, locally-executed logistic-growth outputs as WorldState entities', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    expect(states.length).toBeGreaterThan(0);
    const population = states[0]!.entities[0]!;
    expect(population.ref.kind).toBe('cell-population');
    const fraction = population.properties.find((p) => p.key === 'fractionOfCapacity');
    expect(fraction?.value).toBeGreaterThan(0);
    expect(fraction?.unit).toBe('%');
  });

  it('2. entity IDs are derived from the requested growth rate (stable, deterministic) and ordering matches allRuns', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    const completedRuns = loopResult.allRuns.filter((r) => r.result.status === 'completed');
    expect(states.map((s) => s.entities[0]!.ref.id)).toEqual(completedRuns.map((r) => `r=${r.request.parameters.growthRate}`));
    expect(states.map((s) => s.tick)).toEqual(states.map((_, i) => i));
  });

  it('3. a higher real growth rate reaches a higher fraction of capacity in the same fixed time — not scripted', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    const byRate = new Map(states.map((s) => [s.entities[0]!.properties.find((p) => p.key === 'growthRate')!.value as number, s.entities[0]!.properties.find((p) => p.key === 'fractionOfCapacity')!.value as number]));
    expect(byRate.get(0.6)!).toBeGreaterThan(byRate.get(0.3)!);
    expect(byRate.get(0.3)!).toBeGreaterThan(byRate.get(0.1)!);
  });

  it('4. the SAME ScientificWorldState contract shape is used for cell biology as for every other domain', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    const WORLD_STATE_KEYS = [
      'contractVersion', 'worldId', 'domainId', 'tick', 'entities', 'relations', 'observations',
      'events', 'experiment', 'epistemic', 'evidence', 'replay', 'notModeled', 'fingerprint',
    ].sort();
    expect(Object.keys(states[0]!).sort()).toEqual(WORLD_STATE_KEYS);
    expect(states[0]!.domainId).toBe('CELL_BIOLOGY');
  });

  it('5. epistemic state is the real, unmodified HypothesisLoopResult — no parallel epistemic ontology for cell biology', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    expect(states[0]!.epistemic).toBe(loopResult);
  });

  it('6. gene expression / cell cycle / stochasticity are declared NOT_MODELED on every state — never fabricated', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    for (const state of states) {
      for (const forbidden of ['gene-expression', 'cell-cycle-phase', 'stochasticity', 'cell-death']) {
        expect(state.notModeled).toContain(forbidden);
      }
      const propertyKeys = state.entities.flatMap((e) => e.properties.map((p) => p.key.toLowerCase()));
      for (const forbiddenWord of ['geneexpression', 'cellcycle', 'stochastic']) {
        expect(propertyKeys.some((k) => k.includes(forbiddenWord))).toBe(false);
      }
    }
  });

  it('7. replay determinism — replaying the real cell-population loop reproduces MATCH and the same states', async () => {
    const loopResult = await runCellLoop();
    const states = await projectCellWorldStatesWithReplay(loopResult);
    expect(states.every((s) => s.replay?.status === 'MATCH')).toBe(true);
  });

  it('8. tampering with a projected cell-population state changes its fingerprint (tamper-evident, same guarantee as every other domain)', async () => {
    const loopResult = await runCellLoop();
    const state = projectCellWorldStates(loopResult)[0]!;
    const tampered: WorldState = { ...state, entities: [{ ...state.entities[0]!, properties: [{ key: 'fractionOfCapacity', value: 999999 }] }] };
    const { contractVersion: _cv, fingerprint: _fp, ...rebuildInput } = tampered;
    expect(buildWorldState(rebuildInput).fingerprint).not.toBe(state.fingerprint);
  });

  it('9. provenance survives the complete flow — every cell-population event traces to a real ExperimentRun', async () => {
    const loopResult = await runCellLoop();
    const states = projectCellWorldStates(loopResult);
    for (const state of states) {
      expect(state.events).toHaveLength(1);
      expect(state.events[0]!.provenance?.origin).toBe('model');
      expect(state.events[0]!.experimentId).toBe(state.experiment.runs[0]!.runId);
    }
  });

  it('10. the discovery loop discriminates decisively: the fastest growth rate wins as the highest fraction of capacity', async () => {
    const loopResult = await runCellLoop();
    expect(loopResult.discrimination.decisive).toBe(true);
    const winner = loopResult.preregistration.hypotheses.find((h) => h.hypothesisId === loopResult.discrimination.winnerHypothesisId);
    expect(winner?.provenance).toContain('candidate:0.6');
  });
});
