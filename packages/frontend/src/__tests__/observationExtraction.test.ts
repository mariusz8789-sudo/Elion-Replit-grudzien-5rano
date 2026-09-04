import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { extractObservations } from '../core/observationAnalysis/observationExtraction';
import { observationEvidenceMatchesRun } from '../core/observationAnalysis/observationModel';

describe('observation extraction', () => {
  it('extracts real peaks, status changes/thresholds when present, and completion', () => {
    const run = runScenario('BASELINE', { days: 24, stepsPerDay: 2 });
    const observations = extractObservations(run);

    expect(observations.length).toBeGreaterThanOrEqual(4);
    expect(observations.filter((item) => item.observationType === 'METRIC_PEAK')).toHaveLength(3);
    expect(observations.at(-1)?.observationType).toBe('EXPERIMENT_COMPLETED');
    for (const observation of observations) {
      expect(run.series[observation.evidence.sampleIndex].day).toBe(observation.day);
      expect(observationEvidenceMatchesRun(observation, run)).toBe(true);
    }
  });

  it('is deterministic for the same run', () => {
    const run = runScenario('ISOLATION', { days: 18, stepsPerDay: 2 });
    expect(extractObservations(run)).toEqual(extractObservations(run));
  });
});
