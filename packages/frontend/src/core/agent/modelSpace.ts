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

export type ModelBasis = 'CONSTANT' | 'LINEAR' | 'LOG' | 'POWER' | 'EXP_SATURATION' | 'RECIPROCAL' | 'INTERACTION';

/**
 * M3 — WHICH VARIABLE A TERM ACTS ON.
 *
 * `dim` is the index into the observation's variable vector. It is OPTIONAL and
 * absent means dimension 0, which is what every model written before M3 meant
 * by "x". That is not a convenience: `termKey` below emits the identical string
 * for an absent `dim` and for `dim: 0`, so every fingerprint, every stored
 * model identity and every replay from before M3 is bit-for-bit unchanged.
 */
export type ModelTerm =
  | { readonly basis: 'CONSTANT' }
  | { readonly basis: 'LINEAR'; readonly dim?: number }
  | { readonly basis: 'LOG'; readonly dim?: number }
  | { readonly basis: 'RECIPROCAL'; readonly dim?: number }
  | { readonly basis: 'POWER'; readonly exponent: number; readonly dim?: number }
  | { readonly basis: 'EXP_SATURATION'; readonly tau: number; readonly dim?: number }
  /**
   * The product of two distinct variables — the term that makes
   * `y = a·x1 + b·x2 + c·x1·x2` expressible. An interaction says the effect of
   * one variable DEPENDS on another, which is a different scientific claim
   * from either main effect and is therefore its own term, never implied.
   */
  | { readonly basis: 'INTERACTION'; readonly dims: readonly [number, number] };

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

/** M3: an observation over n independent variables. A 1D `ModelPoint` is the `xs.length === 1` case. */
export interface ModelPointMulti {
  readonly xs: readonly number[];
  readonly y: number;
  readonly sigma: number;
}

export type ModelFitMulti =
  | {
      readonly ok: true;
      readonly coefficients: readonly number[];
      readonly rss: number;
      readonly predictAt: (xs: readonly number[]) => number;
    }
  | { readonly ok: false; readonly reason: string };

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
  return basisValueAt(term, [x]);
}

/**
 * M3: value of one basis function over a whole variable VECTOR. This is the
 * single implementation — `basisValue` above is the one-variable case of it, so
 * 1D and multivariate models can never drift apart in how they are evaluated.
 *
 * A term addressing a dimension the observation does not carry returns NaN
 * rather than 0: a missing variable is unknown, not zero, and `fitModelSpec`
 * refuses a design containing it.
 */
export function basisValueAt(term: ModelTerm, xs: readonly number[]): number {
  if (term.basis === 'CONSTANT') return 1;
  if (term.basis === 'INTERACTION') {
    const [i, j] = term.dims;
    const a = xs[i];
    const b = xs[j];
    if (a === undefined || b === undefined) return Number.NaN;
    return a * b;
  }
  const x = xs[term.dim ?? 0];
  if (x === undefined) return Number.NaN;
  switch (term.basis) {
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
  if (term.basis === 'INTERACTION') return `INTERACTION:${term.dims[0]}x${term.dims[1]}`;
  // Dimension 0 is spelled exactly as it was before M3 existed, so every
  // fingerprint written by an earlier version still names the same model.
  const suffix = term.basis === 'CONSTANT' || (term.dim ?? 0) === 0 ? '' : `@${term.dim}`;
  if (term.basis === 'POWER') return `POWER:${term.exponent}${suffix}`;
  if (term.basis === 'EXP_SATURATION') return `EXP_SATURATION:${term.tau}${suffix}`;
  return `${term.basis}${suffix}`;
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
  // An interaction claims two variables are not separable — a stronger claim
  // than either main effect, so it costs more than a plain extra coefficient.
  INTERACTION: 1,
};

/**
 * One unit per free coefficient, plus a surcharge for bases carrying a
 * nonlinear shape parameter. Used to prefer the simpler of two models that
 * explain the data equally well — never to override a decisive fit difference.
 */
export function modelComplexity(spec: ModelSpec): number {
  return normalizeModelSpec(spec).terms.reduce((acc, t) => acc + 1 + BASIS_SURCHARGE[t.basis], 0);
}

/** Dimension 0 renders as plain `x`, exactly as before M3; higher dimensions as `x2`, `x3`, … */
function v(dim: number | undefined): string {
  return (dim ?? 0) === 0 ? 'x' : `x${(dim ?? 0) + 1}`;
}

export function renderModelSpec(spec: ModelSpec): string {
  const parts = normalizeModelSpec(spec).terms.map((t, i) => {
    const c = `c${i}`;
    switch (t.basis) {
      case 'CONSTANT': return c;
      case 'LINEAR': return `${c}·${v(t.dim)}`;
      case 'LOG': return `${c}·log(${v(t.dim)})`;
      case 'RECIPROCAL': return `${c}/${v(t.dim)}`;
      case 'POWER': return `${c}·${v(t.dim)}^${t.exponent}`;
      case 'EXP_SATURATION': return `${c}·(1 − exp(−${v(t.dim)}/${t.tau}))`;
      case 'INTERACTION': return `${c}·x${t.dims[0] + 1}·x${t.dims[1] + 1}`;
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
  const multi = fitModelSpecMulti(spec, points.map((p) => ({ xs: [p.x], y: p.y, sigma: p.sigma })));
  if (!multi.ok) return multi;
  return { ok: true, coefficients: multi.coefficients, rss: multi.rss, predict: (x: number) => multi.predictAt([x]) };
}

/**
 * M3 — the real fit, over any number of independent variables. `fitModelSpec`
 * above is this function with each observation wrapped as a one-element
 * vector, so there is exactly ONE weighted-least-squares implementation in the
 * engine and the 1D and multivariate paths cannot diverge.
 */
export function fitModelSpecMulti(spec: ModelSpec, points: readonly ModelPointMulti[]): ModelFitMulti {
  const terms = normalizeModelSpec(spec).terms;
  if (terms.length === 0) return { ok: false, reason: 'Model has no terms, so there is nothing to fit.' };

  const design: number[][] = [];
  for (const p of points) {
    const row = terms.map((t) => basisValueAt(t, p.xs));
    if (row.some((value) => !Number.isFinite(value)) || !Number.isFinite(p.y) || !(p.sigma > 0)) {
      return { ok: false, reason: `Model "${renderModelSpec(spec)}" is undefined at x=${p.xs.length === 1 ? p.xs[0] : `[${p.xs.join(', ')}]`} (or that point has a non-positive sigma) — refusing to fit rather than substituting a value.` };
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

  const predictAt = (xs: readonly number[]): number => terms.reduce((acc, t, i) => acc + coefficients[i]! * basisValueAt(t, xs), 0);
  const rss = points.reduce((acc, p) => {
    const r = p.y - predictAt(p.xs);
    return acc + (r * r) / (p.sigma * p.sigma);
  }, 0);
  return { ok: true, coefficients, rss, predictAt };
}

// --- M3: parsimony and out-of-sample ------------------------------------------

/**
 * PARSIMONY. Weighted RSS alone always prefers the more complex model: an
 * extra free coefficient can only ever lower it. This is the BIC form for a
 * chi-square with KNOWN variances — the residuals are already divided by each
 * point's own sigma, so `rss` is that chi-square and the penalty is simply
 * `k·ln(n)` added to it.
 *
 * `k` IS THE NUMBER OF ESTIMATED COEFFICIENTS — one per term — and deliberately
 * NOT `modelComplexity`. Complexity carries a surcharge for nonlinear bases
 * that exists to break ties between equally good fits; folding it into k would
 * charge BIC for freedom the fit never spends. A LOG term estimates exactly one
 * coefficient: its shape is fixed by the grammar, not fitted.
 *
 * WHAT THIS DOES NOT ACCOUNT FOR, stated rather than hidden: the engine
 * enumerates many candidate models and picks the best, and that selection over
 * a grid is itself a source of optimism which a per-model information criterion
 * does not correct. `holdoutScore` below is the answer to that, because
 * out-of-sample error is not flattered by how many models were tried.
 *
 * LOWER IS BETTER. A more complex model wins only when it lowers chi-square by
 * more than `Δk·ln(n)` — which is exactly "not without informational
 * justification".
 */
export function modelSelectionScore(rss: number, estimatedCoefficients: number, pointCount: number): number {
  if (!Number.isFinite(rss) || pointCount <= 0) return Number.POSITIVE_INFINITY;
  return rss + estimatedCoefficients * Math.log(pointCount);
}

/** The number of coefficients a fit of this model actually estimates: one per canonical term. */
export function estimatedCoefficientCount(spec: ModelSpec): number {
  return normalizeModelSpec(spec).terms.length;
}

/** Deterministic split: every `stride`-th point is held out, never a random or seeded draw. */
export function holdoutSplit<T>(points: readonly T[], stride = 3): { readonly fit: readonly T[]; readonly heldOut: readonly T[] } {
  const fit: T[] = [];
  const heldOut: T[] = [];
  points.forEach((p, i) => ((i + 1) % stride === 0 ? heldOut : fit).push(p));
  return { fit, heldOut };
}

/**
 * OUT-OF-SAMPLE CHECK. Fits on part of the data and scores the chi-square on
 * points the fit never saw — the one measurement that overfitting cannot
 * flatter, because a model bent to pass through its own residuals does worse
 * here, not better.
 *
 * Returns `null`, never a number, when the split leaves too little to fit or
 * nothing to test on. A hold-out score computed from an inadequate split would
 * look like evidence while carrying none.
 */
export function holdoutScore(spec: ModelSpec, points: readonly ModelPointMulti[], stride = 3): number | null {
  const { fit, heldOut } = holdoutSplit(points, stride);
  if (heldOut.length === 0) return null;
  const fitted = fitModelSpecMulti(spec, fit);
  if (!fitted.ok) return null;
  let score = 0;
  for (const p of heldOut) {
    const predicted = fitted.predictAt(p.xs);
    if (!Number.isFinite(predicted)) return null;
    const r = p.y - predicted;
    score += (r * r) / (p.sigma * p.sigma);
  }
  return score / heldOut.length;
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

/**
 * M3 — MULTIVARIATE MODEL SPACE.
 *
 * Enumerates models over `dimensions` independent variables: main effects on
 * each dimension, plus pairwise INTERACTION terms, so
 * `y = a·x1 + b·x2 + c·x1·x2` is reachable by enumeration rather than needing
 * to be written by hand.
 *
 * Deliberately NOT a general symbolic search. The space is the cross-product
 * of a declared basis set with a declared dimension count, capped by
 * `maxTerms` — enumerable, replayable and finite, which is the property the
 * rest of the engine depends on. An open-ended CAS would buy expressiveness at
 * the cost of every guarantee around it.
 *
 * `dimensions: 1` returns exactly what `generateModelSpace` returns, because
 * dimension 0 spells its terms identically. That is checked by test, not
 * assumed.
 */
export function generateModelSpaceMulti(
  constraints: ModelSpaceConstraints & { readonly dimensions: number; readonly includeInteractions?: boolean },
): readonly ModelSpec[] {
  const dimensions = Math.max(1, Math.floor(constraints.dimensions));
  const base = candidateTerms(constraints);
  const pool: ModelTerm[] = [];
  for (const term of base) {
    if (term.basis === 'CONSTANT') {
      pool.push(term);
      continue;
    }
    for (let dim = 0; dim < dimensions; dim += 1) pool.push({ ...term, dim } as ModelTerm);
  }
  if (constraints.includeInteractions !== false) {
    for (let i = 0; i < dimensions; i += 1) {
      for (let j = i + 1; j < dimensions; j += 1) pool.push({ basis: 'INTERACTION', dims: [i, j] as const });
    }
  }

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
