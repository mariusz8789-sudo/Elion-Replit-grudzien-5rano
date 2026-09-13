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

/**
 * MULTI-VARIABLE MODELS (C3-2). Every single-variable basis now names WHICH
 * declared variable it operates on (`variable: string`) instead of an
 * implicit, unnamed `x` — required so a model can combine terms over more
 * than one independent variable (e.g. A1's potency ratio AND efficacy delta,
 * or a genomics problem with several covariates), which the previous shape
 * could not express at all. `INTERACTION` is the one genuinely new basis: a
 * plain product of two named variables' raw values, the minimal cross term a
 * declared grammar needs to represent "these two axes don't act
 * independently" without inventing a general expression search.
 *
 * BACKWARD COMPATIBILITY, load-bearing: `basisValue`/`ModelPoint`/`ModelFit.predict`
 * all still accept a bare `number` (see `ModelInput` below) — every existing
 * single-variable caller (`discoveryCampaign.ts`, both real laboratories,
 * every existing test) is unchanged, because a bare number is treated as the
 * value of `DEFAULT_VARIABLE` ('x'), exactly what it always implicitly meant.
 * Multi-variable use is opt-in: declare `variables`/`includeInteractions` on
 * `ModelSpaceConstraints`, or pass a `Record<string, number>` point/input.
 */
export const DEFAULT_VARIABLE = 'x';

export type ModelBasis = 'CONSTANT' | 'LINEAR' | 'LOG' | 'POWER' | 'EXP_SATURATION' | 'RECIPROCAL' | 'INTERACTION';

export type ModelTerm =
  | { readonly basis: 'CONSTANT' }
  | { readonly basis: 'LINEAR'; readonly variable: string }
  | { readonly basis: 'LOG'; readonly variable: string }
  | { readonly basis: 'RECIPROCAL'; readonly variable: string }
  | { readonly basis: 'POWER'; readonly variable: string; readonly exponent: number }
  | { readonly basis: 'EXP_SATURATION'; readonly variable: string; readonly tau: number }
  /** Plain product of two named variables' raw values — the minimal cross term for "these two axes interact". */
  | { readonly basis: 'INTERACTION'; readonly variables: readonly [string, string] };

/**
 * A point/candidate can be given either as a bare number (the legacy,
 * single-variable case — treated as `{ [DEFAULT_VARIABLE]: value }`) or as a
 * named-variable record for a genuinely multi-variable model. Every function
 * below that used to take `x: number` now takes `ModelInput`, and every
 * existing call site that passes a bare number keeps compiling and behaving
 * identically.
 */
export type ModelInput = number | Readonly<Record<string, number>>;

function inputVars(input: ModelInput): Readonly<Record<string, number>> {
  return typeof input === 'number' ? { [DEFAULT_VARIABLE]: input } : input;
}

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
  /**
   * Named variable values for a multi-variable model. Absent for the
   * single-variable case (the overwhelming majority of callers today), which
   * uses `x` under `DEFAULT_VARIABLE` — see `pointInput`. When present, `x`
   * is still required (kept as a stable, human-facing axis for rendering/
   * sorting/`xRange` purposes) but evaluation reads from `vars` instead.
   */
  readonly vars?: Readonly<Record<string, number>>;
}

function pointInput(point: ModelPoint): ModelInput {
  return point.vars ?? point.x;
}

export type ModelFit =
  | {
      readonly ok: true;
      readonly coefficients: readonly number[];
      readonly rss: number;
      readonly predict: (input: ModelInput) => number;
    }
  | { readonly ok: false; readonly reason: string };

// --- basis evaluation --------------------------------------------------------

/**
 * Value of one basis function at `input`. Returns a NON-FINITE value where the
 * basis is genuinely undefined (log of a non-positive number, 1/0, a variable
 * the input does not declare) rather than substituting a fallback — callers
 * must refuse such a fit, not paper over it.
 */
export function basisValue(term: ModelTerm, input: ModelInput): number {
  const vars = inputVars(input);
  if (term.basis === 'CONSTANT') return 1;
  if (term.basis === 'INTERACTION') {
    const [v1, v2] = term.variables;
    const a = vars[v1];
    const b = vars[v2];
    return a === undefined || b === undefined ? Number.NaN : a * b;
  }
  const x = vars[term.variable];
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

/**
 * Total order over terms, so one model has exactly one canonical spelling.
 * Exported so `residualStructure.ts` reuses this exact identity rather than
 * maintaining its own, second copy of the same key format (it did, until this
 * change — a real duplication risk the two files could silently drift on).
 */
export function termKey(term: ModelTerm): string {
  if (term.basis === 'CONSTANT') return term.basis;
  if (term.basis === 'INTERACTION') return `INTERACTION:${[...term.variables].sort().join('*')}`;
  if (term.basis === 'POWER') return `POWER:${term.variable}:${term.exponent}`;
  if (term.basis === 'EXP_SATURATION') return `EXP_SATURATION:${term.variable}:${term.tau}`;
  return `${term.basis}:${term.variable}`;
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

/** Extra cost of a basis beyond the one free coefficient every term already carries.
 * `INTERACTION` is surcharged like a nonlinear-shape basis: it is a claim
 * about how two variables relate, not just one more additive axis. */
const BASIS_SURCHARGE: Readonly<Record<ModelBasis, number>> = {
  CONSTANT: 0,
  LINEAR: 0,
  LOG: 0.5,
  RECIPROCAL: 0.5,
  POWER: 1,
  EXP_SATURATION: 1,
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

export function renderModelSpec(spec: ModelSpec): string {
  const parts = normalizeModelSpec(spec).terms.map((t, i) => {
    const c = `c${i}`;
    switch (t.basis) {
      case 'CONSTANT': return c;
      case 'LINEAR': return `${c}·${t.variable}`;
      case 'LOG': return `${c}·log(${t.variable})`;
      case 'RECIPROCAL': return `${c}/${t.variable}`;
      case 'POWER': return `${c}·${t.variable}^${t.exponent}`;
      case 'EXP_SATURATION': return `${c}·(1 − exp(−${t.variable}/${t.tau}))`;
      case 'INTERACTION': return `${c}·(${t.variables[0]}·${t.variables[1]})`;
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
    const row = terms.map((t) => basisValue(t, pointInput(p)));
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

  const predict = (input: ModelInput): number => terms.reduce((acc, t, i) => acc + coefficients[i]! * basisValue(t, input), 0);
  const rss = points.reduce((acc, p) => {
    const r = p.y - predict(pointInput(p));
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
  /**
   * Named independent variables this space builds single-variable terms
   * over. Defaults to `[DEFAULT_VARIABLE]` ('x') — the single-variable case
   * every existing caller relies on, unchanged when this field is omitted.
   * A multi-variable domain (A1's potency ratio + efficacy delta, a
   * genomics problem with several covariates) declares its real variable
   * names here instead.
   */
  readonly variables?: readonly string[];
  /**
   * Also enumerate pairwise `INTERACTION` terms (`v1 · v2`) between declared
   * `variables`. Meaningless, and ignored, with fewer than two variables.
   * Defaults to false: an interaction is a real structural claim about how
   * two variables relate, so it is opt-in, never assumed — a univariate
   * space's enumerated pool is unaffected unless a caller asks for this.
   */
  readonly includeInteractions?: boolean;
}

const POWER_EXPONENTS = [0.5, 2, 3] as const;

/** Three saturation time constants spanning the real x-range, so tau is never an invented scale. */
function saturationTaus(xRange: ModelSpaceConstraints['xRange']): readonly number[] {
  const span = Math.max(xRange.max - xRange.min, Math.abs(xRange.max), 1);
  return [span / 4, span / 2, span].map((t) => Number(t.toPrecision(6)));
}

function candidateTerms(constraints: ModelSpaceConstraints): readonly ModelTerm[] {
  const excluded = new Set(constraints.excludeBases ?? []);
  const variables = constraints.variables ?? [DEFAULT_VARIABLE];
  const pool: ModelTerm[] = [];
  if (!excluded.has('CONSTANT')) pool.push({ basis: 'CONSTANT' });
  for (const variable of variables) {
    if (!excluded.has('LINEAR')) pool.push({ basis: 'LINEAR', variable });
    if (!excluded.has('LOG')) pool.push({ basis: 'LOG', variable });
    if (!excluded.has('RECIPROCAL')) pool.push({ basis: 'RECIPROCAL', variable });
    if (!excluded.has('POWER')) for (const exponent of POWER_EXPONENTS) pool.push({ basis: 'POWER', variable, exponent });
    if (!excluded.has('EXP_SATURATION')) for (const tau of saturationTaus(constraints.xRange)) pool.push({ basis: 'EXP_SATURATION', variable, tau });
  }
  if (constraints.includeInteractions && !excluded.has('INTERACTION')) {
    // Dimensional filter (F2/F5-4): an INTERACTION is a claim that two
    // DISTINCT axes act jointly. `i < j` already visits each unordered pair
    // once; the extra `variables[i] === variables[j]` guard catches a caller
    // that (accidentally or otherwise) repeats a name in `variables` — two
    // equal names would otherwise mint a same-variable "interaction" that is
    // really `variable²`, already covered honestly by the POWER basis, and
    // would silently double-count that one axis under a false cross-term
    // label rather than a real second dimension.
    for (let i = 0; i < variables.length; i += 1) {
      for (let j = i + 1; j < variables.length; j += 1) {
        if (variables[i] === variables[j]) continue;
        pool.push({ basis: 'INTERACTION', variables: [variables[i]!, variables[j]!] });
      }
    }
  }
  return pool;
}

/**
 * Beam limit (F2/F5-5): the total number of models one `generateModelSpace`
 * call will enumerate before it stops, regardless of how large `maxTerms` and
 * the declared pool (bases × variables × shape grids) make the combinatorial
 * space. `maxTerms` already bounds DEPTH (how many terms one model may carry);
 * this bounds BREADTH at a fixed depth, the same role `MAX_MUTATIONS` plays
 * for `mutateModelSpec` below — so a laboratory that declares many variables
 * or leaves every basis enabled cannot make one campaign round enumerate an
 * unbounded space. Enumeration order is `build`'s own fixed traversal, so
 * which models survive the cap is deterministic, not first-come noise.
 */
const MAX_GENERATED_MODELS = 500;

/**
 * Every distinct model of up to `maxTerms` terms over the declared pool, up to
 * `MAX_GENERATED_MODELS` of them. Deterministic in both membership and order:
 * same constraints in, same space out, so a campaign that enumerates the
 * space is replayable.
 */
export function generateModelSpace(constraints: ModelSpaceConstraints): readonly ModelSpec[] {
  const pool = candidateTerms(constraints);
  const out: ModelSpec[] = [];
  const seen = new Set<string>();

  const emit = (terms: readonly ModelTerm[]): void => {
    if (out.length >= MAX_GENERATED_MODELS) return;
    const spec = normalizeModelSpec({ id: '', terms, lineage: null });
    const print = modelSpecFingerprint(spec);
    if (seen.has(print)) return;
    seen.add(print);
    out.push({ ...spec, id: `model:${print}` });
  };

  const build = (start: number, chosen: ModelTerm[]): void => {
    if (out.length >= MAX_GENERATED_MODELS) return;
    if (chosen.length > 0) emit(chosen);
    if (chosen.length >= constraints.maxTerms) return;
    for (let i = start; i < pool.length; i += 1) {
      if (out.length >= MAX_GENERATED_MODELS) return;
      build(i + 1, [...chosen, pool[i]!]);
    }
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
        emit([...normalized.terms.filter((t) => termKey(t) !== termKey(term)), { basis: 'POWER', variable: term.variable, exponent }], 'TUNE_SHAPE', `power exponent ${term.exponent} → ${exponent}`);
      }
    }
    if (term.basis === 'EXP_SATURATION') {
      for (const tau of saturationTaus(constraints.xRange)) {
        if (tau === term.tau) continue;
        emit([...normalized.terms.filter((t) => termKey(t) !== termKey(term)), { basis: 'EXP_SATURATION', variable: term.variable, tau }], 'TUNE_SHAPE', `saturation tau ${term.tau} → ${tau}`);
      }
    }
  }
  return out;
}
