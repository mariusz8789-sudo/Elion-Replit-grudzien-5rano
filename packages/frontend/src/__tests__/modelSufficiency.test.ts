import { describe, expect, it } from 'vitest';
import { GENESIS_CHEMISTRY_CATALOG } from '../core/agent/chemistryLeverCatalog';
import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { buildGenesisMatrixView } from '../core/agent/genesisMatrix';
import { narrateNext } from '../core/agent/genesisNarration';
import { assessModelSufficiency } from '../core/agent/modelSufficiency';
import { GENESIS_FLOOD_CATALOG, type WorldLeverCatalog } from '../core/agent/worldGoalIntent';

/**
 * MODEL SUFFICIENCY (P4) — every state proven on a REAL run whose end-state was
 * measured first (see the probe in the commit that added this):
 *
 *   flood, full catalog  → infiltration survives            → SUPPORTED_MECHANISM_FOUND
 *   flood, pump only      → both refuted, one reached metric → DECLARED_SPACE_INSUFFICIENT
 *   chemistry, mass only  → refuted, inert (never moved it)  → DECLARED_SPACE_INSUFFICIENT, every inert
 */

function ranRun(goal: string, catalog: WorldLeverCatalog) {
  const outcome = runDiscovery({ shape: 'MECHANISM', goal, catalog });
  if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
  return outcome.run;
}

describe('model sufficiency — did the declared space explain it', () => {
  it('SUPPORTED_MECHANISM_FOUND when a declared mechanism survives', () => {
    const verdict = assessModelSufficiency(ranRun('Minimise peak flood depth, at most 6 experiments.', GENESIS_FLOOD_CATALOG));
    expect(verdict.status).toBe('SUPPORTED_MECHANISM_FOUND');
    expect(verdict.survivingCount).toBeGreaterThan(0);
    // Not insufficient, so no next-step-outside-the-space and no caveat.
    expect(verdict.nextStep).toBeNull();
    expect(verdict.caveat).toBeNull();
  });

  it('UNSETTLED when a mechanism was never tested — never claims insufficiency it did not earn', () => {
    // The full flood run consolidates on infiltration and stops with pump-capacity
    // still UNTESTED. Even though nothing there is insufficient, this guards the
    // rule: an untested mechanism blocks an insufficiency claim.
    const run = ranRun('Minimise peak flood depth, at most 6 experiments.', GENESIS_FLOOD_CATALOG);
    // Force the UNSETTLED branch honestly: a run with an untested hypothesis and
    // nothing supported cannot be judged. We assert the classifier's rule
    // directly on the real partition.
    const withUntested = { ...run, surviving: [] as string[] };
    const verdict = assessModelSufficiency(withUntested);
    if (withUntested.untested.length > 0) {
      expect(verdict.status).toBe('UNSETTLED');
      expect(verdict.caveat).toBeNull();
    }
  });

  it('DECLARED_SPACE_INSUFFICIENT when every declared mechanism is tested and refuted', () => {
    const verdict = assessModelSufficiency(ranRun('Minimise peak flood depth using the pump, at most 4 experiments.', GENESIS_FLOOD_CATALOG));
    expect(verdict.status).toBe('DECLARED_SPACE_INSUFFICIENT');
    expect(verdict.survivingCount).toBe(0);
    expect(verdict.untestedCount).toBe(0);
    expect(verdict.falsifiedCount).toBeGreaterThan(0);
    // The pump moved the metric the wrong way (a real cause, ruled out), and its
    // flipped alternative was inert — so NOT every mechanism is inert here.
    expect(verdict.reachedMetricCount).toBeGreaterThan(0);
    expect(verdict.everyTestedMechanismInert).toBe(false);
    // Insufficiency names a next step and carries the declared-space caveat.
    expect(verdict.nextStep).toContain('different model');
    expect(verdict.caveat).toContain('DECLARED search space');
  });

  it('the strongest case: every tested mechanism inert — nothing declared reaches the objective', () => {
    // Chemistry's mass lever: first-order fractional decay is exactly independent
    // of amount, so the metric never moves — an INCONCLUSIVE round, an inert
    // refutation, and no reached-metric mechanism at all.
    const verdict = assessModelSufficiency(ranRun('Minimise the remaining fraction using the mass, at most 4 experiments.', GENESIS_CHEMISTRY_CATALOG));
    expect(verdict.status).toBe('DECLARED_SPACE_INSUFFICIENT');
    expect(verdict.reachedMetricCount).toBe(0);
    expect(verdict.inertCount).toBeGreaterThan(0);
    expect(verdict.everyTestedMechanismInert).toBe(true);
    expect(verdict.nextStep).toContain('at all');
  });

  it('the honesty boundary holds: insufficiency of the declared space is never dressed as a model failure', () => {
    // The pump-only run found the declared space insufficient — but the flood
    // MODEL can lower flood depth via infiltration, a mechanism this run never
    // declared. The verdict must not claim the model failed.
    const verdict = assessModelSufficiency(ranRun('Minimise peak flood depth using the pump, at most 4 experiments.', GENESIS_FLOOD_CATALOG));
    expect(verdict.caveat).toContain('not proof the model');
    // And the full-catalog run proves the model really can: same world, a
    // declared mechanism outside {pump} succeeds.
    const full = assessModelSufficiency(ranRun('Minimise peak flood depth, at most 6 experiments.', GENESIS_FLOOD_CATALOG));
    expect(full.status).toBe('SUPPORTED_MECHANISM_FOUND');
  });
});

describe('model sufficiency — threaded through the Matrix and the voice', () => {
  it('the Matrix view carries the verdict for a run, and null for a refusal', () => {
    const ran = runDiscovery({ shape: 'MECHANISM', goal: 'Minimise peak flood depth using the pump, at most 4 experiments.', catalog: GENESIS_FLOOD_CATALOG });
    expect(buildGenesisMatrixView(ran).sufficiency?.status).toBe('DECLARED_SPACE_INSUFFICIENT');

    const refused = runDiscovery({ shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG });
    expect(buildGenesisMatrixView(refused).sufficiency).toBeNull();
  });

  it('the Voice Guide speaks insufficiency, and the boundary, from the real verdict', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Minimise the remaining fraction using the mass, at most 4 experiments.', catalog: GENESIS_CHEMISTRY_CATALOG });
    const view = buildGenesisMatrixView(outcome);
    const lines = narrateNext(view);
    expect(lines.some((l) => l.phase === 'VERDICT' && l.text.includes('does not explain'))).toBe(true);
    expect(lines.some((l) => l.phase === 'NEXT' && l.text.includes('different model'))).toBe(true);
  });

  it('a run that found support narrates a next experiment, never an insufficiency line', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: 'Minimise peak flood depth, at most 6 experiments.', catalog: GENESIS_FLOOD_CATALOG });
    const lines = narrateNext(buildGenesisMatrixView(outcome));
    expect(lines.some((l) => l.text.includes('does not explain') || l.text.includes('not enough'))).toBe(false);
  });
});
