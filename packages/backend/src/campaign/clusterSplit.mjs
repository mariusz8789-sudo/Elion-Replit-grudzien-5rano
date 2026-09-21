/**
 * D-083 — CONFIRMATORY cluster split. Checks whether the frozen scaffold split
 * is overestimating generalization. It does NOT replace it and does NOT touch
 * any gate.
 *
 * ========================== WHY THIS IS NOT PARANOIA ======================
 *
 * The frozen gates (D-077, D-081) use `scaffold-hash-mod10` as the
 * out-of-distribution proxy. Bemis-Murcko scaffolds can be nearly identical
 * across the train/test boundary — two analogues differing by a methyl can
 * land in different scaffold buckets while being, chemically, the same
 * molecule to a model. A held-out set like that flatters the estimate.
 *
 * So this module splits by TANIMOTO CLUSTER instead: whole clusters of
 * structurally similar molecules move together, which is a strictly harder
 * and more honest hold-out. If the model does much worse under it, the
 * scaffold-split number was optimistic, and the run says so.
 *
 * ===================== WHAT IT MAY AND MAY NOT DO ========================
 *
 * MAY: report `clusterMAE` next to `scaffoldMAE`, and raise
 * `GENERALIZATION_OVERESTIMATED` when the gap exceeds a frozen delta.
 *
 * MAY NOT: decide anything. The frozen gate reads the scaffold-split numbers
 * it was sealed against, exactly as before. A confirmatory metric that could
 * overrule a frozen gate would be a second gate, and this repository has one.
 * The flag is a WARNING TO THE READER, not an input to promotion.
 */

import { canonicalHash } from '../provenance.mjs';

/** Frozen. A change here changes what "same cluster" means and needs a new D-entry. */
export const CLUSTER_TANIMOTO_THRESHOLD = 0.35;
/** Frozen. How much worse the harder split may be before the easier one is called optimistic. */
export const GENERALIZATION_DELTA = 0.3;

/** Tanimoto over dense 0/1 bit arrays of equal length. Fail-closed on ragged input rather than comparing garbage. */
export function tanimoto(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    throw new Error('FAIL_CLOSED[BITVECTOR_SHAPE]: tanimoto needs two equal-length non-empty bit arrays');
  }
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ? 1 : 0;
    const y = b[i] ? 1 : 0;
    inter += x & y;
    union += x | y;
  }
  return union === 0 ? 0 : inter / union;
}

/**
 * Greedy leader-follower clustering. Deterministic given input ORDER, so the
 * caller sorts first; `clusterSplit` does that itself.
 */
export function leaderCluster(items, threshold = CLUSTER_TANIMOTO_THRESHOLD) {
  const leaders = [];
  for (const it of items) {
    let placed = false;
    for (const l of leaders) {
      if (tanimoto(l.bits, it.bits) >= threshold) { l.members.push(it.id); placed = true; break; }
    }
    if (!placed) leaders.push({ bits: it.bits, members: [it.id] });
  }
  return leaders;
}

/**
 * Whole clusters go to one bucket, so two near-identical molecules can never
 * straddle the train/test line — the leakage the scaffold split can permit.
 * Bucketing is by cluster INDEX through the same mod-10 shape the frozen
 * split uses, so the two are comparable rather than differently biased.
 */
export function clusterSplit(items, { threshold = CLUSTER_TANIMOTO_THRESHOLD } = {}) {
  const sorted = [...items].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const leaders = leaderCluster(sorted, threshold);
  const train = [];
  const calib = [];
  const test = [];
  leaders.forEach((l, i) => {
    let h = 0;
    const s = String(i);
    for (let c = 0; c < s.length; c += 1) h = (h * 31 + s.charCodeAt(c)) >>> 0;
    const b = h % 10;
    (b < 2 ? test : b < 4 ? calib : train).push(...l.members);
  });
  return Object.freeze({
    train: Object.freeze(train), calib: Object.freeze(calib), test: Object.freeze(test),
    clusters: leaders.length,
    largestCluster: leaders.reduce((m, l) => Math.max(m, l.members.length), 0),
    threshold,
    fingerprint: canonicalHash({ n: items.length, clusters: leaders.length, threshold }).slice(0, 16),
  });
}

/**
 * Is the cluster split usable at all on this dataset?
 *
 * MEASURED, NOT ASSUMED. Run against the real 287-row GLP-1R pin at threshold
 * 0.35, this clustering collapsed: 9 clusters, one of them holding 217 of 223
 * usable molecules, producing train=51 / test=226 and an MAE of 26.2. That
 * number does not mean "the scaffold split flatters the model" — it means "a
 * model fitted on 51 rows predicts badly", which is a fact about the split,
 * not about generalization. About 70% of that pin is GLP-1 analogue peptides
 * that are mutually similar well above 0.35 Tanimoto, so a similarity
 * clustering cannot separate them.
 *
 * Reporting GENERALIZATION_OVERESTIMATED from a collapsed split would be
 * exactly the kind of impressive-looking, meaningless finding this repository
 * exists to refuse. So the comparison is gated on viability first, and the
 * frozen MIN_TRAIN is reused as the floor rather than a second number being
 * invented here.
 */
export function clusterSplitViability(split, { minTrain, minTest, totalItems }) {
  const reasons = [];
  if (split.train.length < minTrain) reasons.push(`cluster-split train has ${split.train.length} rows against the frozen MIN_TRAIN of ${minTrain}; a model fitted below that floor measures the split, not the chemistry`);
  if (split.test.length < minTest) reasons.push(`cluster-split test has ${split.test.length} rows against the frozen MIN_TEST of ${minTest}`);
  if (totalItems > 0 && split.largestCluster / totalItems > 0.5) reasons.push(`one cluster holds ${split.largestCluster} of ${totalItems} molecules (${((split.largestCluster / totalItems) * 100).toFixed(0)}%) — the similarity threshold cannot separate this chemotype, so the split is degenerate rather than hard`);
  return Object.freeze({ viable: reasons.length === 0, reasons: Object.freeze(reasons) });
}

/**
 * The verdict a reader needs. `null` MAE on either side is UNMEASURED, never
 * silently treated as agreement; so is a non-viable cluster split.
 */
export function generalizationFlag(scaffoldMAE, clusterMAE, delta = GENERALIZATION_DELTA, viability = null) {
  if (viability && viability.viable === false) {
    return Object.freeze({ flag: 'UNMEASURED', delta, gap: null, note: `the confirmatory cluster split is not viable on this dataset, so no comparison was made: ${viability.reasons.join('; ')}` });
  }
  if (!Number.isFinite(scaffoldMAE) || !Number.isFinite(clusterMAE)) {
    return Object.freeze({ flag: 'UNMEASURED', delta, gap: null, note: 'one of the two splits produced no MAE; absence of a comparison is not agreement' });
  }
  const gap = clusterMAE - scaffoldMAE;
  return Object.freeze({
    flag: gap > delta ? 'GENERALIZATION_OVERESTIMATED' : 'CONSISTENT',
    gap: +gap.toFixed(4),
    delta,
    note: gap > delta
      ? `the harder cluster split is worse by ${gap.toFixed(4)} pActivity; the frozen scaffold-split number flatters this model. THIS DOES NOT CHANGE THE GATE — it tells the reader the held-out estimate is optimistic.`
      : 'the two splits agree within the frozen delta; the scaffold-split estimate is not obviously optimistic',
  });
}
