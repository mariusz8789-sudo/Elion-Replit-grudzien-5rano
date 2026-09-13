import { describe, expect, it } from 'vitest';
import { analyzeResidualStructure, proposeModelsFromResiduals } from '../core/agent/residualStructure';
import { fitModelSpec, modelSpecFingerprint, normalizeModelSpec, type ModelPoint, type ModelSpec } from '../core/agent/modelSpace';

const LINE: ModelSpec = normalizeModelSpec({ id: 'line', terms: [{ basis: 'CONSTANT' }, { basis: 'LINEAR', variable: 'x' }], lineage: null });
const X_RANGE = { min: 1, max: 10 };

function fitOf(spec: ModelSpec, points: readonly ModelPoint[]) {
  const fit = fitModelSpec(spec, points);
  if (!fit.ok) throw new Error(`test setup: fit failed — ${fit.reason}`);
  return fit;
}

/** y = x² fitted by a straight line leaves a textbook U-shaped (curved) residual. */
const QUADRATIC_POINTS: readonly ModelPoint[] = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({ x, y: x * x, sigma: 1 }));

/** A genuinely straight line with tiny alternating noise: no structure to find. */
const CLEAN_LINE_POINTS: readonly ModelPoint[] = [1, 2, 3, 4, 5, 6, 7, 8].map((x, i) => ({
  x, y: 3 + 2 * x + (i % 2 === 0 ? 0.01 : -0.01), sigma: 1,
}));

/** A straight line with ONE point knocked far off, everything else exact. */
const SPIKE_POINTS: readonly ModelPoint[] = [1, 2, 3, 4, 5, 6, 7, 8].map((x) => ({
  x, y: 3 + 2 * x + (x === 5 ? 40 : 0), sigma: 1,
}));

describe('residualStructure — detects real structure, not merely non-zero residuals', () => {
  it('finds NO structure in residuals from a model that genuinely fits', () => {
    const findings = analyzeResidualStructure(LINE, fitOf(LINE, CLEAN_LINE_POINTS), CLEAN_LINE_POINTS);
    expect(findings).toHaveLength(0);
  });

  it('detects CURVATURE when a straight line is fitted to a quadratic', () => {
    const findings = analyzeResidualStructure(LINE, fitOf(LINE, QUADRATIC_POINTS), QUADRATIC_POINTS);
    expect(findings.some((f) => f.kind === 'CURVATURE')).toBe(true);
  });

  it('detects LOCALIZED_ANOMALY for one far-off point among otherwise exact ones', () => {
    const findings = analyzeResidualStructure(LINE, fitOf(LINE, SPIKE_POINTS), SPIKE_POINTS);
    const anomaly = findings.find((f) => f.kind === 'LOCALIZED_ANOMALY');
    expect(anomaly).toBeDefined();
    expect(anomaly!.atX).toBe(5);
  });

  it('every finding carries real numeric evidence and names the x it concerns, never a bare verdict', () => {
    for (const f of analyzeResidualStructure(LINE, fitOf(LINE, QUADRATIC_POINTS), QUADRATIC_POINTS)) {
      expect(f.evidence.length).toBeGreaterThan(20);
      expect(Number.isFinite(f.strength)).toBe(true);
      expect(f.strength).toBeGreaterThan(0);
    }
  });

  it('refuses to analyze too few points rather than reporting structure it cannot see', () => {
    const few = QUADRATIC_POINTS.slice(0, 3);
    expect(analyzeResidualStructure(LINE, fitOf(LINE, few), few)).toHaveLength(0);
  });
});

describe('residualStructure — derives NEW models from detected structure', () => {
  it('proposes at least one model that is NOT the parent, when structure is present', () => {
    const proposals = proposeModelsFromResiduals(LINE, fitOf(LINE, QUADRATIC_POINTS), QUADRATIC_POINTS, { xRange: X_RANGE });
    expect(proposals.length).toBeGreaterThan(0);
    const parentPrint = modelSpecFingerprint(LINE);
    for (const p of proposals) expect(modelSpecFingerprint(p.spec)).not.toBe(parentPrint);
  });

  it('proposes NOTHING when the parent model already fits — no structure, no derivation', () => {
    expect(proposeModelsFromResiduals(LINE, fitOf(LINE, CLEAN_LINE_POINTS), CLEAN_LINE_POINTS, { xRange: X_RANGE })).toHaveLength(0);
  });

  it('a proposed model actually fits the data better than the parent it was derived from — the derivation is useful, not decorative', () => {
    const parentFit = fitOf(LINE, QUADRATIC_POINTS);
    const proposals = proposeModelsFromResiduals(LINE, parentFit, QUADRATIC_POINTS, { xRange: X_RANGE });
    const improved = proposals.filter((p) => {
      const fit = fitModelSpec(p.spec, QUADRATIC_POINTS);
      return fit.ok && fit.rss < parentFit.rss;
    });
    expect(improved.length).toBeGreaterThan(0);
  });

  it('every proposal records the residual finding that motivated it plus full parent lineage', () => {
    for (const p of proposeModelsFromResiduals(LINE, fitOf(LINE, QUADRATIC_POINTS), QUADRATIC_POINTS, { xRange: X_RANGE })) {
      expect(p.motivatedBy.kind.length).toBeGreaterThan(0);
      expect(p.spec.lineage).not.toBeNull();
      expect(p.spec.lineage!.parentFingerprint).toBe(modelSpecFingerprint(LINE));
      expect(p.spec.lineage!.operator).toContain('RESIDUAL');
    }
  });

  it('proposals are duplicate-free', () => {
    const prints = proposeModelsFromResiduals(LINE, fitOf(LINE, QUADRATIC_POINTS), QUADRATIC_POINTS, { xRange: X_RANGE }).map((p) => modelSpecFingerprint(p.spec));
    expect(new Set(prints).size).toBe(prints.length);
  });
});
