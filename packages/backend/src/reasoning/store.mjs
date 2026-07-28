import { canonicalHash } from '../provenance.mjs';
import { newId } from '../auth.mjs';
import { ensureLivingGraphSchema } from './livingGraph.mjs';
import { ensureGraveyardSchema } from './graveyard.mjs';

/**
 * L2 — persistence for the scientific reasoning core.
 *
 * The reasoning itself lives in @genesis-os/reasoning and is pure: it takes data
 * and returns a verdict. This module is the only place that decides what to
 * remember about that verdict, and it is deliberately strict about it.
 *
 * THREE THINGS IT PERSISTS
 *
 *  1. GRAPH SNAPSHOTS. The curated mechanism graph is a constant in git, which
 *     is fine until someone reviews an edge. A review is a judgement about a
 *     specific claim, and if the claim can be edited in place the judgement
 *     silently becomes a judgement about something else. Snapshots are
 *     content-addressed: the id IS the hash of the graph, so re-seeding an
 *     unchanged graph is a no-op and any curation change produces a new,
 *     separately reviewable snapshot. Nothing is ever updated or deleted.
 *
 *  2. EVIDENCE. Until now these lived in React component state and vanished on
 *     reload. Each record stores the grade it received AND the version that
 *     graded it, because the grading rules will change and a stored number with
 *     no rule attached is not evidence of anything.
 *
 *  3. ARTIFACTS. Anything the platform concluded. See the gate below.
 *
 * THE GATE
 *
 * `recordArtifact` refuses an artifact that lacks provenance, a two-axis
 * uncertainty, a refusals list or a valid review status. This is enforced here,
 * at the write, rather than by convention at the call sites — a rule that lives
 * in a style guide is a rule that holds until the first deadline.
 *
 * The uncertainty check deserves its own sentence: it requires BOTH `coverage`
 * (how much of the literature we have looked at) and `belief` (how confident the
 * biology makes us). Collapsing those two into one number is the single most
 * common way an evidence platform starts lying, because a well-read guess and a
 * poorly-read certainty come out looking identical.
 */

const SCHEMA = `
-- A content-addressed snapshot of the curated mechanism graph.
CREATE TABLE IF NOT EXISTS reasoning_snapshots (
  id            TEXT PRIMARY KEY,   -- canonicalHash of the nodes+edges
  created_at    INTEGER NOT NULL,
  source        TEXT NOT NULL,
  node_count    INTEGER NOT NULL,
  edge_count    INTEGER NOT NULL,
  superseded_by TEXT                -- append-only; a newer curation supersedes, never replaces
);

CREATE TABLE IF NOT EXISTS reasoning_nodes (
  snapshot_id TEXT NOT NULL REFERENCES reasoning_snapshots(id) ON DELETE CASCADE,
  id          TEXT NOT NULL,
  kind        TEXT NOT NULL,
  label       TEXT NOT NULL,
  honesty     TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, id)
);

CREATE TABLE IF NOT EXISTS reasoning_edges (
  snapshot_id TEXT NOT NULL REFERENCES reasoning_snapshots(id) ON DELETE CASCADE,
  edge_key    TEXT NOT NULL,        -- from→to→kind: the key the review ledger already uses
  from_id     TEXT NOT NULL,
  to_id       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  effect      TEXT,
  honesty     TEXT NOT NULL,
  mechanism   TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,       -- what a reviewer of THIS edge actually read
  PRIMARY KEY (snapshot_id, edge_key)
);
CREATE INDEX IF NOT EXISTS idx_reasoning_edges_key ON reasoning_edges(edge_key);

CREATE TABLE IF NOT EXISTS evidence_records (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  edge_key        TEXT,
  intervention    TEXT,
  hallmark        TEXT,
  citation        TEXT NOT NULL,    -- mandatory: evidence without a source is an opinion
  tier            TEXT NOT NULL,
  outcome         TEXT NOT NULL,
  direction       TEXT NOT NULL,
  species         TEXT,
  sample_size     INTEGER,
  effect_size     REAL,
  notes           TEXT NOT NULL DEFAULT '',
  strength        REAL NOT NULL,    -- does it support its own conclusion, in its own system
  human_relevance REAL NOT NULL,    -- does it transfer to a human. NEVER merged with strength
  graded_with     TEXT NOT NULL,    -- which grading version produced those two numbers
  provenance      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  created_by      TEXT NOT NULL,
  retired_at      INTEGER,          -- append-only: retracted evidence is retired, not deleted
  shared_from     TEXT              -- the record this was copied from, when shared into a project
);
-- One record reaches a given project once. A second share would create a second
-- copy that then diverges from the first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_shared_once ON evidence_records(project_id, shared_from)
  WHERE shared_from IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_evidence_project ON evidence_records(project_id, retired_at);
CREATE INDEX IF NOT EXISTS idx_evidence_edge ON evidence_records(edge_key);

CREATE TABLE IF NOT EXISTS reasoning_artifacts (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  question      TEXT NOT NULL,
  snapshot_id   TEXT NOT NULL,
  inputs_hash   TEXT NOT NULL,      -- replay key: same inputs must give the same hash
  body          TEXT NOT NULL,
  provenance    TEXT NOT NULL,
  uncertainty   TEXT NOT NULL,      -- JSON: { coverage, belief } — both required
  refusals      TEXT NOT NULL,      -- JSON array, may be empty, may never be absent
  review_status TEXT NOT NULL DEFAULT 'unreviewed',
  created_at    INTEGER NOT NULL,
  created_by    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON reasoning_artifacts(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_replay ON reasoning_artifacts(inputs_hash);
`;

export const REVIEW_STATUSES = ['unreviewed', 'reviewed', 'expert-confirmed', 'disputed'];

/** Grading rules change; a stored grade with no rule attached is not evidence. */
export const GRADING_VERSION = 'genesis-evidence-grading/2';

export function ensureReasoningSchema(db) {
  db.exec(SCHEMA);
  ensureLivingGraphSchema(db);
  ensureGraveyardSchema(db);
  return db;
}

/* ----------------------------- graph snapshots ---------------------------- */

/** The key the review ledger already uses. Must not drift from edgeKeyOf(). */
export function edgeKeyOf(edge) {
  return `${edge.from}→${edge.to}→${edge.kind}`;
}

/**
 * Identity of one edge's CONTENT, which is what an expert actually reviewed.
 *
 * Everything substantive is hashed, including the mechanism prose. That is a
 * deliberate refusal to judge which wording changes matter: the system is not
 * competent to decide that a re-worded mechanism describes the same claim, and
 * guessing wrong in the permissive direction is how an expert confirmation ends
 * up attached to a sentence nobody read.
 *
 * The cost of being conservative is small, because a review of a previous
 * version is MARKED, never deleted — a typo fix asks for a cheap re-affirmation
 * rather than destroying anything. The cost of being permissive is a confirmed
 * edge no expert confirmed.
 */
export function edgeContentHash(edge) {
  return canonicalHash({
    from: String(edge.from ?? edge.from_id ?? ''),
    to: String(edge.to ?? edge.to_id ?? ''),
    kind: String(edge.kind ?? ''),
    effect: edge.effect ?? null,
    honesty: String(edge.honesty ?? ''),
    mechanism: String(edge.mechanism ?? ''),
  });
}

/** Identity of a graph: its content, not when it was loaded or by whom. */
export function snapshotHash(nodes, edges) {
  return canonicalHash({
    nodes: [...nodes].map((n) => ({ id: n.id, kind: n.kind, label: n.label, honesty: n.honesty }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges].map((e) => ({ key: edgeKeyOf(e), content: edgeContentHash(e) }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  });
}

/**
 * Persist the curated graph. Idempotent by construction: the snapshot id is the
 * content hash, so seeding an unchanged graph returns the existing row and
 * writes nothing.
 *
 * When the curation DOES change, the previous snapshot is marked superseded
 * rather than removed. Reviews filed against it stay attached to the claim they
 * were actually about, which is the entire reason snapshots exist.
 */
export function seedGraphSnapshot(db, { nodes, edges, source = 'curated:@genesis-os/reasoning', now = Date.now() }) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length === 0 || edges.length === 0) {
    throw new Error('seedGraphSnapshot: nodes and edges are both required and must be non-empty.');
  }
  const id = snapshotHash(nodes, edges);
  const existing = db.prepare('SELECT * FROM reasoning_snapshots WHERE id = ?').get(id);
  if (existing) return { ...existing, created: false };

  db.exec('BEGIN');
  try {
    // Everything currently live is superseded by this one. Nothing is deleted.
    db.prepare('UPDATE reasoning_snapshots SET superseded_by = ? WHERE superseded_by IS NULL').run(id);
    db.prepare(
      'INSERT INTO reasoning_snapshots (id, created_at, source, node_count, edge_count) VALUES (?, ?, ?, ?, ?)',
    ).run(id, Number(now), String(source), nodes.length, edges.length);

    const node = db.prepare('INSERT INTO reasoning_nodes (snapshot_id, id, kind, label, honesty) VALUES (?, ?, ?, ?, ?)');
    for (const n of nodes) node.run(id, String(n.id), String(n.kind), String(n.label), String(n.honesty));

    const edge = db.prepare(
      'INSERT INTO reasoning_edges (snapshot_id, edge_key, from_id, to_id, kind, effect, honesty, mechanism, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const e of edges) {
      edge.run(id, edgeKeyOf(e), String(e.from), String(e.to), String(e.kind), e.effect ?? null,
        String(e.honesty), String(e.mechanism ?? ''), edgeContentHash(e));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ...db.prepare('SELECT * FROM reasoning_snapshots WHERE id = ?').get(id), created: true };
}

/**
 * The snapshot nothing has superseded, or null before the first seed.
 *
 * Also null when the reasoning schema was never created. The review ledger is
 * usable on its own — a reviewer needs no graph tables to file a verdict — and
 * in that configuration there is simply nothing to compare a version against.
 * Null means "cannot tell", and every caller is required to say so rather than
 * assume "unchanged" (see edgeStatus's versionTracked flag).
 */
export function currentSnapshot(db) {
  const present = db.prepare("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'reasoning_snapshots'").get();
  if (!present) return null;
  return db.prepare('SELECT * FROM reasoning_snapshots WHERE superseded_by IS NULL ORDER BY created_at DESC LIMIT 1').get() ?? null;
}

export function snapshotEdges(db, snapshotId) {
  return db.prepare('SELECT * FROM reasoning_edges WHERE snapshot_id = ? ORDER BY edge_key').all(String(snapshotId));
}

/**
 * The content hash of an edge as it stands right now, or null when the graph is
 * not available to say.
 *
 * Null is not "unchanged". Callers must treat it as "cannot tell" — see
 * edgeStatus, which reports versionTracked: false rather than pretending.
 */
export function currentEdgeContentHash(db, edgeKey) {
  return resolveEdgeKey(db, edgeKey)?.content_hash ?? null;
}

/** Does this edge key name a real claim? Returns the edge, or null. */
export function resolveEdgeKey(db, edgeKey, snapshotId = null) {
  const snap = snapshotId ?? currentSnapshot(db)?.id;
  if (!snap) return null;
  return db.prepare('SELECT * FROM reasoning_edges WHERE snapshot_id = ? AND edge_key = ?').get(String(snap), String(edgeKey)) ?? null;
}

/**
 * Reviews whose edge key names nothing in the current snapshot.
 *
 * Until the graph was persisted, `edge_reviews.edge_key` was free text and
 * nothing could tell a typo from a claim that had been re-curated out from under
 * a reviewer. Both are worth knowing about and neither should be silently
 * dropped, so this reports rather than repairs.
 */
export function orphanReviews(db, snapshotId = null) {
  const snap = snapshotId ?? currentSnapshot(db)?.id;
  if (!snap) return [];
  return db.prepare(`
    SELECT r.edge_key, COUNT(*) AS reviews, MIN(r.created_at) AS first_seen
    FROM edge_reviews r
    WHERE r.superseded_by IS NULL
      AND NOT EXISTS (SELECT 1 FROM reasoning_edges e WHERE e.snapshot_id = ? AND e.edge_key = r.edge_key)
    GROUP BY r.edge_key ORDER BY reviews DESC
  `).all(String(snap));
}

/* -------------------------------- evidence -------------------------------- */

/**
 * Store one graded evidence record.
 *
 * `strength` and `humanRelevance` are supplied by the caller because the grading
 * lives in L3 and this layer does not reason. What this layer refuses is a
 * record with no citation, or one whose two axes have been collapsed into a
 * single score.
 */
export function recordEvidence(db, input) {
  const {
    projectId, edgeKey = null, intervention = null, hallmark = null, citation,
    tier, outcome, direction, species = null, sampleSize = null, effectSize = null,
    notes = '', strength, humanRelevance, gradedWith = GRADING_VERSION,
    createdBy, now = Date.now(),
  } = input ?? {};

  const errors = [];
  if (!projectId) errors.push('projectId is required — evidence belongs to a tenant.');
  if (!citation || !String(citation).trim()) errors.push('A citation is required. Evidence without a source is an opinion.');
  if (!tier) errors.push('tier is required.');
  if (!outcome) errors.push('outcome is required.');
  if (!direction) errors.push('direction is required.');
  if (!Number.isFinite(strength)) errors.push('strength is required.');
  if (!Number.isFinite(humanRelevance)) {
    errors.push('humanRelevance is required and is NOT interchangeable with strength — a worm study can be strong and barely transferable.');
  }
  if (!createdBy) errors.push('createdBy is required.');
  if (errors.length) throw new Error(`recordEvidence: ${errors.join(' ')}`);

  const provenance = canonicalHash({
    citation: String(citation), tier, outcome, direction, species, sampleSize, effectSize,
    strength, humanRelevance, gradedWith,
  });
  const id = newId();
  db.prepare(`
    INSERT INTO evidence_records
      (id, project_id, edge_key, intervention, hallmark, citation, tier, outcome, direction,
       species, sample_size, effect_size, notes, strength, human_relevance, graded_with,
       provenance, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, String(projectId), edgeKey ? String(edgeKey) : null, intervention, hallmark, String(citation),
    String(tier), String(outcome), String(direction), species,
    sampleSize === null ? null : Number(sampleSize), effectSize === null ? null : Number(effectSize),
    String(notes), Number(strength), Number(humanRelevance), String(gradedWith),
    provenance, Number(now), String(createdBy),
  );
  return db.prepare('SELECT * FROM evidence_records WHERE id = ?').get(id);
}

/** Tenant-scoped. Live records only unless asked otherwise. */
export function listEvidence(db, projectId, { edgeKey = null, includeRetired = false } = {}) {
  const clauses = ['project_id = ?'];
  const params = [String(projectId)];
  if (edgeKey) { clauses.push('edge_key = ?'); params.push(String(edgeKey)); }
  if (!includeRetired) clauses.push('retired_at IS NULL');
  return db.prepare(`SELECT * FROM evidence_records WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`).all(...params);
}

/**
 * Share one record into a project — the explicit act the tenancy policy is built
 * around.
 *
 * Personal is the default and sharing is deliberate: laboratories do not want
 * working hypotheses visible the moment a colleague joins, and evidence that
 * silently becomes readable is a privacy surprise, not a collaboration feature.
 *
 * It COPIES rather than moves. Moving would take the record out of the owner's
 * own space, so leaving a project would cost them their own work. The copy
 * carries `shared_from`, so the two are linked and the origin is never lost —
 * and the unique index means a record reaches a given project once, because a
 * second copy would immediately start diverging from the first.
 *
 * The grade is copied verbatim rather than recomputed. Re-grading here would
 * silently produce a different number under a newer rule while presenting as the
 * same record; if the rules changed, that is a fact worth seeing, not hiding.
 */
export function shareEvidence(db, { id, fromProjectId, toProjectId, actorId, now = Date.now() }) {
  const source = db.prepare('SELECT * FROM evidence_records WHERE id = ? AND project_id = ? AND retired_at IS NULL')
    .get(String(id), String(fromProjectId));
  if (!source) return { ok: false, error: 'not_found', message: 'No live evidence record with that id in your workspace.' };
  if (String(fromProjectId) === String(toProjectId)) {
    return { ok: false, error: 'invalid_target', message: 'That record is already in this workspace.' };
  }

  const existing = db.prepare('SELECT id FROM evidence_records WHERE project_id = ? AND shared_from = ?')
    .get(String(toProjectId), String(id));
  if (existing) {
    return { ok: false, error: 'already_shared', message: 'That record has already been shared into this workspace.' };
  }

  const copyId = newId();
  db.prepare(`
    INSERT INTO evidence_records
      (id, project_id, edge_key, intervention, hallmark, citation, tier, outcome, direction,
       species, sample_size, effect_size, notes, strength, human_relevance, graded_with,
       provenance, created_at, created_by, shared_from)
    SELECT ?, ?, edge_key, intervention, hallmark, citation, tier, outcome, direction,
       species, sample_size, effect_size, notes, strength, human_relevance, graded_with,
       provenance, ?, ?, id
    FROM evidence_records WHERE id = ?
  `).run(copyId, String(toProjectId), Number(now), String(actorId), String(id));

  return { ok: true, evidence: db.prepare('SELECT * FROM evidence_records WHERE id = ?').get(copyId) };
}

/**
 * Retire a record. Never deletes: a retracted paper is a fact about the
 * literature, and a platform that erases it loses the ability to say that its
 * own past conclusions rested on it.
 */
export function retireEvidence(db, id, projectId, { now = Date.now() } = {}) {
  const r = db.prepare('UPDATE evidence_records SET retired_at = ? WHERE id = ? AND project_id = ? AND retired_at IS NULL')
    .run(Number(now), String(id), String(projectId));
  return r.changes > 0;
}

/* -------------------------------- artifacts ------------------------------- */

/**
 * Everything the platform concluded, and the four fields that make it readable
 * by someone who does not trust us.
 *
 * Refusing here rather than validating at the call site is the point. There are
 * already a dozen places that could produce an artifact and there will be more;
 * a rule enforced at the single write is a rule, and a rule repeated at twelve
 * call sites is a suggestion.
 */
export function recordArtifact(db, input) {
  const {
    projectId, kind, question, snapshotId, body,
    provenance, uncertainty, refusals, reviewStatus = 'unreviewed',
    createdBy, now = Date.now(),
  } = input ?? {};

  const errors = [];
  if (!projectId) errors.push('projectId is required.');
  if (!kind) errors.push('kind is required.');
  if (!snapshotId) errors.push('snapshotId is required — an artifact must name the graph it reasoned over.');
  if (body === undefined || body === null) errors.push('body is required.');
  if (!createdBy) errors.push('createdBy is required.');

  if (!provenance || typeof provenance !== 'object' || Object.keys(provenance).length === 0) {
    errors.push('provenance is required and must name the inputs: article ids, edge keys, review verdicts, corpus checksum.');
  }
  if (!uncertainty || typeof uncertainty !== 'object'
      || !Number.isFinite(uncertainty.coverage) || !Number.isFinite(uncertainty.belief)) {
    errors.push(
      'uncertainty must carry BOTH coverage (how much of the literature was looked at) and belief (how confident the biology makes us). '
      + 'Collapsing them into one number makes a well-read guess indistinguishable from a poorly-read certainty.',
    );
  }
  if (!Array.isArray(refusals)) {
    errors.push('refusals must be an array. It may be empty; it may never be absent — what the engine declined to conclude is an output, not an error.');
  }
  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    errors.push(`reviewStatus must be one of ${REVIEW_STATUSES.join(', ')}.`);
  }
  if (reviewStatus !== 'unreviewed') {
    errors.push('A new artifact is always unreviewed. Review status is earned through the ledger, never asserted at creation.');
  }
  if (errors.length) throw new Error(`recordArtifact refused: ${errors.join(' ')}`);

  // The replay key. Deliberately excludes the clock and the author: the same
  // question over the same graph and inputs must hash identically next year.
  const inputsHash = canonicalHash({ kind, question: question ?? '', snapshotId, provenance });
  const id = newId();
  db.prepare(`
    INSERT INTO reasoning_artifacts
      (id, project_id, kind, question, snapshot_id, inputs_hash, body, provenance, uncertainty, refusals, review_status, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, String(projectId), String(kind), String(question ?? ''), String(snapshotId), inputsHash,
    JSON.stringify(body), JSON.stringify(provenance), JSON.stringify(uncertainty), JSON.stringify(refusals),
    reviewStatus, Number(now), String(createdBy),
  );
  return getArtifact(db, id, projectId);
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    body: JSON.parse(row.body),
    provenance: JSON.parse(row.provenance),
    uncertainty: JSON.parse(row.uncertainty),
    refusals: JSON.parse(row.refusals),
  };
}

export function getArtifact(db, id, projectId) {
  return hydrate(db.prepare('SELECT * FROM reasoning_artifacts WHERE id = ? AND project_id = ?').get(String(id), String(projectId)));
}

export function listArtifacts(db, projectId, { kind = null, limit = 50 } = {}) {
  const sql = kind
    ? 'SELECT * FROM reasoning_artifacts WHERE project_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM reasoning_artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT ?';
  const params = kind ? [String(projectId), String(kind), Number(limit)] : [String(projectId), Number(limit)];
  return db.prepare(sql).all(...params).map(hydrate);
}

/**
 * Earlier artifacts answering the same question over the same inputs.
 *
 * This is the seed of the replay API: two artifacts sharing an `inputs_hash` but
 * differing in body means the reasoning changed while the inputs did not, which
 * is either a bug or an improvement and is always worth knowing about.
 */
export function replayHistory(db, projectId, inputsHash) {
  return db.prepare(
    'SELECT * FROM reasoning_artifacts WHERE project_id = ? AND inputs_hash = ? ORDER BY created_at ASC',
  ).all(String(projectId), String(inputsHash)).map(hydrate);
}
