import { describe, expect, it } from 'vitest';
import { runAutonomousDiscovery, type DiscoveryLoopInput, type MechanisticHypothesis } from '../core/agent/discoveryLoop';
import { GENESIS_EPIDEMIC_CATALOG } from '../core/agent/epidemicLeverCatalog';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';

/**
 * OBJECTIVE REDUCER — PROVEN THROUGH THE FULL DISCOVERY LOOP, not just
 * `assessWorldCounterfactual` (`objectiveReducer.test.ts` already covers that
 * function directly). This file exists because wiring a reducer into
 * `discoveryLoop.ts` is a different claim from the reducer contract being
 * correct in isolation: the loop is what a caller actually runs, and it is
 * `runAutonomousDiscovery` — with its own belief update, its own
 * `HypothesisBelief`, its own `effect`/`metricMoved` — that has to agree with
 * the criterion's verdict, not just the assessment function underneath it.
 *
 * Every number below was read off a probe of this exact catalog and goal
 * before being written down, per the repo's measure-first rule. They land
 * close to (not identical to, because this is a different fork/branch-id
 * sequence than that file's own probe) the reference figures documented at
 * the top of `objectiveReducer.test.ts`.
 */

const GOAL = 'Minimise infected by distancing, at most 1 experiments.';
const LATE_HORIZON = 200;

/** The real plan for this goal on the real epidemic catalog — no synthetic input anywhere. */
function planAt(horizonTick: number): DiscoveryLoopInput {
  const intent = parseWorldDiscoveryGoal(GOAL, GENESIS_EPIDEMIC_CATALOG);
  const plan = buildWorldDiscoveryPlan(intent, GENESIS_EPIDEMIC_CATALOG);
  if ('error' in plan) throw new Error(plan.error);
  return { ...plan, horizonTick };
}

/** The same plan, with every hypothesis's criterion declaring the MAX reducer instead of the default. */
function withMaxReducer(input: DiscoveryLoopInput): DiscoveryLoopInput {
  const hypotheses: MechanisticHypothesis[] = input.hypotheses.map((hypothesis) => ({
    ...hypothesis,
    criterion: { ...hypothesis.criterion, reducer: { kind: 'MAX' as const } },
  }));
  return { ...input, hypotheses };
}

describe('discoveryLoop — the wired ObjectiveReducer changes the loop\'s own verdict', () => {
  it('at day 200, AT_HORIZON (the default) FALSIFIES distancing — the horizon answering the wrong question', () => {
    const result = runAutonomousDiscovery(planAt(LATE_HORIZON));
    const round = result.rounds[0]!;

    // Measured: the baseline has already burnt through the population by day
    // 200 (I down to ~0.57), while the distanced arm still has an epidemic
    // running (I ~26.4) — so the intervention reads WORSE at this one tick.
    expect(round.objectiveBaseline).toBeCloseTo(0.566, 2);
    expect(round.objectiveObserved).toBeCloseTo(26.394, 2);
    expect(round.effect).toBeGreaterThan(0);

    expect(round.assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    // No reducer was declared, so the assessment carries no override at all —
    // the historical path, unchanged.
    expect(round.assessment.objectiveReducerKind).toBeNull();

    const belief = result.beliefs.find((b) => b.hypothesisId === 'h:distancing')!;
    expect(belief.status).toBe('REFUTED');
    expect(belief.confidence).toBe('REFUTED_BY_CRITERION');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:distancing');
    expect(result.bestSupported).toHaveLength(0);
  });

  /**
   * THE TRANSITION ITSELF: same run, same 200-day epidemic, same
   * `lever:distancing` mechanism at the same strength — only the reducer on the
   * criterion changes, from nothing (AT_HORIZON) to MAX. The verdict flips.
   */
  it('at day 200, declaring MAX SUPPORTS the same mechanism — the peak it actually cut', () => {
    const result = runAutonomousDiscovery(withMaxReducer(planAt(LATE_HORIZON)));
    const round = result.rounds[0]!;

    // Measured: the baseline's peak infected count over the run is ~16 157;
    // the distanced arm's peak is ~28.7 — a real, two-orders-of-magnitude cut
    // that AT_HORIZON could not see because both arms had settled by day 200.
    expect(round.objectiveBaseline).toBeCloseTo(16156.55, 1);
    expect(round.objectiveObserved).toBeCloseTo(28.71, 1);
    expect(round.effect).toBeLessThan(0);

    expect(round.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(round.assessment.objectiveReducerKind).toBe('MAX');

    const belief = result.beliefs.find((b) => b.hypothesisId === 'h:distancing')!;
    expect(belief.status).toBe('SUPPORTED');
    expect(belief.confidence).toBe('SUPPORTED_ONCE');
    expect(result.bestSupported.map((b) => b.hypothesisId)).toContain('h:distancing');
    expect(result.failedHypotheses).toHaveLength(0);
  });

  /**
   * THE ONE THING A HALF-WIRED VERSION COULD GET WRONG: the assessment's own
   * `baseline`/`intervention` (what the criterion was actually judged on) must
   * be the SAME two numbers as the round's `objectiveBaseline`/
   * `objectiveObserved` (what the belief update and the trace report). If the
   * override carried different numbers than the round reported, the verdict
   * and the belief could disagree about what was observed — the defect this
   * whole wiring exists to rule out, not just for AT_HORIZON but for every
   * reducer.
   */
  it('feeds the override and the round report from the identical two reduced numbers', () => {
    const result = runAutonomousDiscovery(withMaxReducer(planAt(LATE_HORIZON)));
    const round = result.rounds[0]!;
    expect(round.assessment.baseline).toBe(round.objectiveBaseline);
    expect(round.assessment.intervention).toBe(round.objectiveObserved);
  });
});
