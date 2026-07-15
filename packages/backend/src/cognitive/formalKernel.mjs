/**
 * Formal Reality Kernel (Phase 4 — Tracks G/H/I/K/L/M).
 *
 * Physics constrains language. This kernel turns claims into formal structure and
 * checks them BEFORE expensive computation:
 *  - Dimensional Intelligence (H): exact rational unit/dimension algebra, dimensional
 *    consistency of equations, dimension-matrix rank, and Buckingham-Pi dimensionless
 *    group generation via a real rational null-space (not hard-coded outputs).
 *  - Assumption Unearthing (I): explicit + implicit assumptions, and assumption-attack
 *    ("if this fails, what collapses?").
 *  - Limit Analyzer (K): where a model stops being trustworthy (validity domain,
 *    singular/sensitive regions) — numerical convergence is not physical truth.
 *  - Necropolis 2 (L): formal failure regions + context-aware similarity that CHANGES
 *    a future decision (avoids a known dead end).
 *  - Epistemic Priority (M): pick the next action by an explicit information-gain
 *    PROXY / cost / reversibility / risk — benchmarked against random / fixed / cost-only.
 *
 * Honesty: an equation asserted by a model is UNVERIFIED_FORMALIZATION until checked.
 * The information-gain term is an explicit proxy, never called Shannon information.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

/* ---------------- Exact rational arithmetic ---------------- */
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
export function fr(n, d = 1) { if (d === 0) throw new Error('division by zero'); if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; }
const fsub = (a, b) => fr(a.n * b.d - b.n * a.d, a.d * b.d);
const fmul = (a, b) => fr(a.n * b.n, a.d * b.d);
const fdiv = (a, b) => fr(a.n * b.d, a.d * b.n);
const fzero = (a) => a.n === 0;

/* ---------------- Dimensions (SI base: M L T I Θ N J) ---------------- */
export const BASE = Object.freeze(['M', 'L', 'T', 'I', 'Th', 'N', 'J']);
export const DIM = Object.freeze({
  DIMENSIONLESS: [0, 0, 0, 0, 0, 0, 0],
  MASS: [1, 0, 0, 0, 0, 0, 0], LENGTH: [0, 1, 0, 0, 0, 0, 0], TIME: [0, 0, 1, 0, 0, 0, 0],
  VELOCITY: [0, 1, -1, 0, 0, 0, 0], ACCELERATION: [0, 1, -2, 0, 0, 0, 0],
  FORCE: [1, 1, -2, 0, 0, 0, 0], ENERGY: [1, 2, -2, 0, 0, 0, 0], PRESSURE: [1, -1, -2, 0, 0, 0, 0],
  DENSITY: [1, -3, 0, 0, 0, 0, 0], DYN_VISCOSITY: [1, -1, -1, 0, 0, 0, 0],
  GRAVITY: [0, 1, -2, 0, 0, 0, 0], FREQUENCY: [0, 0, -1, 0, 0, 0, 0], AREA: [0, 2, 0, 0, 0, 0, 0],
});
export function dimEqual(a, b) { return BASE.every((_, i) => (a[i] ?? 0) === (b[i] ?? 0)); }
export function dimMul(a, b) { return BASE.map((_, i) => (a[i] ?? 0) + (b[i] ?? 0)); }
export function dimPow(a, p) { return BASE.map((_, i) => (a[i] ?? 0) * p); }
export function isDimensionless(a) { return dimEqual(a, DIM.DIMENSIONLESS); }

/** Dimensional consistency of an equation given as terms that must all share a dimension. */
export function checkDimensionalConsistency(terms) {
  if (!Array.isArray(terms) || terms.length === 0) return { consistent: false, reason: 'no terms' };
  const ref = terms[0].dimension;
  const offenders = terms.filter((t) => !dimEqual(t.dimension, ref));
  return offenders.length === 0
    ? { consistent: true, dimension: ref }
    : { consistent: false, reason: 'terms have inconsistent dimensions', reference: ref, offenders: offenders.map((t) => t.symbol ?? '?') };
}

/* ---------------- Buckingham Pi via rational null-space ---------------- */
/** Reduced row echelon form of a fraction matrix (in place copy). Returns { R, pivots }. */
function rref(mat) {
  const R = mat.map((row) => row.map((x) => fr(x.n, x.d)));
  const rows = R.length; const cols = rows ? R[0].length : 0; const pivots = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let piv = -1;
    for (let i = r; i < rows; i++) if (!fzero(R[i][c])) { piv = i; break; }
    if (piv === -1) continue;
    [R[r], R[piv]] = [R[piv], R[r]];
    const inv = fdiv(fr(1), R[r][c]);
    R[r] = R[r].map((x) => fmul(x, inv));
    for (let i = 0; i < rows; i++) {
      if (i !== r && !fzero(R[i][c])) { const f = R[i][c]; R[i] = R[i].map((x, j) => fsub(x, fmul(f, R[r][j]))); }
    }
    pivots.push(c); r++;
  }
  return { R, pivots, rank: pivots.length };
}

/**
 * Buckingham Pi: given variables (each { symbol, dimension:7-vector }) return the
 * dimensionless power-law groups as integer exponent vectors over the variables.
 * Number of groups = nVars - rank(dimension matrix). Real linear algebra.
 */
export function buckinghamPi(variables) {
  const n = variables.length;
  // dimension matrix D: rows = base dims actually used, cols = variables.
  const usedRows = BASE.map((_, i) => i).filter((i) => variables.some((v) => (v.dimension[i] ?? 0) !== 0));
  const D = usedRows.map((i) => variables.map((v) => fr(v.dimension[i] ?? 0)));
  const { pivots, rank } = D.length ? rref(D) : { pivots: [], rank: 0 };
  const nGroups = n - rank;
  // Null space: free columns = non-pivot columns.
  const { R } = D.length ? rref(D) : { R: [] };
  const pivotSet = new Set(pivots);
  const free = [];
  for (let c = 0; c < n; c++) if (!pivotSet.has(c)) free.push(c);
  const groups = free.map((fc) => {
    const vec = new Array(n).fill(null).map(() => fr(0));
    vec[fc] = fr(1);
    // pivot vars expressed from R rows: for each pivot row i with pivot col pc, x_pc = -R[i][fc]
    pivots.forEach((pc, i) => { vec[pc] = fsub(fr(0), R[i][fc]); });
    // scale to smallest integers
    const lcm = vec.reduce((acc, x) => (acc * x.d) / gcd(acc, x.d), 1);
    const ints = vec.map((x) => (x.n * lcm) / x.d);
    const g2 = ints.reduce((a, b) => gcd(a, b || 1), 0) || 1;
    const norm = ints.map((x) => x / g2);
    return norm.map((exp, idx) => ({ symbol: variables[idx].symbol, exponent: exp })).filter((t) => t.exponent !== 0);
  });
  return { nVariables: n, rank, nGroups, groups };
}

/* ---------------- Formal relations (persisted, with status) ---------------- */
export const FORMAL_STATUS = Object.freeze({
  SOURCE_EXTRACTED: 'SOURCE_EXTRACTED', SYMBOLICALLY_DERIVED: 'SYMBOLICALLY_DERIVED',
  COMPUTATIONALLY_VERIFIED: 'COMPUTATIONALLY_VERIFIED', EMPIRICAL_FIT: 'EMPIRICAL_FIT',
  MODEL_ASSUMPTION: 'MODEL_ASSUMPTION', UNVERIFIED_FORMALIZATION: 'UNVERIFIED_FORMALIZATION', CONTRADICTED: 'CONTRADICTED',
});
export function recordFormalRelation(db, { missionId = null, kind, expression = null, symbols = [], dimension = {}, status, source = null, assumptions = [], validityDomain = {}, evidenceRefs = [] }) {
  if (!Object.values(FORMAL_STATUS).includes(status)) throw new Error(`invalid formal status: ${status}`);
  const contentHash = canonicalHash({ kind, expression, symbols, dimension, assumptions });
  return store.saveFormalRelation(db, { missionId, kind, expression, symbols, dimension, status, source, assumptions, validityDomain, evidenceRefs, contentHash });
}

/* ---------------- Assumption Unearthing (I) ---------------- */
export const ASSUMPTION_CLASS = Object.freeze(['EXPLICIT_ASSUMPTION', 'IMPLICIT_REQUIRED_ASSUMPTION', 'NUMERICAL_ASSUMPTION', 'RESOURCE_ASSUMPTION', 'MEASUREMENT_ASSUMPTION', 'SCALING_ASSUMPTION', 'UNRESOLVED_ASSUMPTION']);
/** Attack an assumption: what result-dependencies collapse if it fails? */
export function assumptionAttack(assumption, dependents) {
  return { assumption: assumption.text ?? assumption, ifFalse: 'the following results lose validity', collapses: dependents ?? [], severity: (dependents ?? []).length >= 2 ? 'CRITICAL' : (dependents ?? []).length === 1 ? 'MAJOR' : 'ISOLATED' };
}

/* ---------------- Limit Analyzer (K) ---------------- */
export const LIMIT_STATUS = Object.freeze(['STABLE_IN_TESTED_REGION', 'NUMERICALLY_SENSITIVE', 'BOUNDARY_DEPENDENT', 'VALIDITY_DOMAIN_EXCEEDED', 'SINGULAR_REGION_DETECTED', 'INSUFFICIENT_FORMAL_MODEL']);
/** Classify a scalar model f near x0 using finite-difference sensitivity + validity domain. */
export function analyzeLimit(f, x0, { validityDomain = null, h = 1e-6 } = {}) {
  if (typeof f !== 'function') return { status: 'INSUFFICIENT_FORMAL_MODEL', reason: 'no executable model provided' };
  if (validityDomain && (x0 < validityDomain.min || x0 > validityDomain.max)) return { status: 'VALIDITY_DOMAIN_EXCEEDED', x0, validityDomain };
  const f0 = f(x0); const fp = f(x0 + h); const fm = f(x0 - h);
  if (!Number.isFinite(f0)) return { status: 'SINGULAR_REGION_DETECTED', x0 };
  const deriv = (fp - fm) / (2 * h);
  const sensitivity = Math.abs(deriv) * (Math.abs(x0) || 1) / (Math.abs(f0) || 1); // relative condition proxy
  if (!Number.isFinite(deriv) || sensitivity > 100) return { status: 'NUMERICALLY_SENSITIVE', x0, sensitivity };
  return { status: 'STABLE_IN_TESTED_REGION', x0, sensitivity: +sensitivity.toFixed(4) };
}

/* ---------------- Necropolis 2 (L) — formal failure regions ---------------- */
export const FAILURE_CLASS = Object.freeze(['FAILED_HYPOTHESIS', 'FAILED_PARAMETER_REGION', 'FAILED_ARCHITECTURE', 'FAILED_NUMERICAL_CONFIGURATION', 'FAILED_EXPERIMENTAL_PATH', 'NON_REPRODUCIBLE_RESULT', 'CONTRADICTED_ASSUMPTION', 'RESOURCE_DEAD_END']);
function normalize(vec, scales) {
  const out = {}; for (const k of Object.keys(vec)) out[k] = scales?.[k] ? vec[k] / scales[k] : vec[k]; return out;
}
export function recordFailureRegion(db, { missionId = null, failureClass, context, parameterVector, scales = null, assumptions = [], failureMode = null, verificationState = 'RECORDED' }) {
  if (!FAILURE_CLASS.includes(failureClass)) throw new Error(`invalid failure class: ${failureClass}`);
  const norm = normalize(parameterVector, scales);
  const contentHash = canonicalHash({ failureClass, context, normalized: norm, assumptions });
  return store.saveFailureRegion(db, { missionId, failureClass, context, parameterVector, normalized: norm, assumptions, failureMode, verificationState, contentHash });
}
/** Context-aware similarity (NOT one universal Euclidean radius): compare within the
 * same context using normalized per-dimension distance. */
export function assessRegion(db, missionId, { context, parameterVector, scales = null, radius = 0.15 }) {
  const known = store.listFailureRegions(db, missionId, { context });
  if (known.length === 0) return { verdict: 'NOVEL_REGION', nearest: null, distance: null };
  const norm = normalize(parameterVector, scales);
  let best = null; let bestD = Infinity;
  for (const k of known) {
    const keys = new Set([...Object.keys(norm), ...Object.keys(k.normalized)]);
    let sum = 0; let n = 0;
    for (const key of keys) { const a = norm[key] ?? 0; const b = k.normalized[key] ?? 0; sum += (a - b) ** 2; n++; }
    const d = Math.sqrt(sum / (n || 1));
    if (d < bestD) { bestD = d; best = k; }
  }
  let verdict;
  if (bestD <= radius * 0.34) verdict = 'KNOWN_DEAD_END';
  else if (bestD <= radius) verdict = 'HIGH_FAILURE_SIMILARITY';
  else if (bestD <= radius * 2.5) verdict = 'POTENTIAL_FAILURE_NEIGHBORHOOD';
  else verdict = 'NOVEL_REGION';
  return { verdict, nearest: best ? { id: best.id, failureClass: best.failureClass, failureMode: best.failureMode } : null, distance: +bestD.toFixed(4) };
}

/* ---------------- Epistemic Priority Engine (M) ---------------- */
export const ACTION_TYPE = Object.freeze(['RUN_SIMULATION', 'INCREASE_FIDELITY', 'MEASURE_PARAMETER', 'RETRIEVE_EVIDENCE', 'TEST_ASSUMPTION', 'REPEAT_COMPUTATION', 'INDEPENDENT_REPLICATION', 'RUN_SENSITIVITY_ANALYSIS', 'WAIT_FOR_RESOURCE', 'NO_VALID_ACTION']);
/**
 * Score = (expectedInfoGainProxy * decisionRelevance * reversibility) /
 *         (cost * (1 + riskOfInvalidInference)). Explicit PROXY, not Shannon.
 */
export function scoreAction(a) {
  const info = (a.expectedInfoGainProxy ?? 0) * (a.decisionRelevance ?? 1) * (a.reversibility ?? 1);
  const cost = 1 + (a.computeCost ?? 0) + (a.wallClockCost ?? 0) + (a.resourceCost ?? 0);
  const risk = 1 + (a.riskOfInvalidInference ?? 0);
  return info / (cost * risk);
}
export function selectNextAction(actions) {
  if (!actions || actions.length === 0) return { action: { type: 'NO_VALID_ACTION' }, reason: 'no candidate actions' };
  const scored = actions.map((a) => ({ ...a, _score: +scoreAction(a).toFixed(6) })).sort((x, y) => y._score - x._score);
  return { action: scored[0], ranking: scored, reason: `highest information-per-cost proxy (${scored[0]._score})` };
}
/** Baselines for benchmarking. */
export function baselineFixedOrder(actions) { return { action: actions[0] }; }
export function baselineCostOnly(actions) { return { action: [...actions].sort((a, b) => (1 + (a.computeCost ?? 0)) - (1 + (b.computeCost ?? 0)))[0] }; }
