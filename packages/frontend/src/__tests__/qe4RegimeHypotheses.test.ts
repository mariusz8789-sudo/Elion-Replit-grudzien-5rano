import { describe, expect, it } from 'vitest';
import { generateQe4RegimeHypotheses, QE4_REGIME_TEMPLATES } from '../core/biotechData/qe4RegimeHypotheses';
import { pointsForGrid } from '../core/biotechData/qe4DatasetLaboratory';
import { weightedLinearFit } from '../core/biotechData/qe4BrydgesEstimator';

/**
 * P0.2 (Discovery Engine): ≥2 competing regime hypotheses per (dataset,k),
 * COMPUTED from the pinned dataset's own grid via `DatasetLaboratory`, never
 * from a literal list of hypothesis statements. Every test here proves the
 * numbers came from real data, not from a hardcoded verdict.
 */
describe('qe4RegimeHypotheses — competing regime hypotheses computed from the QE4 grid, not a fixed list', () => {
  it('declares exactly three regime templates, and generates one hypothesis per template for a real (dataset,k)', () => {
    expect(QE4_REGIME_TEMPLATES).toHaveLength(3);
    const results = generateQe4RegimeHypotheses('clean', 5);
    expect(results).toHaveLength(3);
    expect(new Set(results.map((r) => r.template))).toEqual(new Set(QE4_REGIME_TEMPLATES));
  });

  it('LINEAR_GROWTH verdict is SUPPORTED for the clean dataset at k=5 (matches P1s own conclusion that this partition grows significantly), with a REAL fitted slope, not a literal', () => {
    const points = pointsForGrid('clean', 5);
    const fit = weightedLinearFit(points.map((p) => p.t), points.map((p) => p.s2), points.map((p) => p.sigma));
    const results = generateQe4RegimeHypotheses('clean', 5);
    const linear = results.find((r) => r.template === 'LINEAR_GROWTH')!;
    expect(linear.verdict).toBe('SUPPORTED_WITHIN_MODEL');
    expect(linear.hypothesis.criterion.expectedValue).toBeCloseTo(fit.slope, 9);
    expect(linear.hypothesis.criterion.tolerance).toBeCloseTo(fit.slopeSigma, 9);
  });

  it('two different (dataset,k) grids produce two different fitted slopes -- proof this is computed per input, not memorized', () => {
    const a = generateQe4RegimeHypotheses('clean', 5).find((r) => r.template === 'LINEAR_GROWTH')!;
    const b = generateQe4RegimeHypotheses('disorder', 5).find((r) => r.template === 'LINEAR_GROWTH')!;
    expect(a.hypothesis.criterion.expectedValue).not.toBeCloseTo(b.hypothesis.criterion.expectedValue as number, 6);
  });

  it('an undersupplied grid (k with fewer than 3 points, or an entirely absent k) is INCONCLUSIVE, never a fabricated verdict', () => {
    const results = generateQe4RegimeHypotheses('clean', 9999);
    for (const r of results) {
      expect(r.verdict).toBe('INCONCLUSIVE');
      expect(r.pointsUsed).toHaveLength(0);
    }
  });

  it('every hypothesis carries a real Tautology Gate classification and is classified EMPIRICAL_TEST, matching P1-P4s own classification for the same raw measured shots', () => {
    const results = generateQe4RegimeHypotheses('clean', 5);
    for (const r of results) {
      expect(r.tautology.classification).toBe('EMPIRICAL_TEST');
    }
  });

  it('runs real belief revision from a fresh 0.5 prior for every hypothesis, with parentHypothesisId null (first round, not derived)', () => {
    const results = generateQe4RegimeHypotheses('clean', 5);
    for (const r of results) {
      expect(r.hypothesis.history).toHaveLength(1);
      expect(r.hypothesis.history[0]!.beforeConfidence).toBeCloseTo(0.5, 6);
      expect(r.hypothesis.parentHypothesisId).toBeNull();
      expect(r.hypothesis.generatedBy).toBe('INITIAL');
    }
  });

  it('SUPPORTED_WITHIN_MODEL raises confidence above 0.5; FALSIFIED lowers it below 0.5', () => {
    const results = generateQe4RegimeHypotheses('clean', 5);
    for (const r of results) {
      if (r.verdict === 'SUPPORTED_WITHIN_MODEL') expect(r.hypothesis.confidence).toBeGreaterThan(0.5);
      if (r.verdict === 'FALSIFIED') expect(r.hypothesis.confidence).toBeLessThan(0.5);
    }
  });

  it('hypothesis ids are unique per (dataset,k,template) and deterministic across two independent calls', () => {
    const a = generateQe4RegimeHypotheses('clean', 5);
    const b = generateQe4RegimeHypotheses('clean', 5);
    expect(new Set(a.map((r) => r.hypothesis.id)).size).toBe(3);
    expect(a.map((r) => r.hypothesis.id)).toEqual(b.map((r) => r.hypothesis.id));
    expect(a.map((r) => r.verdict)).toEqual(b.map((r) => r.verdict));
  });
});
