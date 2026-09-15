/**
 * D-076/077 — GLP-1R QSAR: ECFP4-style ridge regression over the pinned human
 * activity table, scaffold-split, conformal uncertainty, frozen validation
 * gate (docs/DECISIONS.md D-077).
 *
 * MODEL_ESTIMATE, NEVER a measurement. Even a model that clears every metric
 * below is a computed estimate of a QSAR relationship on a small dataset —
 * not an observation, not clinical evidence. `glp1rEfficacyAdapter.mjs`
 * enforces that label; this module only computes the numbers behind it.
 *
 * FROZEN GATE. `MIN_TRAIN`/`MIN_TEST`/`MAX_MAE`/`MIN_R2` are read from
 * `campaign/glp1r-validation-gate.json`, sealed (docs/DECISIONS.md D-077)
 * BEFORE any human GLP-1R activity row was pulled — the same
 * freeze-before-data discipline this repo already uses for
 * `frozen-prediction-thresholds.json` (D-069/D-074). A model that misses the
 * gate is BLOCKED; nothing here relaxes a threshold after seeing results.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../provenance.mjs';
import { loadValidationGate } from './validationGate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Resolved relative to THIS FILE (not cwd) — same self-sufficiency `glp1rDataset.mjs`'s PIN_PATH uses, so `probeCapabilities()` can stay a zero-arg call. */
export const GLP1R_GATE_PATH = process.env.GENESIS_GLP1R_GATE ?? path.join(HERE, 'glp1r-validation-gate.json');

/** Loads + verifies the frozen GLP-1R validation gate — the GLP-1R binding of the one generic gate loader (`validationGate.mjs`, D-081). Fail-closed: missing/tampered file blocks, never falls back to a default gate. */
export function loadGlp1rValidationGate(gatePath = GLP1R_GATE_PATH, expectedRuleFingerprint) {
  return loadValidationGate(gatePath, { targetLabel: 'GLP-1R', expectedRuleFingerprint });
}

const NBITS = 512;
const BIAS_INDEX = NBITS; // one extra coefficient for the intercept

/** Dense 0/1 bit vector -> sorted array of set-bit indices. */
function nonzeroIndices(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) out.push(i);
  return out;
}

/** Deterministic scaffold -> bucket 0-9 (djb2-style rolling hash, mod 10). Grouping (not the hash quality) is what matters: every row sharing a scaffold lands in the same bucket, so no scaffold ever crosses a split boundary. */
export function scaffoldBucket(scaffold) {
  const s = String(scaffold ?? '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % 10;
}

/**
 * Scaffold-disjoint split: buckets 0-1 -> test (~20%), 2-3 -> calib (~20%),
 * 4-9 -> train (~60%). Deterministic given the input order (no shuffling,
 * no Math.random), so two calls on the same rows produce identical splits —
 * required for `trainAndValidate`'s own determinism guarantee.
 */
export function scaffoldSplit(rowsWithScaffold) {
  const train = [];
  const calib = [];
  const test = [];
  for (const r of rowsWithScaffold) {
    const bucket = scaffoldBucket(r.scaffold);
    if (bucket < 2) test.push(r);
    else if (bucket < 4) calib.push(r);
    else train.push(r);
  }
  return { train, calib, test };
}

/**
 * Ridge regression, solved directly: (XtX + lambda*I) w = Xty, accumulated
 * over each row's SPARSE nonzero indices (never a dense DxD pass per row —
 * D=513, a training row typically sets 20-60 bits, so this stays close to
 * O(rows * nnz^2) rather than O(rows * D^2)). Gaussian elimination with
 * partial pivoting for numerical stability; fully deterministic (no
 * iterative solver, no randomness).
 */
export function trainRidge(trainRows, lambda) {
  const dim = NBITS + 1;
  const XtX = Array.from({ length: dim }, () => new Float64Array(dim));
  const Xty = new Float64Array(dim);
  for (const row of trainRows) {
    const idx = nonzeroIndices(row.bits);
    idx.push(BIAS_INDEX); // intercept feature is always "on"
    for (const i of idx) {
      Xty[i] += row.y;
      for (const j of idx) XtX[i][j] += 1;
    }
  }
  for (let i = 0; i < dim; i += 1) XtX[i][i] += lambda;
  return gaussianSolve(XtX, Xty);
}

/** Solves Ax=b in place via Gaussian elimination with partial pivoting. A and b are not reused by the caller after this call. */
function gaussianSolve(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(A[r][col]);
      if (v > pivotVal) { pivotVal = v; pivotRow = r; }
    }
    if (pivotRow !== col) { [A[col], A[pivotRow]] = [A[pivotRow], A[col]]; [b[col], b[pivotRow]] = [b[pivotRow], b[col]]; }
    const diag = A[col][col] || 1e-12;
    for (let r = col + 1; r < n; r += 1) {
      const factor = A[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c += 1) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = b[i];
    for (let c = i + 1; c < n; c += 1) sum -= A[i][c] * x[c];
    x[i] = sum / (A[i][i] || 1e-12);
  }
  return x;
}

function dotWeights(weights, bits) {
  let sum = weights[BIAS_INDEX];
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) sum += weights[i];
  return sum;
}

/** Set-based Tanimoto (Jaccard) over two SORTED arrays of set-bit indices. */
export function tanimotoIndices(a, b) {
  let i = 0;
  let j = 0;
  let intersection = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { intersection += 1; i += 1; j += 1; }
    else if (a[i] < b[j]) i += 1;
    else j += 1;
  }
  const union = a.length + b.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

export const metrics = (predictions, actuals) => {
  const n = actuals.length;
  const errors = predictions.map((p, i) => p - actuals[i]);
  const mae = errors.reduce((sum, e) => sum + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / n);
  const mean = actuals.reduce((sum, y) => sum + y, 0) / n;
  const totalSumSquares = actuals.reduce((sum, y) => sum + (y - mean) ** 2, 0);
  const residualSumSquares = errors.reduce((sum, e) => sum + e * e, 0);
  const r2 = totalSumSquares === 0 ? 0 : 1 - residualSumSquares / totalSumSquares;
  return { mae, rmse, r2, n };
};

/**
 * Trains on `rowsWithFeatures` (each `{ canonicalSmiles, scaffold, bits, y }`,
 * `bits` a 512-length 0/1 array from `rdkitAdapter.fingerprint`) and validates
 * against the frozen gate. Returns `{ ok:false, reasons }` — NEVER a model —
 * the instant any gate condition is unmet; a caller that ignores `ok` and
 * uses `weights` anyway is misusing this function, but the function itself
 * never silently substitutes a near-miss as a pass. Split-conformal interval
 * half-width is computed from the calibration set at `gate.conformalAlpha`.
 */
export function trainAndValidate(rowsWithFeatures, gate, gateFingerprint, trainingDataHash, rdkitVersion) {
  const { train, calib, test } = scaffoldSplit(rowsWithFeatures);
  const reasons = [];
  if (train.length < gate.MIN_TRAIN) reasons.push(`nTrain=${train.length} < MIN_TRAIN=${gate.MIN_TRAIN}`);
  if (test.length < gate.MIN_TEST) reasons.push(`nTest=${test.length} < MIN_TEST=${gate.MIN_TEST}`);

  if (train.length === 0 || test.length === 0) {
    // Cannot even attempt a fit/validation — report the size failures above and stop; MAE/R2 on zero rows is not a number, it is a lie about having tried.
    return Object.freeze({
      ok: false, reasons: Object.freeze(reasons.length ? reasons : ['nTrain=0 or nTest=0 after scaffold split']),
      split: Object.freeze({ nTrain: train.length, nCalib: calib.length, nTest: test.length }),
      metrics: null, weights: null, halfWidth: null, modelFingerprint: null,
    });
  }

  const weights = trainRidge(train, gate.lambda);
  const testMetrics = metrics(test.map((r) => dotWeights(weights, r.bits)), test.map((r) => r.y));
  if (testMetrics.mae > gate.MAX_MAE) reasons.push(`MAE=${testMetrics.mae.toFixed(4)} > MAX_MAE=${gate.MAX_MAE}`);
  if (testMetrics.r2 < gate.MIN_R2) reasons.push(`R2=${testMetrics.r2.toFixed(4)} < MIN_R2=${gate.MIN_R2}`);

  const calibAbsResiduals = calib
    .map((r) => Math.abs(r.y - dotWeights(weights, r.bits)))
    .sort((a, b) => a - b);
  let halfWidth = null;
  if (calibAbsResiduals.length > 0) {
    // Standard split-conformal quantile index (Vovk et al.): the
    // ceil((n+1)(1-alpha))-th order statistic, 1-indexed, clamped to n.
    const rank = Math.min(calibAbsResiduals.length, Math.ceil((calibAbsResiduals.length + 1) * (1 - gate.conformalAlpha)));
    halfWidth = calibAbsResiduals[Math.max(0, rank - 1)];
  }
  // UNCERTAINTY IS MANDATORY FOR A VALIDATED MODEL. An empty calibration
  // split yields no conformal interval, and a point estimate with no interval
  // is exactly the shape of over-claim this axis exists to prevent — so it is
  // a gate failure, not a nullable field on an otherwise-passing model.
  if (!Number.isFinite(halfWidth)) {
    reasons.push(`nCalib=${calib.length} produced no conformal interval — a validated model must carry an uncertainty, so this is BLOCKED rather than a point estimate without one`);
  }

  const trainScaffolds = new Set(train.map((r) => r.scaffold));
  const split = Object.freeze({ nTrain: train.length, nCalib: calib.length, nTest: test.length });
  const fingerprintBody = {
    algorithm: gate.algorithm, lambda: gate.lambda, conformalAlpha: gate.conformalAlpha,
    splitMethod: gate.splitMethod, gateFingerprint,
    trainingDataHash, rdkitVersion, nTrain: split.nTrain, nCalib: split.nCalib, nTest: split.nTest,
  };
  const modelFingerprint = canonicalHash(fingerprintBody).slice(0, 16);

  return Object.freeze({
    ok: reasons.length === 0,
    reasons: Object.freeze(reasons),
    split,
    metrics: Object.freeze(testMetrics),
    weights: reasons.length === 0 ? weights : null,
    halfWidth: reasons.length === 0 ? halfWidth : null,
    modelFingerprint: reasons.length === 0 ? modelFingerprint : null,
    trainFingerprintsForOod: reasons.length === 0 ? Object.freeze(train.map((r) => Object.freeze(nonzeroIndices(r.bits)))) : null,
    trainScaffoldCount: trainScaffolds.size,
  });
}

/**
 * Predicts on one candidate's already-computed fingerprint
 * (`{ ok, bits, scaffold, canonicalSmiles }` — `rdkitAdapter.fingerprint()`'s
 * own shape). Never called with a `model` that failed `trainAndValidate` —
 * `glp1rEfficacyAdapter.mjs` enforces that upstream; this function still
 * defends against it by returning BLOCKED rather than a bogus number.
 */
export function predictQsar(model, fpResult) {
  if (!model || model.ok !== true || !model.weights) {
    return { status: 'BLOCKED', value: null, outOfDomain: null, blockedReason: 'MODEL_NOT_VALIDATED' };
  }
  if (!fpResult || fpResult.ok !== true || !Array.isArray(fpResult.bits)) {
    return { status: 'BLOCKED', value: null, outOfDomain: null, blockedReason: 'FINGERPRINT_UNCOMPUTABLE' };
  }
  const value = dotWeights(model.weights, fpResult.bits);
  const candidateIdx = nonzeroIndices(fpResult.bits);
  let maxTanimoto = 0;
  for (const trainIdx of model.trainFingerprintsForOod ?? []) {
    const t = tanimotoIndices(candidateIdx, trainIdx);
    if (t > maxTanimoto) maxTanimoto = t;
  }
  const outOfDomain = (model.trainFingerprintsForOod?.length ?? 0) === 0 || maxTanimoto < 0.3;
  return { status: 'AVAILABLE', value, uncertainty: model.halfWidth, outOfDomain, nearestTrainTanimoto: maxTanimoto };
}
