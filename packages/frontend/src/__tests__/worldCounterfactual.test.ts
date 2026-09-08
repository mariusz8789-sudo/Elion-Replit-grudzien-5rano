import { describe, expect, it } from 'vitest';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import { compareBranches, projectToWorldState } from '../core/worldModel/bridge/worldFrameState';
import {
  assessWorldCounterfactual,
  COUNTERFACTUAL_DEPENDENCE_DISCLAIMER,
  criterionFingerprint,
  diffWorldBranches,
  evidenceMagnitudeFromAssessment,
  findFirstDivergenceTick,
  generateAlternativeHypotheses,
  preregisterWorldCounterfactual,
  readMetric,
  selectNextWorldExperiment,
  verifyControlledDifference,
  verifyWorldPreregistrationIntact,
  WORLD_COUNTERFACTUAL_CONTRACT_VERSION,
  type WorldCounterfactualQuestion,
} from '../core/worldModel/discovery/worldCounterfactual';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
  rainfallSchedule,
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  buildWorldEvidenceBundle,
  exportWorldEvidenceBundleRoCrate,
} from '../core/worldModel/evidence/worldEvidenceBundle';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import { withScheduledEvents } from '../core/worldModel/events/worldEventRules';
import { withCrossDomainCouplings } from '../core/worldModel/crossDomain/crossDomainCoupling';
import { createHypothesis, updateConfidence, rankHypotheses, activeHypotheses } from '../core/experimentFabric/beliefRevision';

/**
 * THE COUNTERFACTUAL BRIDGE, DRIVEN BY THE REAL FLAGSHIP SCENARIO.
 *
 * Everything here runs the actual flood city — real solvers, real cascade —
 * so the assertions are about what the model really does, not about a
 * hand-made diff. The point of the module under test is that a branch diff
 * can finally be judged against a criterion declared before the run, so the
 * tests care most about the gates that refuse to judge.
 */

const TICKS = 12;

function runCity(options: { rainfallAtTick?: number }, registry: TemporalBranchRegistry) {
  const city = buildGenesisScientificCity3(options);
  const engine = new TemporalEngine(city.graph, { registry });
  for (let i = 0; i < TICKS; i++) engine.advance(1, city.updater);
  return engine;
}

function worldStateOf(engine: TemporalEngine) {
  return projectToWorldState(engine.graph, 'genesis-scientific-city-3', 'flood-hydrology', engine.tick, engine.journal.upToTick(engine.tick));
}

/** Baseline (dry) vs intervention (extreme rainfall at tick 2), as two real arms. */
function runArms() {
  const registry = new TemporalBranchRegistry();
  const baseline = runCity({}, registry);
  const storm = runCity({ rainfallAtTick: 2 }, registry);
  const comparison = compareBranches(registry, baseline.branchId, storm.branchId, TICKS);
  return { registry, baseline, storm, comparison, diff: diffWorldBranches(comparison) };
}

const FLOOD_DEPTH_CRITERION: FalsificationCriterion = {
  metric: 'maxDepthM',
  relation: 'greater-than',
  rationale: 'An extreme rainfall event that overloads the drainage pump should leave the floodplain deeper than the dry baseline.',
};

function question(overrides: Partial<WorldCounterfactualQuestion> = {}): WorldCounterfactualQuestion {
  return {
    questionId: 'wcf:flood-depth-under-pump-overload',
    question: 'Does extreme rainfall that overloads the drainage pump leave the floodplain deeper than the dry baseline?',
    worldId: 'genesis-scientific-city-3',
    entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
    interventionDescription: 'Extreme rainfall (80 mm/h) scheduled at tick 2',
    criterion: FLOOD_DEPTH_CRITERION,
    declaredAssumptions: ['Synthetic terrain (PROCEDURAL_APPROXIMATION)', 'No calibration against gauge data'],
    ...overrides,
  };
}

describe('The diff gives a real branch comparison its magnitudes', () => {
  const { diff, comparison } = runArms();

  it('reports per-scalar deltas for the entities the flagship cascade really changed', () => {
    expect(diff.contractVersion).toBe(WORLD_COUNTERFACTUAL_CONTRACT_VERSION);
    expect(diff.atTick).toBe(TICKS);
    expect(diff.changed.length).toBeGreaterThan(0);
    // The floodplain is the entity the storm arm is supposed to move.
    const floodplain = diff.changed.find((e) => e.entityId === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    expect(floodplain.presence).toBe('BOTH');
    expect(floodplain.deltas.length).toBeGreaterThan(0);
    const depth = floodplain.deltas.find((d) => d.key === 'maxDepthM')!;
    expect(depth.intervention).toBeGreaterThan(depth.baseline);
    expect(depth.absoluteDelta).toBeCloseTo(depth.intervention - depth.baseline, 12);
  });

  it('never invents a percentage change from a zero baseline', () => {
    for (const delta of diff.deltas) {
      if (delta.baseline === 0) {
        expect(delta.relativeDeltaPercent).toBeNull();
        expect(delta.relativeDeltaStatus).toBe('BASELINE_ZERO');
      } else {
        expect(delta.relativeDeltaStatus).toBe('AVAILABLE');
        expect(delta.relativeDeltaPercent).toBeCloseTo((delta.absoluteDelta / delta.baseline) * 100, 9);
      }
    }
    // The dry baseline really does start this metric at zero, so the guard is exercised.
    expect(diff.deltas.some((d) => d.relativeDeltaStatus === 'BASELINE_ZERO')).toBe(true);
  });

  it('accounts for every entity the comparison called different', () => {
    const differing = comparison.entityDiffs.filter((d) => !d.equal).length;
    expect(diff.changed.length).toBe(differing);
    expect(diff.unchangedEntityCount).toBe(comparison.entityDiffs.length - differing);
    // An entity that differs with no numeric explanation is named, never silently dropped.
    for (const entity of diff.changed) {
      const explained = entity.deltas.length > 0 || entity.scalarsOnlyOnOneSide.length > 0;
      expect(explained || diff.changedWithoutNumericExplanation.includes(entity.entityId)).toBe(true);
    }
  });

  it('orders deltas deterministically, so two runs of the same scenario diff identically', () => {
    const again = runArms().diff;
    expect(again.deltas.map((d) => `${d.entityId}.${d.key}`)).toEqual(diff.deltas.map((d) => `${d.entityId}.${d.key}`));
    expect(again.deltas.map((d) => d.absoluteDelta)).toEqual(diff.deltas.map((d) => d.absoluteDelta));
  });

  it('readMetric returns the declared pair, or null rather than a guess', () => {
    expect(readMetric(diff, GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID, 'maxDepthM')).not.toBeNull();
    expect(readMetric(diff, GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID, 'noSuchMetric')).toBeNull();
    expect(readMetric(diff, 'entity:does-not-exist', 'maxDepthM')).toBeNull();
  });
});

describe('Control and timing are established from the real branches', () => {
  const { registry, baseline, storm } = runArms();

  it('verifies the two arms held the same world before the intervention could act', () => {
    const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);
    expect(control.status).toBe('VERIFIED_IDENTICAL_START');
    expect(control.differingEntityIds).toEqual([]);
    expect(control.reason).toMatch(/downstream of the declared intervention/);
  });

  it('finds the tick the arms really first diverged at — after the intervention, not before', () => {
    const first = findFirstDivergenceTick(registry, baseline.branchId, storm.branchId, 0, TICKS);
    expect(first).not.toBeNull();
    // The rainfall is scheduled at tick 2, so nothing may differ before it.
    expect(first!).toBeGreaterThanOrEqual(2);
    expect(first!).toBeLessThanOrEqual(TICKS);
    // And the arms really are identical at every tick before that.
    for (let tick = 0; tick < first!; tick++) {
      expect(compareBranches(registry, baseline.branchId, storm.branchId, tick).entityDiffs.every((d) => d.equal)).toBe(true);
    }
  });

  it('reports null when two arms never diverge, instead of naming a tick', () => {
    const twin = new TemporalBranchRegistry();
    const a = runCity({}, twin);
    const b = runCity({}, twin);
    expect(findFirstDivergenceTick(twin, a.branchId, b.branchId, 0, TICKS)).toBeNull();
    expect(verifyControlledDifference(twin, a.branchId, b.branchId, TICKS).status).toBe('VERIFIED_IDENTICAL_START');
  });

  it('detects an uncontrolled pair, where the arms differed before the intervention', () => {
    // Two arms built with DIFFERENT rainfall timings: they are not a controlled pair
    // for a question about the storm, because tick 1 already differs.
    const registryB = new TemporalBranchRegistry();
    const early = runCity({ rainfallAtTick: 1 }, registryB);
    const late = runCity({ rainfallAtTick: 2 }, registryB);
    const control = verifyControlledDifference(registryB, early.branchId, late.branchId, 2);
    expect(control.status).toBe('DIVERGED_AT_START');
    expect(control.differingEntityIds.length).toBeGreaterThan(0);
    expect(control.reason).toMatch(/cannot be attributed/);
  });
});

describe('A verdict requires a criterion declared before the numbers existed', () => {
  const { registry, baseline, storm, diff } = runArms();
  const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);

  it('supports a criterion the real cascade meets, and marks it attributable within the model', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(assessment.attribution).toBe('ATTRIBUTABLE_WITHIN_MODEL');
    expect(assessment.intervention!).toBeGreaterThan(assessment.baseline!);
    expect(assessment.disclaimer).toBe(COUNTERFACTUAL_DEPENDENCE_DISCLAIMER);
  });

  it('falsifies a criterion that predicts the wrong direction — the model is allowed to say no', () => {
    const prereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'less-than', rationale: 'Deliberately wrong direction.' } }),
    );
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(assessment.attribution).toBe('ATTRIBUTABLE_WITHIN_MODEL');
  });

  it('refuses a criterion edited after registration', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const tampered = {
      ...prereg,
      question: { ...prereg.question, criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'less-than' as const } },
    };
    expect(verifyWorldPreregistrationIntact(tampered).intact).toBe(false);
    const assessment = assessWorldCounterfactual({ preregistration: tampered, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    expect(assessment.message).toMatch(/post-hoc/);
  });

  it('refuses to judge an uncontrolled comparison', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const uncontrolled = { ...control, status: 'DIVERGED_AT_START' as const, differingEntityIds: ['pump-pipe-system:pump-pipe-1'] };
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: uncontrolled, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    expect(assessment.attribution).toBe('UNATTRIBUTED');
    expect(assessment.message).toMatch(/not attributable/);
  });

  it('refuses to judge a run that was never reproduced', () => {
    const prereg = preregisterWorldCounterfactual(question());
    for (const verdict of ['DRIFT', 'BLOCKED', 'NOT_REPRODUCIBLE', null] as const) {
      const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: verdict });
      expect(assessment.assessment).toBe('INCONCLUSIVE');
      expect(assessment.message).toMatch(/not independently reproduced/);
    }
  });

  it('reports INCONCLUSIVE — never FALSIFIED — when the declared metric does not exist', () => {
    const prereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, metric: 'metricNoSolverWrites' } }),
    );
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    expect(assessment.baseline).toBeNull();
    expect(assessment.metricPresence).toBe('ABSENT');
    expect(assessment.message).toMatch(/carries no value for the preregistered metric|no counterfactual difference/);
  });

  it('distinguishes a metric that is absent from one that exists and did not move', () => {
    // The intervention really changes the floodplain, and `outletWidthM` really is
    // computed on it — but the storm arm leaves it untouched. Reporting that as a
    // missing metric would send a caller off to bind a solver that already exists.
    const prereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, metric: 'outletWidthM' } }),
    );
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    expect(assessment.metricPresence).toBe('PRESENT_BUT_UNMOVED');
    expect(assessment.message).toMatch(/did not reach it/);

    // And the next-action advice reflects the real finding rather than a missing solver.
    const next = selectNextWorldExperiment(assessment, diff);
    expect(next.kind).toBe('METRIC_PRESENT_BUT_UNMOVED');
    expect(next.why).toMatch(/does not reach that quantity/);
  });

  it('reports INCONCLUSIVE for a relation two arms cannot decide', () => {
    const prereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'monotonic-increase' } }),
    );
    const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    expect(assessment.message).toMatch(/serii punktów/);
  });

  it('carries the in-model disclaimer on every outcome, including the refusals', () => {
    const prereg = preregisterWorldCounterfactual(question());
    for (const verdict of ['MATCH', 'DRIFT'] as const) {
      const assessment = assessWorldCounterfactual({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: verdict });
      expect(assessment.disclaimer).toMatch(/not evidence of a causal relationship in the real world/);
    }
  });
});

describe('The next experiment names the most blocking uncertainty', () => {
  const { registry, baseline, storm, diff } = runArms();
  const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);
  const assess = (input: Parameters<typeof assessWorldCounterfactual>[0]) => assessWorldCounterfactual(input);

  it('asks for a controlled pair before anything else that is fixable', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const uncontrolled = { ...control, status: 'DIVERGED_AT_START' as const, differingEntityIds: ['pump-pipe-system:pump-pipe-1'] };
    const next = selectNextWorldExperiment(assess({ preregistration: prereg, diff, controlledDifference: uncontrolled, replayVerdict: 'DRIFT' }), diff);
    // Control outranks replay: an uncontrolled comparison is not worth reproducing.
    expect(next.kind).toBe('CONTROL_NOT_VERIFIED');
    expect(next.action).toMatch(/forking the baseline/);
  });

  it('asks for a reproduction when the comparison is controlled but unverified', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const next = selectNextWorldExperiment(assess({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: null }), diff);
    expect(next.kind).toBe('REPLAY_NOT_VERIFIED');
    expect(next.status).toBe('READY_TO_RUN');
  });

  it('asks for a sweep when the declared relation needs a series', () => {
    const prereg = preregisterWorldCounterfactual(question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'monotonic-increase' } }));
    const next = selectNextWorldExperiment(assess({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' }), diff);
    expect(next.kind).toBe('RELATION_NEEDS_SERIES');
    expect(next.action).toMatch(/at least three intervention magnitudes/);
  });

  it('blocks on a metric nothing computes, rather than proposing a run that cannot answer it', () => {
    const prereg = preregisterWorldCounterfactual(question({ criterion: { ...FLOOD_DEPTH_CRITERION, metric: 'metricNoSolverWrites' } }));
    const next = selectNextWorldExperiment(assess({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' }), diff);
    expect(next.kind).toBe('METRIC_ABSENT');
    expect(next.status).toBe('BLOCKED');
  });

  it('after a clean supported verdict, asks for a second magnitude rather than declaring victory', () => {
    const prereg = preregisterWorldCounterfactual(question());
    const assessment = assess({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    const next = selectNextWorldExperiment(assessment, diff);
    expect(next.kind).toBe('SINGLE_INTERVENTION_POINT');
    expect(next.why).toMatch(/exactly one intervention magnitude/);
  });

  it('a falsified criterion asks for a NEW question against the real divergence — never repeats the failed one', () => {
    const prereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'less-than', rationale: 'Deliberately wrong direction.' } }),
    );
    const assessment = assess({ preregistration: prereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    const next = selectNextWorldExperiment(assessment, diff);
    expect(next.kind).toBe('HYPOTHESIS_FALSIFIED');
    expect(next.status).toBe('RESOLVED');
    // The action names the REAL measured values, not a vague "try again".
    expect(next.action).toContain(String(assessment.baseline));
    expect(next.action).toContain(String(assessment.intervention));
    expect(next.action).toMatch(/new question/);
  });

  it('the critical test: identical setup, only the outcome differs — confirmation and contradiction plan DIFFERENT next steps', () => {
    // Same diff, same controlled/replayed evidence quality on both sides — the ONLY
    // thing that differs is which direction the criterion predicted, i.e. whether the
    // real result confirmed or contradicted it. If Genesis always proposed the same
    // next step regardless of the answer, this would not be reasoning — see the
    // module's own doc for exactly why HYPOTHESIS_FALSIFIED exists.
    const confirmingPrereg = preregisterWorldCounterfactual(question());
    const contradictingPrereg = preregisterWorldCounterfactual(
      question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'less-than', rationale: 'Deliberately wrong direction.' } }),
    );
    const confirmed = assess({ preregistration: confirmingPrereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    const contradicted = assess({ preregistration: contradictingPrereg, diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(confirmed.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(contradicted.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');

    const nextAfterConfirm = selectNextWorldExperiment(confirmed, diff);
    const nextAfterContradiction = selectNextWorldExperiment(contradicted, diff);

    expect(nextAfterConfirm.kind).not.toBe(nextAfterContradiction.kind);
    expect(nextAfterConfirm.kind).toBe('SINGLE_INTERVENTION_POINT'); // confirmed: check it scales
    expect(nextAfterContradiction.kind).toBe('HYPOTHESIS_FALSIFIED'); // contradicted: stop, explain the real data instead
    expect(nextAfterConfirm.action).not.toBe(nextAfterContradiction.action);
  });

  it('flags a non-diverging pair as a possible wiring fault, not as a finding', () => {
    const twin = new TemporalBranchRegistry();
    const a = runCity({}, twin);
    const b = runCity({}, twin);
    const nullDiff = diffWorldBranches(compareBranches(twin, a.branchId, b.branchId, TICKS));
    expect(nullDiff.changed).toEqual([]);
    const prereg = preregisterWorldCounterfactual(question());
    const assessment = assess({
      preregistration: prereg,
      diff: nullDiff,
      controlledDifference: verifyControlledDifference(twin, a.branchId, b.branchId, 0),
      replayVerdict: 'MATCH',
    });
    expect(assessment.assessment).toBe('INCONCLUSIVE');
    const next = selectNextWorldExperiment(assessment, nullDiff);
    expect(next.kind).toBe('NO_DIVERGENCE');
    expect(next.resolves).toMatch(/intervention not wired/);
  });
});

describe('The verdict travels in the evidence bundle, or is honestly absent', () => {
  const { registry, baseline, storm, comparison, diff } = runArms();
  const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);

  const bundleInput = (assessment?: ReturnType<typeof assessWorldCounterfactual>) => ({
    bundleId: 'genesis-urban-resilience-flood-001',
    question: question().question,
    worldId: 'genesis-scientific-city-3',
    domainId: 'flood-hydrology',
    baseline: { engine: baseline, worldState: worldStateOf(baseline) },
    intervention: { engine: storm, worldState: worldStateOf(storm), description: 'Extreme rainfall (80 mm/h) scheduled at tick 2' },
    comparison,
    seed: null,
    ...(assessment ? { assessment } : {}),
  });

  it('carries the preregistered verdict, its criterion and its disclaimer into the RO-Crate', () => {
    const assessment = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question()),
      diff,
      controlledDifference: control,
      replayVerdict: 'MATCH',
    });
    const bundle = buildWorldEvidenceBundle(bundleInput(assessment));
    expect(bundle.assessment!.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');

    const node = exportWorldEvidenceBundleRoCrate(bundle)['@graph'].find(
      (n) => typeof n['@id'] === 'string' && n['@id'].startsWith('#assessment/'),
    )!;
    expect(node).toBeDefined();
    expect(node['genesis:assessment']).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(node['genesis:attribution']).toBe('ATTRIBUTABLE_WITHIN_MODEL');
    expect(node['genesis:criterion']).toEqual(FLOOD_DEPTH_CRITERION);
    // The in-model caveat is attached to the verdict node itself, so extracting
    // that node alone still carries it.
    expect(String(node['genesis:disclaimer'])).toMatch(/not evidence of a causal relationship in the real world/);
  });

  it('reports no verdict — rather than a weak one — when nothing was preregistered', () => {
    const bundle = buildWorldEvidenceBundle(bundleInput());
    expect(bundle.assessment).toBeNull();
    const nodes = exportWorldEvidenceBundleRoCrate(bundle)['@graph'].filter(
      (n) => typeof n['@id'] === 'string' && n['@id'].startsWith('#assessment/'),
    );
    expect(nodes).toEqual([]);
  });

  it('separates two bundles whose criterion decided differently, by scientific content alone', () => {
    const supported = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question()),
      diff, controlledDifference: control, replayVerdict: 'MATCH',
    });
    const falsified = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question({ criterion: { ...FLOOD_DEPTH_CRITERION, relation: 'less-than' } })),
      diff, controlledDifference: control, replayVerdict: 'MATCH',
    });
    const a = buildWorldEvidenceBundle(bundleInput(supported));
    const b = buildWorldEvidenceBundle(bundleInput(falsified));
    expect(a.scientificContentFingerprint).not.toBe(b.scientificContentFingerprint);
    // The same science with the same verdict still fingerprints identically.
    expect(buildWorldEvidenceBundle(bundleInput(supported)).scientificContentFingerprint).toBe(a.scientificContentFingerprint);
  });
});

describe('evidenceMagnitudeFromAssessment — real magnitude, not a fixed step regardless of how decisive the data was', () => {
  const { registry, baseline, storm, diff } = runArms();
  const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);

  it('is 0 when the assessment could not be evaluated (no real baseline/intervention to measure)', () => {
    const inconclusive = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question({ criterion: { ...FLOOD_DEPTH_CRITERION, metric: 'metricNoSolverWrites' } })),
      diff, controlledDifference: control, replayVerdict: 'MATCH',
    });
    expect(evidenceMagnitudeFromAssessment(inconclusive)).toBe(0);
  });

  it('a decisive real supported result has a real positive magnitude', () => {
    const supported = assessWorldCounterfactual({ preregistration: preregisterWorldCounterfactual(question()), diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(supported.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(evidenceMagnitudeFromAssessment(supported)).toBeGreaterThan(0);
  });
});

describe('criterionFingerprint — content-derived, so a genuinely new criterion is never confused with one already tried', () => {
  it('is identical for two structurally identical criteria and different when any decidable field differs', () => {
    const a = criterionFingerprint(FLOOD_DEPTH_CRITERION);
    const b = criterionFingerprint({ ...FLOOD_DEPTH_CRITERION });
    const flipped = criterionFingerprint({ ...FLOOD_DEPTH_CRITERION, relation: 'less-than' });
    expect(a).toBe(b);
    expect(a).not.toBe(flipped);
  });

  it('ignores the rationale text — two criteria that differ only in prose are the SAME criterion for dedup purposes', () => {
    const a = criterionFingerprint(FLOOD_DEPTH_CRITERION);
    const differentProse = criterionFingerprint({ ...FLOOD_DEPTH_CRITERION, rationale: 'a completely different sentence' });
    expect(a).toBe(differentProse);
  });
});

describe('generateAlternativeHypotheses — mechanical, grounded in the real falsifying data, never invented text', () => {
  const { registry, baseline, storm, diff } = runArms();
  const control = verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0);

  it('produces nothing for a SUPPORTED assessment — there is nothing to explain away', () => {
    const supported = assessWorldCounterfactual({ preregistration: preregisterWorldCounterfactual(question()), diff, controlledDifference: control, replayVerdict: 'MATCH' });
    const parent = createHypothesis('H1', FLOOD_DEPTH_CRITERION, 0.7);
    expect(generateAlternativeHypotheses(parent, supported)).toEqual([]);
  });

  it('RELATION_FLIP: a falsified directional criterion produces the empirically-supported opposite direction', () => {
    const wrongDirection: FalsificationCriterion = { ...FLOOD_DEPTH_CRITERION, relation: 'less-than', rationale: 'Deliberately wrong direction.' };
    const falsified = assessWorldCounterfactual({ preregistration: preregisterWorldCounterfactual(question({ criterion: wrongDirection })), diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(falsified.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    const parent = createHypothesis('H1', wrongDirection, 0.7);
    const alternatives = generateAlternativeHypotheses(parent, falsified);
    expect(alternatives.length).toBe(1);
    expect(alternatives[0].criterion.relation).toBe('greater-than'); // the flip of 'less-than'
    expect(alternatives[0].generatedBy).toBe('RELATION_FLIP');
    expect(alternatives[0].parentHypothesisId).toBe('H1');
    expect(alternatives[0].status).toBe('ACTIVE'); // a new candidate, not yet judged
    // The new criterion is itself real and testable through the SAME pipeline, not a placeholder object.
    const reassessed = assessWorldCounterfactual({ preregistration: preregisterWorldCounterfactual(question({ criterion: alternatives[0].criterion })), diff, controlledDifference: control, replayVerdict: 'MATCH' });
    expect(reassessed.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL'); // grounded in the real data, so it really does hold
  });

  it('negative evidence: an alternative identical to one already rejected is filtered out, not silently regenerated', () => {
    const wrongDirection: FalsificationCriterion = { ...FLOOD_DEPTH_CRITERION, relation: 'less-than', rationale: 'Deliberately wrong direction.' };
    const falsified = assessWorldCounterfactual({ preregistration: preregisterWorldCounterfactual(question({ criterion: wrongDirection })), diff, controlledDifference: control, replayVerdict: 'MATCH' });
    const parent = createHypothesis('H1', wrongDirection, 0.7);
    const alreadyRejected = new Set([criterionFingerprint({ ...FLOOD_DEPTH_CRITERION, relation: 'greater-than' })]);
    expect(generateAlternativeHypotheses(parent, falsified, alreadyRejected)).toEqual([]);
  });
});

/** Real, non-tripping intensity confirmed earlier this session (8 mm/h = 90% below
 * the flagship's 80 mm/h) and the flagship's own tripping intensity — used here to
 * build TWO genuinely different real observations, not one diff assessed two ways. */
function runCityWithIntensity(rainfallAtTick: number, intensityMmPerHour: number, registry: TemporalBranchRegistry) {
  const city = buildGenesisScientificCity3({});
  const updater = withCrossDomainCouplings(
    withScheduledEvents(city.updater, rainfallSchedule(rainfallAtTick, intensityMmPerHour)),
    [city.couplings[0]],
  );
  const engine = new TemporalEngine(city.graph, { registry });
  for (let i = 0; i < TICKS; i++) engine.advance(1, updater);
  return engine;
}

const PUMP_STAYS_OPERATIONAL: FalsificationCriterion = {
  metric: 'volumetricFlow', relation: 'greater-than', expectedValue: 0,
  rationale: 'The pump should stay operational (nonzero flow) under the rainfall load.',
};

describe('THE CRITICAL TEST — same initial hypothesis, two real different observations, genuinely different belief state and next action', () => {
  it('a mild real storm supports "the pump stays operational"; an extreme real storm falsifies the SAME criterion', () => {
    const mildRegistry = new TemporalBranchRegistry();
    const mildBaseline = runCity({}, mildRegistry);
    const mildStorm = runCityWithIntensity(2, 8, mildRegistry); // 8 mm/h: known not to trip the pump
    const mildDiff = diffWorldBranches(compareBranches(mildRegistry, mildBaseline.branchId, mildStorm.branchId, TICKS));
    const mildControl = verifyControlledDifference(mildRegistry, mildBaseline.branchId, mildStorm.branchId, 0);
    const mildAssessment = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question({ entityId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID, criterion: PUMP_STAYS_OPERATIONAL })),
      diff: mildDiff, controlledDifference: mildControl, replayVerdict: 'MATCH',
    });
    expect(mildAssessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');

    const extremeRegistry = new TemporalBranchRegistry();
    const extremeBaseline = runCity({}, extremeRegistry);
    const extremeStorm = runCityWithIntensity(2, 80, extremeRegistry); // the flagship's own tripping intensity
    const extremeDiff = diffWorldBranches(compareBranches(extremeRegistry, extremeBaseline.branchId, extremeStorm.branchId, TICKS));
    const extremeControl = verifyControlledDifference(extremeRegistry, extremeBaseline.branchId, extremeStorm.branchId, 0);
    const extremeAssessment = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual(question({ entityId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID, criterion: PUMP_STAYS_OPERATIONAL })),
      diff: extremeDiff, controlledDifference: extremeControl, replayVerdict: 'MATCH',
    });
    expect(extremeAssessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(extremeAssessment.intervention).toBe(0); // the real trip, not a guessed number
  });

  it('THE REQUEST\'S OWN WORKED EXAMPLE, made executable: H1 = 0.7, one supporting real observation, one contradicting real observation, different ranking, different next action each time', () => {
    // --- Setup: the same two real observations from the test above, this time driving belief state. ---
    const mildRegistry = new TemporalBranchRegistry();
    const mildBaseline = runCity({}, mildRegistry);
    const mildStorm = runCityWithIntensity(2, 8, mildRegistry);
    const mildDiff = diffWorldBranches(compareBranches(mildRegistry, mildBaseline.branchId, mildStorm.branchId, TICKS));
    const mildControl = verifyControlledDifference(mildRegistry, mildBaseline.branchId, mildStorm.branchId, 0);

    const extremeRegistry = new TemporalBranchRegistry();
    const extremeBaseline = runCity({}, extremeRegistry);
    const extremeStorm = runCityWithIntensity(2, 80, extremeRegistry);
    const extremeDiff = diffWorldBranches(compareBranches(extremeRegistry, extremeBaseline.branchId, extremeStorm.branchId, TICKS));
    const extremeControl = verifyControlledDifference(extremeRegistry, extremeBaseline.branchId, extremeStorm.branchId, 0);

    function assess(diff: ReturnType<typeof diffWorldBranches>, control: ReturnType<typeof verifyControlledDifference>) {
      return assessWorldCounterfactual({
        preregistration: preregisterWorldCounterfactual(question({ entityId: GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID, criterion: PUMP_STAYS_OPERATIONAL })),
        diff, controlledDifference: control, replayVerdict: 'MATCH',
      });
    }

    // === RUN A: starts at confidence 0.7, observes the SUPPORTING (mild) evidence first. ===
    let h1a = createHypothesis('H1', PUMP_STAYS_OPERATIONAL, 0.7);
    const initialConfidenceA = h1a.confidence;
    const assessmentA = assess(mildDiff, mildControl);
    h1a = updateConfidence(h1a, assessmentA.assessment, evidenceMagnitudeFromAssessment(assessmentA), 'mild real storm: pump stayed operational', 0);
    expect(h1a.confidence).toBeGreaterThan(initialConfidenceA); // real rise
    expect(h1a.status).toBe('SUPPORTED_WITHIN_PROTOCOL');
    const nextActionA = selectNextWorldExperiment(assessmentA, mildDiff);

    // === RUN B: SAME initial hypothesis (same criterion, same prior 0.7) — the ONLY thing that differs
    // is which real observation it sees first: the CONTRADICTING (extreme) one. ===
    let h1b = createHypothesis('H1', PUMP_STAYS_OPERATIONAL, 0.7);
    const initialConfidenceB = h1b.confidence;
    const assessmentB = assess(extremeDiff, extremeControl);
    h1b = updateConfidence(h1b, assessmentB.assessment, evidenceMagnitudeFromAssessment(assessmentB), 'extreme real storm: pump tripped', 0);
    expect(h1b.confidence).toBeLessThan(initialConfidenceB); // real fall
    expect(h1b.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
    const nextActionB = selectNextWorldExperiment(assessmentB, extremeDiff);

    // THE ASSERTION THAT MATTERS: same starting hypothesis, different real observation ->
    // different belief state AND a genuinely different next action. If this ever regresses to
    // "same kind either way", adaptive reasoning has silently reverted to fixed-sequence orchestration.
    expect(h1a.confidence).not.toBeCloseTo(h1b.confidence, 1);
    expect(h1a.status).not.toBe(h1b.status);
    expect(nextActionA.kind).not.toBe(nextActionB.kind);
    expect(nextActionB.kind).toBe('HYPOTHESIS_FALSIFIED');

    // === Genesis learns from the falsification: generate a real alternative, rank it against
    // the original, and confirm it is now the leading (only active) hypothesis. ===
    const alternatives = generateAlternativeHypotheses(h1b, assessmentB);
    expect(alternatives.length).toBeGreaterThan(0);
    const ranked = rankHypotheses([h1b, ...alternatives]);
    expect(activeHypotheses(ranked).map((h) => h.id)).toEqual(alternatives.map((h) => h.id)); // h1b is closed (falsified), only the new candidate(s) remain in play
  });
});
