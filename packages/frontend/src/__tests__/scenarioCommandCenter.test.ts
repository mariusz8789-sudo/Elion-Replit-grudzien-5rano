import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../core/simulation/scenarioEngine';
import {
  replayScenarioCommandCenter,
  runScenarioCommandCenter,
  scenarioParamsFromCommandCenter,
  scenarioUiMetrics,
} from '../core/simulation/scenarioCommandCenter';

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
});
