import { describe, expect, it } from 'vitest';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import { compareBranches, projectToWorldState } from '../core/worldModel/bridge/worldFrameState';
import {
  assessWorldCounterfactual,
  COUNTERFACTUAL_DEPENDENCE_DISCLAIMER,
  diffWorldBranches,
  findFirstDivergenceTick,
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
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  buildWorldEvidenceBundle,
  exportWorldEvidenceBundleRoCrate,
} from '../core/worldModel/evidence/worldEvidenceBundle';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

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
