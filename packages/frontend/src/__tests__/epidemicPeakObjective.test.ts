import { describe, expect, it } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';
import { GENESIS_EPIDEMIC_CATALOG } from '../core/agent/epidemicLeverCatalog';
import { parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';

/**
 * "PEAK INFECTED" — a real, additive objective, not a change to "infected".
 *
 * `epidemicLeverCatalog.ts`'s own doc records the reason this exists: at the
 * catalog's day-60 horizon, `lever:distancing`'s full-strength arm has already
 * come down off its peak (day 19) by the time day 60 is read, so its
 * AT_HORIZON value (I=28.502, see `epidemicDiscovery.test.ts`) and its true
 * peak (I=28.714, MEASURED here) genuinely differ. A goal that actually means
 * "the peak" now gets the peak, through the ordinary goal-parsing seam and the
 * ordinary loop — no separate code path.
 *
 * `objectiveReducer.test.ts` and `discoveryLoopObjectiveReducer.test.ts` prove
 * the reducer machinery itself. This file proves the CATALOG DECLARATION: that
 * a goal sentence naming the peak reaches `{kind: 'MAX'}` through
 * `parseWorldDiscoveryGoal` -> `buildWorldDiscoveryPlan` -> `runAutonomousDiscovery`
 * without a caller ever mentioning a reducer by name.
 */
describe('epidemic catalog — "peak infected" resolves to the real field plus MAX', () => {
  it('parses "peak infected" to the virtual metric, in both languages, distinct from plain "infected"', () => {
    const english = parseWorldDiscoveryGoal('Minimise peak infected by distancing.', GENESIS_EPIDEMIC_CATALOG);
    expect(english.objectiveMetric).toBe('I_PEAK');
    expect(english.requestedLeverIds).toEqual(['lever:distancing']);

    const polish = parseWorldDiscoveryGoal('Zmniejsz szczyt zakażeń przez dystansowanie.', GENESIS_EPIDEMIC_CATALOG);
    expect(polish.objectiveMetric).toBe('I_PEAK');

    // "Longest phrase first" (worldGoalIntent.ts): plain "infected" alone still
    // resolves to the ordinary AT_HORIZON metric, exactly as it always has.
    const plain = parseWorldDiscoveryGoal('Minimise infected by distancing.', GENESIS_EPIDEMIC_CATALOG);
    expect(plain.objectiveMetric).toBe('I');
  });

  it('SUPPORTS distancing against the real peak, measured through the full loop', () => {
    const state = runWorldDiscovery('Minimise peak infected by distancing, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    const [full, half] = state.result.rounds;
    // Measured: the unmitigated baseline's peak within [5,60] is 10 194.51 (it
    // has not yet peaked by day 60 — its true peak is later, day ~73); the
    // full-strength distanced arm peaks at 28.71 on day 19, ABOVE its own
    // day-60 reading of 28.502 in `epidemicDiscovery.test.ts` — the exact gap
    // this objective exists to see.
    expect(full!.objectiveBaseline).toBeCloseTo(10194.51, 1);
    expect(full!.objectiveObserved).toBeCloseTo(28.714, 2);
    expect(full!.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(full!.assessment.objectiveReducerKind).toBe('MAX');

    expect(half!.strength).toBe(0.5);
    expect(half!.objectiveObserved).toBeCloseTo(883.503, 2);

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:distancing');
  });

  /**
   * The treatment lever's exact-zero result (see `epidemicDiscovery.test.ts`,
   * "REFUTES treatment against infections") survives under the new objective
   * too, and for the identical reason: `derivatives` never reads `ifr`, so `I`
   * is bit-identical between arms at EVERY tick, which makes its peak
   * identical as well — MAX cannot manufacture a difference reduction alone
   * did not create.
   */
  it('REFUTES treatment against the peak too — MAX cannot rescue a metric the lever never touches', () => {
    const state = runWorldDiscovery('Minimise peak infected by treatment, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    const round = state.result.rounds[0]!;
    expect(round.objectiveObserved).toBe(round.objectiveBaseline);
    expect(round.effect).toBe(0);
    expect(round.assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(round.assessment.objectiveReducerKind).toBe('MAX');
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:treatment');
    expect(state.result.bestSupported).toHaveLength(0);
  });

  it('states the peak in its own prose rather than leaking the virtual metric name', () => {
    const state = runWorldDiscovery('Minimise peak infected by distancing, at most 1 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    const belief = state.result.beliefs.find((b) => b.hypothesisId === 'h:distancing')!;
    expect(belief.statement).toContain('the peak of I');
    expect(belief.statement).not.toContain('I_PEAK');
  });
});
