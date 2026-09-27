import { describe, expect, it } from 'vitest';
import {
  executeSeededUncertainty,
  isSeededStochasticModel,
  planSeededUncertainty,
  replaySeededUncertainty,
} from '../core/experimentFabric';

const isingRequest = {
  contractVersion: '1.0.0',
  sourceText: 'Prerejestrowany seed-sweep 2D Ising Metropolis dla temperatury 2.',
  domainId: 'chemistry',
  operation: 'simulate' as const,
  modelId: 'chemistry-ising',
  parameters: { temperature: 2, seed: 101 },
};

describe('Genesis seeded uncertainty', () => {
  it('allows only router models explicitly declared seeded-stochastic', () => {
    expect(isSeededStochasticModel('chemistry-ising')).toBe(true);
    expect(isSeededStochasticModel('biology-protein-folding-hp')).toBe(true);
    expect(isSeededStochasticModel('math-gaussian')).toBe(false);
    expect(isSeededStochasticModel(undefined)).toBe(false);
  });

  it('preregisters bounded Ising seeds, executes real runs, retains seed provenance and replays identically', () => {
    const plan = planSeededUncertainty({
      baselineRequest: isingRequest,
      metric: 'magnetization',
      seeds: [401, 101, 307, 203],
    });
    const evidence = executeSeededUncertainty(plan);
    const replay = replaySeededUncertainty(plan);

    expect(plan.seedArms.map((arm) => arm.seed)).toEqual([101, 203, 307, 401]);
    expect(evidence.createdFromRealRunsOnly).toBe(true);
    expect(evidence.runs).toHaveLength(4);
    expect(evidence.runs.every((run, index) => run.result.status === 'completed'
      && run.provenance.resultOrigin === 'real-engine'
      && run.provenance.modelId === 'chemistry-ising'
      && run.provenance.engine === 'genesis-ising-metropolis@1.0.0'
      && run.provenance.seed === plan.seedArms[index].seed
      && run.request.seed === plan.seedArms[index].seed
      && run.request.parameters.seed === plan.seedArms[index].seed)).toBe(true);
    expect(evidence.summary).toMatchObject({ metric: 'magnetization', unit: '', sampleCount: 4 });
    expect(Number.isFinite(evidence.summary.mean)).toBe(true);
    expect(Number.isFinite(evidence.summary.sampleStandardDeviation)).toBe(true);
    expect(evidence.summary.minimum).toBeLessThanOrEqual(evidence.summary.maximum);
    expect(replay.provenanceFingerprint).toBe(evidence.provenanceFingerprint);
    expect(replay.runs.map((run) => run.provenance.runFingerprint)).toEqual(evidence.runs.map((run) => run.provenance.runFingerprint));
    expect(evidence.disclaimer).toContain('Nie jest to discovery');
  });

  it('rejects deterministic models, duplicate seeds and a seed as a pseudo-metric', () => {
    expect(() => planSeededUncertainty({
      baselineRequest: {
        contractVersion: '1.0.0', sourceText: 'Gaussian.', domainId: 'mathematics', operation: 'compute', modelId: 'math-gaussian',
        parameters: { mean: 0, sigma: 1, xValue: 0 },
      },
      metric: 'pdfValue', seeds: [1, 2],
    })).toThrow('seeded-stochastic');
    expect(() => planSeededUncertainty({ baselineRequest: isingRequest, metric: 'magnetization', seeds: [1, 1] })).toThrow('unique');
    expect(() => planSeededUncertainty({ baselineRequest: isingRequest, metric: 'seed', seeds: [1, 2] })).toThrow('non-seed');
  });

  it('does not manufacture a summary when the requested observable is not a completed numeric output', () => {
    const plan = planSeededUncertainty({ baselineRequest: isingRequest, metric: 'notAnOutput', seeds: [1, 2] });
    expect(() => executeSeededUncertainty(plan)).toThrow("Metric 'notAnOutput'");
  });
});
