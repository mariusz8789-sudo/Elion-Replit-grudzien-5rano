import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { analyzeExperiment } from '../core/observationAnalysis/analysis';

describe('experiment analysis', () => {
  it('derives extrema, trends, and evidence-backed events from a real run', () => {
    const run = runScenario('BASELINE', { days: 24, stepsPerDay: 2 });
    const analysis = analyzeExperiment(run);

    expect(analysis.maxima.map((item) => item.metric)).toEqual(['infectious', 'hospital.bedOccupancy', 'hospital.icuOccupancy']);
    expect(analysis.minima).toHaveLength(3);
    expect(analysis.trends).toHaveLength(3);
    expect(analysis.summary).toContain('BASELINE');
    for (const item of analysis.maxima) {
      expect(item.evidence.resultFingerprint).toBe(run.resultFingerprint);
    }
  });

  it('computes deterministic baseline deltas and a largest deviation', () => {
    const baseline = runScenario('BASELINE', { days: 24, stepsPerDay: 2 });
    const variant = runScenario('ISOLATION', { days: 24, stepsPerDay: 2 });
    const first = analyzeExperiment(variant, baseline);
    const second = analyzeExperiment(variant, baseline);

    expect(first).toEqual(second);
    expect(first.baselineDeltas).toHaveLength(5);
    expect(first.mostSignificantDeviation).not.toBeNull();
    expect(first.mostSignificantDeviation?.evidence.resultFingerprint).toBe(variant.resultFingerprint);
  });
});
