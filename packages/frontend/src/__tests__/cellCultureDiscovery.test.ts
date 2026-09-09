import { describe, expect, it } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';
import { GENESIS_FLOOD_CATALOG, parseWorldDiscoveryGoal, resolveWorldLeverCatalog } from '../core/agent/worldGoalIntent';
import {
  buildCellCultureDiscoveryWorld,
  GENESIS_CELL_CULTURE_CATALOG,
  GENESIS_CELL_CULTURE_CATALOG_ID,
  GENESIS_CELL_CULTURE_ID,
  GENESIS_CELL_CULTURE_OBJECTIVE_METRIC,
  GENESIS_CELL_CULTURE_S_PHASE_METRIC,
} from '../core/agent/cellCultureLeverCatalog';
import { CELL_CYCLE_DEFAULTS } from '../core/worldModel/domains/cellCycle';
import { collectScalars } from '../core/worldModel/bridge/worldFrameState';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * THE DISCOVERY ENGINE ON CELL BIOLOGY — the fourth domain on the WorldGraph
 * substrate.
 *
 * Every number below was MEASURED from the real RK4 G1/S/G2M solver before it
 * was written down, by printing the baseline trajectory and each lever's effect
 * at six candidate horizons. The horizon (tick 30, 180 h) came out of that
 * output: earlier and the capacity lever moves the count by 0.12%,
 * indistinguishable from nothing; later and the culture arrests at 1.08 M cells
 * with an S-phase fraction of 0.000026, so every arm collapses onto the same
 * ceiling.
 *
 * Nothing here is a claim about a real cell line, a real drug, or anything in
 * an organism. Every verdict is a statement about this model.
 */
describe('discovery engine on cell biology (fourth domain)', () => {
  it('runs a real culture search through the SAME seam every other domain uses', () => {
    const state = runWorldDiscovery('Maximise cell count, at most 4 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.domainId).toBe('cell-biology');
    expect(state.result.rounds.length).toBeGreaterThan(0);
    for (const round of state.result.rounds) {
      expect(round.branchId).toBeTruthy();
      expect(Number.isFinite(round.objectiveBaseline!)).toBe(true);
      expect(Number.isFinite(round.objectiveObserved!)).toBe(true);
    }
    // Measured: 268 523.6 cells at 180 h from a 1000-cell seed, 27% of capacity.
    expect(state.result.rounds[0]!.objectiveBaseline!).toBeCloseTo(268523.65, 2);
  });

  it('finds the mitogen supported — shortening G1 really does move the population', () => {
    const state = runWorldDiscovery('Maximise cell count by mitogen, at most 4 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:mitogen');
    const [full, half] = state.result.rounds;
    // Measured: G1 11 -> 7 h more than doubles the culture (646 041 vs 268 524);
    // G1 9 h at half strength lands between (404 478), so the effect is
    // dose-dependent rather than an artefact of one setting.
    expect(full!.objectiveObserved!).toBeCloseTo(646041.19, 2);
    expect(half!.strength).toBe(0.5);
    expect(half!.objectiveObserved!).toBeCloseTo(404478.01, 2);
    expect(half!.objectiveObserved!).toBeLessThan(full!.objectiveObserved!);
    expect(half!.objectiveObserved!).toBeGreaterThan(full!.objectiveBaseline!);
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:mitogen')!.confidence)
      .toBe('SUPPORTED_AT_TWO_MAGNITUDES');
  });

  it('finds the S-phase inhibitor supported against the S-phase fraction — cells pile up in S', () => {
    const state = runWorldDiscovery('Maximise s-phase fraction by dna synthesis, at most 4 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:s-phase-inhibitor');
    // Measured: doubling S transit takes the S-phase fraction from 0.2634 to
    // 0.4341, which is what a replication block does to a flow-cytometry readout.
    expect(state.result.rounds[0]!.objectiveBaseline!).toBeCloseTo(0.263421, 6);
    expect(state.result.rounds[0]!.objectiveObserved!).toBeCloseTo(0.434100, 6);
    expect(state.result.rounds[1]!.objectiveObserved!).toBeCloseTo(0.364508, 6);
  });

  /**
   * THE NEGATIVE RESULT this domain really has — and it is the other kind.
   *
   * Not REFUTED_BY_NO_EFFECT (see the next test for why this domain has no
   * exactly-inert lever) but REFUTED_BY_CRITERION: the mechanism moved the
   * objective decisively, in the direction the preregistered criterion ruled
   * out. Killing cells is a real intervention with a real, large effect; it is
   * simply not a way to grow a culture.
   */
  it('REFUTES the cytotoxic hypothesis against growth — a real effect, the wrong way', () => {
    const state = runWorldDiscovery('Maximise cell count by a cytotoxic agent, at most 4 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    // `h:cytotoxic` claimed the agent RAISES cell count — that claim stays
    // refuted, and neither it nor any other hypothesis about that direction
    // is ever supported.
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).not.toContain('h:cytotoxic');
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:cytotoxic');
    expect(state.result.beliefs.find((b) => b.hypothesisId === 'h:cytotoxic')!.confidence)
      .toBe('REFUTED_BY_CRITERION');

    const first = state.result.rounds[0]!;
    expect(first.assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    // Measured: 0.01/h loss takes 268 524 cells down to 54 094.
    expect(first.objectiveObserved!).toBeCloseTo(54093.51, 2);
    expect(first.objectiveObserved!).toBeLessThan(first.objectiveBaseline!);
    // The refutation is by the criterion, so the metric DID move — the
    // distinction the loop keeps between its two refuting paths.
    expect(first.effect).not.toBe(0);

    /**
     * P3 — REGENERATION, caught by this exact test rather than a synthetic one.
     *
     * A clean FALSIFIED_WITHIN_PROTOCOL now automatically proposes its mirror
     * criterion (`deriveAlternativeCriteria`'s RELATION_FLIP): "the agent
     * RAISES growth" refuted becomes "the agent LOWERS growth" — the SAME
     * lever, re-interpreted, never a mechanism invented here. Genesis
     * autonomously derived and confirmed it, so `bestSupported` now correctly
     * contains one entry: not a regression in this test's own claim (which was
     * about the original direction, and still holds), but the new, correct
     * capability this codebase did not have when the test was first written.
     *
     * The anti-HARK guard is what makes the confirmation honest: round 2 runs
     * at strength 0.5, never the strength-1 run that produced the
     * falsification, so this is a genuinely independent measurement — at half
     * dose the agent still kills cells, just less (122 100 vs the 268 524
     * baseline), not a coincidental repeat dressed up as new evidence.
     */
    const second = state.result.rounds[1]!;
    expect(second.hypothesisId).toBe('h:cytotoxic~RELATION_FLIP');
    expect(second.strength).toBe(0.5);
    expect(second.strength).not.toBe(first.strength);
    expect(second.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(second.objectiveObserved!).toBeCloseTo(122099.79, 2);
    expect(second.objectiveObserved!).toBeLessThan(first.objectiveBaseline!);
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:cytotoxic~RELATION_FLIP']);
  });

  /**
   * WHY THIS DOMAIN HAS NO EXACTLY-INERT LEVER, stated as a measurement rather
   * than as a claim.
   *
   * Chemistry has one: first-order fractional decay is exactly independent of
   * how much substance is present, so its mass lever comes back
   * REFUTED_BY_NO_EFFECT with a byte-identical objective. Epidemiology has one:
   * under SEIRD the infected count is computed without reading `ifr` at all.
   *
   * Cell biology has none, and no lever was invented to give it one. The reason
   * is structural: every parameter reaches the objective through
   * `inhibition = 1 - total/carryingCapacityCells`, which is nonlinear in the
   * total, so nothing cancels exactly. The nearest candidate — enlarging the
   * vessel while the culture is still sparse — is LATENT, not inert, and this
   * test is what establishes that: the same lever moves the count by 0.12% at
   * 60 h, 9.0% at 180 h and 85.5% at 240 h. Calling that "no effect" would be
   * false at every horizon; it is one real effect switching on.
   */
  it('measures that the capacity lever is LATENT rather than inert, at three horizons', () => {
    const world = buildCellCultureDiscoveryWorld();
    const registry = new TemporalBranchRegistry();
    const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
    for (let i = 0; i < 40; i++) baseline.advance(GENESIS_CELL_CULTURE_CATALOG.dt, world.updater);

    const arm = baseline.forkBranch(GENESIS_CELL_CULTURE_CATALOG.decisionAtTick, 'capacity', (graph) => {
      const culture = graph.getEntity(GENESIS_CELL_CULTURE_ID)!;
      graph.updateEntity(culture.id, { domainState: { ...culture.domainState, carryingCapacityCells: 5_000_000 } });
    });
    for (let t = GENESIS_CELL_CULTURE_CATALOG.decisionAtTick; t < 40; t++) arm.advance(GENESIS_CELL_CULTURE_CATALOG.dt, world.updater);

    const cellsAt = (engine: TemporalEngine, tick: number) =>
      collectScalars(engine.scrubTo(tick).getEntity(GENESIS_CELL_CULTURE_ID)!).totalCells;
    const relative = (tick: number) => (cellsAt(arm, tick) - cellsAt(baseline, tick)) / cellsAt(baseline, tick);

    // Sparse at 60 h: real, and small enough that a shorter horizon would have
    // made this lever look inert when it is not.
    expect(relative(10)).toBeGreaterThan(0);
    expect(relative(10)).toBeCloseTo(0.00125, 5);
    // The catalogue's own horizon, 180 h, at 27% occupancy.
    expect(relative(30)).toBeCloseTo(0.0897, 4);
    // Confluent at 240 h: the same lever, now dominant.
    expect(relative(40)).toBeCloseTo(0.8553, 4);
    // Never exactly zero anywhere, which is the point.
    for (const tick of [10, 30, 40]) expect(cellsAt(arm, tick)).not.toBe(cellsAt(baseline, tick));
  });

  it('reports the capacity lever as supported at this horizon, because it really is', () => {
    const state = runWorldDiscovery('Maximise cell count by vessel capacity, at most 4 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    // Measured: 268 524 -> 292 616. A real 9% effect, not a rounding artefact,
    // and honestly reported as support rather than talked down to fit a story
    // about contact inhibition not mattering yet.
    expect(state.result.rounds[0]!.objectiveObserved!).toBeCloseTo(292615.65, 2);
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:vessel-capacity');
  });

  it('parses a cell-biology goal, in both languages, without other worlds\' vocabulary leaking in', () => {
    const intent = parseWorldDiscoveryGoal('Maximise cell count by mitogen.', GENESIS_CELL_CULTURE_CATALOG);
    expect(intent.objectiveMetric).toBe(GENESIS_CELL_CULTURE_OBJECTIVE_METRIC);
    expect(intent.direction).toBe('maximize');
    expect(intent.requestedLeverIds).toEqual(['lever:mitogen']);
    expect(intent.unresolved).toHaveLength(0);

    const polish = parseWorldDiscoveryGoal('Zwiększ liczbę komórek przez czynnik wzrostu.', GENESIS_CELL_CULTURE_CATALOG);
    expect(polish.objectiveMetric).toBe(GENESIS_CELL_CULTURE_OBJECTIVE_METRIC);
    expect(polish.requestedLeverIds).toEqual(['lever:mitogen']);

    const sPhase = parseWorldDiscoveryGoal('Maximise s-phase fraction by dna synthesis.', GENESIS_CELL_CULTURE_CATALOG);
    expect(sPhase.objectiveMetric).toBe(GENESIS_CELL_CULTURE_S_PHASE_METRIC);

    const wrongWorld = parseWorldDiscoveryGoal('Maximise cell count by mitogen.', GENESIS_FLOOD_CATALOG);
    expect(wrongWorld.objectiveMetric).toBeNull();
    expect(wrongWorld.unresolved).toContain('OBJECTIVE_METRIC');
  });

  it('offers as objectives only quantities the solver COMPUTES, and never its own denominator', () => {
    const offered = new Set(Object.values(GENESIS_CELL_CULTURE_CATALOG.metricPhrases));
    expect([...offered].sort()).toEqual(['sPhaseFraction', 'totalCells']);
    // `occupancyFraction` is totalCells / carryingCapacityCells, and
    // `lever:vessel-capacity` sets that denominator: offering it would make the
    // intervention its own criterion. The read-only phase durations and the
    // discrete state code are excluded for the same family of reason.
    for (const excluded of ['occupancyFraction', 'stateCode', 'g1DurationH', 'sDurationH', 'g2mDurationH', 'carryingCapacityCells', 'deathRatePerHour', 'g1Cells', 'sCells', 'g2mCells']) {
      expect(offered.has(excluded)).toBe(false);
    }
  });

  it('leaves the solver\'s defaults alone — the levers are the only thing this file changes', () => {
    // A catalogue that quietly re-tuned the model would make its results
    // incomparable with every other user of the same solver.
    expect(CELL_CYCLE_DEFAULTS.g1DurationH).toBe(11);
    expect(CELL_CYCLE_DEFAULTS.sDurationH).toBe(8);
    expect(CELL_CYCLE_DEFAULTS.deathRatePerHour).toBe(0);
    expect(CELL_CYCLE_DEFAULTS.carryingCapacityCells).toBe(1_000_000);
  });

  it('is registered for replay, so a saved culture run can be rebuilt from its id alone', () => {
    expect(resolveWorldLeverCatalog(GENESIS_CELL_CULTURE_CATALOG_ID)).toBe(GENESIS_CELL_CULTURE_CATALOG);
  });

  it('carries the model\'s own limits into the run, including that it is PARTIALLY_MODELLED', () => {
    const state = runWorldDiscovery('Maximise cell count, at most 2 experiments.', GENESIS_CELL_CULTURE_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;
    const assumptions = state.result.declaredAssumptions.join(' ');
    expect(assumptions).toContain('NOT a measurement of any named cell line');
    expect(assumptions).toContain('PARTIALLY_MODELLED');
    const gaps = state.result.notModelledFactors.join(' ');
    expect(gaps).toContain('Chronological age structure');
    expect(gaps).toContain('no result here is evidence about a therapy');
  });
});
