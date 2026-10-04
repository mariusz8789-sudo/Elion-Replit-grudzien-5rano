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
 */
export const SPAN_KINDS = Object.freeze(['COMPUTE', 'QUEUE', 'HUMAN_WAIT']);

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
      if (f.kind === 'COMPUTE') s.computeMs += f.value_ms;
      else if (f.kind === 'QUEUE') s.queueMs += f.value_ms;
      else if (f.kind === 'HUMAN_WAIT') s.humanWaitMs += f.value_ms;
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
