import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import {
  evidenceForSample,
  observationEvidenceMatchesRun,
  observationForSample,
} from '../core/observationAnalysis/observationModel';

describe('observation model', () => {
  it('links an observation to a real scenario sample and result fingerprint', () => {
    const run = runScenario('BASELINE', { days: 12, stepsPerDay: 2 });
    expect(run.status).toBe('COMPLETED');
    expect(run.resultFingerprint).toEqual(expect.any(String));
    const sample = run.series[3];
    const observation = observationForSample(run, sample, 3, 'infectious', sample.infectious, 'METRIC_VALUE');

    expect(observation.experimentId).toBe(run.inputFingerprint);
    expect(observation.day).toBe(sample.day);
    expect(observation.evidence).toEqual({
      source: 'scenario-engine',
      resultFingerprint: run.resultFingerprint,
      day: sample.day,
      sampleIndex: 3,
    });
    expect(observationEvidenceMatchesRun(observation, run)).toBe(true);
  });

  it('does not fabricate evidence for a run without a result fingerprint', () => {
    const run = runScenario('BASELINE', { days: 2, stepsPerDay: 1 });
    const incomplete = { ...run, resultFingerprint: null };

    expect(() => evidenceForSample(incomplete, incomplete.series[0], 0)).toThrow(/result fingerprint/);
  });
});
