import { fnv1a, canonicalJson } from '../../events/hash';
import type { DeciphermentTest, DeciphermentHypothesis, ScoredTest, DeciphermentTestPlan, DeciphermentTestKind } from './deciphermentTypes';

/**
 * Next-test planner — mirror of `core/agent/cyberTestPlanner.ts`'s pattern:
 * explicit, documented heuristic weights (never Bayesian, never a fabricated
 * probability-of-truth), deterministic tie-break, repeated tests penalized.
 * Answers "which test best discriminates the surviving readings", not
 * "which reading is 93% likely correct".
 */

export const DECIPHERMENT_PLANNER_WEIGHTS = {
  uncertainty: 0.35,
  discrimination: 0.25,
  downstream: 0.15,
  safety: 0.15,
  cost: -0.20,
  repeatPenalty: -0.6,
} as const;

export interface PlannerInput {
  readonly hypotheses: readonly DeciphermentHypothesis[];
  readonly executedTestIds: readonly string[];
  readonly seed: number;
}

function cmpStr(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

export function candidateTestsForHypotheses(input: PlannerInput): readonly DeciphermentTest[] {
  const out: DeciphermentTest[] = [];
  let counter = 0;
  const live = input.hypotheses.filter((h) => h.assessment === 'CANDIDATE' || h.assessment === 'SUPPORTED_WITHIN_PROTOCOL');

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]; const b = live[j];
      const core = {
        testId: `test:${input.seed}:${counter++}`,
        hypothesisIds: Object.freeze([a.hypothesisId, b.hypothesisId]),
        kind: 'CROSS_READING_CONSISTENCY' as DeciphermentTestKind,
        description: `Cross-check readings behind ${a.hypothesisId} and ${b.hypothesisId} on a held-out slice of the sequence.`,
        expectedObservation: 'exactly one reading keeps repeat/coherence structure on the holdout slice',
        falsifyingObservation: 'both readings collapse, or both remain equally plausible',
        cost: 1,
        safety: 1,
        discriminationPower: 0.8,
      };
      out.push(Object.freeze({ ...core, fingerprint: fnv1a(canonicalJson(core)) }));
    }
  }
  for (const h of live) {
    const core = {
      testId: `test:${input.seed}:${counter++}`,
      hypothesisIds: Object.freeze([h.hypothesisId]),
      kind: h.falsifier.testKind,
      description: `Attempt to falsify ${h.hypothesisId} via ${h.falsifier.testKind} on a held-out slice.`,
      expectedObservation: h.falsifier.predictedObservable,
      falsifyingObservation: h.falsifier.falsifyingObservable,
      cost: 1,
      safety: 1,
      discriminationPower: 0.6,
    };
    out.push(Object.freeze({ ...core, fingerprint: fnv1a(canonicalJson(core)) }));
  }
  return Object.freeze(out);
}

export function scoreTests(input: PlannerInput, tests: readonly DeciphermentTest[]): readonly ScoredTest[] {
  const executed = new Set(input.executedTestIds);
  const scored = tests.map((test) => {
    const targets = input.hypotheses.filter((h) => (test.hypothesisIds as readonly string[]).includes(h.hypothesisId));
    const unresolved = targets.filter((h) => h.assessment !== 'FALSIFIED_WITHIN_PROTOCOL').length;
    const uncertainty = targets.length === 0 ? 0 : unresolved / targets.length;
    const discrimination = test.discriminationPower * Math.min(1, test.hypothesisIds.length / 2);
    const downstream = test.kind === 'CROSS_READING_CONSISTENCY' ? 0.8 : 0.5;
    const w = DECIPHERMENT_PLANNER_WEIGHTS;
    const repeatPenalty = executed.has(test.testId) ? 1 : 0;
    const score = w.uncertainty * uncertainty + w.discrimination * discrimination + w.downstream * downstream
      + w.safety * test.safety + w.cost * test.cost + w.repeatPenalty * repeatPenalty;
    return Object.freeze({ test, score: Math.round(score * 1000) / 1000, components: Object.freeze({ uncertainty, discrimination, downstream, safety: test.safety, cost: test.cost, repeatPenalty }) });
  });
  return Object.freeze([...scored].sort((a, b) => {
    const diff = b.score - a.score;
    if (Math.abs(diff) > 1e-9) return diff;
    return cmpStr(a.test.testId, b.test.testId);
  }));
}

export function planNextTest(input: PlannerInput): DeciphermentTestPlan {
  const tests = candidateTestsForHypotheses(input);
  const scored = scoreTests(input, tests);
  const selected = scored.length > 0 ? scored[0].test : null;
  const rationale = selected
    ? `Selected ${selected.testId} (${selected.kind}): highest heuristic score among ${scored.length} candidates; discriminates ${selected.hypothesisIds.length} hypothesis(es). Weights: ${Object.entries(DECIPHERMENT_PLANNER_WEIGHTS).map(([k, v]) => `${k}=${v}`).join(', ')}.`
    : 'No candidate tests: no live competing hypotheses remain to discriminate.';
  return Object.freeze({ selectedTest: selected, allScored: scored, weights: DECIPHERMENT_PLANNER_WEIGHTS, rationale });
}
