/**
 * QE4 — pure computational core for the Brydges et al. (2019) randomized-
 * measurement Rényi-2 entropy recomputation (`docs/QE4_PREREGISTRATION.md`).
 *
 * Every function here is a pure function over plain arrays/numbers: no I/O,
 * no network, no repo-wide state. The estimator itself (§5 of the
 * preregistration) is the published Elben/Vermersch/Dalmonte/Zoller (PRL 120,
 * 050406, 2018) / van Enk-Beenakker (PRL 108, 110503, 2012) unbiased
 * cross-correlation formula — Genesis does not invent a new estimator, it
 * implements a documented one and runs it on real raw samples.
 *
 * WHY BOOTSTRAP RESAMPLES ROW INDICES ONCE PER ITERATION FOR ALL PARTITION
 * SIZES TOGETHER (`bootstrapMultiK`), NOT SEPARATELY PER SIZE.
 *
 * `S2(k)` for different partition sizes k are computed from the SAME
 * underlying rows (random-unitary settings) — they are correlated, not
 * independent draws. Precomputing each row's per-k statistic once, then
 * resampling ROW INDICES per bootstrap iteration and reusing the same
 * resampled index set across every k in that iteration, produces a properly
 * joint bootstrap distribution (needed for P1's regression-slope
 * confidence interval, which combines several k's S2 values from the same
 * dataset) instead of pretending each k's uncertainty is independent.
 */

const POPCOUNT_10BIT: readonly number[] = (() => {
  const table = new Array<number>(1024);
  for (let v = 0; v < 1024; v += 1) {
    let count = 0;
    let x = v;
    while (x > 0) {
      count += x & 1;
      x >>= 1;
    }
    table[v] = count;
  }
  return table;
})();

const TOTAL_BITS = 10;

/** (-2)^-d for d=0..10 — precomputed once so the O(shots²) inner loop never calls `**`. */
const NEG_TWO_POW_NEG_D: readonly number[] = Array.from({ length: TOTAL_BITS + 1 }, (_, d) => (-2) ** -d);

/** Ion 1 = MSB (value 512), ion 10 = LSB (value 1) — see preregistration §4. */
export function topKBits(value: number, k: number): number {
  if (k <= 0) return 0;
  if (k >= TOTAL_BITS) return value & 0x3ff;
  return (value & 0x3ff) >> (TOTAL_BITS - k);
}

export function hammingDistance(a: number, b: number): number {
  return POPCOUNT_10BIT[(a ^ b) & 0x3ff];
}

/** Parses a headerless, comma-separated grid of decimal-encoded measurement outcomes. */
export function parseMeasuredStatesCsv(raw: string): readonly (readonly number[])[] {
  const rows: number[][] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const values = trimmed.split(',').map((cell) => {
      const n = Number.parseInt(cell.trim(), 10);
      if (!Number.isFinite(n)) throw new Error(`QE4: non-numeric cell "${cell}" in MeasuredStates CSV`);
      return n;
    });
    rows.push(values);
  }
  return rows;
}

export interface PublishedEntropyRow {
  readonly subsystem: number;
  readonly s2: number;
  readonly stderr: number;
}

/** Parses the authors' tab-delimited `RenyiEntropy_T_Xms.csv` reference tables (P4 comparison only). */
export function parsePublishedRenyiEntropyCsv(raw: string): readonly PublishedEntropyRow[] {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const dataLines = lines.slice(1); // drop header row
  return dataLines.map((line) => {
    const cells = line.split('\t').map((c) => c.trim());
    const subsystem = Number.parseFloat(cells[0]);
    const s2 = Number.parseFloat(cells[1]);
    const stderr = Number.parseFloat(cells[2]);
    if (!Number.isFinite(subsystem) || !Number.isFinite(s2) || !Number.isFinite(stderr)) {
      throw new Error(`QE4: malformed published RenyiEntropy row: "${line}"`);
    }
    return { subsystem, s2, stderr };
  });
}

export interface BlochVectorRow {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
}

/** Parses `Fig1a/PureState.csv` / `MixedState.csv` — already-averaged per-unitary Bloch vector components. */
export function parseFig1aCsv(raw: string): readonly BlochVectorRow[] {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const dataLines = lines.slice(1); // drop header row
  return dataLines.map((line) => {
    const cells = line.split('\t').map((c) => c.trim());
    const sx = Number.parseFloat(cells[1]);
    const sy = Number.parseFloat(cells[2]);
    const sz = Number.parseFloat(cells[3]);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) {
      throw new Error(`QE4: malformed Fig1a row: "${line}"`);
    }
    return { sx, sy, sz };
  });
}

/**
 * X_row for one row (one random-unitary setting) restricted to the top-k
 * bits, per the unbiased two-shot cross-correlation estimator (§5).
 */
export function rowStatistic(shots: readonly number[], k: number): number {
  const nM = shots.length;
  const reduced = shots.map((s) => topKBits(s, k));
  let sum = 0;
  // Only i<j is computed; D_H(i,j) is symmetric, so each unordered pair's
  // contribution is counted twice (matching the ordered-pair sum in the
  // formula) via `sum * 2` below, halving the actual work done here.
  for (let i = 0; i < nM; i += 1) {
    const ri = reduced[i];
    for (let j = i + 1; j < nM; j += 1) {
      const d = POPCOUNT_10BIT[(ri ^ reduced[j]) & 0x3ff];
      sum += NEG_TWO_POW_NEG_D[d];
    }
  }
  return (2 * sum) / (nM * (nM - 1));
}

export interface TraceEstimate {
  readonly traceRhoSquared: number;
  readonly clamped: boolean;
}

/** Converts a mean X statistic into Tr(ρ_A²), clamping to (epsilon, 1] since finite-shot noise can push the raw estimate outside the physical range. */
export function traceFromMeanX(meanX: number, k: number): TraceEstimate {
  const raw = 2 ** k * meanX;
  const EPS = 1e-9;
  if (raw < EPS) return { traceRhoSquared: EPS, clamped: true };
  if (raw > 1) return { traceRhoSquared: 1, clamped: true };
  return { traceRhoSquared: raw, clamped: false };
}

export function s2FromTrace(traceRhoSquared: number): number {
  return -Math.log2(traceRhoSquared);
}

/** One dataset's rows, precomputed per-row X statistics for every requested k — reused across bootstrap iterations without recomputing Hamming distances. */
export function precomputeRowStatistics(rows: readonly (readonly number[])[], ks: readonly number[]): ReadonlyMap<number, readonly number[]> {
  const byK = new Map<number, number[]>();
  for (const k of ks) {
    byK.set(k, rows.map((row) => rowStatistic(row, k)));
  }
  return byK;
}

export interface BootstrapResult {
  readonly s2: number;
  readonly sigma: number;
  readonly clamped: boolean;
  readonly samples: readonly number[];
}

/**
 * Bootstraps S2 for every k in `ks` jointly: each iteration resamples the
 * SAME set of row indices (with replacement) and reuses it across every k,
 * so the resulting per-k bootstrap distributions stay correctly correlated.
 */
export function bootstrapMultiK(
  rows: readonly (readonly number[])[],
  ks: readonly number[],
  iterations: number,
  rng: () => number,
): ReadonlyMap<number, BootstrapResult> {
  const precomputed = precomputeRowStatistics(rows, ks);
  const n = rows.length;
  const point = new Map<number, TraceEstimate>();
  for (const k of ks) {
    const xs = precomputed.get(k)!;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    point.set(k, traceFromMeanX(meanX, k));
  }
  const samplesByK = new Map<number, number[]>();
  for (const k of ks) samplesByK.set(k, []);

  for (let iter = 0; iter < iterations; iter += 1) {
    const indices = new Array<number>(n);
    for (let i = 0; i < n; i += 1) indices[i] = Math.floor(rng() * n);
    for (const k of ks) {
      const xs = precomputed.get(k)!;
      let sum = 0;
      for (const idx of indices) sum += xs[idx];
      const meanX = sum / n;
      const { traceRhoSquared } = traceFromMeanX(meanX, k);
      samplesByK.get(k)!.push(s2FromTrace(traceRhoSquared));
    }
  }

  const result = new Map<number, BootstrapResult>();
  for (const k of ks) {
    const samples = samplesByK.get(k)!;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (samples.length - 1);
    const { traceRhoSquared, clamped } = point.get(k)!;
    result.set(k, { s2: s2FromTrace(traceRhoSquared), sigma: Math.sqrt(variance), clamped, samples });
  }
  return result;
}

/** Groups consecutive rows into fixed-size blocks (one disorder realization each per the source docx); an incomplete trailing block is dropped (preregistration §7). */
export function groupIntoCompleteBlocks<T>(rows: readonly T[], blockSize: number): readonly (readonly T[])[] {
  const blocks: T[][] = [];
  for (let start = 0; start + blockSize <= rows.length; start += blockSize) {
    blocks.push(rows.slice(start, start + blockSize) as T[]);
  }
  return blocks;
}

/**
 * Disorder-aware bootstrap: resamples whole BLOCKS (not individual rows)
 * with replacement, computing each block's own mean-X first (matching how a
 * physical disorder average is built), then averaging block means.
 */
export function bootstrapMultiKBlocked(
  blocks: readonly (readonly (readonly number[])[])[],
  ks: readonly number[],
  iterations: number,
  rng: () => number,
): ReadonlyMap<number, BootstrapResult> {
  const numBlocks = blocks.length;
  // Precompute, per block and per k, the block's own mean X.
  const blockMeanX = new Map<number, number[]>();
  for (const k of ks) {
    blockMeanX.set(
      k,
      blocks.map((block) => {
        const xs = block.map((row) => rowStatistic(row, k));
        return xs.reduce((a, b) => a + b, 0) / xs.length;
      }),
    );
  }

  const point = new Map<number, TraceEstimate>();
  for (const k of ks) {
    const means = blockMeanX.get(k)!;
    const overall = means.reduce((a, b) => a + b, 0) / numBlocks;
    point.set(k, traceFromMeanX(overall, k));
  }

  const samplesByK = new Map<number, number[]>();
  for (const k of ks) samplesByK.set(k, []);

  for (let iter = 0; iter < iterations; iter += 1) {
    const indices = new Array<number>(numBlocks);
    for (let i = 0; i < numBlocks; i += 1) indices[i] = Math.floor(rng() * numBlocks);
    for (const k of ks) {
      const means = blockMeanX.get(k)!;
      let sum = 0;
      for (const idx of indices) sum += means[idx];
      const overall = sum / numBlocks;
      const { traceRhoSquared } = traceFromMeanX(overall, k);
      samplesByK.get(k)!.push(s2FromTrace(traceRhoSquared));
    }
  }

  const result = new Map<number, BootstrapResult>();
  for (const k of ks) {
    const samples = samplesByK.get(k)!;
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (samples.length - 1);
    const { traceRhoSquared, clamped } = point.get(k)!;
    result.set(k, { s2: s2FromTrace(traceRhoSquared), sigma: Math.sqrt(variance), clamped, samples });
  }
  return result;
}

/** Single-qubit purity from an already-averaged Bloch vector (textbook identity, CONSISTENCY_CHECK layer). */
export function purityFromBlochVector(row: BlochVectorRow): number {
  return (row.sx * row.sx + row.sy * row.sy + row.sz * row.sz + 1) / 2;
}

export interface PurityBootstrapResult {
  readonly meanPurity: number;
  readonly s2: number;
  readonly sigmaS2: number;
  readonly samples: readonly number[];
}

export function bootstrapPurity(rows: readonly BlochVectorRow[], iterations: number, rng: () => number): PurityBootstrapResult {
  const n = rows.length;
  const purities = rows.map(purityFromBlochVector);
  const pointMean = purities.reduce((a, b) => a + b, 0) / n;
  const samples: number[] = [];
  for (let iter = 0; iter < iterations; iter += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += purities[Math.floor(rng() * n)];
    const mean = sum / n;
    const clamped = Math.min(1, Math.max(1e-9, mean));
    samples.push(s2FromTrace(clamped));
  }
  const meanS2 = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((acc, v) => acc + (v - meanS2) ** 2, 0) / (samples.length - 1);
  return { meanPurity: pointMean, s2: s2FromTrace(Math.min(1, Math.max(1e-9, pointMean))), sigmaS2: Math.sqrt(variance), samples };
}

export interface WeightedLinearFit {
  readonly slope: number;
  readonly intercept: number;
  /**
   * Analytic standard error of `slope` from standard weighted-least-squares
   * theory (Var(slope) = S / (S*Sxx - Sx^2), S = sum(w)), valid when each
   * point's own `sigma` is an independent uncertainty — true for QE4's
   * cross-time-point fits (each timepoint's S2 comes from its own separate
   * CSV file and its own separate bootstrap run, sharing no draws with any
   * other timepoint). NOT the right tool for a fit across k at one fixed T,
   * where every k's bootstrap estimate reuses the SAME resampled row
   * indices and is therefore correlated — that case needs the paired
   * bootstrap-of-the-slope approach `qe4BrydgesAnalysis.ts`'s own P1 test
   * already uses, not this analytic formula.
   */
  readonly slopeSigma: number;
}

/** Weighted least-squares linear fit (1/sigma^2 weights) — used for P1's extensivity slope test. */
export function weightedLinearFit(x: readonly number[], y: readonly number[], sigma: readonly number[]): WeightedLinearFit {
  const w = sigma.map((s) => 1 / Math.max(s * s, 1e-12));
  let sw = 0;
  let swx = 0;
  let swy = 0;
  let swxx = 0;
  let swxy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sw += w[i];
    swx += w[i] * x[i];
    swy += w[i] * y[i];
    swxx += w[i] * x[i] * x[i];
    swxy += w[i] * x[i] * y[i];
  }
  const denom = sw * swxx - swx * swx;
  const slope = (sw * swxy - swx * swy) / denom;
  const intercept = (swxx * swy - swx * swxy) / denom;
  const slopeSigma = Math.sqrt(sw / denom);
  return { slope, intercept, slopeSigma };
}

/** Weighted sum of squared residuals for a fitted model y_hat(x) vs observed y. */
export function weightedResidualSumOfSquares(x: readonly number[], y: readonly number[], sigma: readonly number[], predict: (xi: number) => number): number {
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) {
    const w = 1 / Math.max(sigma[i] * sigma[i], 1e-12);
    const residual = y[i] - predict(x[i]);
    sum += w * residual * residual;
  }
  return sum;
}
