import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIABLE,
  estimatedCoefficientCount,
  holdoutScore,
  holdoutSplit,
  modelSelectionScore,
  type ModelPoint,
  type ModelSpec,
} from '../core/agent/modelSpace';

/**
 * M3's two guards against an engine flattering itself: an information penalty
 * so a more complex model must EARN its extra freedom, and an out-of-sample
 * score that no amount of in-sample bending can improve.
 *
 * Multi-variable models and interaction terms are covered by
 * `modelSpace.test.ts`; this file covers only the two selection guards.
 */

const LINE: ModelSpec = {
  id: 'line',
  terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: DEFAULT_VARIABLE }],
  lineage: null,
};

const CONTORTED: ModelSpec = {
  id: 'contorted',
  terms: [{ basis: 'RECIPROCAL', variable: DEFAULT_VARIABLE }, { basis: 'POWER', variable: DEFAULT_VARIABLE, exponent: 3 }],
  lineage: null,
};

describe('M3 parsimony — complexity must be paid for in chi-square', () => {
  it('counts the coefficients a fit actually estimates, not the tie-break complexity', () => {
    expect(estimatedCoefficientCount(LINE)).toBe(2);
    // A LOG term estimates one coefficient; its shape is fixed by the grammar, not fitted.
    expect(estimatedCoefficientCount({ id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LOG', variable: DEFAULT_VARIABLE }], lineage: null })).toBe(2);
  });

  it('refuses a more complex model whose improvement is smaller than its extra freedom costs', () => {
    const n = 7; // ln(7) ≈ 1.95 per added coefficient
    const simpler = modelSelectionScore(10, 2, n);
    const barelyBetter = modelSelectionScore(9, 3, n);
    const genuinelyBetter = modelSelectionScore(6, 3, n);
    expect(simpler).toBeLessThan(barelyBetter);
    expect(genuinelyBetter).toBeLessThan(simpler);
  });

  it('scales the penalty with the amount of evidence: more points justify more structure', () => {
    // The same one-coefficient step costs more to justify on 100 points than on 7.
    expect(modelSelectionScore(0, 1, 100) - modelSelectionScore(0, 0, 100))
      .toBeGreaterThan(modelSelectionScore(0, 1, 7) - modelSelectionScore(0, 0, 7));
  });

  it('treats an unfittable model as infinitely bad rather than as a low score', () => {
    expect(modelSelectionScore(Number.NaN, 2, 5)).toBe(Number.POSITIVE_INFINITY);
    expect(modelSelectionScore(1, 2, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('M3 hold-out — the score in-sample bending cannot improve', () => {
  it('splits deterministically, with no seed and no draw', () => {
    const a = holdoutSplit([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(a).toEqual(holdoutSplit([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(a.heldOut).toEqual([3, 6, 9]);
    expect(a.fit).toEqual([1, 2, 4, 5, 7, 8]);
  });

  it('scores the true model better than a contorted one on points neither fit saw', () => {
    const truth: ModelPoint[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x, y: 4 + 2 * x, sigma: 0.05 }));
    const good = holdoutScore(LINE, truth);
    const bad = holdoutScore(CONTORTED, truth);
    expect(good).not.toBeNull();
    expect(bad).not.toBeNull();
    expect(good!).toBeLessThan(bad!);
  });

  it('returns null rather than a meaningless number when the split cannot support a fit', () => {
    const tiny: ModelPoint[] = [{ x: 1, y: 1, sigma: 0.1 }, { x: 2, y: 2, sigma: 0.1 }];
    const threeTerms: ModelSpec = {
      id: '',
      terms: [
        { basis: 'CONSTANT' },
        { basis: 'LINEAR', variable: DEFAULT_VARIABLE },
        { basis: 'POWER', variable: DEFAULT_VARIABLE, exponent: 2 },
      ],
      lineage: null,
    };
    expect(holdoutScore(threeTerms, tiny)).toBeNull();
    expect(holdoutScore(threeTerms, [])).toBeNull();
  });
});
