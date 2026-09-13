import { fnv1a, canonicalJson } from '../events/hash';

/**
 * MODEL SPACE — a generic, domain-agnostic space of candidate MODEL FORMS,
 * plus the machinery to generate, mutate, fit, fingerprint and compare them.
 *
 * WHY THIS EXISTS. Before this module, every hypothesis Genesis could weigh
 * had to be a member of a set some human had already written down: the three
 * regimes in `qe4RegimeInquiryLoop.ts`, the six problems in
 * `hypothesisLoop.ts::HYPOTHESIS_PROBLEMS`, the lever catalogues in
 * `core/agent/*LeverCatalog.ts`. The existing derivation operators
 * (`deriveAlternativeCriteria`, `deriveAlternativeParameterValue`,
 * `generateJointMechanismFrom`) genuinely compute new hypotheses from measured
 * values, but each applies ONE fixed transformation to an existing hypothesis;
 * none can propose a model FORM that nobody declared. That is the gap this
 * closes: here a model's functional shape is itself data — enumerable,
 * mutable, and comparable — so the engine can reach a model it was never
 * given.
 *
 * WHAT IT DELIBERATELY IS NOT. Not symbolic regression, not a search over
 * arbitrary expression trees, and not an optimiser. The space is a bounded,
 * DECLARED grammar: a model is a set of basis terms that are LINEAR IN THEIR
 * COEFFICIENTS, so fitting is exact, deterministic weighted least squares with
 * no seeds, no iteration and no local minima. Nonlinear shape parameters (a
 * power's exponent, a saturation's time constant) are part of the model's
 * IDENTITY rather than fitted, which is what keeps the space discrete,
 * enumerable and replayable — the same profile-least-squares trick
 * `qe4RegimeInquiryLoop.ts::fitSaturating` already uses for one regime,
 * generalized to the whole space.
 *
 * Reuses `events/hash.ts`'s `fnv1a`/`canonicalJson` for identity, exactly like
 * every other fingerprinted record in this codebase. Zero new engines.
 */

export const MODEL_SPACE_CONTRACT_VERSION = '1.0.0';

export type ModelBasis = 'CONSTANT' | 'LINEAR' | 'LOG' | 'POWER' | 'EXP_SATURATION' | 'RECIPROCAL';

export type ModelTerm =
  | { readonly basis: 'CONSTANT' }
  | { readonly basis: 'LINEAR' }
  | { readonly basis: 'LOG' }
  | { readonly basis: 'RECIPROCAL' }
  | { readonly basis: 'POWER'; readonly exponent: number }
  | { readonly basis: 'EXP_SATURATION'; readonly tau: number };

/** How a model came to exist. `null` for a model the generator enumerated rather than derived. */
export interface ModelLineage {
  readonly parentFingerprint: string;
  readonly operator: string;
  readonly detail: string;
}

export interface ModelSpec {
  readonly id: string;
  readonly terms: readonly ModelTerm[];
  readonly lineage: ModelLineage | null;
}

export interface ModelPoint {
  readonly x: number;
  readonly y: number;
  readonly sigma: number;
}

export type ModelFit =
  | {
      readonly ok: true;
      readonly coefficients: readonly number[];
      readonly rss: number;
      readonly predict: (x: number) => number;
    }
  | { readonly ok: false; readonly reason: string };

// --- basis evaluation --------------------------------------------------------

/**
 * Value of one basis function at `x`. Returns a NON-FINITE value where the
 * basis is genuinely undefined (log of a non-positive number, 1/0) rather than
 * substituting a fallback — callers must refuse such a fit, not paper over it.
 */
export function basisValue(term: ModelTerm, x: number): number {
  switch (term.basis) {
    case 'CONSTANT': return 1;
    case 'LINEAR': return x;
    case 'LOG': return x > 0 ? Math.log(x) : Number.NaN;
    case 'RECIPROCAL': return x === 0 ? Number.NaN : 1 / x;
    case 'POWER': return x < 0 && !Number.isInteger(term.exponent) ? Number.NaN : Math.pow(x, term.exponent);
    case 'EXP_SATURATION': return term.tau > 0 ? 1 - Math.exp(-x / term.tau) : Number.NaN;
  }
}

// --- identity, normalization, complexity -------------------------------------

/** Total order over terms, so one model has exactly one canonical spelling. */
function termKey(term: ModelTerm): string {
  if (term.basis === 'POWER') return `POWER:${term.exponent}`;
  if (term.basis === 'EXP_SATURATION') return `EXP_SATURATION:${term.tau}`;
  return term.basis;
}

/** Sorts terms into canonical order and drops exact duplicates (a repeated term is one column, not two). */
export function normalizeModelSpec(spec: ModelSpec): ModelSpec {
  const seen = new Map<string, ModelTerm>();
  for (const term of spec.terms) if (!seen.has(termKey(term))) seen.set(termKey(term), term);
  const terms = [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, t]) => t);
  return { ...spec, terms };
}

/** Identity of the MODEL, not of its name: `id` and `lineage` are deliberately excluded. */
export function modelSpecFingerprint(spec: ModelSpec): string {
  return fnv1a(canonicalJson({ terms: normalizeModelSpec(spec).terms.map(termKey) }));
}

export function compareModelSpecs(a: ModelSpec, b: ModelSpec): boolean {
  return modelSpecFingerprint(a) === modelSpecFingerprint(b);
}

/** Extra cost of a basis beyond the one free coefficient every term already carries. */
const BASIS_SURCHARGE: Readonly<Record<ModelBasis, number>> = {
  CONSTANT: 0,
  LINEAR: 0,
  LOG: 0.5,
  RECIPROCAL: 0.5,
  POWER: 1,
  EXP_SATURATION: 1,
};

/**
 * One unit per free coefficient, plus a surcharge for bases carrying a
 * nonlinear shape parameter. Used to prefer the simpler of two models that
 * explain the data equally well — never to override a decisive fit difference.
 */
export function modelComplexity(spec: ModelSpec): number {
  return normalizeModelSpec(spec).terms.reduce((acc, t) => acc + 1 + BASIS_SURCHARGE[t.basis], 0);
}

export function renderModelSpec(spec: ModelSpec): string {
  const parts = normalizeModelSpec(spec).terms.map((t, i) => {
    const c = `c${i}`;
    switch (t.basis) {
      case 'CONSTANT': return c;
      case 'LINEAR': return `${c}·x`;
      case 'LOG': return `${c}·log(x)`;
      case 'RECIPROCAL': return `${c}/x`;
      case 'POWER': return `${c}·x^${t.exponent}`;
      case 'EXP_SATURATION': return `${c}·(1 − exp(−x/${t.tau}))`;
    }
  });
  return `y = ${parts.join(' + ')}`;
}

// --- fitting ------------------------------------------------------------------

/** Solves `M c = b` by Gaussian elimination with partial pivoting. Returns null if singular. */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      for (let c = col; c <= n; c += 1) m[r]![c]! -= factor * m[col]![c]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/**
 * Exact weighted least squares of `spec` against `points`, weighting each point
 * by `1/sigma²` exactly as `qe4BrydgesEstimator.ts::weightedLinearFit` does.
 * Deterministic: no seed, no iteration, no starting guess.
 *
 * Refuses (`ok: false`) rather than returning a number it cannot justify when
 * any basis is undefined on the supplied points, when there are fewer points
 * than free coefficients, or when the normal equations are singular (a
 * degenerate design — e.g. two bases that coincide on this particular x-grid).
 */
export function fitModelSpec(spec: ModelSpec, points: readonly ModelPoint[]): ModelFit {
  const terms = normalizeModelSpec(spec).terms;
  if (terms.length === 0) return { ok: false, reason: 'Model has no terms, so there is nothing to fit.' };

  const design: number[][] = [];
  for (const p of points) {
    const row = terms.map((t) => basisValue(t, p.x));
    if (row.some((v) => !Number.isFinite(v)) || !Number.isFinite(p.y) || !(p.sigma > 0)) {
      return { ok: false, reason: `Model "${renderModelSpec(spec)}" is undefined at x=${p.x} (or that point has a non-positive sigma) — refusing to fit rather than substituting a value.` };
    }
    design.push(row);
  }
  if (design.length < terms.length) {
    return { ok: false, reason: `${terms.length} free coefficients but only ${design.length} usable point(s) — the fit would be underdetermined.` };
  }

  const n = terms.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<number>(n).fill(0);
  points.forEach((p, i) => {
    const w = 1 / (p.sigma * p.sigma);
    for (let a = 0; a < n; a += 1) {
      rhs[a]! += w * design[i]![a]! * p.y;
      for (let b = 0; b < n; b += 1) matrix[a]![b]! += w * design[i]![a]! * design[i]![b]!;
    }
  });

  const coefficients = solveLinearSystem(matrix, rhs);
  if (coefficients === null || coefficients.some((c) => !Number.isFinite(c))) {
    return { ok: false, reason: `Normal equations for "${renderModelSpec(spec)}" are singular on these points — the terms are not independent on this x-grid.` };
  }

  const predict = (x: number): number => terms.reduce((acc, t, i) => acc + coefficients[i]! * basisValue(t, x), 0);
  const rss = points.reduce((acc, p) => {
    const r = p.y - predict(p.x);
    return acc + (r * r) / (p.sigma * p.sigma);
  }, 0);
  return { ok: true, coefficients, rss, predict };
}

// --- generation ---------------------------------------------------------------

export interface ModelSpaceConstraints {
  /** Maximum number of basis terms in one model (i.e. free coefficients). */
  readonly maxTerms: number;
  /** The real span of the independent variable, so shape-parameter grids land on meaningful values. */
  readonly xRange: { readonly min: number; readonly max: number };
  /** Bases the domain declares meaningless here (e.g. LOG where x can be 0). */
  readonly excludeBases?: readonly ModelBasis[];
}

const POWER_EXPONENTS = [0.5, 2, 3] as const;

/** Three saturation time constants spanning the real x-range, so tau is never an invented scale. */
function saturationTaus(xRange: ModelSpaceConstraints['xRange']): readonly number[] {
  const span = Math.max(xRange.max - xRange.min, Math.abs(xRange.max), 1);
  return [span / 4, span / 2, span].map((t) => Number(t.toPrecision(6)));
}

function candidateTerms(constraints: ModelSpaceConstraints): readonly ModelTerm[] {
  const excluded = new Set(constraints.excludeBases ?? []);
  const pool: ModelTerm[] = [];
  if (!excluded.has('CONSTANT')) pool.push({ basis: 'CONSTANT' });
  if (!excluded.has('LINEAR')) pool.push({ basis: 'LINEAR' });
  if (!excluded.has('LOG')) pool.push({ basis: 'LOG' });
  if (!excluded.has('RECIPROCAL')) pool.push({ basis: 'RECIPROCAL' });
  if (!excluded.has('POWER')) for (const exponent of POWER_EXPONENTS) pool.push({ basis: 'POWER', exponent });
  if (!excluded.has('EXP_SATURATION')) for (const tau of saturationTaus(constraints.xRange)) pool.push({ basis: 'EXP_SATURATION', tau });
  return pool;
}

/**
 * Every distinct model of up to `maxTerms` terms over the declared pool.
 * Deterministic in both membership and order: same constraints in, same space
 * out, so a campaign that enumerates the space is replayable.
 */
export function generateModelSpace(constraints: ModelSpaceConstraints): readonly ModelSpec[] {
  const pool = candidateTerms(constraints);
  const out: ModelSpec[] = [];
  const seen = new Set<string>();

  const emit = (terms: readonly ModelTerm[]): void => {
    const spec = normalizeModelSpec({ id: '', terms, lineage: null });
    const print = modelSpecFingerprint(spec);
    if (seen.has(print)) return;
    seen.add(print);
    out.push({ ...spec, id: `model:${print}` });
  };

  const build = (start: number, chosen: ModelTerm[]): void => {
    if (chosen.length > 0) emit(chosen);
    if (chosen.length >= constraints.maxTerms) return;
    for (let i = start; i < pool.length; i += 1) build(i + 1, [...chosen, pool[i]!]);
  };
  build(0, []);

  return out.sort((a, b) => modelComplexity(a) - modelComplexity(b) || modelSpecFingerprint(a).localeCompare(modelSpecFingerprint(b)));
}

// --- mutation -----------------------------------------------------------------

const MAX_MUTATIONS = 24;

/**
 * Neighbours of `parent` in the space, each carrying real lineage (parent
 * fingerprint + the operator that produced it), so "why does this model exist?"
 * is answerable from the record rather than inferred.
 *
 * Operators: ADD_TERM (a basis the parent lacks), DROP_TERM (never to empty),
 * SWAP_TERM (one basis exchanged for another), TUNE_SHAPE (a power's exponent
 * or a saturation's tau moved to a neighbouring grid value). Every child is
 * distinct from the parent and from its siblings.
 */
export function mutateModelSpec(parent: ModelSpec, constraints: Omit<ModelSpaceConstraints, 'maxTerms'> & { readonly maxTerms?: number }): readonly ModelSpec[] {
  const normalized = normalizeModelSpec(parent);
  const parentPrint = modelSpecFingerprint(normalized);
  const maxTerms = constraints.maxTerms ?? normalized.terms.length + 1;
  const pool = candidateTerms({ ...constraints, maxTerms });
  const present = new Set(normalized.terms.map(termKey));

  const out: ModelSpec[] = [];
  const seen = new Set<string>([parentPrint]);
  const emit = (terms: readonly ModelTerm[], operator: string, detail: string): void => {
    if (out.length >= MAX_MUTATIONS || terms.length === 0) return;
    const spec = normalizeModelSpec({ id: '', terms, lineage: { parentFingerprint: parentPrint, operator, detail } });
    const print = modelSpecFingerprint(spec);
    if (seen.has(print)) return;
    seen.add(print);
    out.push({ ...spec, id: `model:${print}` });
  };

  if (normalized.terms.length < maxTerms) {
    for (const term of pool) {
      if (present.has(termKey(term))) continue;
      emit([...normalized.terms, term], 'ADD_TERM', `added ${termKey(term)} to ${renderModelSpec(normalized)}`);
    }
  }
  if (normalized.terms.length > 1) {
    for (const term of normalized.terms) {
      emit(normalized.terms.filter((t) => termKey(t) !== termKey(term)), 'DROP_TERM', `dropped ${termKey(term)} from ${renderModelSpec(normalized)}`);
    }
  }
  for (const term of normalized.terms) {
    for (const replacement of pool) {
      if (present.has(termKey(replacement))) continue;
      emit(
        [...normalized.terms.filter((t) => termKey(t) !== termKey(term)), replacement],
        'SWAP_TERM',
        `swapped ${termKey(term)} for ${termKey(replacement)}`,
      );
    }
  }
  for (const term of normalized.terms) {
    if (term.basis === 'POWER') {
      for (const exponent of POWER_EXPONENTS) {
        if (exponent === term.exponent) continue;
        emit([...normalized.terms.filter((t) => termKey(t) !== termKey(term)), { basis: 'POWER', exponent }], 'TUNE_SHAPE', `power exponent ${term.exponent} → ${exponent}`);
      }
    }
    if (term.basis === 'EXP_SATURATION') {
      for (const tau of saturationTaus(constraints.xRange)) {
        if (tau === term.tau) continue;
        emit([...normalized.terms.filter((t) => termKey(t) !== termKey(term)), { basis: 'EXP_SATURATION', tau }], 'TUNE_SHAPE', `saturation tau ${term.tau} → ${tau}`);
      }
    }
  }
  return out;
}
