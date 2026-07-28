import { newId } from './auth.mjs';

/**
 * Reviewed edge ledger — the platform's actual moat.
 *
 * Genesis reasons over a curated mechanism graph. Every conclusion it produces is
 * downstream of those edges, so the edges are the product; the engines are just
 * arithmetic over them. A competitor can reimplement the arithmetic in a quarter.
 * What they cannot reimplement is a graph whose every edge carries the signature
 * of a named domain expert who staked their reputation on it.
 *
 * FOUR DESIGN COMMITMENTS, each of which costs something and is worth it:
 *
 * 1. DISPUTES ARE NEVER RESOLVED BY MAJORITY. Two experts disagreeing about a
 *    mechanism is information — the same information the inference engine already
 *    surfaces when two graph paths disagree in sign. Averaging it away would
 *    destroy the most valuable signal the ledger produces. One dispute makes an
 *    edge disputed however many confirmations it has.
 *
 * 2. "I AM NOT THE RIGHT EXPERT" IS A FIRST-CLASS ANSWER. A reviewer declining an
 *    edge on expertise grounds tells the platform which edges need a different
 *    specialist. Forcing a verdict from someone unqualified is how curated
 *    knowledge bases quietly fill with confident noise.
 *
 * 3. EDGE STATUS IS DERIVED, NEVER STORED. It is recomputed from the reviews on
 *    every read. A stored status is a cache, and a cache of a scientific judgement
 *    is a bug waiting to contradict its own evidence.
 *
 * 4. REVIEW IS ATTRIBUTABLE AND COUNTABLE. A reviewer's contribution is queryable
 *    and exportable, because the honest answer to "why would a scientist curate
 *    this for free" is that they should not have to — they should get credit they
 *    can put in a CV.
 *
 * The base graph itself stays in version-controlled code. This ledger overlays
 * judgement onto it by edge key, so the graph remains reviewable as a diff and
 * there is no second source of truth to drift.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reviewer_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  orcid        TEXT,
  display_name TEXT NOT NULL,
  affiliation  TEXT NOT NULL DEFAULT '',
  expertise    TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS edge_reviews (
  id                  TEXT PRIMARY KEY,
  edge_key            TEXT NOT NULL,
  reviewer_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict             TEXT NOT NULL,
  confidence          TEXT NOT NULL DEFAULT 'moderate',
  comment             TEXT NOT NULL DEFAULT '',
  citation            TEXT NOT NULL DEFAULT '',
  proposed_effect     TEXT,
  proposed_mechanism  TEXT,
  proposed_honesty    TEXT,
  created_at          INTEGER NOT NULL,
  superseded_by       TEXT
);
CREATE INDEX IF NOT EXISTS idx_edge_reviews_edge ON edge_reviews(edge_key);
CREATE INDEX IF NOT EXISTS idx_edge_reviews_reviewer ON edge_reviews(reviewer_id);
`;

export const VERDICTS = ['confirm', 'dispute', 'refine', 'insufficient-expertise'];
export const CONFIDENCES = ['low', 'moderate', 'high'];

export function ensureReviewSchema(db) {
  db.exec(SCHEMA);
}

/* ------------------------------- profiles ------------------------------- */

export function upsertReviewerProfile(db, userId, { orcid, displayName, affiliation, expertise, now = Date.now() }) {
  db.prepare(
    `INSERT INTO reviewer_profiles (user_id, orcid, display_name, affiliation, expertise, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET orcid = excluded.orcid, display_name = excluded.display_name,
       affiliation = excluded.affiliation, expertise = excluded.expertise`,
  ).run(String(userId), orcid ?? null, String(displayName), String(affiliation ?? ''), String(expertise ?? ''), now);
  return getReviewerProfile(db, userId);
}

export function getReviewerProfile(db, userId) {
  return db.prepare('SELECT * FROM reviewer_profiles WHERE user_id = ?').get(String(userId)) ?? null;
}

/* -------------------------------- reviews -------------------------------- */

export function validateReview(input) {
  const errors = [];
  if (!input?.edgeKey || !String(input.edgeKey).trim()) errors.push('An edge key is required.');
  if (!VERDICTS.includes(input?.verdict)) errors.push(`Verdict must be one of: ${VERDICTS.join(', ')}.`);
  if (input?.confidence && !CONFIDENCES.includes(input.confidence)) errors.push(`Confidence must be one of: ${CONFIDENCES.join(', ')}.`);
  // A dispute without a reason is an unusable signal — it blocks an edge and
  // gives the curator nothing to act on.
  if (input?.verdict === 'dispute' && !String(input?.comment ?? '').trim()) {
    errors.push('A dispute must state why. An unexplained dispute blocks an edge without telling anyone how to fix it.');
  }
  if (input?.verdict === 'refine' && !String(input?.proposedMechanism ?? '').trim() && !input?.proposedEffect && !input?.proposedHonesty) {
    errors.push('A refinement must propose at least one concrete change.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Record a review. A reviewer's later review of the same edge supersedes their
 * earlier one rather than replacing it — the history of an expert changing their
 * mind is itself worth keeping, and silently overwriting it would erase the only
 * record that a judgement was ever revised.
 */
export function submitReview(db, { edgeKey, reviewerId, verdict, confidence = 'moderate', comment = '', citation = '', proposedEffect = null, proposedMechanism = null, proposedHonesty = null, now = Date.now() }) {
  const v = validateReview({ edgeKey, verdict, confidence, comment, proposedEffect, proposedMechanism, proposedHonesty });
  if (!v.ok) return { ok: false, errors: v.errors };

  const id = newId();
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE edge_reviews SET superseded_by = ? WHERE edge_key = ? AND reviewer_id = ? AND superseded_by IS NULL`,
    ).run(id, String(edgeKey), String(reviewerId));

    db.prepare(
      `INSERT INTO edge_reviews (id, edge_key, reviewer_id, verdict, confidence, comment, citation,
         proposed_effect, proposed_mechanism, proposed_honesty, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, String(edgeKey), String(reviewerId), String(verdict), String(confidence),
      String(comment), String(citation), proposedEffect, proposedMechanism, proposedHonesty, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, review: db.prepare('SELECT * FROM edge_reviews WHERE id = ?').get(id) };
}

/** Current (non-superseded) reviews for an edge, newest first. */
export function reviewsForEdge(db, edgeKey) {
  return db.prepare(`
    SELECT r.*, p.display_name, p.orcid, p.affiliation, p.expertise
    FROM edge_reviews r LEFT JOIN reviewer_profiles p ON p.user_id = r.reviewer_id
    WHERE r.edge_key = ? AND r.superseded_by IS NULL
    ORDER BY r.created_at DESC
  `).all(String(edgeKey));
}

/** Full history including superseded reviews — how a judgement evolved. */
export function reviewHistory(db, edgeKey) {
  return db.prepare('SELECT * FROM edge_reviews WHERE edge_key = ? ORDER BY created_at ASC').all(String(edgeKey));
}

/**
 * Derived status of one edge. Recomputed on every call — never cached.
 *
 * A dispute dominates: an edge with nine confirmations and one substantiated
 * dispute is DISPUTED, because the dispute names a specific problem and the
 * confirmations do not answer it. Counting votes here would be exactly the
 * failure the platform criticises in the literature.
 */
export function edgeStatus(db, edgeKey) {
  const reviews = reviewsForEdge(db, edgeKey);
  const byVerdict = (v) => reviews.filter((r) => r.verdict === v);
  const disputes = byVerdict('dispute');
  const confirms = byVerdict('confirm');
  const refinements = byVerdict('refine');
  const declined = byVerdict('insufficient-expertise');

  let status;
  if (reviews.length === 0) status = 'unreviewed';
  else if (disputes.length > 0) status = 'disputed';
  else if (refinements.length > 0) status = 'refinement-proposed';
  else if (confirms.length > 0) status = 'confirmed';
  else status = 'awaiting-expertise'; // only declines so far

  return {
    edgeKey, status,
    reviewCount: reviews.length,
    confirms: confirms.length,
    disputes: disputes.length,
    refinements: refinements.length,
    declined: declined.length,
    reviewers: reviews.map((r) => ({
      name: r.display_name ?? r.reviewer_id, orcid: r.orcid ?? null,
      affiliation: r.affiliation ?? '', verdict: r.verdict, confidence: r.confidence,
      comment: r.comment, citation: r.citation, at: r.created_at,
    })),
    // What a reader should take from this edge, in one sentence.
    basis: buildBasis(status, confirms, disputes, refinements, declined),
  };
}

function buildBasis(status, confirms, disputes, refinements, declined) {
  switch (status) {
    case 'unreviewed':
      return 'No domain expert has reviewed this edge. It rests on the original curation alone, and any conclusion traversing it inherits that.';
    case 'disputed':
      return `${disputes.length} expert(s) dispute this edge${confirms.length ? ` despite ${confirms.length} confirmation(s)` : ''}. A dispute is not outvoted — it names a specific problem that the confirmations do not answer.`;
    case 'refinement-proposed':
      return `${refinements.length} expert(s) accept the relationship but propose a change to how it is stated. The edge is usable; the wording is not final.`;
    case 'confirmed':
      return `Confirmed by ${confirms.length} domain expert(s) with no outstanding dispute.`;
    default:
      return `${declined.length} reviewer(s) declined on expertise grounds. This edge needs a different specialist — which is useful information, not a gap.`;
  }
}

/** Status for many edges at once, so the UI can annotate a whole graph in one call. */
export function edgeStatuses(db, edgeKeys) {
  return Object.fromEntries(edgeKeys.map((k) => [k, edgeStatus(db, k)]));
}

/* --------------------------- reviewer worklist --------------------------- */

/**
 * What a reviewer should look at next. Ordered so an expert's scarce time goes
 * to the edges where a judgement changes the most downstream reasoning:
 * unreviewed edges first, then those only one person has looked at.
 *
 * `allEdgeKeys` comes from the caller because the base graph lives in the
 * frontend package as version-controlled code — the ledger deliberately does not
 * own a copy of it.
 */
export function reviewWorklist(db, allEdgeKeys, { reviewerId = null, limit = 50 } = {}) {
  const seen = reviewerId
    ? new Set(db.prepare('SELECT edge_key FROM edge_reviews WHERE reviewer_id = ? AND superseded_by IS NULL')
      .all(String(reviewerId)).map((r) => r.edge_key))
    : new Set();

  const rank = { unreviewed: 0, 'awaiting-expertise': 1, disputed: 2, 'refinement-proposed': 3, confirmed: 4 };
  return allEdgeKeys
    .filter((k) => !seen.has(k))
    .map((k) => edgeStatus(db, k))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.reviewCount - b.reviewCount)
    .slice(0, limit);
}

/* ------------------------------ credit ------------------------------ */

/**
 * A reviewer's contribution, in a shape that can be exported into a CV or a
 * citable record. This is the answer to "why would a domain expert do this" —
 * because the work is attributed, countable and theirs.
 */
export function reviewerCredit(db, reviewerId) {
  const profile = getReviewerProfile(db, reviewerId);
  const rows = db.prepare(
    `SELECT verdict, COUNT(*) AS n FROM edge_reviews
     WHERE reviewer_id = ? AND superseded_by IS NULL GROUP BY verdict`,
  ).all(String(reviewerId));
  const counts = Object.fromEntries(rows.map((r) => [r.verdict, r.n]));
  const total = rows.reduce((s, r) => s + r.n, 0);
  const first = db.prepare('SELECT MIN(created_at) AS t FROM edge_reviews WHERE reviewer_id = ?').get(String(reviewerId));

  return {
    reviewerId, profile,
    total,
    confirms: counts.confirm ?? 0,
    disputes: counts.dispute ?? 0,
    refinements: counts.refine ?? 0,
    declined: counts['insufficient-expertise'] ?? 0,
    since: first?.t ?? null,
    // Disputes and refinements are the contributions that change the graph, so
    // they are named separately rather than folded into a single count.
    statement: total === 0
      ? 'No reviews recorded.'
      : `${total} edge review(s): ${counts.confirm ?? 0} confirmed, ${counts.dispute ?? 0} disputed, ${counts.refine ?? 0} refined, ${counts['insufficient-expertise'] ?? 0} declined on expertise grounds.`,
  };
}

/** Everyone who has contributed, for an acknowledgements section or a landing page. */
export function contributors(db) {
  return db.prepare(`
    SELECT r.reviewer_id, COUNT(*) AS reviews, p.display_name, p.orcid, p.affiliation, p.expertise
    FROM edge_reviews r LEFT JOIN reviewer_profiles p ON p.user_id = r.reviewer_id
    WHERE r.superseded_by IS NULL
    GROUP BY r.reviewer_id ORDER BY reviews DESC
  `).all();
}

/* ---------------------------- graph-level audit ---------------------------- */

/**
 * Coverage across the whole graph. This is the number that turns curation from a
 * claim into an asset — and the number an investor should be shown, because it
 * grows with use and cannot be copied.
 */
export function reviewCoverage(db, allEdgeKeys) {
  const statuses = allEdgeKeys.map((k) => edgeStatus(db, k));
  const count = (s) => statuses.filter((x) => x.status === s).length;
  const reviewed = allEdgeKeys.length - count('unreviewed');

  return {
    total: allEdgeKeys.length,
    reviewed,
    unreviewed: count('unreviewed'),
    confirmed: count('confirmed'),
    disputed: count('disputed'),
    refinementProposed: count('refinement-proposed'),
    awaitingExpertise: count('awaiting-expertise'),
    coverage: allEdgeKeys.length ? Number((reviewed / allEdgeKeys.length).toFixed(3)) : 0,
    reviewers: contributors(db).length,
    statement: allEdgeKeys.length === 0
      ? 'No edges supplied.'
      : `${reviewed} of ${allEdgeKeys.length} edges reviewed by ${contributors(db).length} expert(s). `
        + `${count('confirmed')} confirmed, ${count('disputed')} disputed, ${count('unreviewed')} never examined. `
        + 'Conclusions traversing an unreviewed edge inherit that edge\'s unreviewed status, and the platform reports it rather than averaging it into a confidence number.',
  };
}

/**
 * Edge keys an analysis may use under a given standard of evidence.
 *
 * This is what makes the ledger matter rather than merely exist: an analysis can
 * be re-run using ONLY expert-confirmed edges and compared with the same analysis
 * over everything. If the conclusion survives, it is worth far more; if it does
 * not, the platform has just told its user something important about their own
 * reasoning.
 */
export function edgesPassingStandard(db, allEdgeKeys, standard = 'any') {
  const allowed = {
    any: () => true,
    'not-disputed': (s) => s.status !== 'disputed',
    reviewed: (s) => s.status !== 'unreviewed',
    'expert-confirmed': (s) => s.status === 'confirmed',
  }[standard] ?? (() => true);

  return allEdgeKeys.filter((k) => allowed(edgeStatus(db, k)));
}
