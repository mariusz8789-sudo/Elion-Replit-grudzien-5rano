import { describe, expect, it } from 'vitest';
import {
  BASELINE_OPTION_ID,
  DECISION_SUPPORT_CONTRACT_VERSION,
  evaluateDecision,
  eventsUniqueToOption,
  type DecisionOption,
  type DecisionQuestion,
} from '../core/worldModel/decision/decisionSupport';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
} from '../core/worldModel/domains/genesisScientificCity3';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * DECISION SUPPORT ON THE REAL FLAGSHIP CITY.
 *
 * The options below are real interventions on the real flood model, and the
 * expected ordering was read off the model rather than assumed: raising the
 * floodplain's infiltration rate really does reduce peak depth, and widening
 * the outlet really does nothing here, because the water never reaches the
 * outlet sill within the horizon. Both outcomes are asserted as the model
 * gives them — the point of these tests is that the module reports what the
 * world does, including when the answer is "these options are the same".
 */

const DECISION_TICK = 1;
const HORIZON_TICK = 24;
const DT_S = 600; // 10-minute steps: the flood needs hours to develop, not seconds.

/** Sets one scalar on the floodplain at the decision tick. */
function setFloodplainScalar(key: string, value: number): DecisionOption['apply'] {
  return (graph) => {
    const floodplain = graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    graph.updateEntity(floodplain.id, { domainState: { ...floodplain.domainState, [key]: value } });
  };
}

/**
 * Surface infiltration rates achievable with permeable paving are well above
 * the default soil rate; these two levels stand for a full and a partial
 * retrofit. They are inputs to the decision, not calibrated design figures.
 */
const FULL_SUDS_INFILTRATION_M_S = 1.0e-4;
const PARTIAL_SUDS_INFILTRATION_M_S = 2.5e-5;

const PERMEABLE: DecisionOption = {
  optionId: 'option:permeable-surfaces-full',
  label: 'Permeable surfaces across the floodplain',
  description: `Raises floodplain infiltration to ${FULL_SUDS_INFILTRATION_M_S} m/s`,
  apply: setFloodplainScalar('infiltrationRateMPerS', FULL_SUDS_INFILTRATION_M_S),
};
const PARTIAL: DecisionOption = {
  optionId: 'option:permeable-surfaces-partial',
  label: 'Partial permeable-surface retrofit',
  description: `Raises floodplain infiltration to ${PARTIAL_SUDS_INFILTRATION_M_S} m/s`,
  apply: setFloodplainScalar('infiltrationRateMPerS', PARTIAL_SUDS_INFILTRATION_M_S),
};
const WIDEN_OUTLET: DecisionOption = {
  optionId: 'option:widen-outlet',
  label: 'Widen the outlet channel',
  description: 'Widens the floodplain outlet to 20 m',
  apply: setFloodplainScalar('outletWidthM', 20),
};
const BIGGER_PUMP: DecisionOption = {
  optionId: 'option:larger-pump',
  label: 'Install a higher-capacity pump',
  description: 'Doubles the pump-pipe volumetric flow',
  apply: (graph) => {
    const pump = graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID)!;
    graph.updateEntity(pump.id, {
      domainState: { ...pump.domainState, volumetricFlow: (pump.domainState!.volumetricFlow as number) * 2 },
    });
  },
};
const LEAFLETS: DecisionOption = {
  optionId: 'option:public-information-leaflets',
  label: 'Distribute public information leaflets',
  description: 'A real policy option that this world does not represent at all',
  apply: () => {},
};

function question(overrides: Partial<DecisionQuestion> = {}): DecisionQuestion {
  return {
    decisionId: 'decision:flood-mitigation-before-storm',
    question: 'Given a storm is forecast, which mitigation minimises peak flood depth?',
    worldId: 'genesis-scientific-city-3',
    domainId: 'flood-hydrology',
    objective: {
      metric: 'maxDepthM',
      entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
      direction: 'minimize',
      rationale: 'Peak depth is what damages buildings and blocks access.',
    },
    decisionAtTick: DECISION_TICK,
    horizonTick: HORIZON_TICK,
    options: [PERMEABLE, PARTIAL, WIDEN_OUTLET, BIGGER_PUMP, LEAFLETS],
    declaredAssumptions: [
      'Synthetic terrain (PROCEDURAL_APPROXIMATION) — not surveyed ground',
      'A single storm, at one intensity, with no calibration against gauge data',
    ],
    notModelledFactors: [
      'Construction cost and funding',
      'Time to build — every option is applied instantly here',
      'Maintenance, clogging and long-term performance decay',
      'Who bears the flood risk that remains',
    ],
    ...overrides,
  };
}

/** The storm arm as the do-nothing baseline: a flood is coming either way. */
function baselineCity() {
  const city = buildGenesisScientificCity3({ rainfallAtTick: 2 });
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(city.graph, { registry });
  for (let i = 0; i < HORIZON_TICK; i++) baseline.advance(DT_S, city.updater);
  return { registry, baseline, updater: city.updater };
}

function evaluate(overrides: Partial<DecisionQuestion> = {}) {
  const { registry, baseline, updater } = baselineCity();
  return evaluateDecision({ question: question(overrides), baseline, registry, updater, dt: DT_S });
}

describe('Options are run as real forked arms of the real world', () => {
  const report = evaluate();

  it('forks every arm from the baseline, so the control holds by construction', () => {
    expect(report.contractVersion).toBe(DECISION_SUPPORT_CONTRACT_VERSION);
    expect(report.outcomes).toHaveLength(5);
    for (const outcome of report.outcomes) {
      expect(outcome.sharedHistoryUpToTick).toBe(DECISION_TICK);
    }
  });

  it('reports each intervention\'s footprint — what its apply really touched, and nothing wider', () => {
    // Every floodplain option must touch the floodplain and only the floodplain: an
    // apply that reached further would break the control this module rests on, and the
    // footprint is where that would be visible.
    for (const optionId of [PERMEABLE.optionId, PARTIAL.optionId, WIDEN_OUTLET.optionId]) {
      const outcome = report.outcomes.find((o) => o.optionId === optionId)!;
      expect(outcome.interventionFootprint).toEqual([GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID]);
    }
    expect(report.outcomes.find((o) => o.optionId === BIGGER_PUMP.optionId)!.interventionFootprint).toEqual([
      GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
    ]);
    // An option the world cannot represent leaves no footprint at all.
    expect(report.outcomes.find((o) => o.optionId === LEAFLETS.optionId)!.interventionFootprint).toEqual([]);
  });

  it('reports the option that really works, with a real reduction in peak depth', () => {
    const permeable = report.outcomes.find((o) => o.optionId === PERMEABLE.optionId)!;
    expect(permeable.status).toBe('EVALUATED');
    expect(permeable.objectiveValue).toBeLessThan(report.baselineValue!);
    expect(permeable.deltaVsBaseline).toBeLessThan(0);
    // More infiltration removes more water: the fuller retrofit must beat the partial one.
    const partial = report.outcomes.find((o) => o.optionId === PARTIAL.optionId)!;
    expect(permeable.objectiveValue!).toBeLessThan(partial.objectiveValue!);
    expect(partial.objectiveValue!).toBeLessThan(report.baselineValue!);
  });

  it('reports an option that changes the world but not the objective, without dressing it up', () => {
    // Widening the outlet changes the floodplain entity, but within this horizon the
    // water never reaches the outlet sill, so peak depth is untouched. The module must
    // report a real zero rather than an apparent benefit.
    const widen = report.outcomes.find((o) => o.optionId === WIDEN_OUTLET.optionId)!;
    expect(widen.status).toBe('EVALUATED');
    expect(widen.changedEntityCount).toBeGreaterThan(0);
    expect(widen.deltaVsBaseline).toBe(0);
  });

  it('reports an option the world does not represent at all as having no modelled effect', () => {
    const leaflets = report.outcomes.find((o) => o.optionId === LEAFLETS.optionId)!;
    expect(leaflets.status).toBe('NO_MODELLED_EFFECT');
    expect(leaflets.changedEntityCount).toBe(0);
    expect(leaflets.firstDivergenceTick).toBeNull();
    // The honest reading is stated: this is as likely a gap in the model as a fact about the option.
    expect(leaflets.reason).toMatch(/no modelled effect, or it was never wired/);
  });

  it('shows an intuitively protective option making the objective slightly worse', () => {
    // Asserted because the model really does this, not because it is the appealing
    // answer: a higher-capacity pump moves more water into the floodplain, so peak
    // depth rises a little. An option can be worse than doing nothing, and a decision
    // surface that could not report that would be worthless.
    const pump = report.outcomes.find((o) => o.optionId === BIGGER_PUMP.optionId)!;
    expect(pump.status).toBe('EVALUATED');
    expect(pump.changedEntityCount).toBeGreaterThan(0);
    expect(pump.deltaVsBaseline!).toBeGreaterThan(0);
    expect(pump.objectiveValue!).toBeGreaterThan(report.baselineValue!);
  });
});

describe('The ranking is an ordering of modelled outcomes, never a recommendation', () => {
  const report = evaluate();

  it('ranks doing nothing alongside the interventions', () => {
    const baselineRow = report.ranking.find((r) => r.optionId === BASELINE_OPTION_ID)!;
    expect(baselineRow).toBeDefined();
    expect(baselineRow.objectiveValue).toBe(report.baselineValue);
    expect(baselineRow.deltaVsBaseline).toBe(0);
  });

  it('puts the genuinely effective option first and orders the rest by the real numbers', () => {
    expect(report.rankingStatus).toBe('RANKED');
    expect(report.bestModelledOptionIds).toEqual([PERMEABLE.optionId]);
    expect(report.ranking[0].optionId).toBe(PERMEABLE.optionId);
    expect(report.ranking[1].optionId).toBe(PARTIAL.optionId);
    // Minimising: values must ascend down the ranking.
    for (let i = 1; i < report.ranking.length; i++) {
      expect(report.ranking[i].objectiveValue).toBeGreaterThanOrEqual(report.ranking[i - 1].objectiveValue);
    }
  });

  it('gives equal ranks to options the model cannot tell apart', () => {
    // Doing nothing, widening the outlet and the leaflets all end at the same depth.
    const tiedValue = report.baselineValue!;
    const tied = report.ranking.filter((r) => r.objectiveValue === tiedValue);
    expect(tied.length).toBeGreaterThan(1);
    expect(new Set(tied.map((r) => r.rank)).size).toBe(1);
  });

  it('reports a tie at the top as a tie, instead of picking a winner', () => {
    const tiedReport = evaluate({ options: [WIDEN_OUTLET, BIGGER_PUMP, LEAFLETS] });
    expect(tiedReport.rankingStatus).toBe('TIED');
    // Doing nothing is among the joint best — the honest answer when nothing declared helps.
    expect(tiedReport.bestModelledOptionIds).toContain(BASELINE_OPTION_ID);
    expect(tiedReport.bestModelledOptionIds.length).toBeGreaterThan(1);
    expect(tiedReport.rankingReason).toMatch(/will not break the tie/);
  });

  it('carries the objective\'s grounding, so the ordering is not read as better than its world', () => {
    // The floodplain sits on synthetic terrain, and the report says so rather than
    // presenting the ranking as survey-grade.
    expect(report.objectiveGrounding).toBe('PROCEDURAL_APPROXIMATION');
    expect(report.objectiveClassification).toBe('APPROXIMATION');
    expect(report.rankingReason).toMatch(/only as good as that approximation/);
  });

  it('carries what the decision really turns on that the model does not represent', () => {
    expect(report.notModelledFactors.length).toBeGreaterThan(0);
    expect(report.notModelledFactors.join(' ')).toMatch(/cost/i);
    expect(report.disclaimer).toMatch(/not a recommendation/);
    expect(report.disclaimer).toMatch(/Options not declared were not considered/);
  });

  it('exposes no field a consumer could mistake for a recommendation', () => {
    expect(Object.keys(report)).not.toContain('recommendation');
    expect(Object.keys(report)).not.toContain('recommended');
    // The winner field is plural precisely because ties are possible.
    expect(Array.isArray(report.bestModelledOptionIds)).toBe(true);
  });
});

describe('It refuses to rank rather than publishing a meaningless order', () => {
  it('refuses when nothing in the world computes the objective metric', () => {
    const report = evaluate({
      objective: {
        metric: 'metricNoSolverWrites',
        entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
        direction: 'minimize',
        rationale: 'Deliberately unmodelled.',
      },
    });
    expect(report.rankingStatus).toBe('NOT_RANKABLE');
    expect(report.ranking).toEqual([]);
    expect(report.bestModelledOptionIds).toEqual([]);
    expect(report.rankingReason).toMatch(/nothing to measure the options against/);
    for (const outcome of report.outcomes) expect(outcome.status).toBe('NOT_EVALUABLE');
  });

  it('refuses when the objective entity is not in the world at all', () => {
    const report = evaluate({
      objective: {
        metric: 'maxDepthM',
        entityId: 'floodplain:does-not-exist',
        direction: 'minimize',
        rationale: 'Deliberately absent.',
      },
    });
    expect(report.rankingStatus).toBe('NOT_RANKABLE');
    expect(report.objectiveGrounding).toBeNull();
    expect(report.rankingReason).toMatch(/Nothing in this world models/);
  });

  it('refuses when no option was declared, rather than declaring inaction optimal', () => {
    const report = evaluate({ options: [] });
    expect(report.rankingStatus).toBe('NOT_RANKABLE');
    expect(report.bestModelledOptionIds).toEqual([]);
    expect(report.rankingReason).toMatch(/nothing to compare with taking no action/);
  });
});

describe('The evaluation is reproducible and traceable to real events', () => {
  it('produces identical rankings for identical questions', () => {
    const a = evaluate();
    const b = evaluate();
    expect(b.ranking.map((r) => [r.optionId, r.rank, r.objectiveValue])).toEqual(
      a.ranking.map((r) => [r.optionId, r.rank, r.objectiveValue]),
    );
    expect(b.baselineValue).toBe(a.baselineValue);
  });

  it('maximising the same metric reverses the order, confirming the direction is really used', () => {
    const minimised = evaluate();
    const maximised = evaluate({
      objective: { ...question().objective, direction: 'maximize', rationale: 'Direction check.' },
    });
    expect(maximised.ranking[maximised.ranking.length - 1].optionId).toBe(PERMEABLE.optionId);
    expect(maximised.bestModelledOptionIds).not.toEqual(minimised.bestModelledOptionIds);
  });

  it('an option arm really produces events the baseline never did', () => {
    const { registry, baseline, updater } = baselineCity();
    const arm = baseline.forkBranch(DECISION_TICK, 'permeable', PERMEABLE.apply);
    for (let tick = DECISION_TICK; tick < HORIZON_TICK; tick++) arm.advance(DT_S, updater);
    registry.get(arm.branchId); // the fork registered itself in the shared registry
    const unique = eventsUniqueToOption(baseline, arm);
    expect(unique.length).toBeGreaterThan(0);
    // Content-addressed ids: an event unique to this arm reflects different physics,
    // not merely a different run order.
    expect(unique.every((event) => event.timestamp >= DECISION_TICK)).toBe(true);
  });
});
