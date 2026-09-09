import { describe, expect, it } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';
import { GENESIS_FLOOD_CATALOG, parseWorldDiscoveryGoal, resolveWorldLeverCatalog } from '../core/agent/worldGoalIntent';
import {
  GENESIS_EPIDEMIC_CATALOG,
  GENESIS_EPIDEMIC_CATALOG_ID,
  GENESIS_EPIDEMIC_MORTALITY_METRIC,
  GENESIS_EPIDEMIC_OBJECTIVE_METRIC,
} from '../core/agent/epidemicLeverCatalog';

/**
 * THE DISCOVERY ENGINE ON EPIDEMIOLOGY — the third domain on the WorldGraph
 * substrate, after the flood city and chemistry.
 *
 * Every number asserted below was MEASURED from the real RK4 SEIRD solver
 * first, by printing the baseline trajectory and each lever's effect at seven
 * candidate horizons, and only then written down. The horizon (day 60) was
 * chosen from that output: see `epidemicLeverCatalog.ts` for why days past ~100
 * would have inverted the sign of the contact-reduction result and produced a
 * true number in support of a false conclusion.
 *
 * Nothing here is about a real pathogen, outbreak or population. Every verdict
 * is a statement about this model.
 */
describe('discovery engine on epidemiology (third domain)', () => {
  it('runs a real epidemic search through the SAME seam flood and chemistry use', () => {
    const state = runWorldDiscovery('Minimise infected, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.domainId).toBe('epidemiology');
    expect(state.result.rounds.length).toBeGreaterThan(0);
    for (const round of state.result.rounds) {
      expect(round.branchId).toBeTruthy();
      expect(Number.isFinite(round.objectiveBaseline!)).toBe(true);
      expect(Number.isFinite(round.objectiveObserved!)).toBe(true);
    }
    // Measured: 10 194.5 infectious at day 60 in the unmitigated baseline.
    expect(state.result.rounds[0]!.objectiveBaseline!).toBeCloseTo(10194.51, 2);
  });

  it('finds distancing supported — the real β reduction, measured not assumed', () => {
    const state = runWorldDiscovery('Minimise infected by distancing, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:distancing');
    const [full, half] = state.result.rounds;
    // Measured: 10 194.5 -> 28.5 at 60% β reduction from day 5.
    expect(full!.objectiveObserved!).toBeCloseTo(28.502, 3);
    expect(full!.objectiveObserved!).toBeLessThan(full!.objectiveBaseline!);
    // And it is dose-dependent, which is what the loop re-tests at half strength
    // for: 30% reduction leaves 883.5 infectious, between the two extremes.
    expect(half!.strength).toBe(0.5);
    expect(half!.objectiveObserved!).toBeCloseTo(883.503, 3);
    expect(half!.objectiveObserved!).toBeGreaterThan(full!.objectiveObserved!);
    expect(half!.objectiveObserved!).toBeLessThan(full!.objectiveBaseline!);
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:distancing')!.confidence)
      .toBe('SUPPORTED_AT_TWO_MAGNITUDES');
  });

  it('finds contact reduction supported — a different code path to the same β', () => {
    const state = runWorldDiscovery('Minimise infected by contacts, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:contact-reduction');
    // Measured: R0 2.5 -> 1.4 leaves 199.0 infectious at day 60, and R0 1.95
    // (half strength) leaves 1 902.9. Both far below the 10 194.5 baseline.
    expect(state.result.rounds[0]!.objectiveObserved!).toBeCloseTo(198.972, 3);
    expect(state.result.rounds[1]!.objectiveObserved!).toBeCloseTo(1902.909, 3);
  });

  /**
   * THE NEGATIVE RESULT, and it is exact.
   *
   * Under SEIRD, `derivatives` computes S, E and I without ever reading `ifr`;
   * the parameter only decides how the flux leaving I is split between R and D.
   * So improving survival cannot change how many people are infected — not
   * approximately, EXACTLY. Measured at every horizon probed (days 10 to 120):
   * the difference is bit-for-bit zero.
   *
   * The hypothesis being refuted is one people really hold ("treatment is
   * better now, so the epidemic is under control"), and the lever really works
   * — see the next test. It just does not work on this metric.
   */
  it('REFUTES treatment against infections — better survival is exactly zero transmission control', () => {
    const state = runWorldDiscovery('Minimise infected by treatment, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported).toHaveLength(0);
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:treatment');
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:treatment')!.confidence)
      .toBe('REFUTED_BY_NO_EFFECT');

    const first = state.result.rounds[0]!;
    // Not "close" — equal. The arm and the baseline are the same number.
    expect(first.objectiveObserved!).toBe(first.objectiveBaseline!);
    expect(first.effect).toBe(0);
  });

  it('...and SUPPORTS the same lever against deaths, which is the metric it really moves', () => {
    const state = runWorldDiscovery('Minimise deaths by treatment, at most 4 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:treatment');
    const [full, half] = state.result.rounds;
    // Measured: 155.41 deaths at day 60, falling to 31.20 at IFR 0.2% and
    // 93.31 at IFR 0.6% (half strength).
    expect(full!.objectiveBaseline!).toBeCloseTo(155.415, 3);
    expect(full!.objectiveObserved!).toBeCloseTo(31.195, 3);
    expect(half!.objectiveObserved!).toBeCloseTo(93.305, 3);
    // The whole point: one lever, two objectives, opposite verdicts — and the
    // engine reached both from the solver rather than from anything declared here.
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:treatment')!.status).toBe('SUPPORTED');
  });

  it('parses an epidemiology goal, in both languages, without other worlds\' vocabulary leaking in', () => {
    const intent = parseWorldDiscoveryGoal('Minimise infected by distancing.', GENESIS_EPIDEMIC_CATALOG);
    expect(intent.objectiveMetric).toBe(GENESIS_EPIDEMIC_OBJECTIVE_METRIC);
    expect(intent.direction).toBe('minimize');
    expect(intent.requestedLeverIds).toEqual(['lever:distancing']);
    expect(intent.unresolved).toHaveLength(0);

    const polish = parseWorldDiscoveryGoal('Zmniejsz liczbę zakażonych przez dystansowanie.', GENESIS_EPIDEMIC_CATALOG);
    expect(polish.objectiveMetric).toBe(GENESIS_EPIDEMIC_OBJECTIVE_METRIC);
    expect(polish.requestedLeverIds).toEqual(['lever:distancing']);

    const mortality = parseWorldDiscoveryGoal('Minimise deaths by treatment.', GENESIS_EPIDEMIC_CATALOG);
    expect(mortality.objectiveMetric).toBe(GENESIS_EPIDEMIC_MORTALITY_METRIC);

    // The flood catalog cannot read this sentence, and this one cannot read the
    // flood city's — the vocabularies are genuinely per-world.
    const wrongWorld = parseWorldDiscoveryGoal('Minimise infected by distancing.', GENESIS_FLOOD_CATALOG);
    expect(wrongWorld.objectiveMetric).toBeNull();
    expect(wrongWorld.unresolved).toContain('OBJECTIVE_METRIC');
    const floodInEpidemic = parseWorldDiscoveryGoal('Minimise peak flood depth by infiltration.', GENESIS_EPIDEMIC_CATALOG);
    expect(floodInEpidemic.objectiveMetric).toBeNull();
  });

  it('names an unmodelled mechanism instead of quietly ignoring it', () => {
    const intent = parseWorldDiscoveryGoal('Minimise infected by better hospital ventilation.', GENESIS_EPIDEMIC_CATALOG);
    expect(intent.objectiveMetric).toBe('I');
    expect(intent.unresolved).toContain('NAMED_LEVER_NOT_IN_WORLD');
    expect(intent.unknownLeverPhrases).toContain('better hospital ventilation');
  });

  it('offers as objectives only quantities the solver COMPUTES', () => {
    // The trap this guards: `r0`, `ifr`, `interventionDay` and
    // `interventionEffect` all live in the same `domainState` record as the
    // compartments, because a live intervention has to survive the tick. Two of
    // the three levers set them. Offering one as an objective would build an
    // experiment whose intervention IS its own criterion.
    //
    // `I_PEAK` is a third offered metric (added when `ObjectiveReducer` was
    // wired into `discoveryLoop.ts`) and passes the same guard for a different
    // reason: it is not a `domainState` key at all — `parseWorldDiscoveryGoal`
    // never sees `I_PEAK` reach a solver, because every lever's hypothesis
    // translates it back to the real `I` field plus the MAX reducer before a
    // criterion is ever built. See `objectiveField` in `epidemicLeverCatalog.ts`.
    const offered = new Set(Object.values(GENESIS_EPIDEMIC_CATALOG.metricPhrases));
    expect([...offered].sort()).toEqual(['D', 'I', 'I_PEAK']);
    for (const readOnly of ['r0', 'ifr', 'infectiousDays', 'incubationDays', 'interventionDay', 'interventionEffect', 'beta', 't']) {
      expect(offered.has(readOnly)).toBe(false);
    }
  });

  it('is registered for replay, so a saved epidemic run can be rebuilt from its id alone', () => {
    expect(resolveWorldLeverCatalog(GENESIS_EPIDEMIC_CATALOG_ID)).toBe(GENESIS_EPIDEMIC_CATALOG);
  });

  it('carries the model\'s own limits into the run rather than dropping them', () => {
    const state = runWorldDiscovery('Minimise infected, at most 2 experiments.', GENESIS_EPIDEMIC_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    const assumptions = state.result.declaredAssumptions.join(' ');
    expect(assumptions).toContain('NOT calibrated to any real pathogen');
    expect(assumptions).toContain('Homogeneous mixing');
    const gaps = state.result.notModelledFactors.join(' ');
    expect(gaps).toContain('Healthcare capacity');
    expect(gaps).toContain('Vaccination');
  });
});
