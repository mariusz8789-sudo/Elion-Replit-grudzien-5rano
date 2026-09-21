import { describe, expect, it } from 'vitest';
import { classifyCausalLevel, type CausalGateInput } from '../core/agent/causalLadder';
import type { CausalFitResult, ParallelTrendsTestResult } from '../core/agent/causalInference';

const SIGNIFICANT_FIT: CausalFitResult = {
  estimator: 'two-way-fe-did',
  effect: { estimate: 5.2, se: 0.8, ci95: [3.6, 6.8] },
  diagnostics: { n: 18, units: 3, periods: 6, clusters: 3, note: 'test fixture' },
};

const ZERO_INCLUDING_FIT: CausalFitResult = {
  ...SIGNIFICANT_FIT,
  effect: { estimate: 0.5, se: 1.2, ci95: [-1.6, 2.6] },
};

const TRENDS_HOLD: ParallelTrendsTestResult = {
  preTrendDifferenceSlope: { estimate: 0.02, se: 0.5, ci95: [-0.9, 0.94] },
  parallelTrendsHold: true,
};

const TRENDS_VIOLATED: ParallelTrendsTestResult = {
  preTrendDifferenceSlope: { estimate: 3.1, se: 0.4, ci95: [2.3, 3.9] },
  parallelTrendsHold: false,
};

const BASE: CausalGateInput = {
  fit: null, identificationAssumptions: [], parallelTrends: null,
  confoundersChecked: false, hasConfirmedPrediction: false, mechanismDeclared: false,
};

describe('classifyCausalLevel — a strict staircase, never promoted by prediction strength alone', () => {
  it('no confounder check -> CORRELATION, the floor above bare observation', () => {
    expect(classifyCausalLevel(BASE).level).toBe('CORRELATION');
  });

  it('confounders checked but no confirmed prediction -> ASSOCIATION', () => {
    expect(classifyCausalLevel({ ...BASE, confoundersChecked: true }).level).toBe('ASSOCIATION');
  });

  it('a confirmed prediction alone (no mechanism) -> PREDICTION, never higher', () => {
    const result = classifyCausalLevel({ ...BASE, confoundersChecked: true, hasConfirmedPrediction: true });
    expect(result.level).toBe('PREDICTION');
  });

  it('a declared mechanism with no causal-inference estimate at all -> MECHANISTIC_SUPPORT', () => {
    const result = classifyCausalLevel({ ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true });
    expect(result.level).toBe('MECHANISTIC_SUPPORT');
  });

  it('a real causal-inference estimate WITHOUT declared identification assumptions still caps at MECHANISTIC_SUPPORT', () => {
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true, fit: SIGNIFICANT_FIT, identificationAssumptions: [],
    });
    expect(result.level).toBe('MECHANISTIC_SUPPORT');
  });

  it('an effect whose 95% CI includes zero is NEVER a causal claim, however strong the point estimate reads', () => {
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true,
      fit: ZERO_INCLUDING_FIT, identificationAssumptions: ['parallel trends'], parallelTrends: TRENDS_HOLD,
    });
    expect(result.level).toBe('MECHANISTIC_SUPPORT');
  });

  it('a DiD estimate with a FAILED parallel-trends pre-test caps at MECHANISTIC_SUPPORT even with a significant effect', () => {
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true,
      fit: SIGNIFICANT_FIT, identificationAssumptions: ['parallel trends'], parallelTrends: TRENDS_VIOLATED,
    });
    expect(result.level).toBe('MECHANISTIC_SUPPORT');
    expect(result.reasons.join(' ')).toMatch(/parallel-trends pre-test FAILED/);
  });

  it('a DiD estimate whose own parallel-trends check was never run caps at MECHANISTIC_SUPPORT — unchecked, not assumed', () => {
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true,
      fit: SIGNIFICANT_FIT, identificationAssumptions: ['parallel trends'], parallelTrends: null,
    });
    expect(result.level).toBe('MECHANISTIC_SUPPORT');
  });

  it('reaches CAUSAL_CLAIM only when every condition holds together', () => {
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true,
      fit: SIGNIFICANT_FIT, identificationAssumptions: ['parallel trends', 'no anticipation'], parallelTrends: TRENDS_HOLD,
    });
    expect(result.level).toBe('CAUSAL_CLAIM');
  });

  it('a non-DiD estimator (synthetic control) does not require a parallel-trends object to reach CAUSAL_CLAIM', () => {
    const scFit: CausalFitResult = { ...SIGNIFICANT_FIT, estimator: 'synthetic-control', syntheticWeights: { c1: 0.6, c2: 0.4 } };
    const result = classifyCausalLevel({
      ...BASE, confoundersChecked: true, hasConfirmedPrediction: true, mechanismDeclared: true,
      fit: scFit, identificationAssumptions: ['no interference'], parallelTrends: null,
    });
    expect(result.level).toBe('CAUSAL_CLAIM');
  });
});
