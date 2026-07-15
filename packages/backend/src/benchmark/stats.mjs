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

/* ---------------- Retrieval / ranking metrics (known-item recovery) ----------------
 * These score a RANKING against a binary ground truth. `rankedLabels` is the array of
 * booleans in ranked order (index 0 = top-ranked). The math only — labels must be REAL
 * (supplied, provenance-carrying); these functions never invent a label. */

export function precision(tp, fp) { return tp + fp === 0 ? NaN : tp / (tp + fp); }
export function recall(tp, fn) { return tp + fn === 0 ? NaN : tp / (tp + fn); }
export function f1Score(p, r) { return (Number.isNaN(p) || Number.isNaN(r) || p + r === 0) ? NaN : (2 * p * r) / (p + r); }

/** Confusion counts for the top-K of a ranking (K clamped to the list length). */
export function confusionAtK(rankedLabels, k) {
  const K = Math.max(0, Math.min(k, rankedLabels.length));
  const totalPos = rankedLabels.filter(Boolean).length;
  const tp = rankedLabels.slice(0, K).filter(Boolean).length;
  const fp = K - tp;
  const fn = totalPos - tp;
  const tn = rankedLabels.length - K - fn;
  return { tp, fp, fn, tn, k: K, totalPositives: totalPos };
}

export function precisionAtK(rankedLabels, k) { const c = confusionAtK(rankedLabels, k); return precision(c.tp, c.fp); }
export function recallAtK(rankedLabels, k) { const c = confusionAtK(rankedLabels, k); return recall(c.tp, c.fn); }
/** Hit@K: 1 if at least one positive appears in the top K, else 0 (Top-1 / Top-5 / Top-10 recovery). */
export function hitAtK(rankedLabels, k) { return rankedLabels.slice(0, Math.max(0, Math.min(k, rankedLabels.length))).some(Boolean) ? 1 : 0; }

/**
 * Enrichment factor at a fraction f of the ranked list:
 *   EF = (positives in top f / size of top f) / (total positives / N).
 * EF > 1 means the ranking concentrates positives near the top better than random.
 */
export function enrichmentFactor(rankedLabels, fraction) {
  const n = rankedLabels.length;
  const totalPos = rankedLabels.filter(Boolean).length;
  if (n === 0 || totalPos === 0 || fraction <= 0 || fraction > 1) return NaN;
  const topN = Math.max(1, Math.round(n * fraction));
  const posTop = rankedLabels.slice(0, topN).filter(Boolean).length;
  return (posTop / topN) / (totalPos / n);
}

/**
 * ROC-AUC via the Mann–Whitney U statistic (ties handled with average ranks).
 * `scores` higher = more confident positive; `labels` booleans. NaN if only one class.
 */
export function rocAuc(scores, labels) {
  if (scores.length !== labels.length || scores.length === 0) return NaN;
  const nPos = labels.filter(Boolean).length;
  const nNeg = labels.length - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;
  const idx = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  const ranks = new Array(idx.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j].s === idx[i].s) j++;
    const avg = (i + 1 + j) / 2; // average of ranks (i+1)..j (1-based)
    for (let k = i; k < j; k++) ranks[k] = avg;
    i = j;
  }
  let sumRanksPos = 0;
  for (let i = 0; i < idx.length; i++) if (idx[i].y) sumRanksPos += ranks[i];
  return (sumRanksPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

/** Spearman rank-correlation between two score vectors — used for ranking stability. */
export function spearmanRho(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const rank = (arr) => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(arr.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j < idx.length && idx[j].v === idx[i].v) j++;
      const avg = (i + 1 + j) / 2;
      for (let k = i; k < j; k++) r[idx[k].i] = avg;
      i = j;
    }
    return r;
  };
  return pearsonR(rank(xs), rank(ys));
}
