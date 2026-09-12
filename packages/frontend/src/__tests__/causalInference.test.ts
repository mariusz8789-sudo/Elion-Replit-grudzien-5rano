import { describe, expect, it } from 'vitest';
import {
  fitCausalEffect,
  ordinaryLeastSquares,
  runControlPairPlacebo,
  runPlaceboDateTest,
  testParallelPreTrends,
  type PanelObservation,
} from '../core/agent/causalInference';
import { makeRng } from '../core/epidemic/agents';

/**
 * CAP-2 (causalInference.ts) contract tests, per the B1 research package's
 * own TDD requirement: simulated panels with a KNOWN injected effect (the
 * estimator must recover it within error), placebo panels (must return
 * null), and a parallel-trends pre-test — before this module ever touches
 * real DEFRA data.
 */

const CONTROL_UNITS = ['manchester', 'leeds', 'sheffield', 'liverpool', 'newcastle'];
const TREATED_UNIT = 'london';
const CUTOFF = 24; // months since epoch

function buildPanel(options: {
  periods: number;
  trueEffect: number;
  rng: () => number;
  cutoff?: number;
  unitBaselines?: Record<string, number>;
}): PanelObservation[] {
  const cutoff = options.cutoff ?? CUTOFF;
  const baselines = options.unitBaselines ?? {
    [TREATED_UNIT]: 45,
    manchester: 38,
    leeds: 36,
    sheffield: 34,
    liverpool: 37,
    newcastle: 33,
  };
  const rows: PanelObservation[] = [];
  for (const unit of [TREATED_UNIT, ...CONTROL_UNITS]) {
    const baseline = baselines[unit]!;
    for (let period = 0; period < options.periods; period += 1) {
      // Shared seasonal component (all units move together) + tiny common downward trend + unit-specific noise.
      const seasonal = 3 * Math.sin((2 * Math.PI * period) / 12);
      const commonTrend = -0.05 * period;
      const noise = (options.rng() - 0.5) * 1.5;
      const treatmentBump = unit === TREATED_UNIT && period >= cutoff ? options.trueEffect : 0;
      rows.push({ unit, period, outcome: baseline + seasonal + commonTrend + treatmentBump + noise });
    }
  }
  return rows;
}

describe('causalInference (CAP-2) — ordinaryLeastSquares primitive', () => {
  it('recovers an exact linear relationship with zero residual', () => {
    const X = [[1, 1], [1, 2], [1, 3], [1, 4]];
    const y = [3, 5, 7, 9]; // y = 1 + 2x
    const fit = ordinaryLeastSquares(X, y);
    expect(fit.coefficients[0]).toBeCloseTo(1, 6);
    expect(fit.coefficients[1]).toBeCloseTo(2, 6);
    expect(fit.residuals.every((r) => Math.abs(r) < 1e-6)).toBe(true);
  });
});

describe('causalInference (CAP-2) — two-way-fe-did recovers a known injected effect', () => {
  it('recovers a -3.5 unit injected effect within its own 95% CI, across several seeds', () => {
    const trueEffect = -3.5;
    for (const seed of [1, 2, 3]) {
      const rng = makeRng(seed);
      const panel = buildPanel({ periods: 48, trueEffect, rng });
      const result = fitCausalEffect({ panel, treatmentUnit: TREATED_UNIT, controlUnits: CONTROL_UNITS, cutoffPeriod: CUTOFF, estimator: 'two-way-fe-did' });
      expect(result.effect.ci95[0]).toBeLessThan(trueEffect);
      expect(result.effect.ci95[1]).toBeGreaterThan(trueEffect);
      // The point estimate itself should be in the right ballpark, not just a wide CI covering everything.
      expect(Math.abs(result.effect.estimate - trueEffect)).toBeLessThan(1.5);
    }
  });

  it('reports honest diagnostics naming the one-treated-cluster caveat and the permutation-inference remedy', () => {
    const rng = makeRng(42);
    const panel = buildPanel({ periods: 48, trueEffect: -3, rng });
    const result = fitCausalEffect({ panel, treatmentUnit: TREATED_UNIT, controlUnits: CONTROL_UNITS, cutoffPeriod: CUTOFF, estimator: 'two-way-fe-did' });
    expect(result.diagnostics.clusters).toBe(6);
    expect(result.diagnostics.note).toMatch(/Conley.*Taber|PERMUTATION/i);
    expect(result.diagnostics.naiveClusterRobustSe).toBeGreaterThan(0);
    expect(result.diagnostics.permutationPlaceboCount).toBe(5);
  });
});

describe('causalInference (CAP-2) — placebo tests must return null on a null panel', () => {
  it('control-pair placebo (no real treatment anywhere) has a CI including 0', () => {
    const rng = makeRng(7);
    const panel = buildPanel({ periods: 48, trueEffect: 0, rng });
    const placebo = runControlPairPlacebo(panel, 'manchester', ['leeds', 'sheffield', 'liverpool', 'newcastle'], CUTOFF);
    expect(placebo.ciIncludesZero).toBe(true);
  });

  it('placebo date test on genuinely pre-treatment data (fake cutoff before the real one) has a CI including 0', () => {
    const rng = makeRng(11);
    const panel = buildPanel({ periods: 48, trueEffect: -3, rng }); // real effect exists, but only AFTER cutoff=24
    const placebo = runPlaceboDateTest(panel, TREATED_UNIT, CONTROL_UNITS, 12, CUTOFF);
    expect(placebo.ciIncludesZero).toBe(true);
  });

  it('a real effect (not a placebo) is correctly detected as CI excluding 0, for contrast', () => {
    const rng = makeRng(13);
    const panel = buildPanel({ periods: 48, trueEffect: -5, rng });
    const result = fitCausalEffect({ panel, treatmentUnit: TREATED_UNIT, controlUnits: CONTROL_UNITS, cutoffPeriod: CUTOFF, estimator: 'two-way-fe-did' });
    const [lo, hi] = result.effect.ci95;
    expect(lo <= 0 && hi >= 0).toBe(false);
  });
});

describe('causalInference (CAP-2) — parallel pre-trends test', () => {
  it('does not reject parallel trends when pre-period trends are genuinely parallel', () => {
    const rng = makeRng(21);
    const panel = buildPanel({ periods: 48, trueEffect: -3, rng });
    const test = testParallelPreTrends(panel, TREATED_UNIT, CONTROL_UNITS, CUTOFF);
    expect(test.parallelTrendsHold).toBe(true);
  });

  it('correctly detects a violated parallel-trends assumption (treated unit already diverging pre-treatment)', () => {
    const rng = makeRng(31);
    const panel = buildPanel({ periods: 48, trueEffect: -3, rng }).map((obs) =>
      obs.unit === TREATED_UNIT && obs.period < CUTOFF
        ? { ...obs, outcome: obs.outcome - 0.4 * obs.period } // steadily diverging pre-trend, injected on purpose
        : obs,
    );
    const test = testParallelPreTrends(panel, TREATED_UNIT, CONTROL_UNITS, CUTOFF);
    expect(test.parallelTrendsHold).toBe(false);
  });
});

describe('causalInference (CAP-2) — interrupted-time-series and synthetic-control estimators run and produce finite results', () => {
  it('interrupted-time-series recovers a level change in the right direction', () => {
    const rng = makeRng(5);
    const panel = buildPanel({ periods: 48, trueEffect: -4, rng });
    const result = fitCausalEffect({ panel, treatmentUnit: TREATED_UNIT, controlUnits: CONTROL_UNITS, cutoffPeriod: CUTOFF, estimator: 'interrupted-time-series' });
    expect(result.effect.estimate).toBeLessThan(0);
    expect(Number.isFinite(result.effect.se)).toBe(true);
  });

  it('synthetic-control produces finite weights summing to 1 and a gap estimate in the right direction', () => {
    const rng = makeRng(9);
    const panel = buildPanel({ periods: 48, trueEffect: -4, rng });
    const result = fitCausalEffect({ panel, treatmentUnit: TREATED_UNIT, controlUnits: CONTROL_UNITS, cutoffPeriod: CUTOFF, estimator: 'synthetic-control' });
    const weights = Object.values(result.syntheticWeights ?? {});
    expect(weights.every((w) => w >= -1e-9)).toBe(true);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(result.effect.estimate).toBeLessThan(0);
  });
});
