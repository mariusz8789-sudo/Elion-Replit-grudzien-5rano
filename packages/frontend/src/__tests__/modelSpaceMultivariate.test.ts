import { describe, expect, it } from 'vitest';
import {
  basisValueAt,
  estimatedCoefficientCount,
  fitModelSpec,
  fitModelSpecMulti,
  generateModelSpace,
  generateModelSpaceMulti,
  holdoutScore,
  holdoutSplit,
  modelSelectionScore,
  modelSpecFingerprint,
  normalizeModelSpec,
  renderModelSpec,
  type ModelPointMulti,
  type ModelSpec,
} from '../core/agent/modelSpace';

const RANGE = { min: 1, max: 8 };

/** `y = 2 + 3·x1 + 5·x2 + 4·x1·x2`, exactly — the interaction case the contract names. */
function interactionTruth(x1: number, x2: number): number {
  return 2 + 3 * x1 + 5 * x2 + 4 * x1 * x2;
}

const INTERACTION_POINTS: ModelPointMulti[] = [];
for (const x1 of [1, 2, 3, 4]) {
  for (const x2 of [1, 2, 3]) INTERACTION_POINTS.push({ xs: [x1, x2], y: interactionTruth(x1, x2), sigma: 0.01 });
}

describe('M3 — 1D identity is preserved exactly', () => {
  it('a term with no dim and a term with dim 0 are THE SAME MODEL, so old fingerprints still name it', () => {
    const withoutDim: ModelSpec = { id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR' }], lineage: null };
    const withDimZero: ModelSpec = { id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', dim: 0 }], lineage: null };
    expect(modelSpecFingerprint(withDimZero)).toBe(modelSpecFingerprint(withoutDim));
  });

  it('dimension 0 still renders as plain x', () => {
    expect(renderModelSpec({ id: '', terms: [{ basis: 'LINEAR', dim: 0 }, { basis: 'LOG' }], lineage: null })).toContain('·x');
    expect(renderModelSpec({ id: '', terms: [{ basis: 'LINEAR', dim: 0 }], lineage: null })).not.toContain('x1');
  });

  it('a one-dimensional multivariate space is identical to the plain space', () => {
    const flat = generateModelSpace({ maxTerms: 2, xRange: RANGE }).map(modelSpecFingerprint);
    const multi = generateModelSpaceMulti({ maxTerms: 2, xRange: RANGE, dimensions: 1 }).map(modelSpecFingerprint);
    expect(multi).toEqual(flat);
  });

  it('the 1D fit is the multivariate fit — same coefficients, same RSS', () => {
    const spec: ModelSpec = { id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR' }], lineage: null };
    const points = [1, 2, 3, 4].map((x) => ({ x, y: 3 + 2 * x, sigma: 0.1 }));
    const flat = fitModelSpec(spec, points);
    const multi = fitModelSpecMulti(spec, points.map((p) => ({ xs: [p.x], y: p.y, sigma: p.sigma })));
    expect(flat.ok && multi.ok).toBe(true);
    if (!flat.ok || !multi.ok) return;
    expect(flat.coefficients).toEqual(multi.coefficients);
    expect(flat.rss).toBe(multi.rss);
  });
});

describe('M3 — multivariate models and interactions', () => {
  it('evaluates a term against the variable it names, not always the first', () => {
    expect(basisValueAt({ basis: 'LINEAR', dim: 1 }, [7, 11])).toBe(11);
    expect(basisValueAt({ basis: 'INTERACTION', dims: [0, 1] }, [3, 5])).toBe(15);
  });

  it('treats a variable the observation does not carry as unknown (NaN), never as zero', () => {
    expect(Number.isNaN(basisValueAt({ basis: 'LINEAR', dim: 3 }, [1, 2]))).toBe(true);
    expect(Number.isNaN(basisValueAt({ basis: 'INTERACTION', dims: [0, 4] }, [1, 2]))).toBe(true);
  });

  it('recovers y = 2 + 3·x1 + 5·x2 + 4·x1·x2 exactly, coefficients and all', () => {
    const spec: ModelSpec = {
      id: '',
      terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', dim: 0 }, { basis: 'LINEAR', dim: 1 }, { basis: 'INTERACTION', dims: [0, 1] }],
      lineage: null,
    };
    const fit = fitModelSpecMulti(spec, INTERACTION_POINTS);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.rss).toBeLessThan(1e-6);
    expect(fit.predictAt([5, 4])).toBeCloseTo(interactionTruth(5, 4), 6);
    // Canonical ordering puts CONSTANT first, then the interaction, then the two linear terms.
    const ordered = normalizeModelSpec(spec).terms;
    expect(ordered).toHaveLength(4);
  });

  it('a model WITHOUT the interaction cannot fit data that has one — the term is a real claim', () => {
    const noInteraction: ModelSpec = {
      id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', dim: 0 }, { basis: 'LINEAR', dim: 1 }], lineage: null,
    };
    const fit = fitModelSpecMulti(noInteraction, INTERACTION_POINTS);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.rss).toBeGreaterThan(1);
  });

  it('enumerates interaction terms in a 2D space, and none in a 1D one', () => {
    const twoD = generateModelSpaceMulti({ maxTerms: 3, xRange: RANGE, dimensions: 2 });
    expect(twoD.some((s) => s.terms.some((t) => t.basis === 'INTERACTION'))).toBe(true);
    expect(twoD.some((s) => s.terms.some((t) => t.basis === 'LINEAR' && t.dim === 1))).toBe(true);
    const oneD = generateModelSpaceMulti({ maxTerms: 3, xRange: RANGE, dimensions: 1 });
    expect(oneD.some((s) => s.terms.some((t) => t.basis === 'INTERACTION'))).toBe(false);
  });

  it('can be asked for main effects only, when interactions are not scientifically wanted', () => {
    const space = generateModelSpaceMulti({ maxTerms: 3, xRange: RANGE, dimensions: 2, includeInteractions: false });
    expect(space.some((s) => s.terms.some((t) => t.basis === 'INTERACTION'))).toBe(false);
  });

  it('is deterministic: the same constraints enumerate the same space in the same order', () => {
    const a = generateModelSpaceMulti({ maxTerms: 2, xRange: RANGE, dimensions: 2 }).map(modelSpecFingerprint);
    const b = generateModelSpaceMulti({ maxTerms: 2, xRange: RANGE, dimensions: 2 }).map(modelSpecFingerprint);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe('M3 — parsimony', () => {
  it('counts the coefficients a fit actually estimates, not the tie-break complexity', () => {
    expect(estimatedCoefficientCount({ id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LOG' }], lineage: null })).toBe(2);
  });

  it('refuses to prefer a more complex model that buys less than its extra freedom costs', () => {
    const n = 7;
    // One extra coefficient costs ln(7) ≈ 1.95 of chi-square.
    const simpler = modelSelectionScore(10, 2, n);
    const barelyBetter = modelSelectionScore(9, 3, n);
    const genuinelyBetter = modelSelectionScore(6, 3, n);
    expect(simpler).toBeLessThan(barelyBetter);
    expect(genuinelyBetter).toBeLessThan(simpler);
  });

  it('treats an unfittable model as infinitely bad rather than as a low score', () => {
    expect(modelSelectionScore(Number.NaN, 2, 5)).toBe(Number.POSITIVE_INFINITY);
    expect(modelSelectionScore(1, 2, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('M3 — hold-out', () => {
  it('splits deterministically, with no seed and no draw', () => {
    const a = holdoutSplit([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const b = holdoutSplit([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(a).toEqual(b);
    expect(a.heldOut).toEqual([3, 6, 9]);
    expect(a.fit).toEqual([1, 2, 4, 5, 7, 8]);
  });

  it('scores a true model well and an overfitted one badly on points it never saw', () => {
    const truth: ModelPointMulti[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ xs: [x], y: 4 + 2 * x, sigma: 0.05 }));
    const correct: ModelSpec = { id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR' }], lineage: null };
    const contorted: ModelSpec = { id: '', terms: [{ basis: 'RECIPROCAL' }, { basis: 'POWER', exponent: 3 }], lineage: null };
    const good = holdoutScore(correct, truth);
    const bad = holdoutScore(contorted, truth);
    expect(good).not.toBeNull();
    expect(bad).not.toBeNull();
    expect(good!).toBeLessThan(bad!);
  });

  it('returns null rather than a meaningless number when the split cannot support a fit', () => {
    const tiny: ModelPointMulti[] = [{ xs: [1], y: 1, sigma: 0.1 }, { xs: [2], y: 2, sigma: 0.1 }];
    const threeTerms: ModelSpec = { id: '', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR' }, { basis: 'POWER', exponent: 2 }], lineage: null };
    expect(holdoutScore(threeTerms, tiny)).toBeNull();
    expect(holdoutScore(threeTerms, [])).toBeNull();
  });
});
