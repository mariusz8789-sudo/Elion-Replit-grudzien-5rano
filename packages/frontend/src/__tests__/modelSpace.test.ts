import { describe, expect, it } from 'vitest';
import {
  basisValue,
  compareModelSpecs,
  fitModelSpec,
  generateModelSpace,
  modelComplexity,
  modelSpecFingerprint,
  mutateModelSpec,
  normalizeModelSpec,
  renderModelSpec,
  type ModelSpec,
  type ModelTerm,
} from '../core/agent/modelSpace';

const CONST: ModelTerm = { basis: 'CONSTANT' };
const LIN: ModelTerm = { basis: 'LINEAR' };
const LOG: ModelTerm = { basis: 'LOG' };
const SAT = (tau: number): ModelTerm => ({ basis: 'EXP_SATURATION', tau });
const POW = (p: number): ModelTerm => ({ basis: 'POWER', exponent: p });

const spec = (terms: readonly ModelTerm[], id = 'm'): ModelSpec => normalizeModelSpec({ id, terms, lineage: null });

/** Exact points on y = 3 + 2x, so a correct fit must recover (3, 2) to machine precision. */
const LINE_POINTS = [1, 2, 3, 4, 5].map((x) => ({ x, y: 3 + 2 * x, sigma: 1 }));

describe('modelSpace — basis functions', () => {
  it('evaluates each declared basis at a known point', () => {
    expect(basisValue(CONST, 7)).toBe(1);
    expect(basisValue(LIN, 7)).toBe(7);
    expect(basisValue(LOG, Math.E)).toBeCloseTo(1, 12);
    expect(basisValue(POW(2), 3)).toBe(9);
    expect(basisValue(POW(0.5), 9)).toBeCloseTo(3, 12);
    expect(basisValue(SAT(1), 0)).toBe(0);
    expect(basisValue(SAT(1), 1e6)).toBeCloseTo(1, 9);
  });

  it('returns a non-finite value for a basis evaluated outside its domain, rather than silently inventing a number', () => {
    expect(Number.isFinite(basisValue(LOG, 0))).toBe(false);
    expect(Number.isFinite(basisValue(LOG, -1))).toBe(false);
  });
});

describe('modelSpace — fitting', () => {
  it('recovers exact coefficients of a noiseless linear relationship', () => {
    const fit = fitModelSpec(spec([CONST, LIN]), LINE_POINTS);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.coefficients[0]).toBeCloseTo(3, 9);
    expect(fit.coefficients[1]).toBeCloseTo(2, 9);
    expect(fit.rss).toBeCloseTo(0, 9);
  });

  it('a richer model fits a curve that a poorer one cannot — real discrimination, not a tie', () => {
    const pts = [1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 2 * Math.log(x) + 1, sigma: 1 }));
    const linear = fitModelSpec(spec([CONST, LIN]), pts);
    const log = fitModelSpec(spec([CONST, LOG]), pts);
    expect(linear.ok && log.ok).toBe(true);
    if (!linear.ok || !log.ok) return;
    expect(log.rss).toBeLessThan(linear.rss);
    expect(log.rss).toBeCloseTo(0, 9);
  });

  it('refuses (ok:false) rather than fitting when there are fewer points than free coefficients', () => {
    const fit = fitModelSpec(spec([CONST, LIN, POW(2)]), LINE_POINTS.slice(0, 2));
    expect(fit.ok).toBe(false);
    if (fit.ok) return;
    expect(fit.reason).toContain('2');
  });

  it('refuses rather than producing NaN when a basis is undefined on the supplied points', () => {
    const fit = fitModelSpec(spec([CONST, LOG]), [{ x: 0, y: 1, sigma: 1 }, { x: 1, y: 2, sigma: 1 }, { x: 2, y: 3, sigma: 1 }]);
    expect(fit.ok).toBe(false);
  });

  it('weights points by 1/sigma^2 — a tight point pulls the fit more than a loose one', () => {
    const pts = [
      { x: 0, y: 0, sigma: 0.01 },
      { x: 1, y: 10, sigma: 10 },
      { x: 2, y: 0, sigma: 0.01 },
    ];
    const fit = fitModelSpec(spec([CONST, LIN]), pts);
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    // The two tight points at y=0 dominate; the loose outlier barely moves it.
    expect(Math.abs(fit.predict(1))).toBeLessThan(1);
  });
});

describe('modelSpace — identity, normalization, dedup', () => {
  it('normalizes term order so the same model written two ways has one fingerprint', () => {
    const a = spec([LIN, CONST]);
    const b = spec([CONST, LIN]);
    expect(modelSpecFingerprint(a)).toBe(modelSpecFingerprint(b));
    expect(compareModelSpecs(a, b)).toBe(true);
  });

  it('drops duplicate terms during normalization — a term added twice is one column, not two', () => {
    expect(normalizeModelSpec({ id: 'm', terms: [CONST, LIN, LIN], lineage: null }).terms).toHaveLength(2);
  });

  it('distinguishes models that differ only in a nonlinear shape parameter', () => {
    expect(modelSpecFingerprint(spec([CONST, SAT(2)]))).not.toBe(modelSpecFingerprint(spec([CONST, SAT(5)])));
    expect(modelSpecFingerprint(spec([CONST, POW(2)]))).not.toBe(modelSpecFingerprint(spec([CONST, POW(3)])));
  });

  it('fingerprint ignores the human-facing id — identity is the model, not its name', () => {
    expect(modelSpecFingerprint(spec([CONST, LIN], 'alpha'))).toBe(modelSpecFingerprint(spec([CONST, LIN], 'beta')));
  });

  it('complexity counts free coefficients and penalizes exotic terms above plain ones', () => {
    expect(modelComplexity(spec([CONST]))).toBeLessThan(modelComplexity(spec([CONST, LIN])));
    expect(modelComplexity(spec([CONST, LIN]))).toBeLessThan(modelComplexity(spec([CONST, SAT(3)])));
  });

  it('renders a readable formula, so a generated model is inspectable and not an opaque blob', () => {
    expect(renderModelSpec(spec([CONST, LIN]))).toContain('x');
    expect(renderModelSpec(spec([CONST, LOG]))).toContain('log');
  });
});

describe('modelSpace — generation', () => {
  it('generates a bounded, duplicate-free space of distinct models', () => {
    const space = generateModelSpace({ maxTerms: 2, xRange: { min: 1, max: 20 } });
    expect(space.length).toBeGreaterThan(3);
    const prints = space.map(modelSpecFingerprint);
    expect(new Set(prints).size).toBe(prints.length);
  });

  it('the three regimes the QE4 loop hardcodes are all members of the generated space — the space generalizes them, it does not replace them with something else', () => {
    const space = generateModelSpace({ maxTerms: 2, xRange: { min: 1, max: 20 } });
    const prints = new Set(space.map(modelSpecFingerprint));
    expect(prints.has(modelSpecFingerprint(spec([CONST, LIN])))).toBe(true);
    expect(prints.has(modelSpecFingerprint(spec([CONST, LOG])))).toBe(true);
    expect(space.some((m) => m.terms.some((t) => t.basis === 'EXP_SATURATION'))).toBe(true);
  });

  it('respects a declared constraint: excluding a basis really removes it from the whole space', () => {
    const space = generateModelSpace({ maxTerms: 2, xRange: { min: 1, max: 20 }, excludeBases: ['LOG'] });
    expect(space.some((m) => m.terms.some((t) => t.basis === 'LOG'))).toBe(false);
  });

  it('generation is deterministic — same constraints, same space, same order', () => {
    const a = generateModelSpace({ maxTerms: 2, xRange: { min: 1, max: 20 } });
    const b = generateModelSpace({ maxTerms: 2, xRange: { min: 1, max: 20 } });
    expect(a.map(modelSpecFingerprint)).toEqual(b.map(modelSpecFingerprint));
  });
});

describe('modelSpace — mutation and lineage', () => {
  it('mutations of a parent are all distinct from the parent', () => {
    const parent = spec([CONST, LIN], 'parent');
    const kids = mutateModelSpec(parent, { xRange: { min: 1, max: 20 } });
    expect(kids.length).toBeGreaterThan(0);
    const parentPrint = modelSpecFingerprint(parent);
    for (const kid of kids) expect(modelSpecFingerprint(kid)).not.toBe(parentPrint);
  });

  it('every mutation records its parent and the operator that produced it — lineage is answerable, not implied', () => {
    const parent = spec([CONST, LIN], 'parent');
    for (const kid of mutateModelSpec(parent, { xRange: { min: 1, max: 20 } })) {
      expect(kid.lineage).not.toBeNull();
      expect(kid.lineage!.parentFingerprint).toBe(modelSpecFingerprint(parent));
      expect(kid.lineage!.operator.length).toBeGreaterThan(0);
    }
  });

  it('mutation can reach a model that adds a term the parent did not have — the space is genuinely open beyond the parent', () => {
    const parent = spec([CONST, LIN], 'parent');
    const kids = mutateModelSpec(parent, { xRange: { min: 1, max: 20 } });
    expect(kids.some((k) => k.terms.length > parent.terms.length)).toBe(true);
  });

  it('mutations are duplicate-free among themselves', () => {
    const kids = mutateModelSpec(spec([CONST, LIN]), { xRange: { min: 1, max: 20 } });
    const prints = kids.map(modelSpecFingerprint);
    expect(new Set(prints).size).toBe(prints.length);
  });
});
