import { describe, expect, it } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';
import { GENESIS_FLOOD_CATALOG, parseWorldDiscoveryGoal, resolveWorldLeverCatalog } from '../core/agent/worldGoalIntent';
import {
  buildGeneratorDiscoveryWorld,
  GENESIS_GENERATOR_CATALOG,
  GENESIS_GENERATOR_CATALOG_ID,
  GENESIS_GENERATOR_ID,
  GENESIS_GENERATOR_OBJECTIVE_METRIC,
} from '../core/agent/electricalGeneratorLeverCatalog';
import { GENERATOR_DEFAULTS, GENERATOR_STATUS } from '../core/worldModel/domains/electricalGenerator';
import { collectScalars } from '../core/worldModel/bridge/worldFrameState';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * THE DISCOVERY ENGINE ON ELECTRICAL ENGINEERING — the fifth domain on the
 * WorldGraph substrate.
 *
 * Every number below was MEASURED from the real generator state machine before
 * it was written down. The horizon (tick 60, ten hours) came out of the printed
 * baseline: 40 L still in the tank, fifteen ticks before it empties and every
 * arm would be compared against a floor instead of a trajectory.
 *
 * Nothing here is a claim about any named generator. The solver publishes at
 * PROCEDURAL_APPROXIMATION and so does every verdict below.
 */
describe('discovery engine on electrical engineering (fifth domain)', () => {
  it('runs a real endurance search through the SAME seam every other domain uses', () => {
    const state = runWorldDiscovery('Maximise fuel remaining, at most 4 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.domainId).toBe('electrical-engineering');
    expect(state.result.rounds.length).toBeGreaterThan(0);
    for (const round of state.result.rounds) {
      expect(round.branchId).toBeTruthy();
      expect(Number.isFinite(round.objectiveBaseline!)).toBe(true);
      expect(Number.isFinite(round.objectiveObserved!)).toBe(true);
    }
    // Measured: 200 L minus 16 L/h for ten hours = 40 L.
    expect(state.result.rounds[0]!.objectiveBaseline!).toBeCloseTo(40, 6);
  });

  it('finds fuel efficiency supported — one of the two real factors in the burn rate', () => {
    const state = runWorldDiscovery('Maximise fuel remaining by efficiency, at most 4 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:fuel-efficiency');
    const [full, half] = state.result.rounds;
    // Measured: 0.32 -> 0.22 L/kWh leaves 85.83 L against a 40 L baseline;
    // 0.27 L/kWh at half strength lands at 62.92, exactly halfway, because the
    // fuel model is linear in specific consumption.
    expect(full!.objectiveObserved!).toBeCloseTo(85.8333, 4);
    expect(half!.strength).toBe(0.5);
    expect(half!.objectiveObserved!).toBeCloseTo(62.9167, 4);
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:fuel-efficiency')!.confidence)
      .toBe('SUPPORTED_AT_TWO_MAGNITUDES');
  });

  it('finds load shedding supported — the other real factor, and the bigger one here', () => {
    const state = runWorldDiscovery('Maximise fuel remaining by load shedding, at most 4 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:load-shedding');
    // Measured: 50 -> 30 kW leaves 98.67 L, 40 -> 69.33 L at half strength.
    expect(state.result.rounds[0]!.objectiveObserved!).toBeCloseTo(98.6667, 4);
    expect(state.result.rounds[1]!.objectiveObserved!).toBeCloseTo(69.3333, 4);
  });

  /**
   * NEGATIVE RESULT #1 — about the MACHINE, and exact.
   *
   * `loadKw` is set from `ratedPowerKw` exactly once, at the STARTING ->
   * RUNNING transition. After that the unit carries the load it is carrying, so
   * re-rating a genset that is already online changes nothing it burns. That is
   * correct behaviour rather than an oversight: fuel burn is driven by LOAD,
   * and a nameplate is not a load. It is the electrical counterpart of the
   * chemistry catalogue's mass lever.
   */
  it('REFUTES the nameplate hypothesis — rating an online unit does not move its fuel', () => {
    const state = runWorldDiscovery('Maximise fuel remaining by nameplate, at most 4 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported).toHaveLength(0);
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:generator-rating');
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:generator-rating')!.confidence)
      .toBe('REFUTED_BY_NO_EFFECT');
    const first = state.result.rounds[0]!;
    // Not "close" — equal.
    expect(first.objectiveObserved!).toBe(first.objectiveBaseline!);
    expect(first.effect).toBe(0);
  });

  /**
   * NEGATIVE RESULT #2 — about the MODEL, and this file will not blur the two.
   *
   * The solver decrements `fuelRemainingL` and never reads `fuelCapacityL` at
   * all, so a bigger declared tank changes nothing. A real generator with a
   * bigger tank obviously runs longer. What the loop found is a real limit of
   * THIS model, and reporting it as a fact about diesel generators would be
   * false — which is exactly what the loop's model-scoped disclaimer is for.
   */
  it('REFUTES the bigger-tank hypothesis — a real limit of the model, not of generators', () => {
    const state = runWorldDiscovery('Maximise fuel remaining by a bigger tank, at most 4 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:larger-tank');
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:larger-tank')!.confidence)
      .toBe('REFUTED_BY_NO_EFFECT');
    expect(state.result.rounds[0]!.effect).toBe(0);
    // The verdict travels with its disclaimer, which is the only thing that
    // makes this refutation safe to publish.
    expect(state.result.rounds[0]!.assessment.disclaimer).toBeTruthy();
  });

  it('measures the baseline trajectory the horizon was chosen from', () => {
    const world = buildGeneratorDiscoveryWorld();
    const registry = new TemporalBranchRegistry();
    const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
    for (let i = 0; i < 80; i++) baseline.advance(GENESIS_GENERATOR_CATALOG.dt, world.updater);
    const fuelAt = (tick: number) =>
      collectScalars(baseline.scrubTo(tick).getEntity(GENESIS_GENERATOR_ID)!).fuelRemainingL;
    const statusAt = (tick: number) =>
      collectScalars(baseline.scrubTo(tick).getEntity(GENESIS_GENERATOR_ID)!).status;

    // 16 L/h at 50 kW and 0.32 L/kWh: a straight line down.
    expect(fuelAt(10)).toBeCloseTo(173.3333, 4);
    expect(fuelAt(30)).toBeCloseTo(120, 6);
    // The catalogue's horizon: still on the line, well clear of the floor.
    expect(fuelAt(60)).toBeCloseTo(40, 6);
    expect(statusAt(60)).toBe(GENERATOR_STATUS.RUNNING);
    // And the reason not to go further: by tick 80 the tank is empty and every
    // arm would be compared against a clamp instead of a trajectory.
    expect(fuelAt(80)).toBe(0);
    expect(statusAt(80)).toBe(GENERATOR_STATUS.FUEL_EXHAUSTED);
  });

  it('parses a generator goal, in both languages, without other worlds\' vocabulary leaking in', () => {
    const intent = parseWorldDiscoveryGoal('Maximise fuel remaining by load shedding.', GENESIS_GENERATOR_CATALOG);
    expect(intent.objectiveMetric).toBe(GENESIS_GENERATOR_OBJECTIVE_METRIC);
    expect(intent.direction).toBe('maximize');
    expect(intent.requestedLeverIds).toEqual(['lever:load-shedding']);
    expect(intent.unresolved).toHaveLength(0);

    const polish = parseWorldDiscoveryGoal('Zwiększ zapas paliwa przez odciążenie.', GENESIS_GENERATOR_CATALOG);
    expect(polish.objectiveMetric).toBe(GENESIS_GENERATOR_OBJECTIVE_METRIC);
    expect(polish.requestedLeverIds).toEqual(['lever:load-shedding']);

    const wrongWorld = parseWorldDiscoveryGoal('Maximise fuel remaining by load shedding.', GENESIS_FLOOD_CATALOG);
    expect(wrongWorld.objectiveMetric).toBeNull();
    expect(wrongWorld.unresolved).toContain('OBJECTIVE_METRIC');
  });

  it('offers as an objective only a quantity the solver COMPUTES and no lever sets', () => {
    const offered = new Set(Object.values(GENESIS_GENERATOR_CATALOG.metricPhrases));
    expect([...offered]).toEqual(['fuelRemainingL']);
    // `loadKw` is computed but `lever:load-shedding` sets it — offering it would
    // make the intervention its own criterion. `cumulativeRuntimeS` is computed
    // but on a RUNNING unit it is a clock: every lever would score exactly zero
    // for a reason that says nothing about generators.
    for (const excluded of ['loadKw', 'cumulativeRuntimeS', 'status', 'secondsRemaining', 'ratedPowerKw', 'specificFuelConsumptionLPerKwh', 'fuelCapacityL', 'startupDelayS']) {
      expect(offered.has(excluded)).toBe(false);
    }
  });

  it('leaves the solver\'s defaults alone — the levers are the only thing this file changes', () => {
    expect(GENERATOR_DEFAULTS.ratedPowerKw).toBe(50);
    expect(GENERATOR_DEFAULTS.specificFuelConsumptionLPerKwh).toBe(0.32);
    expect(GENERATOR_DEFAULTS.fuelCapacityL).toBe(200);
  });

  it('is registered for replay, so a saved generator run can be rebuilt from its id alone', () => {
    expect(resolveWorldLeverCatalog(GENESIS_GENERATOR_CATALOG_ID)).toBe(GENESIS_GENERATOR_CATALOG);
  });

  it('carries the model\'s own limits into the run, including the capability disagreement', () => {
    const state = runWorldDiscovery('Maximise fuel remaining, at most 2 experiments.', GENESIS_GENERATOR_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    const assumptions = state.result.declaredAssumptions.join(' ');
    expect(assumptions).toContain('NOT a measurement of any named unit');
    expect(assumptions).toContain('PROCEDURAL_APPROXIMATION');
    const gaps = state.result.notModelledFactors.join(' ');
    expect(gaps).toContain('Part-load efficiency');
    expect(gaps).toContain('Refuelling logistics');
  });
});
