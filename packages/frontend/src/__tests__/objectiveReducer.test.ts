import { describe, expect, it } from 'vitest';
import { GENESIS_EPIDEMIC_CATALOG, GENESIS_EPIDEMIC_POPULATION_ID } from '../core/agent/epidemicLeverCatalog';
import { AT_HORIZON } from '../core/experimentFabric/objectiveReducer';
import { reduceObjectiveTrajectory } from '../core/worldModel/discovery/objectiveTrajectory';
import {
  assessWorldCounterfactual,
  diffWorldBranches,
  forkedArmControl,
  preregisterWorldCounterfactual,
} from '../core/worldModel/discovery/worldCounterfactual';
import { collectScalars, compareBranches } from '../core/worldModel/bridge/worldFrameState';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

/**
 * OBJECTIVE REDUCER — measured on the REAL SEIR substrate, not a synthetic series.
 *
 * Every number asserted below was read off a probe of this exact world before
 * the assertion was written, per the repo's measure-first rule. The headline
 * fact this whole contract exists for, at day 200 of the real epidemic:
 *
 *   baseline  AT_HORIZON 0.566   MAX 16156.6   SUM 624779.7   ARGMAX 73
 *   distanced AT_HORIZON 26.39   MAX    28.7   SUM   5455.2   ARGMAX 19
 *
 * Read at the horizon, the distancing arm is HIGHER than the baseline, because
 * the baseline already burnt through the population while the intervention
 * still has people left to infect. A criterion asking to minimise I is
 * therefore FALSIFIED — about an intervention that cut the peak by a factor of
 * 562 and the cumulative burden by 115. That is not a modelling error; it is
 * the horizon answering a question nobody asked.
 */

const CATALOG = GENESIS_EPIDEMIC_CATALOG;
const LATE_HORIZON = 200;

function twoArms(horizon: number) {
  const world = CATALOG.buildWorld();
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
  for (let i = 0; i < horizon; i++) baseline.advance(CATALOG.dt, world.updater);

  const lever = CATALOG.levers.find((l) => l.leverId === 'lever:distancing')!;
  const hypothesis = lever.hypothesis('I', 'minimize');
  const arm = baseline.forkBranch(CATALOG.decisionAtTick, 'distancing@1', (graph) => hypothesis.apply(graph, 1));
  for (let t = CATALOG.decisionAtTick; t < horizon; t++) arm.advance(CATALOG.dt, world.updater);

  return { registry, baseline, arm, hypothesis, horizon };
}

function reduce(engine: TemporalEngine, reducer: Parameters<typeof reduceObjectiveTrajectory>[3], horizon: number) {
  return reduceObjectiveTrajectory(engine, GENESIS_EPIDEMIC_POPULATION_ID, 'I', reducer, CATALOG.decisionAtTick, horizon);
}

describe('objective reducer — the trajectory scan', () => {
  it('AT_HORIZON is exactly the single-tick read it replaces', () => {
    // The backward-compatibility gate: every criterion that declares no reducer
    // must keep reading precisely the value the hand-rolled `objectiveAt` and
    // `objectiveValueAt` read, or dozens of committed tests are silently wrong.
    const { baseline } = twoArms(LATE_HORIZON);
    const direct = collectScalars(baseline.scrubTo(LATE_HORIZON).tryGetEntity(GENESIS_EPIDEMIC_POPULATION_ID)!)['I'];

    const reduction = reduce(baseline, AT_HORIZON, LATE_HORIZON);
    expect(reduction.value).toBe(direct);
    // One read, not a scan — the historical path stays exactly as cheap.
    expect(reduction.ticksScanned).toBe(1);
  });

  it('measures the gap the horizon hides: the peak diverges where the endpoint does not', () => {
    const { baseline, arm } = twoArms(LATE_HORIZON);

    // At the horizon the intervention arm reads HIGHER — the epidemic it
    // prevented has not finished happening.
    expect(reduce(arm, AT_HORIZON, LATE_HORIZON).value!).toBeGreaterThan(
      reduce(baseline, AT_HORIZON, LATE_HORIZON).value!,
    );

    // At the peak it reads two orders of magnitude LOWER. Same run, same data.
    const baselinePeak = reduce(baseline, { kind: 'MAX' }, LATE_HORIZON).value!;
    const armPeak = reduce(arm, { kind: 'MAX' }, LATE_HORIZON).value!;
    expect(baselinePeak).toBeGreaterThan(16_000);
    expect(armPeak).toBeLessThan(30);
    expect(baselinePeak / armPeak).toBeGreaterThan(100);
  });

  it('ARGMAX reports the tick of the peak, and the flattened arm peaks earlier', () => {
    const { baseline, arm } = twoArms(LATE_HORIZON);
    const baselineDay = reduce(baseline, { kind: 'ARGMAX' }, LATE_HORIZON).value!;
    const armDay = reduce(arm, { kind: 'ARGMAX' }, LATE_HORIZON).value!;

    expect(baselineDay).toBe(73);
    expect(armDay).toBe(19);
    // Both inside the scanned window — a tick number, never a metric value.
    for (const day of [baselineDay, armDay]) {
      expect(day).toBeGreaterThanOrEqual(CATALOG.decisionAtTick);
      expect(day).toBeLessThanOrEqual(LATE_HORIZON);
    }
  });

  it('SUM is the sum of the samples it actually read, and nothing more', () => {
    // Asserted against an independent re-scan rather than a remembered constant:
    // this is the one reducer whose meaning could drift into "integral" by
    // accident, and the test states what it really is.
    const { baseline } = twoArms(LATE_HORIZON);
    let expected = 0;
    for (let t = CATALOG.decisionAtTick; t <= LATE_HORIZON; t++) {
      const value = collectScalars(baseline.scrubTo(t).tryGetEntity(GENESIS_EPIDEMIC_POPULATION_ID)!)['I'];
      if (typeof value === 'number' && Number.isFinite(value)) expected += value;
    }
    expect(reduce(baseline, { kind: 'SUM' }, LATE_HORIZON).value).toBeCloseTo(expected, 6);
  });

  it('FIRST_CROSSING finds a real crossing, and refuses to invent one that never happened', () => {
    const { baseline } = twoArms(LATE_HORIZON);

    const crossed = reduce(baseline, { kind: 'FIRST_CROSSING', threshold: 1000, direction: 'above' }, LATE_HORIZON);
    expect(crossed.value).not.toBeNull();
    // Before the peak, which is where a rise through 1000 has to happen.
    expect(crossed.value!).toBeLessThan(73);

    const never = reduce(baseline, { kind: 'FIRST_CROSSING', threshold: 1e9, direction: 'above' }, LATE_HORIZON);
    expect(never.value).toBeNull();
    // A null carries its reason, so the assessment can explain itself rather
    // than reporting an unexplained INCONCLUSIVE.
    expect(never.reason).toContain('never crossed');
    expect(never.samplesRead).toBeGreaterThan(0);
  });

  it('names what it could not read instead of returning a silent null', () => {
    const { baseline } = twoArms(60);
    const missing = reduceObjectiveTrajectory(
      baseline, GENESIS_EPIDEMIC_POPULATION_ID, 'no-such-metric', { kind: 'MAX' }, CATALOG.decisionAtTick, 60,
    );
    expect(missing.value).toBeNull();
    expect(missing.samplesRead).toBe(0);
    expect(missing.reason).toContain('no-such-metric');
  });
});

describe('objective reducer — the verdict it feeds', () => {
  function assess(reducerOverride: 'none' | 'max') {
    const { registry, baseline, arm, hypothesis, horizon } = twoArms(LATE_HORIZON);
    const criterion: FalsificationCriterion = { ...hypothesis.criterion, metric: 'I', relation: 'less-than' };

    const preregistration = preregisterWorldCounterfactual({
      questionId: 'q:distancing',
      question: hypothesis.statement,
      worldId: CATALOG.worldId,
      entityId: GENESIS_EPIDEMIC_POPULATION_ID,
      interventionDescription: 'distancing at strength 1',
      criterion,
      declaredAssumptions: CATALOG.declaredAssumptions,
    });
    const diff = diffWorldBranches(compareBranches(registry, baseline.branchId, arm.branchId, horizon));
    const { controlledDifference } = forkedArmControl(registry, baseline.branchId, arm.branchId, CATALOG.decisionAtTick);

    const override =
      reducerOverride === 'none'
        ? undefined
        : {
            reducerKind: 'MAX' as const,
            baseline: reduce(baseline, { kind: 'MAX' }, horizon).value,
            intervention: reduce(arm, { kind: 'MAX' }, horizon).value,
            reason: null,
          };

    return assessWorldCounterfactual({
      preregistration, diff, controlledDifference, replayVerdict: 'MATCH', objectiveOverride: override,
    });
  }

  it('the horizon falsifies an intervention that really worked — the defect, reproduced', () => {
    const verdict = assess('none');
    expect(verdict.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(verdict.objectiveReducerKind).toBeNull();
  });

  it('the same run, measured at the peak, is supported — and says which reducer decided it', () => {
    const verdict = assess('max');
    expect(verdict.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(verdict.objectiveReducerKind).toBe('MAX');
    // The numbers judged are the reduced ones, not the diff's horizon values.
    expect(verdict.baseline!).toBeGreaterThan(16_000);
    expect(verdict.intervention!).toBeLessThan(30);
    expect(verdict.metricPresence).toBe('PRESENT_AND_MOVED');
  });

  it('a reducer that found nothing stays INCONCLUSIVE, never falsified', () => {
    const { registry, baseline, arm, hypothesis, horizon } = twoArms(LATE_HORIZON);
    const preregistration = preregisterWorldCounterfactual({
      questionId: 'q:never-crosses',
      question: hypothesis.statement,
      worldId: CATALOG.worldId,
      entityId: GENESIS_EPIDEMIC_POPULATION_ID,
      interventionDescription: 'distancing at strength 1',
      criterion: { ...hypothesis.criterion, metric: 'I', relation: 'less-than' },
      declaredAssumptions: CATALOG.declaredAssumptions,
    });
    const never = { kind: 'FIRST_CROSSING' as const, threshold: 1e9, direction: 'above' as const };
    const verdict = assessWorldCounterfactual({
      preregistration,
      diff: diffWorldBranches(compareBranches(registry, baseline.branchId, arm.branchId, horizon)),
      controlledDifference: forkedArmControl(registry, baseline.branchId, arm.branchId, CATALOG.decisionAtTick).controlledDifference,
      replayVerdict: 'MATCH',
      objectiveOverride: {
        reducerKind: 'FIRST_CROSSING',
        baseline: reduce(baseline, never, horizon).value,
        intervention: reduce(arm, never, horizon).value,
        reason: reduce(baseline, never, horizon).reason,
      },
    });
    // Failing to evaluate a criterion is not evaluating it and finding it false.
    expect(verdict.assessment).toBe('INCONCLUSIVE');
    expect(verdict.metricPresence).toBe('ABSENT');
    expect(verdict.message).toContain('never crossed');
  });
});
