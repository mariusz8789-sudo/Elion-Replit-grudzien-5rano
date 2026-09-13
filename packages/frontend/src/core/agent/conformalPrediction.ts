import { canonicalJson, fnv1a } from '../events/hash';
import { makeRng } from '../epidemic/agents';
import type { DataProvenance } from '../dataProvenance';
import { classifyObservationGap, type ObservationGapTrigger } from './observationGap';
import type { ModelFit, ModelPoint } from './modelSpace';

/**
 * CONFORMAL UNCERTAINTY LAYER (A8) — split conformal prediction intervals for
 * a fitted regression model, on top of infrastructure that already exists.
 *
 * REUSE, not a second system:
 *  - Fitting a model and predicting from it is `ModelFit`/`fitModelSpec` in
 *    `modelSpace.ts`. This module never fits anything itself; it takes an
 *    already-`ok:true` `ModelFit` and calls `.predict(x)`, exactly like
 *    `residualStructure.ts` does for `(p.y - fit.predict(p.x))`.
 *  - Identity/replay is `fnv1a(canonicalJson(...))` from `events/hash.ts`,
 *    the same primitive `observationGap.ts`, `discoveryCampaign.ts` and
 *    `falsifiedModelRegistry.ts` all use. No new hash.
 *  - `DataProvenance` (`SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL`) is carried
 *    verbatim on the calibration result, not re-declared.
 *  - The M1 ObservationGapRequest discriminability decision
 *    (`classifyObservationGap` in `observationGap.ts`) is called UNCHANGED.
 *    This module only computes a new KIND of "prediction spread in units of
 *    the observation's own uncertainty" — from two conformal intervals
 *    instead of two point predictions — and hands that single number to the
 *    existing classifier. There is no second gap engine and no new
 *    threshold: `TAU_DISCRIMINABILITY`/`TAU_ZERO_SPREAD` in `observationGap.ts`
 *    still decide everything.
 *  - Replay verdicts reuse `computeReplayVerdict` from `matrixFoundation/
 *    replayVerdict.ts` directly (see tests/demo) rather than a local
 *    MATCH/DRIFT re-implementation.
 *
 * GOVERNMENT RESEARCH POLICY: methodological problems this layer can detect
 * (too little calibration data for the requested confidence level; a
 * calibration set whose residuals are suspiciously all ~0, consistent with a
 * model-derived pseudo-observation rather than an independent one) are
 * reported as `warnings` on the result — FLAG/AUDIT, never a thrown error.
 * Only structural violations (empty/NaN/Infinite input, index leakage between
 * calibration and holdout, a shape mismatch) throw, because those are not
 * uncertain science, they are inputs the math cannot process at all.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *  - It does not claim a conformal interval is a "truth score". Consultation
 *    of `reusableAs`/epistemic status in other modules is untouched; nothing
 *    here writes to `KnowledgeEpistemicStatus` or falsification records.
 *  - It does not invent a new confidence-interval mathematics independent of
 *    Genesis's existing sigma-based discrimination convention — see
 *    `discriminabilityFromConformalIntervals` below, which is deliberately
 *    the same "spread / combined-uncertainty" shape as `discriminationAt` in
 *    `discoveryCampaign.ts`, not a fresh formula.
 */

export const CONFORMAL_PREDICTION_CONTRACT_VERSION = '1.0.0';

type FittedModel = Extract<ModelFit, { ok: true }>;

// --- deterministic calibration/holdout split --------------------------------

/**
 * Disclosed literal seed for the calibration/holdout shuffle — same
 * convention as `BOOTSTRAP_SEED` in `qe4BrydgesAnalysis.ts`. The split must be
 * explicit and replayable, never chosen post-hoc after seeing which split
 * happens to look best; a caller who wants a different split must pass a
 * different, equally disclosed, seed.
 */
export const CONFORMAL_SPLIT_SEED = 0x434f4e46;

export interface ConformalSplit {
  readonly seed: number;
  readonly sampleSize: number;
  readonly calibrationFraction: number;
  readonly calibrationIndices: readonly number[];
  readonly holdoutIndices: readonly number[];
  readonly fingerprint: string;
}

/**
 * A deterministic Fisher–Yates shuffle of `[0..sampleSize)` (mulberry32 via
 * `makeRng`, the same generator `qe4BrydgesAnalysis.ts` reuses for its
 * bootstrap) sliced into calibration/holdout. Same `seed` + `sampleSize` +
 * `calibrationFraction` always produces the same two index sets — that is the
 * whole "deterministic, jawny, replayable" requirement, and the fingerprint
 * lets a caller prove no split was hand-picked after the fact.
 */
export function deterministicCalibrationSplit(
  sampleSize: number,
  opts: { readonly calibrationFraction?: number; readonly seed?: number } = {},
): ConformalSplit {
  const calibrationFraction = opts.calibrationFraction ?? 0.5;
  const seed = opts.seed ?? CONFORMAL_SPLIT_SEED;
  if (!Number.isInteger(sampleSize) || sampleSize < 2) {
    throw new Error(`deterministicCalibrationSplit: sampleSize must be an integer >= 2, got ${sampleSize}.`);
  }
  if (!(calibrationFraction > 0 && calibrationFraction < 1)) {
    throw new Error(`deterministicCalibrationSplit: calibrationFraction must be in (0,1), got ${calibrationFraction}.`);
  }
  const rng = makeRng(seed);
  const indices = Array.from({ length: sampleSize }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i]!;
    indices[i] = indices[j]!;
    indices[j] = tmp;
  }
  const calibrationCount = Math.max(1, Math.min(sampleSize - 1, Math.round(sampleSize * calibrationFraction)));
  const calibrationIndices = indices.slice(0, calibrationCount).sort((a, b) => a - b);
  const holdoutIndices = indices.slice(calibrationCount).sort((a, b) => a - b);
  const fingerprint = fnv1a(canonicalJson({ seed, sampleSize, calibrationFraction, calibrationIndices, holdoutIndices }));
  return { seed, sampleSize, calibrationFraction, calibrationIndices, holdoutIndices, fingerprint };
}

/**
 * Slices `points` by a `ConformalSplit`'s index sets. Refuses (throws) if the
 * split was computed for a different sample size, or — the leakage case the
 * task calls out explicitly — if calibration and holdout indices overlap.
 * `deterministicCalibrationSplit` above can never itself produce an
 * overlapping split, so a caught overlap here means a hand-built or corrupted
 * `ConformalSplit` was passed in, not a bug in the shuffle.
 */
export function splitPoints(
  points: readonly ModelPoint[],
  split: ConformalSplit,
): { readonly calibrationPoints: readonly ModelPoint[]; readonly holdoutPoints: readonly ModelPoint[] } {
  if (points.length !== split.sampleSize) {
    throw new Error(`splitPoints: split was computed for ${split.sampleSize} points but received ${points.length}.`);
  }
  const holdoutSet = new Set(split.holdoutIndices);
  const overlap = split.calibrationIndices.filter((i) => holdoutSet.has(i));
  if (overlap.length > 0) {
    throw new Error(`splitPoints: calibration and holdout indices overlap at [${overlap.join(', ')}] — refusing to calibrate on data that leaks into the holdout.`);
  }
  return {
    calibrationPoints: split.calibrationIndices.map((i) => points[i]!),
    holdoutPoints: split.holdoutIndices.map((i) => points[i]!),
  };
}

// --- calibration -------------------------------------------------------------

function assertFinitePoints(points: readonly ModelPoint[], label: string): void {
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.sigma)) {
      throw new Error(`${label}: point {x:${p.x}, y:${p.y}, sigma:${p.sigma}} is not finite — refusing to compute a conformal result from NaN/Infinity.`);
    }
  }
}

/**
 * The split-conformal order statistic: `k = ceil((n+1) * level)`, 1-indexed,
 * clamped to `n`. When `k > n` there are not enough calibration points to
 * achieve the requested finite-sample coverage guarantee at all —
 * `guaranteeAchievable` reports that honestly (using the largest observed
 * residual as a lower bound) instead of silently promising a level the math
 * cannot back up.
 */
export function conformalQuantile(
  absResiduals: readonly number[],
  confidenceLevel: number,
): { readonly quantile: number; readonly guaranteeAchievable: boolean } {
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error(`conformalQuantile: confidenceLevel must be in (0,1), got ${confidenceLevel}.`);
  }
  const n = absResiduals.length;
  if (n === 0) {
    throw new Error('conformalQuantile: absResiduals must be non-empty — cannot compute a quantile from zero calibration residuals.');
  }
  if (absResiduals.some((r) => !Number.isFinite(r) || r < 0)) {
    throw new Error('conformalQuantile: residuals must be finite and non-negative.');
  }
  const sorted = [...absResiduals].sort((a, b) => a - b);
  const k = Math.ceil((n + 1) * confidenceLevel);
  const guaranteeAchievable = k <= n;
  const index = Math.max(0, Math.min(k, n) - 1);
  return { quantile: sorted[index]!, guaranteeAchievable };
}

export interface ConformalCalibrationResult {
  readonly contractVersion: string;
  readonly confidenceLevel: number;
  readonly sampleSize: number;
  readonly quantile: number;
  readonly guaranteeAchievable: boolean;
  readonly splitFingerprint: string;
  readonly provenance: DataProvenance;
  readonly warnings: readonly string[];
  readonly fingerprint: string;
}

const MODEL_DERIVED_PSEUDO_OBSERVATION_TOLERANCE = 1e-9;

/**
 * Fits nothing — `input.fit` must already be a successful `ModelFit`. Computes
 * the nonconformity score `|y - predict(x)|` for every calibration point
 * (the same `y - prediction` shape `residualStructure.ts` uses, unnormalized
 * by sigma per the task's formal definition), then the conformal quantile,
 * then packages it with the split's fingerprint and the caller's declared
 * `DataProvenance` so the result is self-describing and replayable.
 */
export function calibrateConformalPredictor(input: {
  readonly fit: FittedModel;
  readonly calibrationPoints: readonly ModelPoint[];
  readonly confidenceLevel: number;
  readonly splitFingerprint: string;
  readonly provenance: DataProvenance;
}): ConformalCalibrationResult {
  if (input.calibrationPoints.length === 0) {
    throw new Error('calibrateConformalPredictor: calibration set is empty — cannot compute a conformal quantile from zero points.');
  }
  assertFinitePoints(input.calibrationPoints, 'calibrateConformalPredictor');
  const residuals = input.calibrationPoints.map((p) => Math.abs(p.y - input.fit.predict(p.x)));
  if (residuals.some((r) => !Number.isFinite(r))) {
    throw new Error('calibrateConformalPredictor: model produced a non-finite prediction on a calibration point.');
  }
  const { quantile, guaranteeAchievable } = conformalQuantile(residuals, input.confidenceLevel);

  const warnings: string[] = [];
  if (!guaranteeAchievable) {
    const minimumNeeded = Math.ceil(1 / (1 - input.confidenceLevel)) - 1;
    warnings.push(
      `Only ${residuals.length} calibration point(s) — the finite-sample coverage guarantee at confidenceLevel=${input.confidenceLevel} is NOT achieved (would need at least ${minimumNeeded}); reporting the largest observed residual as a lower bound, not a validated ${Math.round(input.confidenceLevel * 100)}% quantile.`,
    );
  }
  if (residuals.every((r) => r <= MODEL_DERIVED_PSEUDO_OBSERVATION_TOLERANCE)) {
    warnings.push(
      'Every calibration residual is ~0 — consistent with the calibration "observations" being derived from this same model rather than an independent measurement. FLAG, not a block: verify the calibration data source before trusting this interval.',
    );
  }

  const core = {
    contractVersion: CONFORMAL_PREDICTION_CONTRACT_VERSION,
    confidenceLevel: input.confidenceLevel,
    sampleSize: residuals.length,
    quantile: Number(quantile.toPrecision(12)),
    guaranteeAchievable,
    splitFingerprint: input.splitFingerprint,
    provenance: input.provenance,
  };
  return { ...core, warnings, fingerprint: fnv1a(canonicalJson(core)) };
}

// --- intervals -----------------------------------------------------------------

export interface ConformalInterval {
  readonly prediction: number;
  readonly lo: number;
  readonly hi: number;
  readonly quantile: number;
  readonly confidenceLevel: number;
  readonly calibrationFingerprint: string;
  readonly fingerprint: string;
}

/** `[prediction - q, prediction + q]`, from an already-calibrated quantile. */
export function buildConformalInterval(input: {
  readonly x: number;
  readonly fit: FittedModel;
  readonly calibration: ConformalCalibrationResult;
}): ConformalInterval {
  if (!Number.isFinite(input.x)) {
    throw new Error(`buildConformalInterval: x must be finite, got ${input.x}.`);
  }
  const prediction = input.fit.predict(input.x);
  if (!Number.isFinite(prediction)) {
    throw new Error(`buildConformalInterval: model produced a non-finite prediction at x=${input.x}.`);
  }
  const { quantile, confidenceLevel } = input.calibration;
  const core = {
    prediction: Number(prediction.toPrecision(12)),
    lo: Number((prediction - quantile).toPrecision(12)),
    hi: Number((prediction + quantile).toPrecision(12)),
    quantile,
    confidenceLevel,
    calibrationFingerprint: input.calibration.fingerprint,
  };
  return { ...core, fingerprint: fnv1a(canonicalJson(core)) };
}

// --- coverage verification -----------------------------------------------------

export interface CoverageReport {
  readonly nominalCoverage: number;
  readonly observedCoverage: number;
  readonly sampleSize: number;
  readonly averageIntervalWidth: number;
  readonly method: 'SPLIT_CONFORMAL';
  readonly splitFingerprint: string;
  readonly calibrationFingerprint: string;
  readonly fingerprint: string;
}

/**
 * Empirical coverage on held-out points that took no part in calibration.
 * Reports `nominalCoverage`/`observedCoverage`/`sampleSize`/`method`/
 * `splitFingerprint` side by side rather than a single pass/fail, because a
 * small holdout genuinely cannot prove a guaranteed rate — the caller (or a
 * human reading the report) judges whether `sampleSize` is large enough to
 * trust `observedCoverage` as an estimate of `nominalCoverage`.
 */
export function evaluateCoverage(input: {
  readonly fit: FittedModel;
  readonly calibration: ConformalCalibrationResult;
  readonly holdoutPoints: readonly ModelPoint[];
}): CoverageReport {
  if (input.holdoutPoints.length === 0) {
    throw new Error('evaluateCoverage: holdout set is empty — cannot measure empirical coverage.');
  }
  assertFinitePoints(input.holdoutPoints, 'evaluateCoverage');
  let covered = 0;
  let widthSum = 0;
  for (const p of input.holdoutPoints) {
    const interval = buildConformalInterval({ x: p.x, fit: input.fit, calibration: input.calibration });
    widthSum += interval.hi - interval.lo;
    if (p.y >= interval.lo && p.y <= interval.hi) covered += 1;
  }
  const core = {
    nominalCoverage: input.calibration.confidenceLevel,
    observedCoverage: covered / input.holdoutPoints.length,
    sampleSize: input.holdoutPoints.length,
    averageIntervalWidth: Number((widthSum / input.holdoutPoints.length).toPrecision(12)),
    method: 'SPLIT_CONFORMAL' as const,
    splitFingerprint: input.calibration.splitFingerprint,
    calibrationFingerprint: input.calibration.fingerprint,
  };
  return { ...core, fingerprint: fnv1a(canonicalJson(core)) };
}

// --- M1 (ObservationGapRequest) extension ---------------------------------------

/**
 * "Prediction spread in units of the observation's own uncertainty" —
 * `observationGap.ts`'s own description of `bestDiscriminability` — computed
 * from two CONFORMAL INTERVALS instead of two point predictions plus an
 * assumed sigma. Shape is deliberately the same as `discriminationAt` in
 * `discoveryCampaign.ts` (`spread / scale`), just with each model's conformal
 * half-width standing in for that model's uncertainty at this x. This is the
 * ONLY new piece of math M1 integration needs; everything downstream of the
 * returned number is the existing classifier.
 */
export function discriminabilityFromConformalIntervals(a: ConformalInterval, b: ConformalInterval): number {
  const halfA = (a.hi - a.lo) / 2;
  const halfB = (b.hi - b.lo) / 2;
  const combinedHalfWidth = Math.max(halfA + halfB, 1e-12);
  const centerA = (a.lo + a.hi) / 2;
  const centerB = (b.lo + b.hi) / 2;
  return Math.abs(centerA - centerB) / combinedHalfWidth;
}

/**
 * Feeds a conformal-interval-derived discriminability straight into
 * `classifyObservationGap` — NOT a new gap engine. Two live models whose
 * conformal intervals overlap heavily (e.g. `[9.8,10.2]` vs `[9.9,10.1]`)
 * yield a low or zero discriminability and the same `LOW_DISCRIMINABILITY`/
 * `ZERO_SPREAD` triggers M1 already raises for point-prediction gaps; two
 * clearly separated intervals (e.g. `[7.0,8.0]` vs `[11.0,12.0]`) yield a
 * high discriminability and `null` (sufficient, proceed).
 */
export function classifyConformalObservationGap(input: {
  readonly unobservedCount: number;
  readonly intervals: readonly [ConformalInterval, ConformalInterval] | null;
}): ObservationGapTrigger | null {
  const bestDiscriminability = input.intervals === null
    ? null
    : discriminabilityFromConformalIntervals(input.intervals[0], input.intervals[1]);
  return classifyObservationGap({ unobservedCount: input.unobservedCount, bestDiscriminability });
}
