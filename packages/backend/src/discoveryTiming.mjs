/**
 * TIME-TO-DISCOVERY — the measurable substrate behind the owner's 2x KPI.
 *
 * The owner's definition, verbatim in its consequences: "2x faster" means Genesis needs AT MOST 50%
 * of the competitor benchmark time for the SAME task scope under a COMPARABLE evidence standard.
 * Everything in this file exists to make that number measurable, and to make it impossible to
 * report it when it has not been measured.
 *
 * WHAT THIS IS NOT. It is not a second timing or state system. There is no clock here that the
 * ResearchRun loop does not already pass through: every stage boundary is written from inside the
 * canonical loop's own write transaction (researchRun.mjs, researchRunExecution.mjs), on the same
 * database, through the same `store.mjs` migration path (schema v17). A loop step that rolls back
 * leaves no timing behind, because the timing was part of the step.
 *
 * THE FOUR CLOCKS, and why they are four and not one:
 *   wallClockMs   OPEN -> CLOSE of the stage. The only number a stopwatch in a room would see.
 *   computeMs     machine time actually spent executing (engine runtime, replay verification).
 *   queueMs       time a unit of work waited for a MACHINE: a free worker, a lease, a scheduler.
 *   humanWaitMs   time BLOCKED ON A PERSON: a review, a decision, a laboratory turnaround.
 * queueMs and humanWaitMs are never merged. They answer different questions and can be improved by
 * different means: queue time is capacity, human-wait time is organisation. A benchmark that
 * collapsed them could show a 2x by hiring a faster reviewer, or hide a 2x behind a slow one. The
 * distinction is enforced by the schema (`SPAN_KINDS`) and restated in
 * docs/benchmark/TIME-TO-DISCOVERY.md.
 *
 * THE INDICATOR. GENESIS SPEEDUP = competitor_time / genesis_time, GREEN only at
 * speedup >= SPEEDUP_GREEN_THRESHOLD with a comparable scope and a comparable evidence standard.
 * There are no credible competitor numbers in this repository: no "without Genesis" baseline exists
 * anywhere in it. So `genesisSpeedup()` reports the literal string TARGET_2X_NOT_YET_BENCHMARKED and
 * a null speedup, and it is structurally unable to do otherwise: the ONLY source of a competitor
 * time is a row in `discovery_competitor_baselines`, every provenance column of which is NOT NULL
 * and CHECKed non-empty by the database. No number in this file is a competitor time, a speedup or
 * an achievement; the one constant is the owner's own 2.0 threshold.
 */
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { newId } from './auth.mjs';

/* ---------------- vocabulary ---------------- */

/**
 * The ten stages the owner named, in the order a discovery traverses them.
 * QUESTION_TO_VERIFIED_RESEARCH_OUTCOME spans all of them and is the stage the 2x claim is about.
 */
export const DISCOVERY_STAGES = Object.freeze([
  'QUESTION_TO_HYPOTHESES',
  'HYPOTHESES_TO_FROZEN_PROTOCOLS',
  'PROTOCOLS_TO_COMPLETED_EXPERIMENTS',
  'EXPERIMENT_TO_FALSIFICATION',
  'RESULT_TO_REPLAY',
  'RESULT_TO_EVIDENCE_PACK',
  'CANDIDATE_POOL_TO_RANKED_CANDIDATE',
  'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER',
  'WINNER_TO_LABORATORY_HANDOFF',
  'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME',
]);

/** The stage the full-question claim is measured on. */
export const FULL_CYCLE_STAGE = 'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME';

export const TIMING_SCOPE_KINDS = Object.freeze(['RESEARCH_RUN', 'EXPERIMENT', 'CAMPAIGN']);

/**
 * COMPUTE is machine execution. QUEUE is waiting for a MACHINE (worker, lease, scheduler).
 * HUMAN_WAIT is waiting for a PERSON (review, decision, laboratory). See the header.
 * LAB_INSTRUMENT is time an instrument in a physical laboratory spent on this scope; it is neither
 * compute nor waiting, and it is the only source of LAB_HOURS_USED. Human ACTIVE time is not a span
 * at all: it is one row per thing a person did, in `discovery_human_touches`.
 */
export const SPAN_KINDS = Object.freeze(['COMPUTE', 'QUEUE', 'HUMAN_WAIT', 'LAB_INSTRUMENT']);

/** Counters that add up inside a stage. */
export const COUNT_KINDS = Object.freeze(['EXPERIMENTS', 'REJECTED_CANDIDATES', 'RETRIES']);

/** Identities counted DISTINCTLY (two facts naming one worker are one worker). */
export const MEMBER_KINDS = Object.freeze(['AGENT', 'WORKER']);

/** Quality statuses carried alongside the timings, so a fast stage can never be read apart from its evidence. */
export const STATUS_KINDS = Object.freeze(['EVIDENCE', 'REPLAY']);

/** The owner's threshold: Genesis must need at most 50% of the competitor time, i.e. speedup >= 2. */
export const SPEEDUP_GREEN_THRESHOLD = 2.0;

/** The only status this repository can report today, and why. Not a placeholder: a measured absence. */
export const SPEEDUP_STATUS = Object.freeze({
  NOT_BENCHMARKED: 'TARGET_2X_NOT_YET_BENCHMARKED',
  GREEN: 'GREEN',
  BELOW_TARGET: 'BELOW_2X',
  NOT_COMPARABLE: 'NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD',
  GENESIS_NOT_MEASURED: 'GENESIS_CYCLE_NOT_MEASURED',
});

const NOW = () => Date.now();

function assertEnum(value, allowed, what) {
  if (!allowed.includes(value)) throw new Error(`discoveryTiming: unknown ${what} "${value}" (allowed: ${allowed.join(', ')})`);
  return value;
}

function assertScope(scopeKind, scopeId) {
  assertEnum(scopeKind, TIMING_SCOPE_KINDS, 'scopeKind');
  if (typeof scopeId !== 'string' || !scopeId) throw new Error('discoveryTiming: scopeId is required');
  return scopeId;
}

const nonNegInt = (v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

/* ---------------- writing (callable inside an existing write transaction) ---------------- */

/**
 * Opens a stage. The boundary is recorded ONCE: a second call for the same (scope, stage) is a
 * no-op `{ ok: true, deduped: true }`, refused by the database's unique index rather than by a
 * convention here, so a re-entered or resumed loop step can never reset a measured start.
 */
export function openStage(db, { scopeKind, scopeId, stage, atMs = NOW(), campaignId = null, detail = null }) {
  return mark(db, 'OPEN', { scopeKind, scopeId, stage, atMs, campaignId, detail });
}

/**
 * Closes a stage. Recorded once, like OPEN. A stage closes at its FIRST completion: for a stage a
 * run traverses repeatedly (one protocol after another) the per-stage wall clock therefore measures
 * the first traversal, while the repetition is visible in the EXPERIMENTS/RETRIES counters and the
 * whole journey in QUESTION_TO_VERIFIED_RESEARCH_OUTCOME. Per-experiment detail is measured on its
 * own EXPERIMENT scope. This is stated here because the alternative — letting CLOSE move — would
 * make a stage's duration depend on how often it was re-entered.
 */
export function closeStage(db, { scopeKind, scopeId, stage, atMs = NOW(), campaignId = null, detail = null }) {
  return mark(db, 'CLOSE', { scopeKind, scopeId, stage, atMs, campaignId, detail });
}

function mark(db, markKind, { scopeKind, scopeId, stage, atMs, campaignId, detail }) {
  assertScope(scopeKind, scopeId);
  assertEnum(stage, DISCOVERY_STAGES, 'stage');
  const existing = db.prepare(
    'SELECT at_ms FROM discovery_stage_marks WHERE scope_kind = ? AND scope_id = ? AND stage = ? AND mark = ?',
  ).get(scopeKind, scopeId, stage, markKind);
  if (existing) return { ok: true, deduped: true, atMs: existing.at_ms };
  db.prepare(
    `INSERT INTO discovery_stage_marks (scope_kind, scope_id, stage, mark, at_ms, campaign_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(scopeKind, scopeId, stage, markKind, nonNegInt(atMs), campaignId ?? null,
    detail === null ? null : canonicalJson(detail), NOW());
  return { ok: true, deduped: false, atMs: nonNegInt(atMs) };
}

function insertFact(db, row) {
  assertScope(row.scopeKind, row.scopeId);
  assertEnum(row.stage, DISCOVERY_STAGES, 'stage');
  db.prepare(
    `INSERT INTO discovery_stage_facts
       (scope_kind, scope_id, stage, fact, kind, value_ms, delta, member, status, ref, campaign_id, detail_json, at_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(row.scopeKind, row.scopeId, row.stage, row.fact, row.kind,
    row.valueMs ?? null, row.delta ?? null, row.member ?? null, row.status ?? null, row.ref ?? null,
    row.campaignId ?? null, row.detail === undefined || row.detail === null ? null : canonicalJson(row.detail),
    nonNegInt(row.atMs ?? NOW()), NOW());
  return { ok: true };
}

/**
 * Adds a time span to a stage. `kind` is COMPUTE, QUEUE (waiting for a machine) or HUMAN_WAIT
 * (blocked on a person) — never a guess: the caller names which clock it observed.
 */
export function recordSpan(db, { scopeKind, scopeId, stage, kind, ms, source = null, campaignId = null, atMs = NOW(), detail = null }) {
  assertEnum(kind, SPAN_KINDS, 'span kind');
  return insertFact(db, { scopeKind, scopeId, stage, fact: 'SPAN', kind, valueMs: nonNegInt(ms), ref: source, campaignId, atMs, detail });
}

/** Adds to a stage counter (experiments, rejected candidates, retries). */
export function recordCount(db, { scopeKind, scopeId, stage, kind, delta = 1, ref = null, campaignId = null, atMs = NOW(), detail = null }) {
  assertEnum(kind, COUNT_KINDS, 'count kind');
  return insertFact(db, { scopeKind, scopeId, stage, fact: 'COUNT', kind, delta: Math.round(delta), ref, campaignId, atMs, detail });
}

/** Names an agent or worker that took part in a stage. Counted distinctly, so repeated calls are safe. */
export function recordMember(db, { scopeKind, scopeId, stage, kind, member, campaignId = null, atMs = NOW(), detail = null }) {
  assertEnum(kind, MEMBER_KINDS, 'member kind');
  if (typeof member !== 'string' || !member) throw new Error('discoveryTiming: member id is required');
  return insertFact(db, { scopeKind, scopeId, stage, fact: 'MEMBER', kind, member, campaignId, atMs, detail });
}

/** Records the Evidence or Replay status reached in a stage. Every recorded status is kept. */
export function recordStageStatus(db, { scopeKind, scopeId, stage, kind, status, ref = null, campaignId = null, atMs = NOW(), detail = null }) {
  assertEnum(kind, STATUS_KINDS, 'status kind');
  if (typeof status !== 'string' || !status) throw new Error('discoveryTiming: status is required');
  return insertFact(db, { scopeKind, scopeId, stage, fact: 'STATUS', kind, status, ref, campaignId, atMs, detail });
}

/** Attaches a scope (usually a ResearchRun) to a campaign, so the campaign's whole cycle is retrievable. */
export function linkScopeToCampaign(db, { scopeKind, scopeId, campaignId }) {
  assertScope(scopeKind, scopeId);
  if (typeof campaignId !== 'string' || !campaignId) throw new Error('discoveryTiming: campaignId is required');
  db.prepare(
    `INSERT OR IGNORE INTO discovery_timing_campaign_links (scope_kind, scope_id, campaign_id, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(scopeKind, scopeId, campaignId, NOW());
  return { ok: true };
}

/** Campaign ids a scope is attached to. */
export function campaignsOfScope(db, scopeKind, scopeId) {
  return db.prepare('SELECT campaign_id FROM discovery_timing_campaign_links WHERE scope_kind = ? AND scope_id = ? ORDER BY campaign_id')
    .all(scopeKind, scopeId).map((r) => r.campaign_id);
}

/* ---------------- reading ---------------- */

function emptyStage(stage) {
  return {
    stage,
    openedAtMs: null,
    closedAtMs: null,
    complete: false,
    wallClockMs: null,
    computeMs: 0,
    queueMs: 0,
    humanWaitMs: 0,
    labInstrumentMs: 0,
    computeSpans: 0,
    humanWaitSpans: 0,
    labInstrumentSpans: 0,
    experiments: 0,
    rejectedCandidates: 0,
    retries: 0,
    agents: 0,
    workers: 0,
    agentIds: [],
    workerIds: [],
    evidenceStatuses: [],
    replayStatuses: [],
  };
}

function foldFacts(stages, facts) {
  const members = new Map();
  for (const f of facts) {
    const s = stages.get(f.stage) ?? emptyStage(f.stage);
    stages.set(f.stage, s);
    if (f.fact === 'SPAN') {
      // The span COUNTS are kept next to the sums on purpose. A sum of zero can mean "no time" or
      // "nothing was measured", and those are different facts: the human-work metrics report UNKNOWN
      // for the second rather than a flattering 0 (see `humanWorkReport`).
      if (f.kind === 'COMPUTE') { s.computeMs += f.value_ms; s.computeSpans += 1; }
      else if (f.kind === 'QUEUE') s.queueMs += f.value_ms;
      else if (f.kind === 'HUMAN_WAIT') { s.humanWaitMs += f.value_ms; s.humanWaitSpans += 1; }
      else if (f.kind === 'LAB_INSTRUMENT') { s.labInstrumentMs += f.value_ms; s.labInstrumentSpans += 1; }
    } else if (f.fact === 'COUNT') {
      if (f.kind === 'EXPERIMENTS') s.experiments += f.delta;
      else if (f.kind === 'REJECTED_CANDIDATES') s.rejectedCandidates += f.delta;
      else if (f.kind === 'RETRIES') s.retries += f.delta;
    } else if (f.fact === 'MEMBER') {
      const key = `${f.stage}\u0000${f.kind}`;
      if (!members.has(key)) members.set(key, new Set());
      members.get(key).add(f.member);
    } else if (f.fact === 'STATUS') {
      const list = f.kind === 'EVIDENCE' ? s.evidenceStatuses : s.replayStatuses;
      list.push({ status: f.status, ref: f.ref ?? null, atMs: f.at_ms });
    }
  }
  for (const [key, set] of members) {
    const [stage, kind] = key.split('\u0000');
    const s = stages.get(stage);
    if (kind === 'AGENT') { s.agentIds = [...set].sort(); s.agents = set.size; }
    else { s.workerIds = [...set].sort(); s.workers = set.size; }
  }
}

function finish(stages) {
  const out = [];
  for (const stage of DISCOVERY_STAGES) {
    const s = stages.get(stage);
    if (!s) continue;
    s.complete = s.openedAtMs !== null && s.closedAtMs !== null;
    s.wallClockMs = s.complete ? Math.max(0, s.closedAtMs - s.openedAtMs) : null;
    out.push(s);
  }
  // A stage with facts but an unknown name would be invisible; surface it instead of dropping it.
  for (const [stage, s] of stages) {
    if (!DISCOVERY_STAGES.includes(stage)) out.push(s);
  }
  return out;
}

/** Every measured stage of one scope, in stage order. Stages never entered are absent, not zero. */
export function stageTimings(db, scopeKind, scopeId) {
  assertScope(scopeKind, scopeId);
  const stages = new Map();
  for (const m of db.prepare('SELECT stage, mark, at_ms FROM discovery_stage_marks WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all(scopeKind, scopeId)) {
    const s = stages.get(m.stage) ?? emptyStage(m.stage);
    stages.set(m.stage, s);
    if (m.mark === 'OPEN') s.openedAtMs = m.at_ms; else s.closedAtMs = m.at_ms;
  }
  foldFacts(stages, db.prepare('SELECT * FROM discovery_stage_facts WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all(scopeKind, scopeId));
  return finish(stages);
}

/**
 * The timing report for one scope: its stages, and the full-cycle stage picked out. Pure read; it
 * never fills a missing measurement with a default.
 */
export function discoveryTimingReport(db, scopeKind, scopeId) {
  const stages = stageTimings(db, scopeKind, scopeId);
  const fullCycle = stages.find((s) => s.stage === FULL_CYCLE_STAGE) ?? null;
  return {
    scopeKind,
    scopeId,
    stages,
    fullCycle,
    genesisWallClockMs: fullCycle?.wallClockMs ?? null,
    campaigns: campaignsOfScope(db, scopeKind, scopeId),
  };
}

/**
 * GLP-1R / weight-loss style campaign cycle: research question -> candidate set -> filtering ->
 * ResearchRun -> falsification -> Replay -> Evidence Pack -> computational candidate -> chemistry
 * handoff, aggregated over the campaign's own scope AND every scope linked to it, so the cycle's
 * duration is retrievable per campaign.
 *
 * It only reads. Candidate selection, ranking and the chemistry handoff are owned elsewhere; this
 * function is the timing substrate they call into, and it never decides anything about a candidate.
 */
export function campaignCycleTiming(db, campaignId) {
  if (typeof campaignId !== 'string' || !campaignId) throw new Error('discoveryTiming: campaignId is required');
  const linked = db.prepare('SELECT scope_kind, scope_id FROM discovery_timing_campaign_links WHERE campaign_id = ? ORDER BY scope_kind, scope_id').all(campaignId);
  const scopes = [{ scope_kind: 'CAMPAIGN', scope_id: campaignId }, ...linked.filter((l) => !(l.scope_kind === 'CAMPAIGN' && l.scope_id === campaignId))];

  const stages = new Map();
  const marksByCampaignColumn = db.prepare('SELECT scope_kind, scope_id, stage, mark, at_ms FROM discovery_stage_marks WHERE campaign_id = ? ORDER BY id').all(campaignId);
  const marks = [...marksByCampaignColumn];
  const facts = [...db.prepare('SELECT * FROM discovery_stage_facts WHERE campaign_id = ? ORDER BY id').all(campaignId)];
  const seenMark = new Set(marks.map((m) => `${m.scope_kind}\u0000${m.scope_id}\u0000${m.stage}\u0000${m.mark}`));
  for (const scope of scopes) {
    for (const m of db.prepare('SELECT scope_kind, scope_id, stage, mark, at_ms FROM discovery_stage_marks WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all(scope.scope_kind, scope.scope_id)) {
      const key = `${m.scope_kind}\u0000${m.scope_id}\u0000${m.stage}\u0000${m.mark}`;
      if (seenMark.has(key)) continue;
      seenMark.add(key);
      marks.push(m);
    }
  }
  const seenFact = new Set(facts.map((f) => f.id));
  for (const scope of scopes) {
    for (const f of db.prepare('SELECT * FROM discovery_stage_facts WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all(scope.scope_kind, scope.scope_id)) {
      if (seenFact.has(f.id)) continue;
      seenFact.add(f.id);
      facts.push(f);
    }
  }

  // Across several scopes a stage's boundary is the EARLIEST open and the LATEST close: the campaign's
  // cycle covers all of its runs, not one of them.
  for (const m of marks) {
    const s = stages.get(m.stage) ?? emptyStage(m.stage);
    stages.set(m.stage, s);
    if (m.mark === 'OPEN') s.openedAtMs = s.openedAtMs === null ? m.at_ms : Math.min(s.openedAtMs, m.at_ms);
    else s.closedAtMs = s.closedAtMs === null ? m.at_ms : Math.max(s.closedAtMs, m.at_ms);
  }
  foldFacts(stages, facts);
  const list = finish(stages);
  const boundedOpens = list.map((s) => s.openedAtMs).filter((v) => v !== null);
  const boundedCloses = list.filter((s) => s.closedAtMs !== null).map((s) => s.closedAtMs);
  const firstAtMs = boundedOpens.length ? Math.min(...boundedOpens) : null;
  const lastAtMs = boundedCloses.length ? Math.max(...boundedCloses) : null;
  return {
    campaignId,
    scopes: scopes.map((s) => ({ scopeKind: s.scope_kind, scopeId: s.scope_id })),
    stages: list,
    firstAtMs,
    lastAtMs,
    // The campaign's observed span. It is NOT a claim that this span is a discovery: what it covers
    // is exactly the stages listed above, and the Evidence/Replay statuses they carry.
    cycleWallClockMs: firstAtMs !== null && lastAtMs !== null ? Math.max(0, lastAtMs - firstAtMs) : null,
  };
}

/* ---------------- competitor baselines ---------------- */

/**
 * The provenance a competitor/manual baseline must carry to exist at all. Every one of these is a
 * NOT NULL, non-empty column in `discovery_competitor_baselines`, so an incomplete baseline is
 * rejected by the database, not merely discouraged here.
 */
export const COMPETITOR_PROVENANCE_FIELDS = Object.freeze([
  'measuredBy', 'measuredAt', 'measurementMethod', 'sourceUri', 'sourceSha256',
]);

/** Canonical hash of a task scope description: two baselines are comparable only if these match. */
export function taskScopeHash(taskScope) {
  return sha256Hex(canonicalJson(taskScope ?? null));
}

/**
 * Records an EXTERNALLY measured baseline (a competitor workflow, or a computational chemist doing
 * the same task by hand with a stopwatch). Refuses anything without full provenance; nothing in this
 * repository calls it with built-in numbers, and no default value is supplied for any field.
 */
export function recordCompetitorBaseline(db, input) {
  const b = input ?? {};
  const missing = COMPETITOR_PROVENANCE_FIELDS.filter((f) => typeof b[f] !== 'string' || !b[f].trim());
  if (missing.length) return { ok: false, error: 'missing_provenance', fields: missing };
  if (!/^[0-9a-f]{64}$/.test(b.sourceSha256)) return { ok: false, error: 'invalid_provenance', field: 'sourceSha256' };
  const stage = typeof b.stage === 'string' && b.stage ? b.stage : FULL_CYCLE_STAGE;
  if (!DISCOVERY_STAGES.includes(stage)) return { ok: false, error: 'unknown_stage', stage };
  if (typeof b.taskScopeId !== 'string' || !b.taskScopeId.trim()) return { ok: false, error: 'missing_task_scope' };
  if (!b.taskScope || typeof b.taskScope !== 'object') return { ok: false, error: 'missing_task_scope', field: 'taskScope' };
  if (typeof b.evidenceStandard !== 'string' || !b.evidenceStandard.trim()) return { ok: false, error: 'missing_evidence_standard' };
  if (!Number.isFinite(b.wallClockMs) || b.wallClockMs <= 0) return { ok: false, error: 'invalid_measurement', field: 'wallClockMs' };
  if (!Number.isFinite(b.activeHumanMs) || b.activeHumanMs < 0) return { ok: false, error: 'invalid_measurement', field: 'activeHumanMs' };
  if (!Number.isFinite(b.computeMs) || b.computeMs < 0) return { ok: false, error: 'invalid_measurement', field: 'computeMs' };

  const provenance = {
    measuredBy: b.measuredBy.trim(),
    measuredAt: b.measuredAt.trim(),
    measurementMethod: b.measurementMethod.trim(),
    sourceUri: b.sourceUri.trim(),
    sourceSha256: b.sourceSha256,
    notes: typeof b.notes === 'string' ? b.notes : null,
  };
  const id = typeof b.id === 'string' && b.id ? b.id : `ctb-${newId()}`;
  db.prepare(
    `INSERT INTO discovery_competitor_baselines
       (id, task_scope_id, task_scope_hash, stage, evidence_standard, wall_clock_ms, active_human_ms, compute_ms,
        measured_by, measured_at, measurement_method, source_uri, source_sha256, provenance_json, provenance_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, b.taskScopeId.trim(), taskScopeHash(b.taskScope), stage, b.evidenceStandard.trim(),
    Math.round(b.wallClockMs), Math.round(b.activeHumanMs), Math.round(b.computeMs),
    provenance.measuredBy, provenance.measuredAt, provenance.measurementMethod, provenance.sourceUri,
    provenance.sourceSha256, canonicalJson(provenance), sha256Hex(canonicalJson(provenance)), NOW());
  return { ok: true, id, baseline: getCompetitorBaseline(db, id) };
}

function toBaseline(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskScopeId: row.task_scope_id,
    taskScopeHash: row.task_scope_hash,
    stage: row.stage,
    evidenceStandard: row.evidence_standard,
    wallClockMs: row.wall_clock_ms,
    activeHumanMs: row.active_human_ms,
    computeMs: row.compute_ms,
    provenance: JSON.parse(row.provenance_json),
    provenanceHash: row.provenance_hash,
    createdAt: row.created_at,
  };
}

export function getCompetitorBaseline(db, id) {
  return toBaseline(db.prepare('SELECT * FROM discovery_competitor_baselines WHERE id = ?').get(id));
}

/** Recorded baselines, newest first. Empty in this repository: nothing has been measured. */
export function listCompetitorBaselines(db, { taskScopeId = null, stage = null } = {}) {
  const where = [];
  const args = [];
  if (taskScopeId) { where.push('task_scope_id = ?'); args.push(taskScopeId); }
  if (stage) { where.push('stage = ?'); args.push(stage); }
  const sql = `SELECT * FROM discovery_competitor_baselines${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...args).map(toBaseline);
}

/* ---------------- the indicator ---------------- */

/**
 * GENESIS SPEEDUP = competitor_time / genesis_time.
 *
 * Returns GREEN only when all four of these hold:
 *   1. a competitor baseline EXISTS as a database row with full provenance;
 *   2. its task scope hash equals the Genesis side's task scope hash (same scope, not a shrunken one);
 *   3. its evidence standard equals the Genesis side's declared evidence standard;
 *   4. speedup >= SPEEDUP_GREEN_THRESHOLD.
 * With no baseline the status is the literal string TARGET_2X_NOT_YET_BENCHMARKED, `speedup` is null
 * and `green` is false. There is no code path that produces a speedup number or GREEN from an empty
 * `discovery_competitor_baselines`.
 */
export function genesisSpeedup(db, {
  scopeKind = 'RESEARCH_RUN', scopeId, stage = FULL_CYCLE_STAGE,
  taskScopeId = null, taskScope = null, evidenceStandard = null,
  genesisWallClockMs = null,
} = {}) {
  assertEnum(stage, DISCOVERY_STAGES, 'stage');
  let genesisMs = genesisWallClockMs;
  if (genesisMs === null || genesisMs === undefined) {
    const measured = scopeId ? stageTimings(db, scopeKind, scopeId).find((s) => s.stage === stage) : null;
    genesisMs = measured?.wallClockMs ?? null;
  }
  const candidates = taskScopeId ? listCompetitorBaselines(db, { taskScopeId, stage }) : listCompetitorBaselines(db, { stage });
  const base = {
    indicator: 'GENESIS_SPEEDUP',
    definition: 'competitor_time / genesis_time; 2x means Genesis needs at most 50% of the competitor time at the same task scope and a comparable evidence standard',
    greenThreshold: SPEEDUP_GREEN_THRESHOLD,
    stage,
    scopeKind,
    scopeId: scopeId ?? null,
    genesisWallClockMs: genesisMs,
    competitor: null,
    speedup: null,
    green: false,
    comparability: null,
  };

  // 1. No measured competitor time -> the only honest answer, whatever the Genesis side shows.
  if (candidates.length === 0) {
    return {
      ...base,
      status: SPEEDUP_STATUS.NOT_BENCHMARKED,
      reason: 'NO_COMPETITOR_MEASUREMENT_RECORDED',
      explanation: 'No competitor or manual baseline with provenance has been recorded for this stage. '
        + 'A speedup cannot be computed and no 2x achievement can be reported from Genesis timings alone.',
    };
  }

  // The slowest-is-best temptation is removed by construction: the SMALLEST recorded competitor time
  // is used, so adding a slower baseline can never raise the reported speedup.
  const competitor = candidates.reduce((a, b) => (b.wallClockMs < a.wallClockMs ? b : a));
  const expectedScopeHash = taskScope ? taskScopeHash(taskScope) : null;
  const scopeMatches = expectedScopeHash !== null && expectedScopeHash === competitor.taskScopeHash;
  const evidenceMatches = typeof evidenceStandard === 'string' && evidenceStandard.trim().length > 0
    && evidenceStandard.trim() === competitor.evidenceStandard;
  const comparability = {
    taskScopeHash: expectedScopeHash,
    competitorTaskScopeHash: competitor.taskScopeHash,
    scopeMatches,
    declaredEvidenceStandard: typeof evidenceStandard === 'string' ? evidenceStandard.trim() || null : null,
    competitorEvidenceStandard: competitor.evidenceStandard,
    evidenceMatches,
  };

  if (genesisMs === null || genesisMs <= 0) {
    return {
      ...base,
      competitor,
      comparability,
      status: SPEEDUP_STATUS.GENESIS_NOT_MEASURED,
      reason: 'GENESIS_STAGE_NOT_CLOSED',
      explanation: `Stage ${stage} has no completed wall-clock measurement for this scope, so no ratio exists.`,
    };
  }
  if (!scopeMatches || !evidenceMatches) {
    return {
      ...base,
      competitor,
      comparability,
      status: SPEEDUP_STATUS.NOT_COMPARABLE,
      reason: !scopeMatches ? 'TASK_SCOPE_MISMATCH' : 'EVIDENCE_STANDARD_MISMATCH',
      explanation: 'A baseline exists but it does not describe the same task scope and evidence standard, '
        + 'so dividing the two numbers would compare different work.',
    };
  }
  const speedup = competitor.wallClockMs / genesisMs;
  const green = speedup >= SPEEDUP_GREEN_THRESHOLD;
  return {
    ...base,
    competitor,
    comparability,
    speedup,
    green,
    status: green ? SPEEDUP_STATUS.GREEN : SPEEDUP_STATUS.BELOW_TARGET,
    reason: 'COMPARED_AGAINST_RECORDED_BASELINE',
    explanation: `competitor ${competitor.wallClockMs} ms / genesis ${genesisMs} ms = ${speedup.toFixed(3)}x`,
  };
}

/* ======================================================================================
 * HUMAN WORK — the owner's principle as a number, not a slogan.
 *
 * "Genesis takes the human's work onto itself. If a person performs an action Genesis could do
 *  correctly, reproducibly, under Evidence, safely and automatically, that is a PRODUCT BUG."
 *
 * Everything below extends the v17 instrumentation above. It adds no clock: human ACTIVE time is one
 * append-only row per thing a person did (`discovery_human_touches`), human WAIT time is already the
 * v17 HUMAN_WAIT span, machine time is already the v17 COMPUTE span, and laboratory instrument time is
 * the v17 span machinery with one more kind. There is no second state system and no second report.
 *
 * THE HONESTY INVARIANT, which is the point of this section. Four of the owner's quantities —
 * SCIENTIST_HOURS_SAVED, LAB_HOURS_AVOIDED, EXPERIMENTS_AVOIDED, FAILED_EXPERIMENTS_AVOIDED — and
 * COST_TO_DECISION cannot be computed from Genesis's own data at all. They are differences against what
 * a person WITHOUT Genesis would have needed, and no such measurement exists anywhere in this
 * repository. So each of them returns the literal string UNKNOWN until a baseline row with full
 * provenance exists AND describes the same task scope and evidence standard. There is no code path from
 * an absent baseline to a saved-hours number, an avoided-experiment count or a cost figure, including
 * when a caller supplies its own numbers: no function here accepts a baseline value as an argument.
 * ====================================================================================== */

/** The literal every baseline-dependent metric returns when nothing was measured. Never 0, never an estimate. */
export const UNKNOWN = 'UNKNOWN';

/**
 * Exactly one of these per step of the canonical loop.
 *   AUTOMATED                Genesis performs it end to end; no person is in the path.
 *   HUMAN_APPROVAL_ONLY      Genesis does the work and proposes the result; a person only says yes or no.
 *   HUMAN_REQUIRED           a person does the work. Needs a WHY_HUMAN_REQUIRED reason or it is a bug.
 *   EXTERNAL_PHYSICAL_ACTION it happens in a physical room Genesis is not in.
 */
export const STEP_CLASSES = Object.freeze(['AUTOMATED', 'HUMAN_APPROVAL_ONLY', 'HUMAN_REQUIRED', 'EXTERNAL_PHYSICAL_ACTION']);

/**
 * The ONLY four reasons that remove a step from the AUTOMATION_COVERAGE denominator, named by the owner.
 * The denominator is therefore "every step that does not require physical presence, legal
 * responsibility, a real measurement or mandatory human review" — defined here in code, restated in
 * docs/benchmark/HUMAN-WORK.md, and never implied.
 */
export const COVERAGE_EXCLUSIONS = Object.freeze(['PHYSICAL_PRESENCE', 'LEGAL_RESPONSIBILITY', 'REAL_MEASUREMENT', 'MANDATORY_HUMAN_REVIEW']);

/** The owner's target for AUTOMATION_COVERAGE: at least 90% of the steps left in the denominator. */
export const AUTOMATION_COVERAGE_TARGET = 0.9;

/** What a person was doing when they touched the loop. `activeMs` is time spent, not time waited. */
export const HUMAN_TOUCH_KINDS = Object.freeze(['QUESTION', 'APPROVAL', 'DECISION', 'REVIEW', 'DATA_ENTRY', 'PHYSICAL_ACTION', 'MEASUREMENT']);

/**
 * THE CLASSIFICATION. Read off the code, not off a wish list: every row names the function that
 * actually performs the step today, and `justification` says what makes the class true of that code.
 * A step that a person performs for a reason NOT in COVERAGE_EXCLUSIONS stays in the denominator on
 * purpose — those are the product bugs the owner's principle is about, and hiding them among the
 * exclusions would be the first way to game this number.
 */
export const LOOP_STEPS = Object.freeze([
  {
    stepId: 'SUBMIT_RESEARCH_QUESTION', seq: 1, stage: 'QUESTION_TO_HYPOTHESES', stepClass: 'HUMAN_REQUIRED',
    coverageExclusion: null,
    codeRef: 'api.mjs POST /api/projects/:id/research-runs -> researchRun.mjs startResearchRun()',
    justification: 'The run cannot be created without a question in the request body; nothing in the loop generates one.',
    whyHumanRequired: 'The research question is the person’s intent. Genesis has no way to know which question is worth asking, and a question it invented for itself would make every later measurement a measurement of its own preference. This step is IN the automation denominator deliberately: it is not one of the four admitted exclusions, so it counts against the coverage number until someone finds an honest way to automate it.',
  },
  {
    stepId: 'FORMALIZE_PROBLEM', seq: 2, stage: 'QUESTION_TO_HYPOTHESES', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRun.mjs startResearchRun() -> PROBLEM_FORMALIZED event',
    justification: 'The server writes the PROBLEM_FORMALIZED event inside the run’s own write transaction; no human input beyond the question text.',
    whyHumanRequired: null,
  },
  {
    stepId: 'RETRIEVE_LITERATURE', seq: 3, stage: 'QUESTION_TO_HYPOTHESES', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunLiterature.mjs retrieveResearchRunLiterature()',
    justification: 'The connectors fetch, hash and store the raw responses and append the KNOWLEDGE_SNAPSHOT event; an unreachable host is recorded as BLOCKED by the code, not escalated to a person.',
    whyHumanRequired: null,
  },
  {
    stepId: 'GENERATE_HYPOTHESES', seq: 4, stage: 'QUESTION_TO_HYPOTHESES', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRun.mjs proposeResearchPlan() -> HYPOTHESES_GENERATED event',
    justification: 'The reasoning provider produces sub-problems, hypotheses and experiment proposals; the stage records it as an AGENT member, not as a person.',
    whyHumanRequired: null,
  },
  {
    stepId: 'VALIDATE_HYPOTHESIS_PROPOSALS', seq: 5, stage: 'QUESTION_TO_HYPOTHESES', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRun.mjs proposeResearchPlan() validator; rejected proposals counted as REJECTED_CANDIDATES',
    justification: 'A proposal without a falsification criterion is thrown out by the validator before any person sees it.',
    whyHumanRequired: null,
  },
  {
    stepId: 'ATTACH_DATASET', seq: 6, stage: 'HYPOTHESES_TO_FROZEN_PROTOCOLS', stepClass: 'HUMAN_REQUIRED',
    coverageExclusion: null,
    codeRef: 'researchRunDatasets.mjs attachResearchRunDataset()',
    justification: 'The function takes the file bytes, the licence field and the origin URL from an editor’s request body; its own header states that the origin is DECLARED by the person who registered the file and that Genesis does not fetch it.',
    whyHumanRequired: 'The bytes, the licence and the origin of an external dataset are supplied by a person. Genesis verifies the hash it is given but cannot acquire the file, cannot read a licence it was not shown, and must not decide on its own authority which external data a claim may rest on. This step is also IN the denominator: fetching a dataset from a declared, licensed source is automatable, so its presence here is a standing product bug, not a law of nature.',
  },
  {
    stepId: 'FREEZE_PROTOCOL', seq: 7, stage: 'HYPOTHESES_TO_FROZEN_PROTOCOLS', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs -> PREDICTIONS_FROZEN event + PREREGISTRATION record',
    justification: 'The predictions, thresholds and the engine are frozen and written to append-only Scientific Memory in the loop’s own transaction, before the engine runs.',
    whyHumanRequired: null,
  },
  {
    stepId: 'SELECT_ENGINE_AND_CHECK_AVAILABILITY', seq: 8, stage: 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs tools.engineStatus()',
    justification: 'Engine availability, version and toolchain fingerprint are read from the runtime; an unavailable engine blocks the step in code.',
    whyHumanRequired: null,
  },
  {
    stepId: 'EXECUTE_EXPERIMENT', seq: 9, stage: 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs executeResearchExperiment()',
    justification: 'The engine runs, its duration is recorded as a COMPUTE span and the worker that ran it as a WORKER member. No human touch exists in this path.',
    whyHumanRequired: null,
  },
  {
    stepId: 'APPROVE_BIOLOGICAL_OR_WET_LAB_CLAIM', seq: 10, stage: 'PROTOCOLS_TO_COMPLETED_EXPERIMENTS', stepClass: 'HUMAN_APPROVAL_ONLY',
    coverageExclusion: 'LEGAL_RESPONSIBILITY',
    codeRef: 'claimProposal.mjs HUMAN_APPROVAL_KINDS -> decision HUMAN_APPROVAL_REQUIRED',
    justification: 'The code already refuses to propose biological, wet-lab, clinical, animal, human-subject or synthesis work without a person: the decision is HUMAN_APPROVAL_REQUIRED by construction.',
    whyHumanRequired: null,
  },
  {
    stepId: 'SEAL_FALSIFICATION', seq: 11, stage: 'EXPERIMENT_TO_FALSIFICATION', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs -> SELF_FALSIFICATION event + SESSION record',
    justification: 'The result is compared against the frozen predictions by the server and the verdict is sealed; the verdict is not negotiable afterwards.',
    whyHumanRequired: null,
  },
  {
    stepId: 'REPLAY_VERIFY', seq: 12, stage: 'RESULT_TO_REPLAY', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs replayResearchExperiment()',
    justification: 'The replay verifier re-runs the sealed execution and returns a verdict; its runtime is recorded as a COMPUTE span.',
    whyHumanRequired: null,
  },
  {
    stepId: 'RESOLVE_NON_REPRODUCING_RESULT', seq: 13, stage: 'RESULT_TO_REPLAY', stepClass: 'HUMAN_REQUIRED',
    coverageExclusion: 'MANDATORY_HUMAN_REVIEW',
    codeRef: 'researchRunExecution.mjs: a replay verdict other than MATCH yields action HUMAN_REVIEW with reason REPLAY_<verdict>; researchRunAdvance.mjs stops with AWAITING_HUMAN_REVIEW',
    justification: 'The loop’s fixed rule deliberately has no branch that continues past a non-MATCH replay.',
    whyHumanRequired: 'Deciding whether a result that did not reproduce is a defect of the method, of the environment or of the claim is a scientific judgement about Genesis’s own failure. A system that ruled on its own failure could clear itself, so the rule stops instead. This is mandatory human review in the strict sense, and it is excluded from the denominator.',
  },
  {
    stepId: 'BUILD_EVIDENCE_PACK', seq: 14, stage: 'RESULT_TO_EVIDENCE_PACK', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunEvidencePack.mjs buildResearchRunEvidencePack(); researchRunExecution.mjs -> EVIDENCE_UPDATE event',
    justification: 'The pack is assembled from the run’s own records and appended as a proposal with status PROPOSED_REQUIRES_HUMAN_APPROVAL, by code, with no human step.',
    whyHumanRequired: null,
  },
  {
    stepId: 'APPROVE_EVIDENCE_PUBLICATION', seq: 15, stage: 'RESULT_TO_EVIDENCE_PACK', stepClass: 'HUMAN_APPROVAL_ONLY',
    coverageExclusion: 'MANDATORY_HUMAN_REVIEW',
    codeRef: 'researchRunExecution.mjs publication: REQUIRES_HUMAN_APPROVAL; the evidence ledger needs a separate PUBLISH entry',
    justification: 'Genesis records the Evidence status as PROPOSED_REQUIRES_HUMAN_APPROVAL and has no path that publishes without a person.',
    whyHumanRequired: null,
  },
  {
    stepId: 'PROPOSE_NEXT_EXPERIMENT', seq: 16, stage: 'RESULT_TO_EVIDENCE_PACK', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunExecution.mjs -> NEXT_EXPERIMENT event (the run’s fixed rule)',
    justification: 'The next action comes from the run’s own recorded rule, not from a caller and not from a person.',
    whyHumanRequired: null,
  },
  {
    stepId: 'ADVANCE_LOOP', seq: 17, stage: 'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunAdvance.mjs advanceResearchRun(); researchRunJobs.mjs enqueueResearchAdvance()',
    justification: 'The loop walks itself from one justified experiment to the next, in-process or on the job queue, until its rule has nothing executable left.',
    whyHumanRequired: null,
  },
  {
    stepId: 'RANK_CANDIDATE_POOL', seq: 18, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'packages/backend/src/campaign/ candidate pipeline; timings recorded through openStage/closeStage on the CAMPAIGN scope',
    justification: 'Candidate filtering and ranking run as campaign code; the rejected-candidate counter is written by that code, not by a person.',
    whyHumanRequired: null,
  },
  {
    stepId: 'SELECT_COMPUTATIONAL_WINNER', seq: 19, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'packages/backend/src/campaign/ candidate pipeline; stage RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER',
    justification: 'The winner follows from the ranking rule recorded before the ranking ran.',
    whyHumanRequired: null,
  },
  {
    stepId: 'APPROVE_LABORATORY_HANDOFF', seq: 20, stage: 'WINNER_TO_LABORATORY_HANDOFF', stepClass: 'HUMAN_APPROVAL_ONLY',
    coverageExclusion: 'LEGAL_RESPONSIBILITY',
    codeRef: 'campaign/candidateLabHandoff.mjs requiresHumanApproval: true; EXTERNAL_LAB_AND_HUMAN_APPROVAL_REQUIRED',
    justification: 'The handoff package is built by code and marked as needing human approval before anything leaves the system; it commits money, materials and a third party’s time.',
    whyHumanRequired: null,
  },
  {
    stepId: 'SYNTHESISE_AND_ASSAY_IN_LABORATORY', seq: 21, stage: 'WINNER_TO_LABORATORY_HANDOFF', stepClass: 'EXTERNAL_PHYSICAL_ACTION',
    coverageExclusion: 'PHYSICAL_PRESENCE',
    codeRef: 'campaign/labClosedLoop.mjs prepareLabRequest() / exportLabPackage(): Genesis exports a request and waits',
    justification: 'Making a compound and running an assay happens in a building Genesis is not in; the code models it as an export followed by HUMAN_WAIT.',
    whyHumanRequired: null,
  },
  {
    stepId: 'MEASURE_AND_TRANSCRIBE_OBSERVATION', seq: 22, stage: 'WINNER_TO_LABORATORY_HANDOFF', stepClass: 'EXTERNAL_PHYSICAL_ACTION',
    coverageExclusion: 'REAL_MEASUREMENT',
    codeRef: 'researchRunLab.mjs / campaign/labClosedLoop.mjs ingestLabObservation()',
    justification: 'The number originates at an instrument. Genesis can only ingest and hash what is handed to it; it cannot read a plate.',
    whyHumanRequired: null,
  },
  {
    stepId: 'REVIEW_LAB_OBSERVATION', seq: 23, stage: 'WINNER_TO_LABORATORY_HANDOFF', stepClass: 'HUMAN_APPROVAL_ONLY',
    coverageExclusion: 'MANDATORY_HUMAN_REVIEW',
    codeRef: 'researchRunLab.mjs reviewLabObservation(); campaign/labEvidenceBridge.mjs takes a HUMAN-REVIEWED observation only',
    justification: 'An external observation becomes usable only after a person reviews it; the bridge’s own header says so.',
    whyHumanRequired: null,
  },
  {
    stepId: 'COMPARE_MODEL_TO_MEASUREMENT', seq: 24, stage: 'WINNER_TO_LABORATORY_HANDOFF', stepClass: 'AUTOMATED',
    coverageExclusion: null,
    codeRef: 'researchRunLab.mjs compareModelToMeasurement()',
    justification: 'Once a reviewed measurement exists, the comparison against the frozen prediction is arithmetic the server performs.',
    whyHumanRequired: null,
  },
  {
    stepId: 'RECORD_HUMAN_WORK_BASELINE', seq: 25, stage: 'QUESTION_TO_VERIFIED_RESEARCH_OUTCOME', stepClass: 'HUMAN_REQUIRED',
    coverageExclusion: 'REAL_MEASUREMENT',
    codeRef: 'discoveryTiming.mjs recordHumanWorkBaseline()',
    justification: 'The function refuses any row without a measurer, a time, a method, a source and that source’s SHA-256, and nothing in this repository calls it.',
    whyHumanRequired: 'A baseline is a stopwatch measurement of a person doing the same task WITHOUT Genesis. That work happens outside this system by definition, so no code path here can produce it; it is a real measurement in the strict sense and is excluded from the denominator. Until such a row exists, every metric that needs it reads UNKNOWN.',
  },
]);

/* ---------------- the classification, persisted ---------------- */

function assertStepDeclaration(step) {
  assertEnum(step.stepClass, STEP_CLASSES, 'step class');
  assertEnum(step.stage, DISCOVERY_STAGES, 'stage');
  if (step.coverageExclusion !== null && step.coverageExclusion !== undefined) {
    assertEnum(step.coverageExclusion, COVERAGE_EXCLUSIONS, 'coverage exclusion');
  }
  if (typeof step.stepId !== 'string' || !step.stepId.trim()) throw new Error('discoveryTiming: stepId is required');
  if (!Number.isInteger(step.seq) || step.seq <= 0) throw new Error(`discoveryTiming: step ${step.stepId} needs a positive seq`);
  if (typeof step.justification !== 'string' || !step.justification.trim()) throw new Error(`discoveryTiming: step ${step.stepId} needs a justification for its class`);
  if (typeof step.codeRef !== 'string' || !step.codeRef.trim()) throw new Error(`discoveryTiming: step ${step.stepId} needs a codeRef`);
  return step;
}

/**
 * Writes one classified step. The DATABASE has the last word: a HUMAN_REQUIRED row without a non-empty
 * `why_human_required` is refused by a table CHECK, and an AUTOMATED row cannot carry a coverage
 * exclusion. Both refusals come from SQLite, not from this function, so no caller can route around them.
 */
export function recordLoopStep(db, step) {
  assertStepDeclaration(step);
  db.prepare(
    `INSERT INTO discovery_loop_steps
       (step_id, seq, stage, step_class, why_human_required, coverage_exclusion, justification, code_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(step_id) DO UPDATE SET
       seq = excluded.seq, stage = excluded.stage, step_class = excluded.step_class,
       why_human_required = excluded.why_human_required, coverage_exclusion = excluded.coverage_exclusion,
       justification = excluded.justification, code_ref = excluded.code_ref`,
  ).run(step.stepId.trim(), step.seq, step.stage, step.stepClass,
    step.whyHumanRequired ?? null, step.coverageExclusion ?? null,
    step.justification.trim(), step.codeRef.trim(), NOW());
  return { ok: true, stepId: step.stepId.trim() };
}

/**
 * Projects LOOP_STEPS into the database. Idempotent, and the only writer the shipped code uses: the
 * classification is a declaration in code, and this table is its queryable mirror, so a changed
 * classification is a code change under review, never a row somebody edited.
 */
export function syncLoopStepClassification(db, steps = LOOP_STEPS) {
  for (const step of steps) recordLoopStep(db, step);
  return { ok: true, steps: steps.length };
}

function toLoopStep(row) {
  return {
    stepId: row.step_id,
    seq: row.seq,
    stage: row.stage,
    stepClass: row.step_class,
    whyHumanRequired: row.why_human_required ?? null,
    coverageExclusion: row.coverage_exclusion ?? null,
    justification: row.justification,
    codeRef: row.code_ref,
  };
}

/** The PERSISTED classification, in loop order. Empty until `syncLoopStepClassification` has run. */
export function loopStepClassification(db) {
  return db.prepare('SELECT * FROM discovery_loop_steps ORDER BY seq, step_id').all().map(toLoopStep);
}

/**
 * The classification the metrics actually use, and where it came from.
 *
 * The persisted rows win when they exist, so a deployment can be audited against what its database
 * says. When the table is empty the frozen declaration in this file is used instead and `source` says
 * so — which is what keeps the read-only report read-only: a GET never writes a row to make the
 * classification appear. There is still only one classification, because the table is only ever
 * written as a projection of this same constant (`syncLoopStepClassification`).
 */
export function effectiveLoopStepClassification(db) {
  const persisted = loopStepClassification(db);
  if (persisted.length > 0) return { steps: persisted, source: 'DATABASE' };
  return {
    steps: LOOP_STEPS.map((s) => ({ ...s, whyHumanRequired: s.whyHumanRequired ?? null, coverageExclusion: s.coverageExclusion ?? null })),
    source: 'CODE_DECLARATION',
  };
}

/**
 * AUTOMATION_COVERAGE, computed from Genesis's own records.
 *
 *   denominator = classified steps whose `coverage_exclusion` IS NULL, i.e. every step that does NOT
 *                 require physical presence, legal responsibility, a real measurement or mandatory
 *                 human review. The exclusion set is COVERAGE_EXCLUSIONS and nothing else; the
 *                 denominator is defined here in code, not implied.
 *   numerator   = those steps classified AUTOMATED. An AUTOMATED step can never be excluded — a table
 *                 CHECK refuses it — so the numerator is always a subset of the denominator.
 *
 * `targetComparable` is false, and `meetsTarget` null, whenever any stage of the loop carries no
 * classified step: a coverage figure over part of the loop is not an achievement against the 90%
 * target, and the number of unclassified stages is reported instead of being rounded away.
 * `denominatorShareOfLoop` travels in the same object so the coverage figure can never be quoted
 * without the fraction of the loop it actually covers.
 */
export function automationCoverage(db, { extraStages = [] } = {}) {
  const { steps, source: classificationSource } = effectiveLoopStepClassification(db);
  const byClass = Object.fromEntries(STEP_CLASSES.map((c) => [c, steps.filter((s) => s.stepClass === c).length]));
  const excluded = steps.filter((s) => s.coverageExclusion !== null);
  const included = steps.filter((s) => s.coverageExclusion === null);
  const automatedIncluded = included.filter((s) => s.stepClass === 'AUTOMATED');
  const classifiedStages = new Set(steps.map((s) => s.stage));
  const unclassifiedStages = [...new Set([...DISCOVERY_STAGES, ...extraStages])].filter((s) => !classifiedStages.has(s));
  const coverage = included.length > 0 ? automatedIncluded.length / included.length : null;
  const targetComparable = steps.length > 0 && unclassifiedStages.length === 0;
  return {
    metric: 'AUTOMATION_COVERAGE',
    definition: 'automated steps / steps that do not require physical presence, legal responsibility, a real measurement or mandatory human review',
    classificationSource,
    exclusionReasons: [...COVERAGE_EXCLUSIONS],
    target: AUTOMATION_COVERAGE_TARGET,
    totalSteps: steps.length,
    stepsByClass: byClass,
    excludedSteps: excluded.length,
    excludedStepIds: excluded.map((s) => s.stepId),
    excludedBy: Object.fromEntries(COVERAGE_EXCLUSIONS.map((r) => [r, excluded.filter((s) => s.coverageExclusion === r).length])),
    denominator: included.length,
    numerator: automatedIncluded.length,
    coverage: coverage === null ? UNKNOWN : coverage,
    denominatorShareOfLoop: steps.length > 0 ? included.length / steps.length : UNKNOWN,
    notAutomatedIncludedStepIds: included.filter((s) => s.stepClass !== 'AUTOMATED').map((s) => s.stepId),
    unclassifiedStages,
    unclassifiedStageCount: unclassifiedStages.length,
    targetComparable,
    meetsTarget: targetComparable && coverage !== null ? coverage >= AUTOMATION_COVERAGE_TARGET : null,
    reason: steps.length === 0
      ? 'NO_STEP_CLASSIFICATION_RECORDED'
      : unclassifiedStages.length > 0
        ? `STEP_CLASSIFICATION_INCOMPLETE: ${unclassifiedStages.length} stage(s) of the loop carry no classified step, so this coverage figure is not an achievement against the ${AUTOMATION_COVERAGE_TARGET * 100}% target`
        : 'CLASSIFICATION_COVERS_EVERY_STAGE_OF_THE_LOOP',
  };
}

/* ---------------- human touches: the only source of human ACTIVE time ---------------- */

/**
 * Records one thing a person did. `activeMs` is time SPENT, never time waited: waiting stays a
 * HUMAN_WAIT span on the stage. Append-only, like every other observation here.
 */
export function recordHumanTouch(db, {
  scopeKind, scopeId, stage, stepId, touchKind, actor, activeMs = 0,
  ref = null, campaignId = null, atMs = NOW(), detail = null,
}) {
  assertScope(scopeKind, scopeId);
  assertEnum(stage, DISCOVERY_STAGES, 'stage');
  assertEnum(touchKind, HUMAN_TOUCH_KINDS, 'human touch kind');
  if (typeof stepId !== 'string' || !stepId.trim()) throw new Error('discoveryTiming: a human touch must name the step it touched');
  if (typeof actor !== 'string' || !actor.trim()) throw new Error('discoveryTiming: a human touch must name its actor');
  db.prepare(
    `INSERT INTO discovery_human_touches
       (scope_kind, scope_id, stage, step_id, touch_kind, actor, active_ms, ref, campaign_id, detail_json, at_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(scopeKind, scopeId, stage, stepId.trim(), touchKind, actor.trim(), nonNegInt(activeMs),
    ref ?? null, campaignId ?? null, detail === null || detail === undefined ? null : canonicalJson(detail),
    nonNegInt(atMs), NOW());
  return { ok: true };
}

function toTouch(row) {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeId: row.scope_id,
    stage: row.stage,
    stepId: row.step_id,
    touchKind: row.touch_kind,
    actor: row.actor,
    activeMs: row.active_ms,
    ref: row.ref ?? null,
    atMs: row.at_ms,
  };
}

/** Every recorded human touch of one scope, oldest first. */
export function humanTouches(db, scopeKind, scopeId) {
  assertScope(scopeKind, scopeId);
  return db.prepare('SELECT * FROM discovery_human_touches WHERE scope_kind = ? AND scope_id = ? ORDER BY id')
    .all(scopeKind, scopeId).map(toTouch);
}

/** Human touches of a campaign: rows tagged with its id, its own scope, and every scope linked to it. */
export function campaignHumanTouches(db, campaignId) {
  if (typeof campaignId !== 'string' || !campaignId) throw new Error('discoveryTiming: campaignId is required');
  const seen = new Set();
  const out = [];
  const add = (rows) => {
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(toTouch(r));
    }
  };
  add(db.prepare('SELECT * FROM discovery_human_touches WHERE campaign_id = ? ORDER BY id').all(campaignId));
  add(db.prepare('SELECT * FROM discovery_human_touches WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all('CAMPAIGN', campaignId));
  for (const link of db.prepare('SELECT scope_kind, scope_id FROM discovery_timing_campaign_links WHERE campaign_id = ? ORDER BY scope_kind, scope_id').all(campaignId)) {
    add(db.prepare('SELECT * FROM discovery_human_touches WHERE scope_kind = ? AND scope_id = ? ORDER BY id').all(link.scope_kind, link.scope_id));
  }
  return out.sort((a, b) => a.id - b.id);
}

/* ---------------- the human-work baseline (what a person WITHOUT Genesis needed) ---------------- */

/**
 * The provenance a human-work baseline must carry to exist at all — the same five fields, and the same
 * NOT NULL / CHECKed-non-empty columns, as `discovery_competitor_baselines`.
 */
export const HUMAN_WORK_BASELINE_PROVENANCE_FIELDS = Object.freeze([
  'measuredBy', 'measuredAt', 'measurementMethod', 'sourceUri', 'sourceSha256',
]);

const CURRENCY_RE = /^[A-Z]{3}$/;

/**
 * Records a baseline measured OUTSIDE Genesis: a scientist doing the same task scope without it, with
 * active human time logged separately from machine time. Nothing in this repository calls it, and it
 * supplies no default for any field, so an absent baseline stays absent.
 */
export function recordHumanWorkBaseline(db, input) {
  const b = input ?? {};
  const missing = HUMAN_WORK_BASELINE_PROVENANCE_FIELDS.filter((f) => typeof b[f] !== 'string' || !b[f].trim());
  if (missing.length) return { ok: false, error: 'missing_provenance', fields: missing };
  if (!/^[0-9a-f]{64}$/.test(b.sourceSha256)) return { ok: false, error: 'invalid_provenance', field: 'sourceSha256' };
  const stage = typeof b.stage === 'string' && b.stage ? b.stage : FULL_CYCLE_STAGE;
  if (!DISCOVERY_STAGES.includes(stage)) return { ok: false, error: 'unknown_stage', stage };
  if (typeof b.taskScopeId !== 'string' || !b.taskScopeId.trim()) return { ok: false, error: 'missing_task_scope' };
  if (!b.taskScope || typeof b.taskScope !== 'object') return { ok: false, error: 'missing_task_scope', field: 'taskScope' };
  if (typeof b.evidenceStandard !== 'string' || !b.evidenceStandard.trim()) return { ok: false, error: 'missing_evidence_standard' };
  if (typeof b.currency !== 'string' || !CURRENCY_RE.test(b.currency)) return { ok: false, error: 'invalid_measurement', field: 'currency' };
  const numbers = {
    activeHumanMs: { value: b.activeHumanMs, min: 0 },
    wallClockMs: { value: b.wallClockMs, min: 1 },
    labInstrumentMs: { value: b.labInstrumentMs, min: 0 },
    experiments: { value: b.experiments, min: 0 },
    failedExperiments: { value: b.failedExperiments, min: 0 },
    costMinor: { value: b.costMinor, min: 0 },
  };
  for (const [field, { value, min }] of Object.entries(numbers)) {
    if (!Number.isFinite(value) || value < min) return { ok: false, error: 'invalid_measurement', field };
  }
  if (numbers.failedExperiments.value > numbers.experiments.value) return { ok: false, error: 'invalid_measurement', field: 'failedExperiments' };

  const provenance = {
    measuredBy: b.measuredBy.trim(),
    measuredAt: b.measuredAt.trim(),
    measurementMethod: b.measurementMethod.trim(),
    sourceUri: b.sourceUri.trim(),
    sourceSha256: b.sourceSha256,
    notes: typeof b.notes === 'string' ? b.notes : null,
  };
  const id = typeof b.id === 'string' && b.id ? b.id : `hwb-${newId()}`;
  db.prepare(
    `INSERT INTO discovery_human_work_baselines
       (id, task_scope_id, task_scope_hash, stage, evidence_standard, active_human_ms, wall_clock_ms,
        lab_instrument_ms, experiments, failed_experiments, cost_minor, currency,
        measured_by, measured_at, measurement_method, source_uri, source_sha256,
        provenance_json, provenance_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, b.taskScopeId.trim(), taskScopeHash(b.taskScope), stage, b.evidenceStandard.trim(),
    Math.round(numbers.activeHumanMs.value), Math.round(numbers.wallClockMs.value),
    Math.round(numbers.labInstrumentMs.value), Math.round(numbers.experiments.value),
    Math.round(numbers.failedExperiments.value), Math.round(numbers.costMinor.value), b.currency,
    provenance.measuredBy, provenance.measuredAt, provenance.measurementMethod, provenance.sourceUri,
    provenance.sourceSha256, canonicalJson(provenance), sha256Hex(canonicalJson(provenance)), NOW());
  return { ok: true, id, baseline: getHumanWorkBaseline(db, id) };
}

function toHumanWorkBaseline(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskScopeId: row.task_scope_id,
    taskScopeHash: row.task_scope_hash,
    stage: row.stage,
    evidenceStandard: row.evidence_standard,
    activeHumanMs: row.active_human_ms,
    wallClockMs: row.wall_clock_ms,
    labInstrumentMs: row.lab_instrument_ms,
    experiments: row.experiments,
    failedExperiments: row.failed_experiments,
    costMinor: row.cost_minor,
    currency: row.currency,
    provenance: JSON.parse(row.provenance_json),
    provenanceHash: row.provenance_hash,
    createdAt: row.created_at,
  };
}

export function getHumanWorkBaseline(db, id) {
  return toHumanWorkBaseline(db.prepare('SELECT * FROM discovery_human_work_baselines WHERE id = ?').get(id));
}

/** Recorded human-work baselines, newest first. Empty in this repository: nothing has been measured. */
export function listHumanWorkBaselines(db, { taskScopeId = null, stage = null } = {}) {
  const where = [];
  const args = [];
  if (taskScopeId) { where.push('task_scope_id = ?'); args.push(taskScopeId); }
  if (stage) { where.push('stage = ?'); args.push(stage); }
  const sql = `SELECT * FROM discovery_human_work_baselines${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all(...args).map(toHumanWorkBaseline);
}

/* ---------------- cost rates (COST_TO_DECISION has no built-in prices) ---------------- */

export const COST_RATE_PROVENANCE_FIELDS = HUMAN_WORK_BASELINE_PROVENANCE_FIELDS;

/** Records the three prices a cost figure needs. No rate is hardcoded anywhere in this module. */
export function recordCostRates(db, input) {
  const r = input ?? {};
  const missing = COST_RATE_PROVENANCE_FIELDS.filter((f) => typeof r[f] !== 'string' || !r[f].trim());
  if (missing.length) return { ok: false, error: 'missing_provenance', fields: missing };
  if (!/^[0-9a-f]{64}$/.test(r.sourceSha256)) return { ok: false, error: 'invalid_provenance', field: 'sourceSha256' };
  if (typeof r.currency !== 'string' || !CURRENCY_RE.test(r.currency)) return { ok: false, error: 'invalid_rate', field: 'currency' };
  if (typeof r.effectiveFrom !== 'string' || !r.effectiveFrom.trim()) return { ok: false, error: 'invalid_rate', field: 'effectiveFrom' };
  for (const field of ['scientistMinorPerHour', 'computeMinorPerHour', 'labMinorPerHour']) {
    if (!Number.isFinite(r[field]) || r[field] < 0) return { ok: false, error: 'invalid_rate', field };
  }
  const provenance = {
    measuredBy: r.measuredBy.trim(),
    measuredAt: r.measuredAt.trim(),
    measurementMethod: r.measurementMethod.trim(),
    sourceUri: r.sourceUri.trim(),
    sourceSha256: r.sourceSha256,
  };
  const id = typeof r.id === 'string' && r.id ? r.id : `rate-${newId()}`;
  db.prepare(
    `INSERT INTO discovery_cost_rates
       (id, currency, scientist_minor_per_hour, compute_minor_per_hour, lab_minor_per_hour, effective_from,
        measured_by, measured_at, measurement_method, source_uri, source_sha256,
        provenance_json, provenance_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, r.currency, Math.round(r.scientistMinorPerHour), Math.round(r.computeMinorPerHour),
    Math.round(r.labMinorPerHour), r.effectiveFrom.trim(),
    provenance.measuredBy, provenance.measuredAt, provenance.measurementMethod, provenance.sourceUri,
    provenance.sourceSha256, canonicalJson(provenance), sha256Hex(canonicalJson(provenance)), NOW());
  return { ok: true, id };
}

function toCostRates(row) {
  if (!row) return null;
  return {
    id: row.id,
    currency: row.currency,
    scientistMinorPerHour: row.scientist_minor_per_hour,
    computeMinorPerHour: row.compute_minor_per_hour,
    labMinorPerHour: row.lab_minor_per_hour,
    effectiveFrom: row.effective_from,
    provenance: JSON.parse(row.provenance_json),
    provenanceHash: row.provenance_hash,
  };
}

/** Recorded cost rates, newest first. Empty in this repository. */
export function listCostRates(db, { currency = null } = {}) {
  const sql = `SELECT * FROM discovery_cost_rates${currency ? ' WHERE currency = ?' : ''} ORDER BY created_at DESC, id DESC`;
  return (currency ? db.prepare(sql).all(currency) : db.prepare(sql).all()).map(toCostRates);
}

/* ---------------- the metrics ---------------- */

const MS_PER_HOUR = 3_600_000;

/** A metric that could be computed, with the records it came from. */
function known(metric, value, unit, source, definition) {
  return { metric, value, unit, computable: true, source, definition, reason: null };
}

/** A metric that could NOT be computed. `value` is the literal UNKNOWN — never 0, never an estimate. */
function unknownMetric(metric, unit, definition, reason, explanation) {
  return { metric, value: UNKNOWN, unit, computable: false, source: null, definition, reason, explanation };
}

const NO_BASELINE_EXPLANATION = 'This quantity is a difference against what a person would have needed WITHOUT Genesis. '
  + 'No such measurement exists in this repository, and Genesis cannot observe work done outside itself, '
  + 'so the honest answer is UNKNOWN rather than a zero or an estimate.';

/**
 * Picks the one human-work baseline that may be used, with the same discipline as `genesisSpeedup`:
 * the task scope hash must match exactly and the evidence standard must match exactly. A baseline that
 * describes different work is not a baseline for this work. Returns a reason instead of a row when
 * there is nothing usable; a caller never gets to pass numbers in.
 */
function selectHumanWorkBaseline(db, { stage, taskScopeId, taskScope, evidenceStandard }) {
  const candidates = taskScopeId ? listHumanWorkBaselines(db, { taskScopeId, stage }) : listHumanWorkBaselines(db, { stage });
  if (candidates.length === 0) return { baseline: null, reason: 'NO_HUMAN_WORK_BASELINE_RECORDED' };
  const expected = taskScope ? taskScopeHash(taskScope) : null;
  const declared = typeof evidenceStandard === 'string' ? evidenceStandard.trim() : '';
  if (expected === null) return { baseline: null, reason: 'NO_TASK_SCOPE_DECLARED_FOR_COMPARISON' };
  if (!declared) return { baseline: null, reason: 'NO_EVIDENCE_STANDARD_DECLARED_FOR_COMPARISON' };
  const matching = candidates.filter((c) => c.taskScopeHash === expected && c.evidenceStandard === declared);
  if (matching.length === 0) return { baseline: null, reason: 'BASELINE_NOT_COMPARABLE_SCOPE_OR_EVIDENCE_STANDARD' };
  // The SMALLEST recorded human effort is used, so adding a slower, more wasteful baseline can never
  // raise a saved-hours or avoided-experiment number.
  const baseline = matching.reduce((a, b) => (b.activeHumanMs < a.activeHumanMs ? b : a));
  return { baseline, reason: 'COMPARED_AGAINST_RECORDED_BASELINE' };
}

function foldScope(stages) {
  const sum = (key) => stages.reduce((n, s) => n + (s[key] ?? 0), 0);
  return {
    computeMs: sum('computeMs'),
    computeSpans: sum('computeSpans'),
    queueMs: sum('queueMs'),
    humanWaitMs: sum('humanWaitMs'),
    humanWaitSpans: sum('humanWaitSpans'),
    labInstrumentMs: sum('labInstrumentMs'),
    labInstrumentSpans: sum('labInstrumentSpans'),
    experiments: sum('experiments'),
    retries: sum('retries'),
    rejectedCandidates: sum('rejectedCandidates'),
  };
}

/**
 * The thirteen quantities the owner named, plus AUTOMATION_COVERAGE, computed from RECORDED DATA ONLY.
 *
 * No argument of this function is a baseline value, an estimate or a rate: baselines and rates are read
 * from their own provenanced tables, which is why a caller cannot talk this function into a number.
 */
function computeMetrics(db, { stages, touches, fullCycleWallClockMs, stage, taskScopeId, taskScope, evidenceStandard }) {
  const r = foldScope(stages);
  const activeHumanMs = touches.reduce((n, t) => n + t.activeMs, 0);
  const touchCount = touches.length;
  const { baseline, reason: baselineReason } = selectHumanWorkBaseline(db, { stage, taskScopeId, taskScope, evidenceStandard });

  const metrics = {};
  const put = (m) => { metrics[m.metric] = m; };

  // --- Genesis's own clocks. A sum of zero with no source row means "not measured", not "no time". ---
  put(r.computeSpans > 0
    ? known('GENESIS_ACTIVE_TIME', r.computeMs, 'ms', `${r.computeSpans} COMPUTE span(s) in discovery_stage_facts`,
      'machine time Genesis actually spent executing on this scope')
    : unknownMetric('GENESIS_ACTIVE_TIME', 'ms', 'machine time Genesis actually spent executing on this scope', 'NO_COMPUTE_TIME_RECORDED',
      'No COMPUTE span was recorded for this scope. A zero here would be indistinguishable from an uninstrumented engine run.'));

  put(touchCount > 0
    ? known('SCIENTIST_ACTIVE_TIME', activeHumanMs, 'ms', `${touchCount} row(s) in discovery_human_touches`,
      'time a person actually spent working inside this scope, not time spent waiting')
    : unknownMetric('SCIENTIST_ACTIVE_TIME', 'ms', 'time a person actually spent working inside this scope, not time spent waiting', 'NO_HUMAN_TOUCH_RECORDED',
      '"No person worked on this scope" and "nobody measured what the person did" are the same absence in the data, and reporting 0 would turn the second into the first.'));

  put(r.humanWaitSpans > 0
    ? known('SCIENTIST_WAIT_TIME', r.humanWaitMs, 'ms', `${r.humanWaitSpans} HUMAN_WAIT span(s) in discovery_stage_facts`,
      'time this scope was blocked on a person: a review, a decision, a laboratory turnaround')
    : unknownMetric('SCIENTIST_WAIT_TIME', 'ms', 'time this scope was blocked on a person: a review, a decision, a laboratory turnaround', 'NO_HUMAN_WAIT_RECORDED',
      'No HUMAN_WAIT span was recorded for this scope.'));

  put(r.labInstrumentSpans > 0
    ? known('LAB_HOURS_USED', r.labInstrumentMs / MS_PER_HOUR, 'hours', `${r.labInstrumentSpans} LAB_INSTRUMENT span(s) in discovery_stage_facts`,
      'physical laboratory instrument time consumed by this scope')
    : unknownMetric('LAB_HOURS_USED', 'hours', 'physical laboratory instrument time consumed by this scope', 'NO_LAB_TIME_RECORDED',
      'No LAB_INSTRUMENT span was recorded. A scope that genuinely used no laboratory time has to record that explicitly; silence is not evidence of absence.'));

  put(known('HUMAN_TOUCH_COUNT', touchCount, 'touches', 'row count of discovery_human_touches for this scope',
    'how many times a person had to touch this scope at all; by the owner’s principle each one is a candidate product bug'));

  put(fullCycleWallClockMs !== null && fullCycleWallClockMs !== undefined
    ? known('TIME_TO_DECISION', fullCycleWallClockMs, 'ms', `discovery_stage_marks OPEN/CLOSE of ${FULL_CYCLE_STAGE}`,
      'wall clock from the question being formalised to the loop having no further justified experiment')
    : unknownMetric('TIME_TO_DECISION', 'ms', 'wall clock from the question being formalised to the loop having no further justified experiment', 'FULL_CYCLE_STAGE_NOT_CLOSED',
      `${FULL_CYCLE_STAGE} has no completed OPEN/CLOSE pair for this scope, so there is no decision time to report.`));

  // --- The two ratios. Measured over ACTIVE work time; waiting is nobody's work. ---
  const totalActive = r.computeMs + activeHumanMs;
  const ratioDefinition = 'share of recorded ACTIVE work time (machine compute against human active time); waiting time is excluded from both sides because waiting is not work';
  if (touchCount === 0) {
    const why = 'No human touch is recorded for this scope, so a ratio would read as 100% automation purely because nobody measured the human side.';
    put(unknownMetric('AUTOMATED_WORK_RATIO', 'ratio', ratioDefinition, 'NO_HUMAN_TIME_RECORDED', why));
    put(unknownMetric('HUMAN_WORK_RATIO', 'ratio', ratioDefinition, 'NO_HUMAN_TIME_RECORDED', why));
  } else if (totalActive === 0) {
    const why = 'Neither side recorded any active time, so there is no ratio.';
    put(unknownMetric('AUTOMATED_WORK_RATIO', 'ratio', ratioDefinition, 'NO_WORK_TIME_RECORDED', why));
    put(unknownMetric('HUMAN_WORK_RATIO', 'ratio', ratioDefinition, 'NO_WORK_TIME_RECORDED', why));
  } else {
    const source = `${r.computeSpans} COMPUTE span(s) and ${touchCount} human touch row(s)`;
    put(known('AUTOMATED_WORK_RATIO', r.computeMs / totalActive, 'ratio', source, ratioDefinition));
    put(known('HUMAN_WORK_RATIO', activeHumanMs / totalActive, 'ratio', source, ratioDefinition));
  }

  // --- The baseline-dependent quantities. No comparable baseline -> UNKNOWN, with no exception. ---
  const baselineSource = baseline ? `discovery_human_work_baselines ${baseline.id} (provenance ${baseline.provenanceHash.slice(0, 12)})` : null;

  const savedDefinition = 'baseline active human time for the same task scope minus the human active time Genesis actually needed';
  if (!baseline) put(unknownMetric('SCIENTIST_HOURS_SAVED', 'hours', savedDefinition, baselineReason, NO_BASELINE_EXPLANATION));
  else if (touchCount === 0) {
    put(unknownMetric('SCIENTIST_HOURS_SAVED', 'hours', savedDefinition, 'NO_HUMAN_TOUCH_RECORDED',
      'A baseline exists, but the Genesis side of the subtraction was never measured: no human touch is recorded for this scope.'));
  } else put(known('SCIENTIST_HOURS_SAVED', (baseline.activeHumanMs - activeHumanMs) / MS_PER_HOUR, 'hours', baselineSource, savedDefinition));

  const labDefinition = 'baseline laboratory instrument time for the same task scope minus the laboratory time Genesis actually used';
  if (!baseline) put(unknownMetric('LAB_HOURS_AVOIDED', 'hours', labDefinition, baselineReason, NO_BASELINE_EXPLANATION));
  else if (r.labInstrumentSpans === 0) {
    put(unknownMetric('LAB_HOURS_AVOIDED', 'hours', labDefinition, 'NO_LAB_TIME_RECORDED',
      'A baseline exists, but LAB_HOURS_USED was never recorded for this scope, so the subtraction has no second term.'));
  } else put(known('LAB_HOURS_AVOIDED', (baseline.labInstrumentMs - r.labInstrumentMs) / MS_PER_HOUR, 'hours', baselineSource, labDefinition));

  const expDefinition = 'baseline experiment count for the same task scope minus the experiments Genesis actually completed';
  if (!baseline) put(unknownMetric('EXPERIMENTS_AVOIDED', 'experiments', expDefinition, baselineReason, NO_BASELINE_EXPLANATION));
  else put(known('EXPERIMENTS_AVOIDED', baseline.experiments - r.experiments, 'experiments', baselineSource, expDefinition));

  const failDefinition = 'baseline failed-experiment count for the same task scope minus the failed attempts Genesis actually made (the RETRIES counter)';
  if (!baseline) put(unknownMetric('FAILED_EXPERIMENTS_AVOIDED', 'experiments', failDefinition, baselineReason, NO_BASELINE_EXPLANATION));
  else put(known('FAILED_EXPERIMENTS_AVOIDED', baseline.failedExperiments - r.retries, 'experiments', baselineSource, failDefinition));

  // --- Cost. No price is built into this code; without a recorded rate row there is no figure. ---
  const costDefinition = 'recorded scientist active time, machine time and laboratory time at recorded, provenanced rates';
  const rate = listCostRates(db, { currency: baseline?.currency ?? null }).at(0) ?? null;
  const missingInputs = [
    touchCount === 0 ? 'SCIENTIST_ACTIVE_TIME' : null,
    r.computeSpans === 0 ? 'GENESIS_ACTIVE_TIME' : null,
    r.labInstrumentSpans === 0 ? 'LAB_HOURS_USED' : null,
  ].filter(Boolean);
  if (!rate) {
    put(unknownMetric('COST_TO_DECISION', 'currency-minor', costDefinition, 'NO_COST_RATE_RECORDED',
      'No scientist, compute or laboratory rate with provenance has been recorded. There is no price built into this code, so a cost figure cannot be produced.'));
  } else if (missingInputs.length > 0) {
    put(unknownMetric('COST_TO_DECISION', 'currency-minor', costDefinition, 'COST_INPUT_NOT_MEASURED',
      `Rates exist, but these inputs were never recorded for this scope: ${missingInputs.join(', ')}.`));
  } else {
    const cost = (activeHumanMs / MS_PER_HOUR) * rate.scientistMinorPerHour
      + (r.computeMs / MS_PER_HOUR) * rate.computeMinorPerHour
      + (r.labInstrumentMs / MS_PER_HOUR) * rate.labMinorPerHour;
    put({ ...known('COST_TO_DECISION', cost, 'currency-minor', `discovery_cost_rates ${rate.id}`, costDefinition), currency: rate.currency });
  }

  put(automationCoverage(db, { extraStages: stages.map((s) => s.stage) }));

  return {
    metrics,
    recorded: { ...r, activeHumanMs, humanTouchCount: touchCount },
    baseline,
    baselineReason,
    costRates: rate,
  };
}

const HUMAN_WORK_PRINCIPLE = 'Genesis takes the human’s work onto itself: a step a person performs that Genesis could perform '
  + 'correctly, reproducibly, under Evidence, safely and automatically is a product bug.';

/**
 * HUMAN WORK report for one scope, usually a ResearchRun. Pure read: it writes nothing and fills no
 * missing measurement with a default. Every quantity that needs a baseline reads UNKNOWN until a
 * provenanced, comparable baseline row exists.
 *
 * `taskScope` and `evidenceStandard` only DECLARE what this scope's work was, so that a recorded
 * baseline can be matched to it. They are not values and they cannot become one.
 */
export function humanWorkReport(db, scopeKind, scopeId, {
  stage = FULL_CYCLE_STAGE, taskScopeId = null, taskScope = null, evidenceStandard = null,
} = {}) {
  assertScope(scopeKind, scopeId);
  assertEnum(stage, DISCOVERY_STAGES, 'stage');
  const timing = discoveryTimingReport(db, scopeKind, scopeId);
  const touches = humanTouches(db, scopeKind, scopeId);
  const classification = effectiveLoopStepClassification(db);
  const computed = computeMetrics(db, {
    stages: timing.stages, touches, fullCycleWallClockMs: timing.fullCycle?.wallClockMs ?? null,
    stage, taskScopeId, taskScope, evidenceStandard,
  });
  return {
    report: 'HUMAN_WORK',
    principle: HUMAN_WORK_PRINCIPLE,
    scopeKind,
    scopeId,
    stage,
    timing,
    humanTouches: touches,
    classification: classification.steps,
    classificationSource: classification.source,
    ...computed,
  };
}

/** The same report for a campaign: its own scope plus every scope linked to it. */
export function campaignHumanWorkReport(db, campaignId, {
  stage = FULL_CYCLE_STAGE, taskScopeId = null, taskScope = null, evidenceStandard = null,
} = {}) {
  assertEnum(stage, DISCOVERY_STAGES, 'stage');
  const timing = campaignCycleTiming(db, campaignId);
  const touches = campaignHumanTouches(db, campaignId);
  const classification = effectiveLoopStepClassification(db);
  const fullCycle = timing.stages.find((s) => s.stage === FULL_CYCLE_STAGE) ?? null;
  const computed = computeMetrics(db, {
    stages: timing.stages, touches, fullCycleWallClockMs: fullCycle?.wallClockMs ?? null,
    stage, taskScopeId, taskScope, evidenceStandard,
  });
  return {
    report: 'HUMAN_WORK',
    principle: HUMAN_WORK_PRINCIPLE,
    campaignId,
    stage,
    timing,
    humanTouches: touches,
    classification: classification.steps,
    classificationSource: classification.source,
    ...computed,
  };
}
