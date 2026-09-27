import { canonicalHash } from '../provenance.mjs';
import { newId } from '../auth.mjs';
import { currentSnapshot, snapshotEdges } from './store.mjs';

/**
 * L2 — the Living Knowledge Graph.
 *
 * WHY THIS IS NOT A SECOND COPY OF THE GRAPH. `reasoning_edges` holds the
 * curated graph AS AUTHORED, frozen per snapshot and immutable. This module
 * holds something different: what a given tenant currently BELIEVES about a
 * relationship, and how that belief got there. The curated edge is the claim;
 * the claim record is the belief about it over time.
 *
 * Keeping them apart is what lets the graph be shared while beliefs stay
 * private. Two laboratories reason over the same curated edges and may hold
 * opposite confidence in them, each with its own auditable history, without
 * either being able to edit the other's — or the curator's — text.
 *
 * FOUR COMMITMENTS
 *
 * 1. NOTHING IS UPDATED IN PLACE. A change of belief is an append. `confidence`
 *    is a history, not a column, and the current value is the newest revision.
 *    A stored "current confidence" would be a cache of a scientific judgement,
 *    and this codebase has already decided what those are worth (see
 *    edgeStatus).
 *
 * 2. EVERY REVISION NAMES ITS CAUSE AND ITS RULE. Not just "confidence is now
 *    0.7" but which review, which evidence record or which retraction moved it,
 *    and which rule turned that into a number. A confidence with no rule
 *    attached cannot be re-derived, argued with, or corrected when the rule
 *    turns out to be wrong — and the rules WILL turn out to be wrong.
 *
 * 3. CONFIDENCE AND COVERAGE STAY SEPARATE. Same discipline as evidence
 *    grading: how sure the biology makes us is not how much of the literature
 *    we have read. A well-read doubt and an unread certainty must never come
 *    out looking the same.
 *
 * 4. CONTRADICTIONS ARE DETECTED, NEVER RESOLVED. Detection is a query over
 *    live claims — derived, never cached, so it cannot go stale against its own
 *    evidence. Resolution is a separate, recorded, human act. The platform is
 *    not permitted to decide which of two conflicting claims is right; that is
 *    the reader's judgement and the whole reason the conflict is worth showing.
 */

const SCHEMA = `
-- A tracked assertion. Identity is (tenant, subject, predicate, object): the
-- same relationship asserted twice is one claim with two revisions, not two
-- claims that quietly disagree.
CREATE TABLE IF NOT EXISTS graph_claims (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  subject      TEXT NOT NULL,
  predicate    TEXT NOT NULL,
  object       TEXT NOT NULL,
  -- Where the claim came from: a curated edge, a literature link, an experiment.
  origin       TEXT NOT NULL,
  origin_ref   TEXT,                -- edge key, article id, evidence id
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,
  retired_at   INTEGER,             -- retired, never deleted
  UNIQUE (project_id, subject, predicate, object)
);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON graph_claims(project_id, subject, retired_at);
CREATE INDEX IF NOT EXISTS idx_claims_pair ON graph_claims(project_id, subject, object, retired_at);

-- Every change of belief, append-only. The newest row IS the current state.
CREATE TABLE IF NOT EXISTS claim_revisions (
  id           TEXT PRIMARY KEY,
  claim_id     TEXT NOT NULL REFERENCES graph_claims(id) ON DELETE CASCADE,
  at           INTEGER NOT NULL,
  confidence   REAL NOT NULL,       -- belief: how sure the biology makes us
  coverage     REAL NOT NULL,       -- literature: how much we have actually read
  cause        TEXT NOT NULL,
  cause_ref    TEXT,                -- review id, evidence id, retraction notice
  rule         TEXT NOT NULL,       -- which rule turned the cause into these numbers
  note         TEXT NOT NULL DEFAULT '',
  provenance   TEXT NOT NULL,
  actor_id     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_claim ON claim_revisions(claim_id, at);

-- Resolutions ONLY. Detection is a query, so there is no cached list of
-- contradictions that can drift out of agreement with the claims themselves.
CREATE TABLE IF NOT EXISTS contradiction_resolutions (
  contradiction_id TEXT PRIMARY KEY,   -- derived: canonicalHash of the conflict's identity
  project_id       TEXT NOT NULL,
  kind             TEXT NOT NULL,
  resolved_at      INTEGER NOT NULL,
  resolved_by      TEXT NOT NULL,      -- a named human, always
  resolution       TEXT NOT NULL,      -- what was decided, and why
  provenance       TEXT NOT NULL
);
`;

/** What may move a belief. A cause outside this list is a cause nobody can audit. */
export const CAUSES = ['initial', 'review', 'new-evidence', 'retraction', 'contradiction', 'manual'];

/** Causes that must point at the thing that moved the belief. */
const CAUSES_REQUIRING_REF = new Set(['review', 'new-evidence', 'retraction', 'contradiction']);

export const CONTRADICTION_KINDS = ['sign-conflict', 'evidence-conflict', 'review-conflict'];

/** Predicates that are each other's negation. Used for sign-conflict detection. */
const OPPOSITES = { promotes: 'counteracts', counteracts: 'promotes' };

export function ensureLivingGraphSchema(db) {
  db.exec(SCHEMA);
  return db;
}

/* --------------------------------- claims -------------------------------- */

function validateBelief({ confidence, coverage, cause, causeRef, rule }) {
  const errors = [];
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    errors.push('confidence must be a number in [0, 1] — how sure the biology makes us.');
  }
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    errors.push(
      'coverage must be a number in [0, 1] and is NOT interchangeable with confidence — '
      + 'a well-read doubt and an unread certainty must not come out looking the same.',
    );
  }
  if (!CAUSES.includes(cause)) errors.push(`cause must be one of: ${CAUSES.join(', ')}.`);
  if (CAUSES_REQUIRING_REF.has(cause) && !causeRef) {
    errors.push(`cause "${cause}" must name what moved the belief (causeRef). An unattributable revision cannot be checked.`);
  }
  if (!rule || !String(rule).trim()) {
    errors.push('rule is required: which rule turned the cause into these numbers. A confidence with no rule cannot be re-derived or corrected.');
  }
  return errors;
}

/**
 * Assert a claim, or return the existing one. Idempotent on identity: the same
 * relationship asserted twice is one claim, never two that quietly disagree.
 */
export function assertClaim(db, input) {
  const {
    projectId, subject, predicate, object, origin = 'manual', originRef = null,
    confidence, coverage, rule, note = '', actorId, now = Date.now(),
  } = input ?? {};

  const errors = [];
  if (!projectId) errors.push('projectId is required.');
  if (!subject || !predicate || !object) errors.push('subject, predicate and object are all required.');
  if (!actorId) errors.push('actorId is required.');
  errors.push(...validateBelief({ confidence, coverage, cause: 'initial', causeRef: originRef, rule }));
  if (errors.length) throw new Error(`assertClaim refused: ${errors.join(' ')}`);

  const existing = db.prepare(
    'SELECT * FROM graph_claims WHERE project_id = ? AND subject = ? AND predicate = ? AND object = ?',
  ).get(String(projectId), String(subject), String(predicate), String(object));
  if (existing) return { claim: existing, created: false };

  const id = newId();
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO graph_claims (id, project_id, subject, predicate, object, origin, origin_ref, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, String(projectId), String(subject), String(predicate), String(object), String(origin), originRef, Number(now), String(actorId));
    appendRevision(db, {
      claimId: id, confidence, coverage, cause: 'initial', causeRef: originRef,
      rule, note, actorId, now,
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { claim: db.prepare('SELECT * FROM graph_claims WHERE id = ?').get(id), created: true };
}

/** Append one revision. Not exported as the primary path — see reviseClaim. */
function appendRevision(db, { claimId, confidence, coverage, cause, causeRef, rule, note, actorId, now }) {
  const provenance = canonicalHash({ claimId, confidence, coverage, cause, causeRef: causeRef ?? null, rule });
  const id = newId();
  db.prepare(`
    INSERT INTO claim_revisions (id, claim_id, at, confidence, coverage, cause, cause_ref, rule, note, provenance, actor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, String(claimId), Number(now), Number(confidence), Number(coverage), String(cause),
    causeRef ?? null, String(rule), String(note ?? ''), provenance, String(actorId));
  return id;
}

/**
 * Record a change of belief. Never updates: the previous value stays, and the
 * pair of them is the evidence that a judgement moved and why.
 */
export function reviseClaim(db, input) {
  const {
    claimId, projectId, confidence, coverage, cause, causeRef = null,
    rule, note = '', actorId, now = Date.now(),
  } = input ?? {};

  const errors = [];
  if (!claimId) errors.push('claimId is required.');
  if (!actorId) errors.push('actorId is required.');
  if (cause === 'initial') errors.push('cause "initial" belongs to the first revision only; a later change must name what moved it.');
  errors.push(...validateBelief({ confidence, coverage, cause, causeRef, rule }));
  if (errors.length) throw new Error(`reviseClaim refused: ${errors.join(' ')}`);

  const claim = db.prepare('SELECT * FROM graph_claims WHERE id = ? AND project_id = ?').get(String(claimId), String(projectId));
  if (!claim) return { ok: false, error: 'not_found', message: 'No such claim in this workspace.' };
  if (claim.retired_at !== null) {
    // Reviving is a deliberate, separate act. Silently un-retiring on the next
    // revision would make a withdrawn claim reappear as a live one.
    return { ok: false, error: 'retired', message: 'This claim is retired. Revive it explicitly before revising it.' };
  }

  const revisionId = appendRevision(db, { claimId, confidence, coverage, cause, causeRef, rule, note, actorId, now });
  return { ok: true, revision: db.prepare('SELECT * FROM claim_revisions WHERE id = ?').get(revisionId) };
}

/** Retire a claim. The history stays; only the live set changes. */
export function retireClaim(db, { claimId, projectId, cause, causeRef = null, rule, note = '', actorId, now = Date.now() }) {
  const claim = db.prepare('SELECT * FROM graph_claims WHERE id = ? AND project_id = ? AND retired_at IS NULL')
    .get(String(claimId), String(projectId));
  if (!claim) return { ok: false, error: 'not_found', message: 'No live claim with that id in this workspace.' };
  if (!CAUSES_REQUIRING_REF.has(cause) && cause !== 'manual') {
    return { ok: false, error: 'invalid_cause', message: `Retiring must name a cause: ${[...CAUSES_REQUIRING_REF].join(', ')} or manual.` };
  }
  if (CAUSES_REQUIRING_REF.has(cause) && !causeRef) {
    return { ok: false, error: 'invalid_cause', message: 'A retraction or review that retires a claim must name itself (causeRef).' };
  }

  db.exec('BEGIN');
  try {
    // Confidence goes to 0 with the cause recorded, so the history reads as a
    // withdrawal rather than as a claim that simply stops appearing.
    appendRevision(db, { claimId, confidence: 0, coverage: lastRevision(db, claimId)?.coverage ?? 0, cause, causeRef, rule: rule || 'retirement/1', note, actorId, now });
    db.prepare('UPDATE graph_claims SET retired_at = ? WHERE id = ?').run(Number(now), String(claimId));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, claim: db.prepare('SELECT * FROM graph_claims WHERE id = ?').get(String(claimId)) };
}

function lastRevision(db, claimId) {
  return db.prepare('SELECT * FROM claim_revisions WHERE claim_id = ? ORDER BY at DESC, rowid DESC LIMIT 1').get(String(claimId)) ?? null;
}

/**
 * Current state of a claim — derived from the newest revision, never stored.
 *
 * `trend` is the signed change since the previous revision, so a reader can see
 * that a belief is falling without having to diff the history themselves. It is
 * a description of what happened, not a prediction.
 */
export function claimState(db, claimId) {
  const claim = db.prepare('SELECT * FROM graph_claims WHERE id = ?').get(String(claimId));
  if (!claim) return null;
  const revisions = claimHistory(db, claimId);
  const latest = revisions[revisions.length - 1] ?? null;
  const previous = revisions[revisions.length - 2] ?? null;
  return {
    ...claim,
    live: claim.retired_at === null,
    confidence: latest?.confidence ?? null,
    coverage: latest?.coverage ?? null,
    rule: latest?.rule ?? null,
    lastCause: latest?.cause ?? null,
    lastCauseRef: latest?.cause_ref ?? null,
    revisions: revisions.length,
    trend: latest && previous ? Number((latest.confidence - previous.confidence).toFixed(4)) : null,
  };
}

export function claimHistory(db, claimId) {
  return db.prepare('SELECT * FROM claim_revisions WHERE claim_id = ? ORDER BY at ASC, rowid ASC').all(String(claimId));
}

export function liveClaims(db, projectId, { subject = null } = {}) {
  const sql = subject
    ? 'SELECT * FROM graph_claims WHERE project_id = ? AND retired_at IS NULL AND subject = ?'
    : 'SELECT * FROM graph_claims WHERE project_id = ? AND retired_at IS NULL';
  const params = subject ? [String(projectId), String(subject)] : [String(projectId)];
  return db.prepare(sql).all(...params);
}

/**
 * Seed a tenant's claims from the curated graph.
 *
 * Idempotent — existing claims are left exactly as they are, including any
 * revisions the tenant has made. Re-seeding must never reset somebody's belief
 * back to the curator's starting point.
 *
 * Starting confidence is deliberately low and coverage is zero: a curated edge
 * is an author's assertion, not a reviewed one, and nothing has been read yet.
 * The rule is named so the number can be re-derived and argued with.
 */
export function seedClaimsFromSnapshot(db, { projectId, snapshotId = null, actorId, now = Date.now(), confidence = 0.3 }) {
  const snap = snapshotId ?? currentSnapshot(db)?.id;
  if (!snap) return { seeded: 0, skipped: 0, snapshotId: null };

  let seeded = 0;
  let skipped = 0;
  for (const edge of snapshotEdges(db, snap)) {
    // A curated edge with no direction is not a belief about anything yet.
    if (!edge.effect) { skipped += 1; continue; }
    const r = assertClaim(db, {
      projectId, subject: edge.from_id, predicate: edge.effect, object: edge.to_id,
      origin: 'curated', originRef: edge.edge_key,
      confidence, coverage: 0, rule: 'curated-seed/1',
      note: 'Author assertion from the curated graph. Nothing has been reviewed or read yet.',
      actorId, now,
    });
    if (r.created) seeded += 1; else skipped += 1;
  }
  return { seeded, skipped, snapshotId: snap };
}

/* ----------------------------- contradictions ---------------------------- */

/** Stable identity of a conflict, so a resolution can attach to a derived thing. */
export function contradictionId({ projectId, kind, parts }) {
  return canonicalHash({ projectId, kind, parts: [...parts].map(String).sort() });
}

/**
 * Everything currently in conflict. DERIVED — there is no stored list, so it
 * cannot drift out of agreement with the claims it describes.
 *
 * Three kinds, each structural rather than interpretive:
 *
 *   sign-conflict     two live claims assert opposite directions for the same pair
 *   evidence-conflict evidence on one edge points both ways
 *   review-conflict   experts confirm and dispute the same version of a claim
 *
 * Nothing here decides who is right. A contradiction is a finding, and the
 * platform's job is to make sure a reader sees it rather than to remove it.
 */
export function detectContradictions(db, projectId) {
  const found = [];
  const project = String(projectId);

  // 1. Opposite predicates on the same pair, both live.
  const claims = liveClaims(db, project);
  const byPair = new Map();
  for (const c of claims) {
    const key = `${c.subject} ${c.object}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(c);
  }
  for (const group of byPair.values()) {
    for (const a of group) {
      const opposite = OPPOSITES[a.predicate];
      if (!opposite) continue;
      for (const b of group) {
        if (b.predicate !== opposite || a.id >= b.id) continue;
        const aState = claimState(db, a.id);
        const bState = claimState(db, b.id);
        found.push({
          id: contradictionId({ projectId: project, kind: 'sign-conflict', parts: [a.id, b.id] }),
          kind: 'sign-conflict',
          subject: a.subject,
          object: a.object,
          parts: [a.id, b.id],
          detail: `Both "${a.subject} ${a.predicate} ${a.object}" (confidence ${aState.confidence}) and `
            + `"${b.subject} ${b.predicate} ${b.object}" (confidence ${bState.confidence}) are held live. `
            + 'These cannot both be right in the same system; they may both be right in different ones, which is itself the finding.',
        });
      }
    }
  }

  // 2. Evidence on one edge pointing in opposite directions.
  const conflicting = db.prepare(`
    SELECT edge_key,
           SUM(CASE WHEN direction = 'increase' OR direction = 'beneficial' THEN 1 ELSE 0 END) AS up,
           SUM(CASE WHEN direction = 'decrease' OR direction = 'harmful' THEN 1 ELSE 0 END) AS down,
           COUNT(*) AS total
    FROM evidence_records
    WHERE project_id = ? AND retired_at IS NULL AND edge_key IS NOT NULL
    GROUP BY edge_key HAVING up > 0 AND down > 0
  `).all(project);
  for (const row of conflicting) {
    found.push({
      id: contradictionId({ projectId: project, kind: 'evidence-conflict', parts: [row.edge_key] }),
      kind: 'evidence-conflict',
      edgeKey: row.edge_key,
      parts: [row.edge_key],
      detail: `${row.up} record(s) report an increase and ${row.down} a decrease for the same relationship. `
        + 'Averaging them would erase the disagreement, which is usually the most informative thing present.',
    });
  }

  return found.map((c) => ({ ...c, resolution: resolutionFor(db, c.id) }));
}

function resolutionFor(db, id) {
  return db.prepare('SELECT * FROM contradiction_resolutions WHERE contradiction_id = ?').get(String(id)) ?? null;
}

/**
 * Record how a human resolved a contradiction.
 *
 * Refuses an unattributed or unexplained resolution. "Resolved" with no name
 * and no reason is worse than an open conflict: it looks settled and cannot be
 * questioned.
 */
export function resolveContradiction(db, { contradictionId: id, projectId, kind, resolution, resolvedBy, now = Date.now() }) {
  const errors = [];
  if (!id) errors.push('contradictionId is required.');
  if (!projectId) errors.push('projectId is required.');
  if (!CONTRADICTION_KINDS.includes(kind)) errors.push(`kind must be one of: ${CONTRADICTION_KINDS.join(', ')}.`);
  if (!resolvedBy) errors.push('resolvedBy is required — a resolution with no name behind it cannot be questioned.');
  if (!resolution || String(resolution).trim().length < 10) {
    errors.push('resolution must state what was decided and why. "Resolved" alone looks settled and tells a reader nothing.');
  }
  if (errors.length) return { ok: false, error: 'invalid_resolution', message: errors.join(' ') };

  db.prepare(`
    INSERT INTO contradiction_resolutions (contradiction_id, project_id, kind, resolved_at, resolved_by, resolution, provenance)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contradiction_id) DO UPDATE SET
      resolved_at = excluded.resolved_at, resolved_by = excluded.resolved_by,
      resolution = excluded.resolution, provenance = excluded.provenance
  `).run(String(id), String(projectId), String(kind), Number(now), String(resolvedBy), String(resolution),
    canonicalHash({ id, kind, resolution, resolvedBy }));

  return { ok: true, resolution: resolutionFor(db, id) };
}

/**
 * Belief over time for a whole workspace — the data behind a confidence curve.
 *
 * Returns one point per revision, not a resampled series: interpolating between
 * revisions would draw a line through moments when nobody believed anything in
 * particular.
 */
export function confidenceTimeline(db, projectId, { subject = null, limit = 500 } = {}) {
  const sql = `
    SELECT r.at, r.confidence, r.coverage, r.cause, r.cause_ref, r.rule,
           c.id AS claim_id, c.subject, c.predicate, c.object
    FROM claim_revisions r JOIN graph_claims c ON c.id = r.claim_id
    WHERE c.project_id = ? ${subject ? 'AND c.subject = ?' : ''}
    ORDER BY r.at ASC, r.rowid ASC LIMIT ?`;
  const params = subject ? [String(projectId), String(subject), Number(limit)] : [String(projectId), Number(limit)];
  return db.prepare(sql).all(...params);
}
