import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../core/simulation/scenarioEngine';
import {
  openScenarioVariantInWorld,
  openTemporalMultiverseBranchInWorld,
  replayScenarioCommandCenter,
  runScenarioCommandCenter,
  runTemporalMultiverseCommandCenter,
  scenarioParamsFromCommandCenter,
  scenarioUiMetrics,
  temporalTimelinesFor,
} from '../core/simulation/scenarioCommandCenter';
import { clearScenarioTimelineHandoffs, peekPendingScenarioTimeline } from '../core/experimentFabric/worldHandoff';
import { temporalStateAt } from '../core/simulation/temporalState';

const params = {
  nAgents: 120, initialInfected: 4, r0: 2.5, infectiousDays: 6, incubationDays: 3, ifr: 0.02,
  contactRadius: 14, transmissionScale: 1, restrictions: 0, isolate: false, mobility: 0.85,
  severeRate: 0.15, closeSchools: false, householdTransmissionScale: 1, seed: 20260817, clockSpeed: 50,
};

describe('Scenario Command Center adapter', () => {
  it('runs the existing baseline and an existing intervention with one shared input state', () => {
    const run = runScenarioCommandCenter('ISOLATION', params);
    expect(run.baseline.scenarioId).toBe('BASELINE');
    expect(run.baseline.status).toBe('COMPLETED');
    expect(run.intervention.scenarioId).toBe('ISOLATION');
    expect(run.intervention.status).toBe('COMPLETED');
    expect(run.comparison.status).toBe('COMPLETED');
    expect(run.comparison.baselineScenario).toBe('BASELINE');
    expect(run.comparison.variantScenario).toBe('ISOLATION');
  });

  it('opens a completed WHAT IF variant through the existing World timeline handoff', () => {
    clearScenarioTimelineHandoffs();
    const run = runScenarioCommandCenter('ISOLATION', params, { variantInterventionStartDay: 7 });
    const handoffRunId = openScenarioVariantInWorld(run);
    const pending = peekPendingScenarioTimeline();
    expect(handoffRunId).toBe(`what-if:${run.counterfactualFingerprint}`);
    expect(pending?.origin).toBe('fabric-run');
    expect(pending?.epistemicStatus).toBe('SIMULATION');
    expect(pending?.scenarioRun).toBe(run.intervention);
    expect(pending?.counterfactual?.counterfactualFingerprint).toBe(run.counterfactualFingerprint);
    clearScenarioTimelineHandoffs();
  });

  it('exposes only real summary values and preserves replay determinism', () => {
    const first = runScenarioCommandCenter('ISOLATION', params);
    const second = runScenarioCommandCenter('ISOLATION', params);
    expect(first.intervention.resultFingerprint).toBe(second.intervention.resultFingerprint);
    expect(scenarioUiMetrics(first.baseline, first.intervention).find((metric) => metric.key === 'hospitalizedEver')?.baseline).not.toBeNull();
    expect(replayScenarioCommandCenter(first).map((replay) => replay.status)).toEqual(['MATCH', 'MATCH']);
  });

  it('does not turn a non-modelled intervention into a fabricated comparison', () => {
    const run = runScenarioCommandCenter('TRANSPORT_REDUCTION', params);
    expect(SCENARIOS.TRANSPORT_REDUCTION.notModeledReason).toBeTruthy();
    expect(run.intervention.status).toBe('NOT_MODELED');
    expect(run.comparison.status).toBe('BLOCKED_NOT_MODELED');
    expect(scenarioUiMetrics(run.baseline, run.intervention).every((metric) => metric.intervention === null)).toBe(true);
  });

  it('filters render-only controls out of Scenario Engine input', () => {
    const normalized = scenarioParamsFromCommandCenter(params);
    expect(normalized.seed).toBe(params.seed);
    expect('clockSpeed' in normalized).toBe(false);
  });

  it('passes a selected temporal day as the existing variant intervention start', () => {
    const run = runScenarioCommandCenter('ISOLATION', params, { variantInterventionStartDay: 7 });
    expect(run.baseline.interventionStartDay).toBe(0);
    expect(run.intervention.interventionStartDay).toBe(7);
    expect(run.intervention.series.slice(0, 6)).toEqual(run.baseline.series.slice(0, 6));
  });

  it('measures a real divergence day instead of assuming the intervention start', () => {
    const run = runScenarioCommandCenter('ISOLATION', params);
    // ISOLATION differs from BASELINE from day 0 here (no delayed-start control
    // in this adapter), so the arms must diverge — the measured day comes from
    // the same firstDivergentDay() the counterfactual engine already tests.
    expect(run.firstDivergentDay).not.toBeNull();
    expect(run.counterfactualFingerprint).toBeTruthy();
  });

  it('is deterministic: same inputs give the same measured divergence and fingerprint', () => {
    const first = runScenarioCommandCenter('ISOLATION', params);
    const second = runScenarioCommandCenter('ISOLATION', params);
    expect(second.firstDivergentDay).toBe(first.firstDivergentDay);
    expect(second.counterfactualFingerprint).toBe(first.counterfactualFingerprint);
  });

  it('builds a temporal timeline per arm that matches the real series', () => {
    const run = runScenarioCommandCenter('ISOLATION', params);
    const timelines = temporalTimelinesFor(run);
    expect(timelines).not.toBeNull();
    for (const sample of run.baseline.series) {
      expect(temporalStateAt(timelines!.baseline, sample.day)?.sample).toEqual(sample);
    }
    for (const sample of run.intervention.series) {
      expect(temporalStateAt(timelines!.variant, sample.day)?.sample).toEqual(sample);
    }
  });

  it('has no timeline for a non-modelled intervention — nothing to scrub', () => {
    const run = runScenarioCommandCenter('TRANSPORT_REDUCTION', params);
    expect(temporalTimelinesFor(run)).toBeNull();
  });

  it('runs three real branches from one T0 and opens a selected branch in World/3D', () => {
    clearScenarioTimelineHandoffs();
    const multiverse = runTemporalMultiverseCommandCenter(['ISOLATION', 'CONTACT_REDUCTION', 'HEALTHCARE_EXPANSION'], params);
    expect(multiverse.baseline.status).toBe('COMPLETED');
    expect(multiverse.branches.map((branch) => branch.branchId)).toEqual(['B', 'C', 'D']);
    expect(multiverse.branches.every((branch) => branch.run.status === 'COMPLETED')).toBe(true);
    expect(multiverse.branches.every((branch) => branch.timeline !== null)).toBe(true);
    expect(multiverse.branches.every((branch) => branch.firstDivergentDayFromBaseline === null || Number.isFinite(branch.firstDivergentDayFromBaseline))).toBe(true);
    const handoffRunId = openTemporalMultiverseBranchInWorld(multiverse, 'C');
    expect(handoffRunId).toBe(`multiverse:${multiverse.multiverseFingerprint}:C`);
    expect(peekPendingScenarioTimeline()?.scenarioId).toBe('CONTACT_REDUCTION');
    clearScenarioTimelineHandoffs();
  });
});
