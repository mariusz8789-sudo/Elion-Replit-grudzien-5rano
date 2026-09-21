/**
 * D-079 — GLP-1R QSAR V2: does a peptide-aware representation clear the gate
 * that Morgan fingerprints could not?
 *
 * D-077a established the open question empirically: V1 (Morgan r=2/512 +
 * ridge) cleared MIN_TRAIN, MIN_TEST and MIN_R2 on the real 287-row human pin
 * but missed MAX_MAE (1.1726 > 1.0), and 70% of that pin is GLP-1 analogue
 * peptides whose backbone dominates a Morgan bit vector. The hypothesis —
 * stated there as a hypothesis, not a finding — was that the FEATURISATION,
 * not the sample size, is the binding constraint. This module tests it.
 *
 * ===================== WHY A SECOND RIDGE IS NOT A DUPLICATE ===============
 *
 * `glp1rQsar.mjs::trainRidge` is a SPARSE BINARY ridge by construction: it
 * accumulates `XtX[i][j] += 1` and `Xty[i] += y` over the nonzero indices,
 * which is only correct when every feature is 0 or 1. Feeding it continuous
 * descriptors does not error — it silently fits "is this feature nonzero",
 * discarding the value. Measured: on a PERFECTLY linear continuous target
 * that a correct ridge fits to ~0, it returns MAE 1.5031. It also hardcodes
 * the intercept at index 512, so any representation wider than 512 columns
 * would overwrite the bias term.
 *
 * So `denseRidge` below is the missing capability, not a second copy of an
 * existing one. V1 keeps its own ridge, unchanged, and keeps producing the
 * identical V1 numbers.
 *
 * ===================== WHAT IS NOT TOUCHED =================================
 *
 * The frozen D-077 gate is READ FROM ITS FILE through the existing
 * `loadGlp1rValidationGate()` — never mirrored as a constant here, because a
 * second copy of a threshold is a second source of truth. The split is the
 * existing `scaffoldSplit`. The metrics are the existing `metrics`. D-057 and
 * D-069 are untouched, and a V2 model is still `MODEL_ESTIMATE`.
 */

import { scaffoldSplit, metrics } from './glp1rQsar.mjs';
import { canonicalHash } from '../provenance.mjs';

export const V2_CONTRACT_VERSION = 'glp1r-qsar-v2';

/**
 * FROZEN BEFORE THE V2 RUN. An amide-bond count of >= 3 separates peptides
 * from small molecules. Derived from the D-077a diagnostic (peptide rows had a
 * median of 19 amide bonds; small molecules 0-2), so 3 sits in the empty gap
 * with margin rather than being tuned against a V2 result.
 */
export const FROZEN_PEPTIDE_AMIDE_MIN = 3;

/**
 * Amide bonds as written by RDKit canonical SMILES. Both directions occur
 * (`NC(=O)` and `C(=O)N`) depending on how the canonical form walks the
 * backbone, so counting only one systematically undercounts. Overlapping
 * matches are not double counted: the two patterns are disjoint as written.
 */
export function countAmideBonds(canonicalSmiles) {
  const s = String(canonicalSmiles ?? '');
  return (s.match(/NC\(=O\)/g) ?? []).length + (s.match(/C\(=O\)N/g) ?? []).length;
}

/** The exact descriptor keys `rdkitAdapter.descriptors()` really returns — verified against the live engine, not assumed. */
export const RDKIT_FEATURE_NAMES = Object.freeze([
  'molWt', 'heavyAtomCount', 'hbd', 'hba', 'rotatableBonds', 'ringCount',
  'aromaticRings', 'fractionCsp3', 'tpsa', 'crippenLogP', 'formalCharge', 'heteroatomCount',
]);

export const PEPTIDE_FEATURE_NAMES = Object.freeze(['amideBonds', 'residueEstimate', 'smilesLength']);
export const DESCRIPTOR_SCHEMA = Object.freeze([...RDKIT_FEATURE_NAMES, ...PEPTIDE_FEATURE_NAMES]);

/**
 * Builds the descriptor half of a feature vector. Returns an explicit failure
 * code rather than a partial vector — a missing or non-finite descriptor is
 * never silently coerced to 0, because 0 is a meaningful value for several of
 * these columns (formalCharge, aromaticRings, ringCount).
 */
export function descriptorVector(canonicalSmiles, rdkitData) {
  if (typeof canonicalSmiles !== 'string' || canonicalSmiles.length === 0) return { ok: false, code: 'INVALID_SMILES' };
  if (!rdkitData || typeof rdkitData !== 'object') return { ok: false, code: 'NO_DESCRIPTORS' };
  const vector = [];
  for (const name of RDKIT_FEATURE_NAMES) {
    const v = rdkitData[name];
    if (!Number.isFinite(v)) return { ok: false, code: 'MISSING_FEATURE', feature: name };
    vector.push(v);
  }
  const amideBonds = countAmideBonds(canonicalSmiles);
  vector.push(amideBonds, amideBonds + 1, canonicalSmiles.length);
  if (vector.some((x) => !Number.isFinite(x))) return { ok: false, code: 'NON_FINITE_FEATURE' };
  return { ok: true, vector, amideBonds, peptideLike: amideBonds >= FROZEN_PEPTIDE_AMIDE_MIN, schema: DESCRIPTOR_SCHEMA };
}

/**
 * Standardization fitted on TRAIN ROWS ONLY. This is the leakage control that
 * makes the held-out estimate honest: calibration and test rows are
 * transformed with train statistics and never contribute to them. A
 * zero-variance column carries no information and would divide by zero, so it
 * is recorded in `dropped` and emitted as a constant 0 — visible in the model
 * fingerprint rather than silently rescaled.
 */
export function fitStandardization(trainVectors) {
  const width = trainVectors[0]?.length ?? 0;
  const mean = new Array(width).fill(0);
  const sd = new Array(width).fill(0);
  const dropped = [];
  for (let j = 0; j < width; j += 1) {
    let sum = 0;
    for (const v of trainVectors) sum += v[j];
    const m = sum / Math.max(1, trainVectors.length);
    let varSum = 0;
    for (const v of trainVectors) varSum += (v[j] - m) ** 2;
    mean[j] = m;
    sd[j] = Math.sqrt(varSum / Math.max(1, trainVectors.length));
    if (!(sd[j] > 1e-12)) dropped.push(j);
  }
  return { mean, sd, dropped, width, version: 'std-train-only-v1' };
}

export function applyStandardization(vector, std) {
  return vector.map((v, j) => (std.dropped.includes(j) ? 0 : (v - std.mean[j]) / std.sd[j]));
}

/**
 * DENSE ridge regression: (XtX + lambda*I) w = Xty with a real intercept
 * column, accumulating the actual products `x_i * x_j` and `x_i * y`. Unlike
 * the sparse binary ridge in `glp1rQsar.mjs` this is correct for continuous
 * features and for any width. Deterministic: no shuffling, no RNG, Gaussian
 * elimination with partial pivoting.
 *
 * The intercept is an explicit trailing column of ones, so `w[width]` is the
 * bias for a width-column design — it cannot collide with a feature index.
 */
export function denseRidge(rows, lambda) {
  const width = rows[0]?.x.length ?? 0;
  const dim = width + 1;
  const XtX = Array.from({ length: dim }, () => new Float64Array(dim));
  const Xty = new Float64Array(dim);
  for (const row of rows) {
    const x = row.x;
    for (let i = 0; i < width; i += 1) {
      const xi = x[i];
      if (xi === 0) continue;
      Xty[i] += xi * row.y;
      for (let j = 0; j < width; j += 1) XtX[i][j] += xi * x[j];
      XtX[i][width] += xi;
      XtX[width][i] += xi;
    }
    Xty[width] += row.y;
    XtX[width][width] += 1;
  }
  // Regularize the slopes, never the intercept: penalizing the bias would pull
  // predictions toward zero rather than toward the training mean.
  for (let i = 0; i < width; i += 1) XtX[i][i] += lambda;
  return solve(XtX, Xty);
}

function solve(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(A[r][col]);
      if (v > best) { best = v; pivot = r; }
    }
    if (pivot !== col) { [A[col], A[pivot]] = [A[pivot], A[col]]; [b[col], b[pivot]] = [b[pivot], b[col]]; }
    const diag = A[col][col] || 1e-12;
    for (let r = col + 1; r < n; r += 1) {
      const f = A[r][col] / diag;
      if (f === 0) continue;
      for (let c = col; c < n; c += 1) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = b[i];
    for (let c = i + 1; c < n; c += 1) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-12);
  }
  return x;
}

export function densePredict(weights, x) {
  let s = weights[x.length];
  for (let i = 0; i < x.length; i += 1) s += weights[i] * x[i];
  return s;
}

/** The three representations actually built. `D` (sequence-aware) is NOT implemented and is reported as such rather than faked. */
export const REPRESENTATIONS = Object.freeze({
  A: 'morgan-ecfp4-r2-512 (the V1 baseline representation, refitted with the dense ridge for a like-for-like comparison)',
  B: 'rdkit-descriptors + peptide counts, standardized on train only',
  C: 'hybrid: Morgan bits alongside standardized descriptors',
  D: 'NOT_IMPLEMENTED — a sequence-aware representation needs a SMILES->residue parser this runtime does not have; not faked',
});

export function representationVector(rep, bits, standardizedDescriptors) {
  if (rep === 'A') return bits;
  if (rep === 'B') return standardizedDescriptors;
  return [...bits, ...standardizedDescriptors];
}

/**
 * PRE-REGISTERED SELECTION RULE. The winning representation is chosen on
 * CALIBRATION error only; the test split is touched exactly once, afterwards,
 * to score the already-chosen model. The candidate objects handed here carry
 * no test field at all, so selecting on test is not merely forbidden — it is
 * structurally impossible.
 */
export const SELECTION_RULE = Object.freeze({ criterion: 'calibMAE', tieBreak: 'representationIdAsc', version: 'v2-select-v1' });

export function selectRepresentation(candidates) {
  const feasible = candidates.filter((c) => Number.isFinite(c.calibMAE));
  if (feasible.length === 0) return { ok: false, code: 'NO_FEASIBLE_CANDIDATE' };
  for (const c of feasible) {
    if ('testMAE' in c || 'testR2' in c) return { ok: false, code: 'SELECTION_LEAKAGE', reason: `candidate ${c.id} carries a test metric; selection may only see calibration` };
  }
  const best = Math.min(...feasible.map((c) => c.calibMAE));
  const tied = feasible.filter((c) => Math.abs(c.calibMAE - best) < 1e-12).sort((a, b) => (a.id < b.id ? -1 : 1));
  return { ok: true, selected: tied[0], rule: SELECTION_RULE, tied: tied.length };
}

/** Split-conformal half-width from calibration residuals. Fail-closed: no interval, no validated model. */
export function conformalHalfWidth(calibResiduals, alpha) {
  if (!Array.isArray(calibResiduals) || calibResiduals.length === 0) return { ok: false, code: 'CALIBRATION_EMPTY' };
  if (calibResiduals.some((r) => !Number.isFinite(r))) return { ok: false, code: 'CALIBRATION_INVALID' };
  const sorted = [...calibResiduals].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.ceil((sorted.length + 1) * (1 - alpha)));
  const halfWidth = sorted[Math.max(0, rank - 1)];
  return Number.isFinite(halfWidth) ? { ok: true, halfWidth, nCalib: sorted.length, alpha } : { ok: false, code: 'UNSTABLE_INTERVAL' };
}

export function modelFingerprintV2(body) {
  return canonicalHash({ contract: V2_CONTRACT_VERSION, ...body }).slice(0, 16);
}

/**
 * Applies the FROZEN gate object (loaded from its file by the caller — this
 * function never reads or mirrors a threshold). Strict comparisons: "almost
 * passed" is not passed.
 */
export function applyFrozenGate(gate, { nTrain, nTest, mae, r2, halfWidth }) {
  const reasons = [];
  if (nTrain < gate.MIN_TRAIN) reasons.push(`nTrain=${nTrain} < MIN_TRAIN=${gate.MIN_TRAIN}`);
  if (nTest < gate.MIN_TEST) reasons.push(`nTest=${nTest} < MIN_TEST=${gate.MIN_TEST}`);
  if (!(mae <= gate.MAX_MAE)) reasons.push(`MAE=${Number(mae).toFixed(4)} > MAX_MAE=${gate.MAX_MAE}`);
  if (!(r2 >= gate.MIN_R2)) reasons.push(`R2=${Number(r2).toFixed(4)} < MIN_R2=${gate.MIN_R2}`);
  if (!Number.isFinite(halfWidth)) reasons.push('no conformal interval — a validated model must carry an uncertainty');
  return { status: reasons.length === 0 ? 'AVAILABLE' : 'BLOCKED', reasons: Object.freeze(reasons) };
}

export { scaffoldSplit, metrics };
