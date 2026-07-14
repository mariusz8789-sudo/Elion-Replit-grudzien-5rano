/**
 * Pure statistics for the Benchmark & Reproducibility Suite (Priority A).
 * No engine dependency — deterministic, unit-testable functions used to score
 * every per-engine benchmark case against a ground truth (exact math, a
 * physical invariant, or a cited value — never a fabricated number).
 */

export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

/** Root-mean-square error between predicted and reference arrays. */
export function rmse(predicted, reference) {
  if (predicted.length !== reference.length || predicted.length === 0) return NaN;
  const sq = predicted.map((p, i) => (p - reference[i]) ** 2);
  return Math.sqrt(mean(sq));
}

/** Mean absolute error. */
export function mae(predicted, reference) {
  if (predicted.length !== reference.length || predicted.length === 0) return NaN;
  return mean(predicted.map((p, i) => Math.abs(p - reference[i])));
}

/** Pearson correlation coefficient. NaN when either series has zero variance. */
export function pearsonR(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const mx = mean(xs); const my = mean(ys);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx; const dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/** Fraction of cases where the predicted class matches the reference class. */
export function accuracy(predictedLabels, referenceLabels) {
  if (predictedLabels.length !== referenceLabels.length || predictedLabels.length === 0) return NaN;
  let correct = 0;
  for (let i = 0; i < predictedLabels.length; i++) if (predictedLabels[i] === referenceLabels[i]) correct++;
  return correct / predictedLabels.length;
}

/** Fraction of benchmark cases that executed without error (engine reliability, not accuracy). */
export function successRate(results) {
  if (results.length === 0) return NaN;
  return results.filter((r) => r.ok).length / results.length;
}

/**
 * Reproducibility: fraction of case pairs (run1, run2) whose numeric outputs
 * match within `tol` (default bit-for-bit, tol=0 for exact determinism checks;
 * pass a tolerance for stochastic-adjacent engines).
 */
export function reproducibilityRate(pairs, tol = 0) {
  if (pairs.length === 0) return NaN;
  let matches = 0;
  for (const [a, b] of pairs) if (Math.abs(a - b) <= tol) matches++;
  return matches / pairs.length;
}
