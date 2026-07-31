/**
 * L2 — the knowledge timeline.
 *
 * How this workspace's understanding changed, as one stream. Four sources, all
 * of them already append-only because of decisions made in earlier phases:
 *
 *   claim_revisions       a belief moved, with its cause and the rule behind it
 *   edge_reviews          an expert filed a verdict on a specific version
 *   evidence_records      a study was entered, or retired
 *   hypothesis_graveyard  a hypothesis was buried, or reopened
 *
 * DERIVED, NEVER STORED. There is no timeline table. A cached timeline is a
 * cache of a scientific history, and it would eventually disagree with the
 * records it claims to describe — the same reasoning that keeps edgeStatus and
 * contradiction detection derived.
 *
 * NOT THE COSMOLOGY TIMELINE. `frontend/components/DiscoveryTimeline.tsx` is a
 * separate, unrelated 15-epoch journey from the Big Bang, and the name collision
 * is real. Per docs/GENESIS_CONSOLIDATION.md this one belongs inside Memory and
 * the cosmology one moves to the education product.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not interpolate, smooth, or resample.
 * Every entry is a moment when something actually happened. A chart drawn
 * through the gaps would imply the workspace held intermediate opinions it never
 * held.
 */

export const EVENT_KINDS = ['belief', 'review', 'evidence', 'retraction', 'burial', 'exhumation'];

/** True when the table exists — each source is optional, as schemas are lazy. */
function has(db, table) {
  return Boolean(db.prepare("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

/**
 * Every event, oldest first.
 *
 * `since` and `until` are inclusive millisecond bounds. `kinds` filters, and an
 * unknown kind is an error rather than an empty result — silently returning
 * nothing for a typo is how a reader concludes their laboratory did nothing.
 */
export function knowledgeTimeline(db, projectId, { since = null, until = null, kinds = null, limit = 500 } = {}) {
  if (kinds) {
    const unknown = kinds.filter((k) => !EVENT_KINDS.includes(k));
    if (unknown.length) {
      throw new Error(`knowledgeTimeline: unknown event kind(s) ${unknown.join(', ')}. Valid: ${EVENT_KINDS.join(', ')}.`);
    }
  }
  const wanted = (kind) => !kinds || kinds.includes(kind);
  const project = String(projectId);
  const events = [];

  if (wanted('belief') && has(db, 'claim_revisions')) {
    for (const r of db.prepare(`
      SELECT r.at, r.confidence, r.coverage, r.cause, r.cause_ref, r.rule, r.note,
             c.id AS claim_id, c.subject, c.predicate, c.object
      FROM claim_revisions r JOIN graph_claims c ON c.id = r.claim_id
      WHERE c.project_id = ? ORDER BY r.at ASC
    `).all(project)) {
      events.push({
        at: r.at, kind: 'belief', ref: r.claim_id,
        subject: `${r.subject} ${r.predicate} ${r.object}`,
        detail: r.cause === 'initial'
          ? `Claim asserted at confidence ${r.confidence} (coverage ${r.coverage}), by rule ${r.rule}.`
          : `Confidence moved to ${r.confidence} (coverage ${r.coverage}) because of ${r.cause}${r.cause_ref ? ` (${r.cause_ref})` : ''}, by rule ${r.rule}.`,
        // Carried through so a curve can be interrogated point by point rather
        // than admired.
        confidence: r.confidence, coverage: r.coverage, cause: r.cause, rule: r.rule,
      });
    }
  }

  if (wanted('review') && has(db, 'edge_reviews')) {
    for (const r of db.prepare(`
      SELECT r.created_at, r.edge_key, r.verdict, r.comment, r.edge_content_hash, p.display_name
      FROM edge_reviews r LEFT JOIN reviewer_profiles p ON p.user_id = r.reviewer_id
      ORDER BY r.created_at ASC
    `).all()) {
      // The ledger is intentionally global — a review is a public act, and it is
      // shown on every workspace's timeline because it changes what everyone
      // should believe about that edge.
      events.push({
        at: r.created_at, kind: 'review', ref: r.edge_key, subject: r.edge_key,
        detail: `${r.display_name ?? 'A reviewer'} filed "${r.verdict}"${r.comment ? `: ${r.comment}` : ''}.`
          + (r.edge_content_hash ? '' : ' (Filed before version tracking; it does not speak for the current text.)'),
        verdict: r.verdict, global: true,
      });
    }
  }

  if (wanted('evidence') || wanted('retraction')) {
    if (has(db, 'evidence_records')) {
      for (const e of db.prepare('SELECT * FROM evidence_records WHERE project_id = ? ORDER BY created_at ASC').all(project)) {
        if (wanted('evidence')) {
          events.push({
            at: e.created_at, kind: 'evidence', ref: e.id, subject: e.citation,
            detail: `${e.tier} study on ${e.outcome} entered: strength ${e.strength}, human relevance ${e.human_relevance} (${e.graded_with}).`,
            strength: e.strength, humanRelevance: e.human_relevance,
          });
        }
        if (wanted('retraction') && e.retired_at !== null) {
          events.push({
            at: e.retired_at, kind: 'retraction', ref: e.id, subject: e.citation,
            detail: 'Evidence retired. The record is kept, so conclusions that rested on it can still be traced.',
          });
        }
      }
    }
  }

  if ((wanted('burial') || wanted('exhumation')) && has(db, 'hypothesis_graveyard')) {
    for (const g of db.prepare('SELECT * FROM hypothesis_graveyard WHERE project_id = ? ORDER BY buried_at ASC').all(project)) {
      if (wanted('burial')) {
        events.push({
          at: g.buried_at, kind: 'burial', ref: g.id, subject: g.statement,
          detail: `Buried (${g.cause}), evidence ${g.evidence_ref}.${g.lesson ? ` Lesson: ${g.lesson}` : ' No lesson was recorded.'}`,
          cause: g.cause,
        });
      }
      if (wanted('exhumation') && g.exhumed_at !== null) {
        events.push({
          at: g.exhumed_at, kind: 'exhumation', ref: g.id, subject: g.statement,
          detail: `Reopened: ${g.exhumed_why}`,
        });
      }
    }
  }

  const inWindow = events.filter((e) => (since === null || e.at >= since) && (until === null || e.at <= until));
  // Ties are broken by kind name. Two events CAN share a millisecond — entering
  // a study and burying a hypothesis in the same request, for instance — and
  // within that millisecond there is no true order to recover. The tie-break is
  // therefore arbitrary but STABLE, so the same data always renders the same
  // way. Callers must not read same-millisecond adjacency as causality.
  inWindow.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));

  return {
    events: inWindow.slice(0, limit),
    total: inWindow.length,
    truncated: inWindow.length > limit,
    // Stated rather than implied: a timeline is only as complete as the sources
    // that existed when it was read.
    sources: {
      belief: has(db, 'claim_revisions'),
      review: has(db, 'edge_reviews'),
      evidence: has(db, 'evidence_records'),
      graveyard: has(db, 'hypothesis_graveyard'),
    },
  };
}

/**
 * A readable summary of what changed in a window.
 *
 * Deliberately counts rather than characterises. "Your understanding improved"
 * is not something this can know; "four beliefs moved, one downward, two
 * hypotheses were buried" is.
 */
export function timelineSummary(db, projectId, { since = null, until = null } = {}) {
  const { events, sources } = knowledgeTimeline(db, projectId, { since, until, limit: 100000 });
  const count = (kind) => events.filter((e) => e.kind === kind).length;

  // Direction is measured from where the belief STARTED, so the initial
  // revision is the baseline and must be included. Excluding it made a claim
  // that went 0.8 -> 0.2 in one step compare 0.2 against itself and register as
  // unmoved — which is the opposite of what happened.
  const byClaim = new Map();
  for (const e of events.filter((x) => x.kind === 'belief')) {
    if (!byClaim.has(e.ref)) byClaim.set(e.ref, []);
    byClaim.get(e.ref).push(e);
  }
  let rose = 0;
  let fell = 0;
  for (const list of byClaim.values()) {
    // A claim with only its initial revision has not moved; it was merely made.
    if (list.length < 2) continue;
    const delta = list[list.length - 1].confidence - list[0].confidence;
    if (delta > 0) rose += 1;
    if (delta < 0) fell += 1;
  }

  return {
    window: { since, until },
    events: events.length,
    byKind: Object.fromEntries(EVENT_KINDS.map((k) => [k, count(k)])),
    beliefsThatRose: rose,
    beliefsThatFell: fell,
    sources,
    statement: events.length === 0
      ? 'Nothing was recorded in this window. That is an absence of activity, not an absence of change in the field.'
      : `${events.length} recorded event(s): ${count('evidence')} study(ies) entered, ${count('review')} expert verdict(s), `
        + `${count('burial')} hypothesis(es) buried, ${count('belief')} belief revision(s). `
        + `${rose} claim(s) rose in confidence and ${fell} fell.`,
  };
}
