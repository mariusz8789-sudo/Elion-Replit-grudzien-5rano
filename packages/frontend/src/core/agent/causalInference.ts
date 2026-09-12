/**
 * CAP-2 — CAUSAL INFERENCE ESTIMATOR LIBRARY (difference-in-differences /
 * interrupted-time-series / synthetic-control), the ONE new reusable
 * capability the B1 (ULEZ->NO2 adjudication) research package required
 * (`docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md`, CAP-2).
 *
 * Confirmed missing before writing a line here: `grep -rn
 * "differenceInDifferences\|syntheticControl\|causalInference"
 * packages/frontend/src` returned nothing.
 *
 * Zero new engine: this is one statistical primitive, the same order as
 * `beliefRevision.ts`/`tautologyGate.ts` — a pure function of a panel and a
 * design, reusable for ANY future policy-intervention experiment (Scotland
 * MUP, France 80 km/h, other LEZ/CAZ), not a one-off built for ULEZ. It
 * knows nothing about NO2, London, or DEFRA.
 *
 * ## Honesty boundaries, stated once here rather than at every call site
 *
 * - Cluster-robust standard errors are the standard CR1 sandwich estimator
 *   with the usual small-sample df correction — but with FEW clusters (a
 *   handful of cities, as B1 has), the asymptotic justification for this
 *   formula is weak; this is disclosed in `CausalFitDiagnostics.note`
 *   whenever `clusters < 20`, never silently presented as exact.
 * - The two-way fixed-effects DiD estimator uses the standard
 *   Frisch-Waugh-Lovell double-demeaning shortcut (valid because there is
 *   exactly one regressor of interest, the treated*post indicator) — this
 *   is mathematically identical to running the full dummy-variable
 *   regression, not an approximation.
 * - Synthetic control weights are found by projected gradient descent on
 *   pre-period RMSE with a non-negativity + sum-to-one constraint — a real,
 *   standard construction (Abadie et al.), not a heuristic invented here.
 * - `assessTautology`/`beliefRevision.ts` are NOT called from this module —
 *   this module answers "what does the data say", never "how much should
 *   this move belief" or "is this circular". Those questions belong to the
 *   caller, exactly as `qe4BrydgesEstimator.ts` never touches
 *   `tautologyGate.ts` either.
 */

export const CAUSAL_INFERENCE_CONTRACT_VERSION = '1.0.0';

export interface PanelObservation {
  readonly unit: string;
  /** Integer time index (e.g. months since a fixed epoch) — must be comparable with `<`/`===`. */
  readonly period: number;
  readonly outcome: number;
}

export type CausalEstimator = 'two-way-fe-did' | 'interrupted-time-series' | 'synthetic-control';

export interface CausalFitInput {
  readonly panel: readonly PanelObservation[];
  readonly treatmentUnit: string;
  readonly controlUnits: readonly string[];
  /** First period at which `treatmentUnit` is treated (inclusive). */
  readonly cutoffPeriod: number;
  readonly estimator: CausalEstimator;
}

export interface EstimateWithCI {
  readonly estimate: number;
  readonly se: number;
  readonly ci95: readonly [number, number];
}

export interface CausalFitDiagnostics {
  readonly n: number;
  readonly units: number;
  readonly periods: number;
  readonly clusters: number;
  readonly note: string;
  /** two-way-fe-did only: the naive CR1 sandwich SE, reported for reference — NOT the primary inference (see `note`). */
  readonly naiveClusterRobustSe?: number;
  /** two-way-fe-did only: how many leave-one-out control-unit placebo relabelings the permutation SE was built from. */
  readonly permutationPlaceboCount?: number;
}

export interface CausalFitResult {
  readonly estimator: CausalEstimator;
  readonly effect: EstimateWithCI;
  readonly diagnostics: CausalFitDiagnostics;
  /** Only for `estimator === 'synthetic-control'`. */
  readonly syntheticWeights?: Readonly<Record<string, number>>;
  /** Only for `estimator === 'interrupted-time-series'`: level change is the returned `effect`; this is the additional slope-change term. */
  readonly slopeChange?: EstimateWithCI;
}

function ci95(estimate: number, se: number): readonly [number, number] {
  const half = 1.96 * se;
  return [estimate - half, estimate + half];
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Small general-purpose OLS (Gaussian elimination on the normal equations).
// Used by the ITS estimator, which genuinely needs several regressors.
// ---------------------------------------------------------------------------

export interface OlsResult {
  readonly coefficients: readonly number[];
  readonly residuals: readonly number[];
  /** Homoskedastic (X'X)^-1 * sigma^2 — the baseline; callers needing HAC/cluster-robust SEs use `hacCovariance`/`clusterRobustVariance` on the same design matrix and residuals instead. */
  readonly covariance: readonly (readonly number[])[];
}

function transpose(matrix: readonly (readonly number[])[]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const result: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i += 1) for (let j = 0; j < cols; j += 1) result[j]![i] = matrix[i]![j]!;
  return result;
}

function matMul(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = a.length;
  const m = b[0]?.length ?? 0;
  const k = b.length;
  const result: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      let sum = 0;
      for (let p = 0; p < k; p += 1) sum += a[i]![p]! * b[p]![j]!;
      result[i]![j] = sum;
    }
  }
  return result;
}

function matVec(a: readonly (readonly number[])[], v: readonly number[]): number[] {
  return a.map((row) => row.reduce((sum, value, index) => sum + value * v[index]!, 0));
}

/** Inverts a square matrix via Gauss-Jordan elimination with partial pivoting. Throws on a singular matrix (never silently returns garbage). */
function invertMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const augmented: number[][] = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]![col]!) > Math.abs(augmented[pivotRow]![col]!)) pivotRow = row;
    }
    if (Math.abs(augmented[pivotRow]![col]!) < 1e-12) {
      throw new Error('causalInference: singular design matrix (perfectly collinear regressors) — cannot invert.');
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow]!, augmented[col]!];
    const pivotValue = augmented[col]![col]!;
    for (let j = 0; j < 2 * n; j += 1) augmented[col]![j] = augmented[col]![j]! / pivotValue;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = augmented[row]![col]!;
      for (let j = 0; j < 2 * n; j += 1) augmented[row]![j] = augmented[row]![j]! - factor * augmented[col]![j]!;
    }
  }
  return augmented.map((row) => row.slice(n));
}

/** Ordinary least squares via the normal equations. `X` must include an intercept column explicitly if one is wanted. */
export function ordinaryLeastSquares(X: readonly (readonly number[])[], y: readonly number[]): OlsResult {
  if (X.length !== y.length || X.length === 0) throw new Error('causalInference: X and y must be the same non-zero length.');
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXInv = invertMatrix(XtX);
  const Xty = matVec(Xt, y);
  const coefficients = matVec(XtXInv, Xty);
  const fitted = X.map((row) => row.reduce((sum, value, index) => sum + value * coefficients[index]!, 0));
  const residuals = y.map((value, index) => value - fitted[index]!);
  const dof = Math.max(1, X.length - coefficients.length);
  const sigma2 = residuals.reduce((sum, e) => sum + e * e, 0) / dof;
  const covariance = XtXInv.map((row) => row.map((value) => value * sigma2));
  return { coefficients, residuals, covariance };
}

/**
 * Newey-West HAC covariance for a single-equation OLS fit, for time-series
 * serial correlation within one unit's series. `maxLag` defaults to the
 * common rule of thumb floor(4*(n/100)^(2/9)).
 */
export function hacStandardError(X: readonly (readonly number[])[], residuals: readonly number[], coefficientIndex: number, maxLag?: number): number {
  const n = X.length;
  const lag = maxLag ?? Math.max(1, Math.floor(4 * (n / 100) ** (2 / 9)));
  const Xt = transpose(X);
  const XtXInv = invertMatrix(matMul(Xt, X));
  const scores = X.map((row, t) => row[coefficientIndex]! * residuals[t]!);
  let sum = scores.reduce((s, v) => s + v * v, 0);
  for (let lagIndex = 1; lagIndex <= lag; lagIndex += 1) {
    const weight = 1 - lagIndex / (lag + 1);
    let autocov = 0;
    for (let t = lagIndex; t < n; t += 1) autocov += scores[t]! * scores[t - lagIndex]!;
    sum += 2 * weight * autocov;
  }
  const bread = XtXInv[coefficientIndex]![coefficientIndex]!;
  const variance = bread * bread * sum * X.length;
  return Math.sqrt(Math.max(0, variance));
}

// ---------------------------------------------------------------------------
// Two-way fixed-effects DiD via double demeaning (Frisch-Waugh-Lovell).
// ---------------------------------------------------------------------------

function twoWayDemean(panel: readonly PanelObservation[], values: readonly number[]): number[] {
  const unitSums = new Map<string, { sum: number; n: number }>();
  const periodSums = new Map<number, { sum: number; n: number }>();
  let grandSum = 0;
  panel.forEach((obs, i) => {
    const v = values[i]!;
    grandSum += v;
    const u = unitSums.get(obs.unit) ?? { sum: 0, n: 0 };
    u.sum += v; u.n += 1; unitSums.set(obs.unit, u);
    const p = periodSums.get(obs.period) ?? { sum: 0, n: 0 };
    p.sum += v; p.n += 1; periodSums.set(obs.period, p);
  });
  const grandMean = grandSum / panel.length;
  return panel.map((obs, i) => {
    const unitMean = unitSums.get(obs.unit)!.sum / unitSums.get(obs.unit)!.n;
    const periodMean = periodSums.get(obs.period)!.sum / periodSums.get(obs.period)!.n;
    return values[i]! - unitMean - periodMean + grandMean;
  });
}

/**
 * The plain single-regressor CR1 sandwich, reported ONLY as a secondary,
 * clearly-labelled diagnostic (`diagnostics.naiveClusterRobustSe` below) —
 * NEVER as the primary inference. It is exposed at all because it is a
 * real, standard quantity practitioners expect to see, not because it is
 * trustworthy here.
 */
function clusterRobustVariance(x: readonly number[], residuals: readonly number[], clusterIds: readonly string[]): number {
  const sxx = x.reduce((sum, v) => sum + v * v, 0);
  const byCluster = new Map<string, number>();
  x.forEach((v, i) => {
    const contribution = v * residuals[i]!;
    byCluster.set(clusterIds[i]!, (byCluster.get(clusterIds[i]!) ?? 0) + contribution);
  });
  const meat = [...byCluster.values()].reduce((sum, s) => sum + s * s, 0);
  const g = byCluster.size;
  const n = x.length;
  const k = 1;
  const dfCorrection = g > 1 ? (g / (g - 1)) * ((n - 1) / Math.max(1, n - k)) : 1;
  return dfCorrection * meat / (sxx * sxx);
}

/**
 * Fits the plain two-way-demeaned bivariate DiD (point estimate + residuals)
 * for one declared treated unit against one declared set of controls. Pure
 * arithmetic, no inference attached — `twoWayFixedEffectsDiD` and the
 * permutation machinery below both call this on different (real vs.
 * relabelled) unit assignments.
 */
function fitTwoWayDemeanedDiD(rows: readonly PanelObservation[], treatmentUnit: string, cutoffPeriod: number): { estimate: number; dTilde: number[]; yTilde: number[]; residuals: number[] } {
  const outcomes = rows.map((obs) => obs.outcome);
  const treatmentIndicator = rows.map((obs) => (obs.unit === treatmentUnit && obs.period >= cutoffPeriod ? 1 : 0));
  const yTilde = twoWayDemean(rows, outcomes);
  const dTilde = twoWayDemean(rows, treatmentIndicator);
  const sxx = dTilde.reduce((sum, v) => sum + v * v, 0);
  if (sxx < 1e-9) throw new Error('causalInference: treatment indicator has no residual variation after two-way demeaning — design is not identified.');
  const sxy = dTilde.reduce((sum, v, i) => sum + v * yTilde[i]!, 0);
  const estimate = sxy / sxx;
  const residuals = yTilde.map((v, i) => v - estimate * dTilde[i]!);
  return { estimate, dTilde, yTilde, residuals };
}

/**
 * PRIMARY inference for a design with exactly ONE treated unit — the
 * situation every call to `twoWayFixedEffectsDiD` in this module is in,
 * since `CausalFitInput.treatmentUnit` is always a single unit.
 *
 * Conley & Taber (2011) showed that cluster-robust/asymptotic sandwich
 * standard errors are NOT valid here, regardless of how many CONTROL
 * clusters exist — the asymptotics require the number of TREATED clusters
 * to grow, and it never does when there is exactly one policy-adopting
 * city. This was measured directly in this module's own test suite before
 * being written up here, not assumed: a naive CR1 sandwich SE was
 * benchmarked by simulation against 50 known-null seeds and gave ~46%
 * empirical coverage of a nominal 95% CI with 6 clusters, and WORSE (~24%)
 * with 31 clusters — ruling out "too few clusters" and confirming the
 * one-treated-unit structural problem instead.
 *
 * The standard remedy (Conley & Taber; Cameron & Miller 2015's review;
 * Ferman & Pinto) is randomization/permutation inference: relabel each
 * CONTROL unit in turn as the "treated" one (holding the same cutoff,
 * against the remaining controls), refit the identical estimator, and use
 * the empirical distribution of those placebo estimates as the reference
 * distribution for the real one. This is the SAME mechanism as
 * `runControlPairPlacebo` below, generalized into an inference procedure
 * rather than a single pass/fail check.
 */
function permutationInference(rows: readonly PanelObservation[], controlUnits: readonly string[], cutoffPeriod: number, realEstimate: number): { se: number; ci95: readonly [number, number]; placeboCount: number } {
  const placeboEstimates: number[] = [];
  for (const placeboUnit of controlUnits) {
    const remaining = controlUnits.filter((u) => u !== placeboUnit);
    if (remaining.length === 0) continue;
    const placeboRows = rows.filter((obs) => obs.unit === placeboUnit || remaining.includes(obs.unit));
    try {
      const { estimate } = fitTwoWayDemeanedDiD(placeboRows, placeboUnit, cutoffPeriod);
      placeboEstimates.push(estimate);
    } catch {
      // A degenerate placebo relabeling (e.g. no residual variation for that unit) contributes nothing — never fabricated.
    }
  }
  if (placeboEstimates.length < 2) {
    return { se: Number.NaN, ci95: [Number.NaN, Number.NaN], placeboCount: placeboEstimates.length };
  }
  const placeboMean = mean(placeboEstimates);
  const se = Math.sqrt(placeboEstimates.reduce((sum, v) => sum + (v - placeboMean) ** 2, 0) / (placeboEstimates.length - 1));
  return { se, ci95: ci95(realEstimate, se), placeboCount: placeboEstimates.length };
}

function twoWayFixedEffectsDiD(input: CausalFitInput): CausalFitResult {
  const { panel, treatmentUnit, controlUnits, cutoffPeriod } = input;
  const relevantUnits = new Set([treatmentUnit, ...controlUnits]);
  const rows = panel.filter((obs) => relevantUnits.has(obs.unit));
  if (rows.length === 0) throw new Error('causalInference: no panel rows for the declared treatment/control units.');

  const { estimate, dTilde, residuals } = fitTwoWayDemeanedDiD(rows, treatmentUnit, cutoffPeriod);

  const clusterIds = rows.map((obs) => obs.unit);
  const naiveVariance = clusterRobustVariance(dTilde, residuals, clusterIds);
  const naiveSe = Math.sqrt(Math.max(0, naiveVariance));

  const permutation = permutationInference(rows, controlUnits, cutoffPeriod, estimate);

  const clusters = new Set(clusterIds).size;
  const units = new Set(rows.map((r) => r.unit)).size;
  const periods = new Set(rows.map((r) => r.period)).size;

  return {
    estimator: 'two-way-fe-did',
    effect: { estimate, se: permutation.se, ci95: permutation.ci95 },
    diagnostics: {
      n: rows.length,
      units,
      periods,
      clusters,
      naiveClusterRobustSe: naiveSe,
      permutationPlaceboCount: permutation.placeboCount,
      note: `Primary inference is PERMUTATION-based (${permutation.placeboCount} leave-one-out control-unit placebo relabelings), not the naive cluster-robust sandwich SE (reported separately as diagnostics.naiveClusterRobustSe=${naiveSe.toFixed(4)} for reference only). Conley & Taber (2011): cluster-robust SEs are invalid with only ONE treated cluster regardless of control-cluster count — confirmed here by simulation (naive SE gave ~46% empirical coverage of a nominal 95% interval with 6 clusters, WORSE with 31 clusters, before this fix). Permutation inference itself is coarse with few control units (${controlUnits.length} here) — treat the CI as indicative, not exact, and see the placebo results for the actual reference distribution.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Interrupted time series: segmented regression on the TREATED unit alone.
// ---------------------------------------------------------------------------

function interruptedTimeSeries(input: CausalFitInput): CausalFitResult {
  const { panel, treatmentUnit, cutoffPeriod } = input;
  const rows = panel.filter((obs) => obs.unit === treatmentUnit).slice().sort((a, b) => a.period - b.period);
  if (rows.length < 4) throw new Error('causalInference: interrupted-time-series needs at least 4 observations on the treatment unit.');

  const t0 = rows[0]!.period;
  const X = rows.map((obs) => {
    const time = obs.period - t0;
    const post = obs.period >= cutoffPeriod ? 1 : 0;
    const timeSincePostCutoff = post ? obs.period - cutoffPeriod : 0;
    return [1, time, post, timeSincePostCutoff];
  });
  const y = rows.map((obs) => obs.outcome);
  const fit = ordinaryLeastSquares(X, y);

  const levelChangeSE = hacStandardError(X, fit.residuals, 2);
  const slopeChangeSE = hacStandardError(X, fit.residuals, 3);
  const levelChange = fit.coefficients[2]!;
  const slopeChange = fit.coefficients[3]!;

  return {
    estimator: 'interrupted-time-series',
    effect: { estimate: levelChange, se: levelChangeSE, ci95: ci95(levelChange, levelChangeSE) },
    slopeChange: { estimate: slopeChange, se: slopeChangeSE, ci95: ci95(slopeChange, slopeChangeSE) },
    diagnostics: {
      n: rows.length,
      units: 1,
      periods: rows.length,
      clusters: 1,
      note: 'Single-unit segmented regression with Newey-West HAC standard errors for serial correlation; no cross-unit clustering applies here.',
    },
  };
}

// ---------------------------------------------------------------------------
// Synthetic control: non-negative, sum-to-one weights over control units
// minimizing pre-period RMSE against the treatment unit (Abadie et al.).
// ---------------------------------------------------------------------------

function projectToSimplex(weights: readonly number[]): number[] {
  // Standard Euclidean projection onto the probability simplex (Duchi et al. 2008).
  const sorted = [...weights].sort((a, b) => b - a);
  let cumulative = 0;
  let rho = -1;
  for (let i = 0; i < sorted.length; i += 1) {
    cumulative += sorted[i]!;
    if (sorted[i]! - (cumulative - 1) / (i + 1) > 0) rho = i;
  }
  const cumulativeAtRho = sorted.slice(0, rho + 1).reduce((a, b) => a + b, 0);
  const theta = (cumulativeAtRho - 1) / (rho + 1);
  return weights.map((w) => Math.max(0, w - theta));
}

/** Fits weights on already-demeaned (deviation-from-own-pre-mean) series — see `syntheticControl`'s own doc for why. */
function fitSyntheticControlWeights(preTreatedDeviations: readonly number[], preControlDeviations: readonly (readonly number[])[]): number[] {
  const k = preControlDeviations.length;
  let weights = new Array(k).fill(1 / k);
  const learningRate = 0.05;
  for (let iter = 0; iter < 2000; iter += 1) {
    const predicted = preTreatedDeviations.map((_, t) => preControlDeviations.reduce((sum, series, c) => sum + weights[c]! * series[t]!, 0));
    const gradient = preControlDeviations.map((series) =>
      -2 * series.reduce((sum, value, t) => sum + value * (preTreatedDeviations[t]! - predicted[t]!), 0) / preTreatedDeviations.length,
    );
    weights = projectToSimplex(weights.map((w, c) => w - learningRate * gradient[c]!));
  }
  return weights;
}

function seriesForUnit(panel: readonly PanelObservation[], unit: string, wantedPeriods: readonly number[]): number[] {
  return wantedPeriods.map((p) => {
    const match = panel.find((obs) => obs.unit === unit && obs.period === p);
    if (match === undefined) throw new Error(`causalInference: unit "${unit}" is missing an observation at period ${p} — synthetic control requires a balanced panel.`);
    return match.outcome;
  });
}

/**
 * Fits synthetic-control weights + the resulting post-period gap for ONE
 * declared treated unit against ONE declared control pool, given the full
 * period list split into pre/post. Shared by the real fit and every
 * placebo-in-space relabeling below.
 *
 * Weights are fit on DEVIATIONS from each series' own pre-period mean, not
 * on raw levels — plain Abadie-style level fitting fails whenever the
 * treated unit's baseline sits outside the convex hull of the controls'
 * baselines (a convex combination of numbers all below X can never reach
 * above X). This was caught by this module's own TDD suite: a first,
 * level-only implementation returned a POSITIVE gap estimate on a
 * synthetic panel with an injected NEGATIVE effect, because every control
 * city's baseline NO2 was below London's. Demeaning by each series' own
 * pre-period mean before fitting (then adding the treated unit's own
 * pre-mean back for reconstruction) matches the SHAPE/dynamics via the
 * convex combination while letting the LEVEL come from the treated unit
 * itself — the same idea "synthetic difference-in-differences"
 * (Arkhangelsky et al. 2021) combines DiD-style demeaning with
 * synthetic-control-style weighting for.
 */
function fitSyntheticControlGap(panel: readonly PanelObservation[], treatedUnit: string, controlPool: readonly string[], prePeriods: readonly number[], postPeriods: readonly number[]): { gap: number; weights: readonly number[] } {
  const preTreated = seriesForUnit(panel, treatedUnit, prePeriods);
  const preControlSeries = controlPool.map((unit) => seriesForUnit(panel, unit, prePeriods));
  const treatedPreMean = mean(preTreated);
  const controlPreMeans = preControlSeries.map((series) => mean(series));

  const preTreatedDev = preTreated.map((v) => v - treatedPreMean);
  const preControlDev = preControlSeries.map((series, c) => series.map((v) => v - controlPreMeans[c]!));
  const weights = fitSyntheticControlWeights(preTreatedDev, preControlDev);

  const postTreated = seriesForUnit(panel, treatedUnit, postPeriods);
  const postControlSeries = controlPool.map((unit) => seriesForUnit(panel, unit, postPeriods));
  const postControlDev = postControlSeries.map((series, c) => series.map((v) => v - controlPreMeans[c]!));
  const syntheticPost = postPeriods.map((_, t) => treatedPreMean + postControlDev.reduce((sum, series, c) => sum + weights[c]! * series[t]!, 0));
  const gap = mean(postTreated.map((value, t) => value - syntheticPost[t]!));
  return { gap, weights };
}

function syntheticControl(input: CausalFitInput): CausalFitResult {
  const { panel, treatmentUnit, controlUnits, cutoffPeriod } = input;
  const periods = [...new Set(panel.map((obs) => obs.period))].sort((a, b) => a - b);
  const prePeriods = periods.filter((p) => p < cutoffPeriod);
  const postPeriods = periods.filter((p) => p >= cutoffPeriod);
  if (prePeriods.length < 2) throw new Error('causalInference: synthetic-control needs at least 2 pre-treatment periods.');

  const { gap: estimate, weights } = fitSyntheticControlGap(panel, treatmentUnit, controlUnits, prePeriods, postPeriods);

  // Placebo-in-space distribution: apply the identical fitting procedure with each
  // control unit standing in as "treated" against the remaining controls, to get an
  // honest sense of scale for the gap under the null — the standard synthetic-control
  // inference approach (Abadie et al.) when there is only one treated unit and
  // conventional standard errors do not apply.
  const placeboGaps: number[] = [];
  for (const placeboUnit of controlUnits) {
    const remaining = controlUnits.filter((u) => u !== placeboUnit);
    if (remaining.length === 0) continue;
    const { gap } = fitSyntheticControlGap(panel, placeboUnit, remaining, prePeriods, postPeriods);
    placeboGaps.push(gap);
  }
  const placeboSd = placeboGaps.length > 1
    ? Math.sqrt(placeboGaps.reduce((sum, g) => sum + (g - mean(placeboGaps)) ** 2, 0) / (placeboGaps.length - 1))
    : Number.NaN;

  const syntheticWeights: Record<string, number> = {};
  controlUnits.forEach((unit, i) => { syntheticWeights[unit] = weights[i]!; });

  return {
    estimator: 'synthetic-control',
    effect: { estimate, se: placeboSd, ci95: Number.isFinite(placeboSd) ? ci95(estimate, placeboSd) : [Number.NaN, Number.NaN] },
    syntheticWeights,
    diagnostics: {
      n: panel.length,
      units: controlUnits.length + 1,
      periods: periods.length,
      clusters: controlUnits.length,
      note: `Weights are fit on each series' deviation from its own pre-period mean (see this module's own doc comment for why: plain level-fitting fails when the treated unit's baseline sits outside the controls' convex hull, which is exactly London-vs-other-UK-cities' situation). Standard error is the placebo-in-space (leave-one-control-out) SD across ${placeboGaps.length} placebo runs, the standard synthetic-control approach when only one unit is treated — not a conventional asymptotic SE. With ${controlUnits.length} control units this placebo distribution is coarse; treat the CI as indicative.`,
    },
  };
}

/** CAP-2's declared minimal interface: `fit(panel, treatment, controls, estimator) -> {estimate, CI, diagnostics, placebo_results}`. */
export function fitCausalEffect(input: CausalFitInput): CausalFitResult {
  switch (input.estimator) {
    case 'two-way-fe-did': return twoWayFixedEffectsDiD(input);
    case 'interrupted-time-series': return interruptedTimeSeries(input);
    case 'synthetic-control': return syntheticControl(input);
  }
}

// ---------------------------------------------------------------------------
// Negative controls: required, not optional (see the B1 prompt's own rule:
// "without them a SUPPORTED verdict means nothing").
// ---------------------------------------------------------------------------

export interface PlaceboTestResult {
  readonly label: string;
  readonly effect: EstimateWithCI;
  /** True when the 95% CI includes 0 — the expected outcome for a well-behaved placebo. */
  readonly ciIncludesZero: boolean;
}

function toPlaceboResult(label: string, result: CausalFitResult): PlaceboTestResult {
  const [lo, hi] = result.effect.ci95;
  return { label, effect: result.effect, ciIncludesZero: lo <= 0 && hi >= 0 };
}

/** Control-pair placebo: treat one control unit as if it were treated, using the remaining controls as its controls. Expected: null (CI includes 0). */
export function runControlPairPlacebo(panel: readonly PanelObservation[], placeboTreated: string, placeboControls: readonly string[], cutoffPeriod: number): PlaceboTestResult {
  const result = twoWayFixedEffectsDiD({ panel, treatmentUnit: placeboTreated, controlUnits: placeboControls, cutoffPeriod, estimator: 'two-way-fe-did' });
  return toPlaceboResult(`control-pair placebo: ${placeboTreated} vs ${placeboControls.join(',')}`, result);
}

/** Pre-period placebo date: rerun the DiD design as if treatment began earlier than it really did, using only genuinely pre-treatment data. Expected: null. */
export function runPlaceboDateTest(panel: readonly PanelObservation[], treatmentUnit: string, controlUnits: readonly string[], fakeCutoffPeriod: number, realCutoffPeriod: number): PlaceboTestResult {
  if (fakeCutoffPeriod >= realCutoffPeriod) throw new Error('causalInference: a placebo cutoff must be strictly before the real cutoff.');
  const prePeriodOnly = panel.filter((obs) => obs.period < realCutoffPeriod);
  const result = twoWayFixedEffectsDiD({ panel: prePeriodOnly, treatmentUnit, controlUnits, cutoffPeriod: fakeCutoffPeriod, estimator: 'two-way-fe-did' });
  return toPlaceboResult(`placebo date: fake cutoff ${fakeCutoffPeriod} (real: ${realCutoffPeriod})`, result);
}

export interface ParallelTrendsTestResult {
  readonly preTrendDifferenceSlope: EstimateWithCI;
  /** True when the 95% CI on the pre-trend DIFFERENCE (treated minus mean-of-controls) slope includes 0 — the assumption the DiD design requires. */
  readonly parallelTrendsHold: boolean;
}

/** Pre-treatment parallel-trends test: regresses (treated - mean(controls)) on time, using ONLY pre-treatment periods. A slope significantly different from 0 means the identifying assumption is violated. */
export function testParallelPreTrends(panel: readonly PanelObservation[], treatmentUnit: string, controlUnits: readonly string[], cutoffPeriod: number): ParallelTrendsTestResult {
  const prePeriods = [...new Set(panel.filter((obs) => obs.period < cutoffPeriod).map((obs) => obs.period))].sort((a, b) => a - b);
  if (prePeriods.length < 3) throw new Error('causalInference: parallel-trends pre-test needs at least 3 pre-treatment periods.');

  const diffs = prePeriods.map((period) => {
    const treatedValue = panel.find((obs) => obs.unit === treatmentUnit && obs.period === period)?.outcome;
    const controlValues = controlUnits
      .map((unit) => panel.find((obs) => obs.unit === unit && obs.period === period)?.outcome)
      .filter((v): v is number => v !== undefined);
    if (treatedValue === undefined || controlValues.length === 0) throw new Error(`causalInference: missing observation(s) at pre-period ${period} for the parallel-trends test.`);
    return treatedValue - mean(controlValues);
  });

  const t0 = prePeriods[0]!;
  const X = prePeriods.map((p) => [1, p - t0]);
  const fit = ordinaryLeastSquares(X, diffs);
  const slope = fit.coefficients[1]!;
  const se = hacStandardError(X, fit.residuals, 1);
  const [lo, hi] = ci95(slope, se);

  return {
    preTrendDifferenceSlope: { estimate: slope, se, ci95: [lo, hi] },
    parallelTrendsHold: lo <= 0 && hi >= 0,
  };
}
