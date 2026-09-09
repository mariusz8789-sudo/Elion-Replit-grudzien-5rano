import { describe, expect, it } from 'vitest';
import { GENESIS_CHEMISTRY_CATALOG } from '../core/agent/chemistryLeverCatalog';
import { runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';

/**
 * P3 — REGENERATION: a clean falsification proposes its own alternative, on the
 * REAL flood substrate, not a synthetic hypothesis object.
 *
 * Every number below was read off a probe of this exact world before the
 * assertion was written (the repo's measure-first rule), and independently
 * cross-checked outside the loop by forking the same lever at six strengths
 * directly. The measurement surfaced a real fact about the solver worth
 * recording here rather than only in a deleted probe: `lever:pump-capacity`
 * has a THRESHOLD — `maxDepthM` reads exactly the baseline value
 * (1.4495159056888596) at strength ≤ 0.5 and exactly 1.466356695856317 at
 * strength ≥ 0.75. There is no gradient between them; the routing solver's
 * outlet either saturates or it does not.
 *
 * That threshold is what makes this a genuinely good test of the anti-HARK
 * guard rather than a contrived one: the derived hypothesis is scheduled at
 * strength 0.5 specifically BECAUSE it must avoid the strength-1 run that
 * falsified its parent, and 0.5 lands on the OTHER side of a real physical
 * threshold — a different, independently measured fact, not a coincidental
 * repeat of the falsifying run dressed up as confirmation.
 */

function pumpOnlyPlan() {
  const intent = parseWorldDiscoveryGoal(
    'Minimise peak flood depth using the pump, at most 4 experiments.',
    GENESIS_FLOOD_CATALOG,
  );
  expect(intent.requestedLeverIds).toEqual(['lever:pump-capacity']);
  const plan = buildWorldDiscoveryPlan(intent, GENESIS_FLOOD_CATALOG);
  if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
  return plan;
}

describe('discovery loop — regeneration after a clean falsification (P3)', () => {
  it('falsifies the declared hypothesis, then tests a derived one — MEASURED, not asserted from memory', () => {
    const result = runAutonomousDiscovery(pumpOnlyPlan());

    expect(result.rounds).toHaveLength(2);

    const [first, second] = result.rounds;
    expect(first!.hypothesisId).toBe('h:pump-capacity');
    expect(first!.strength).toBe(1);
    expect(first!.assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    // The measured values: doubling pump flow makes the peak WORSE, not better.
    expect(first!.objectiveBaseline).toBeCloseTo(1.4495159056888596, 9);
    expect(first!.objectiveObserved).toBeCloseTo(1.466356695856317, 9);

    // A second round happened at all — the automatic step this test exists to prove.
    expect(second!.hypothesisId).toBe('h:pump-capacity~RELATION_FLIP');
    expect(second!.objectiveObserved).toBeCloseTo(1.4495159056888596, 9); // below the solver's real threshold
  });

  it('THE HARD CONSTRAINT: the derived hypothesis is tested at a strength its parent never used', () => {
    const result = runAutonomousDiscovery(pumpOnlyPlan());
    const [first, second] = result.rounds;

    expect(second!.strength).not.toBe(first!.strength);
    // Not just "different" — specifically the untested magnitude, so a reader
    // can see the guard picked a real alternative rather than merely avoiding
    // one number by accident.
    expect(second!.strength).toBe(0.5);
  });

  it('the derived hypothesis carries real provenance: id, parent, mechanism and why', () => {
    const result = runAutonomousDiscovery(pumpOnlyPlan());
    const parentBelief = result.beliefs.find((b) => b.hypothesisId === 'h:pump-capacity')!;
    const derivedBelief = result.beliefs.find((b) => b.hypothesisId === 'h:pump-capacity~RELATION_FLIP');

    expect(parentBelief.status).toBe('REFUTED');
    expect(derivedBelief).toBeDefined();
    // Genuinely tested, not merely proposed: it has a real strength on record,
    // and — per the guard above — a DIFFERENT one from its parent.
    expect(derivedBelief!.testedAtStrengths).toEqual([0.5]);

    // The mechanism is unchanged: this is the SAME lever the world declares,
    // re-interpreted under a new criterion — never a mechanism invented here.
    const derivedRound = result.rounds.find((r) => r.hypothesisId === 'h:pump-capacity~RELATION_FLIP')!;
    expect(derivedRound.selectionReason).toContain('h:pump-capacity~RELATION_FLIP');
  });

  it('a clean falsification with no derivable alternative left never re-derives the same criterion twice', () => {
    // `rejectedFingerprints` accumulates across the WHOLE run: if the derived
    // criterion's own fingerprint were somehow re-offered, the loop must not
    // silently re-test it as if it were a third, new hypothesis.
    const result = runAutonomousDiscovery(pumpOnlyPlan());
    const ids = result.rounds.map((r) => r.hypothesisId);
    expect(new Set(ids).size).toBe(ids.length); // no hypothesis tested twice under the same id
    expect(result.beliefs.filter((b) => b.hypothesisId.startsWith('h:pump-capacity'))).toHaveLength(2); // exactly one generation, not a chain
  });

  it('a REFUTED_BY_NO_EFFECT result derives nothing — deriveAlternativeCriteria\'s own gate, honoured by the loop', () => {
    // Chemistry's `lever:substance-mass` is a documented, measured
    // REFUTED_BY_NO_EFFECT: first-order decay is defined on a fraction, so mass
    // never moves the objective at all. `deriveAlternativeCriteria` returns []
    // for anything other than a clean, evaluable FALSIFIED_WITHIN_PROTOCOL — a
    // no-effect result must not spawn a fabricated "alternative" mechanism.
    const intent = parseWorldDiscoveryGoal(
      'Minimise the remaining fraction using the mass, at most 2 experiments.',
      GENESIS_CHEMISTRY_CATALOG,
    );
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);

    const result = runAutonomousDiscovery(plan);
    expect(result.rounds[0]!.assessment.assessment).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(result.beliefs.some((b) => b.hypothesisId.includes('~'))).toBe(false);
  });
});
