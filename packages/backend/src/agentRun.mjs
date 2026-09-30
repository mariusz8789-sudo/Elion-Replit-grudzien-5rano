/**
 * Autonomous Core — AgentRun persistence (Genesis Master Audit, Part 7 NEXT 2).
 *
 * The one genuinely new piece of infrastructure the whole Autonomous Core plan
 * depends on: a real, resumable record of a multi-step agent investigation.
 * Everything else in that plan (hypothesis generation, experiment selection,
 * falsification, decision ranking) already exists as real, callable functions
 * elsewhere in this codebase — this module holds no reasoning of its own, only
 * the durable trace of reasoning that happened through those real functions.
 *
 * Same discipline as `campaign/persistence.mjs`: steps are APPEND-ONLY (a step,
 * once recorded, is never rewritten — a mistaken step is followed by a corrective
 * one, not edited away), and every read is a real SQL query against `store.mjs`'s
 * own `node:sqlite` database, never an in-memory cache that could drift from what
 * was actually persisted.
 */
import { newId } from './auth.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';

const J = (v) => JSON.stringify(v ?? null);
const P = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export const AGENT_RUN_STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  RESOLVED: 'RESOLVED',
  BLOCKED: 'BLOCKED',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  FAILED: 'FAILED',
});

/* ---------------- Runs ---------------- */

export function createAgentRun(db, r) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO agent_runs (id, project_id, goal, domain, status, budget_json, final_json, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'RUNNING', ?, NULL, ?, ?, ?)`,
  ).run(id, r.projectId, r.goal, r.domain, J(r.budget ?? {}), r.createdBy ?? null, now, now);
  return getAgentRun(db, id);
}

function toAgentRun(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.project_id, goal: row.goal, domain: row.domain,
    status: row.status, budget: P(row.budget_json, {}),
    final: row.final_json ? P(row.final_json, null) : null,
    createdBy: row.created_by ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function getAgentRun(db, id) {
  return toAgentRun(db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id));
}

/** Newest-first. `rowid DESC` breaks ties when two runs share a millisecond timestamp
 * (SQLite's own insertion-order tiebreaker) — `created_at` alone is not always unique. */
export function listAgentRuns(db, projectId) {
  return db.prepare('SELECT * FROM agent_runs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC').all(projectId).map(toAgentRun);
}

/** Real status transitions only — a run's own real terminal states, never a bare string. */
export function updateAgentRunStatus(db, id, status, final = undefined) {
  const cur = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id);
  if (!cur) return null;
  if (!Object.values(AGENT_RUN_STATUS).includes(status)) throw new Error(`invalid_agent_run_status: ${status}`);
  db.prepare('UPDATE agent_runs SET status = ?, final_json = ?, updated_at = ? WHERE id = ?').run(
    status, final !== undefined ? J(final) : cur.final_json, Date.now(), id,
  );
  return getAgentRun(db, id);
}

/* ---------------- Steps (append-only — the real GENESIS AGENT TRACE) ---------------- */

export function addAgentStep(db, s) {
  const id = newId();
  db.prepare(
    `INSERT INTO agent_run_steps
       (id, agent_run_id, step_index, hypothesis_json, tool_invoked, capability, branch_id,
        observation_json, falsification_verdict_json, error, retry_count, next_action_json,
        provenance_event_ids_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, s.agentRunId, s.stepIndex, J(s.hypothesis ?? {}), s.toolInvoked, s.capability, s.branchId ?? null,
    s.observation !== undefined ? J(s.observation) : null,
    s.falsificationVerdict !== undefined ? J(s.falsificationVerdict) : null,
    s.error ?? null, s.retryCount ?? 0, J(s.nextAction ?? {}), J(s.provenanceEventIds ?? []), Date.now(),
  );
  db.prepare('UPDATE agent_runs SET updated_at = ? WHERE id = ?').run(Date.now(), s.agentRunId);
  return id;
}

function toAgentStep(row) {
  return {
    id: row.id, agentRunId: row.agent_run_id, stepIndex: row.step_index,
    hypothesis: P(row.hypothesis_json, {}), toolInvoked: row.tool_invoked, capability: row.capability,
    branchId: row.branch_id ?? null,
    observation: row.observation_json ? P(row.observation_json, null) : null,
    falsificationVerdict: row.falsification_verdict_json ? P(row.falsification_verdict_json, null) : null,
    error: row.error ?? null, retryCount: row.retry_count,
    nextAction: P(row.next_action_json, {}), provenanceEventIds: P(row.provenance_event_ids_json, []),
    createdAt: row.created_at,
  };
}

export function listAgentSteps(db, agentRunId) {
  return db.prepare('SELECT * FROM agent_run_steps WHERE agent_run_id = ? ORDER BY step_index ASC, created_at ASC').all(agentRunId).map(toAgentStep);
}

/* ---------------- Research State (ENTITY-0) ----------------
 *
 * `frontend/src/core/mind/researchState.ts` is Genesis Mind's append-only,
 * hash-chained transition log. Until ENTITY-0 it lived only in process memory,
 * so a restart erased what the Mind was working on. Its events are stored HERE,
 * as ordinary steps of an agent run — no new table and no second memory: one
 * research-state event is one `agent_run_steps` row whose `tool_invoked` is
 * RESEARCH_STATE_TOOL, `capability` is the event type, `step_index` is the
 * event's `seq` and `observation_json` is the event itself (payload included).
 *
 * The chain rule is the frontend's, re-computed here with the backend's own
 * twin of the same primitives (`determinism.mjs`), so a write that does not
 * extend the current head is refused and a read reports a broken chain instead
 * of repairing it. Nothing in this section ever edits or deletes a step.
 */
export const RESEARCH_STATE_TOOL = 'mind.researchState';
export const RESEARCH_STATE_EVENT_TYPES = Object.freeze([
  'PROBLEM_FORMALIZED', 'KNOWLEDGE_SNAPSHOT', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN',
  'EXPERIMENT_HANDOFF', 'EVIDENCE_UPDATE', 'SELF_FALSIFICATION', 'NEXT_EXPERIMENT', 'TERMINAL',
]);
export const RESEARCH_STATE_GENESIS_HEAD = fnv1a(canonicalJson({ genesis: 'research-state-v1' }));

function researchTransition(previousHead, type, payloadFingerprint, seq) {
  return fnv1a(canonicalJson({ prev: previousHead, type, payloadFingerprint, seq }));
}

function researchStateSteps(db, agentRunId) {
  return listAgentSteps(db, agentRunId).filter((s) => s.toolInvoked === RESEARCH_STATE_TOOL);
}

/**
 * Recomputes the whole chain from the genesis head. Never repairs: the first
 * inconsistency is reported with its position and the chain stays broken.
 */
export function verifyResearchStateEvents(events) {
  let head = RESEARCH_STATE_GENESIS_HEAD;
  for (const [index, event] of events.entries()) {
    const fail = (reason) => ({ ok: false, length: events.length, head: null, brokenAt: index, reason });
    if (!event || typeof event !== 'object') return fail('malformed_event');
    if (event.seq !== index) return fail('sequence_gap');
    if (!RESEARCH_STATE_EVENT_TYPES.includes(event.type)) return fail('unknown_event_type');
    if (!('payload' in event)) return fail('payload_missing');
    if (fnv1a(canonicalJson(event.payload)) !== event.payloadFingerprint) return fail('payload_fingerprint_mismatch');
    if (researchTransition(head, event.type, event.payloadFingerprint, event.seq) !== event.transitionFingerprint) return fail('transition_fingerprint_mismatch');
    head = event.transitionFingerprint;
  }
  return { ok: true, length: events.length, head, brokenAt: null, reason: null };
}

/** The run's persisted research-state events, in order, and the verdict of re-verifying their chain. */
export function readResearchState(db, agentRunId) {
  const events = researchStateSteps(db, agentRunId).map((s) => s.observation);
  return { events, chain: verifyResearchStateEvents(events) };
}

/**
 * Appends one event. Accepted only if it extends the current head exactly; the
 * same event sent twice is an idempotent no-op, anything else at an occupied or
 * skipped position is refused. A run whose stored chain is already broken
 * accepts nothing more (fail closed).
 */
export function appendResearchStateEvent(db, agentRunId, event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { ok: false, error: 'invalid_event' };
  if (!Number.isInteger(event.seq) || event.seq < 0) return { ok: false, error: 'invalid_event', reason: 'seq' };
  if (!RESEARCH_STATE_EVENT_TYPES.includes(event.type)) return { ok: false, error: 'invalid_event', reason: 'type' };
  if (typeof event.at !== 'string') return { ok: false, error: 'invalid_event', reason: 'at' };
  if (!('payload' in event)) return { ok: false, error: 'invalid_event', reason: 'payload' };
  const stored = { seq: event.seq, type: event.type, at: event.at, payload: event.payload, payloadFingerprint: event.payloadFingerprint, transitionFingerprint: event.transitionFingerprint };

  const current = readResearchState(db, agentRunId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  if (event.seq < current.events.length) {
    const existing = current.events[event.seq];
    return canonicalJson(existing) === canonicalJson(stored)
      ? { ok: true, deduped: true, event: existing, head: current.chain.head }
      : { ok: false, error: 'step_index_conflict' };
  }
  if (event.seq !== current.events.length) return { ok: false, error: 'step_index_conflict' };
  if (fnv1a(canonicalJson(stored.payload)) !== stored.payloadFingerprint) return { ok: false, error: 'payload_fingerprint_mismatch' };
  if (researchTransition(current.chain.head, stored.type, stored.payloadFingerprint, stored.seq) !== stored.transitionFingerprint) {
    return { ok: false, error: 'chain_mismatch' };
  }
  addAgentStep(db, {
    agentRunId, stepIndex: stored.seq, toolInvoked: RESEARCH_STATE_TOOL, capability: stored.type,
    hypothesis: {}, observation: stored, nextAction: {},
  });
  return { ok: true, deduped: false, event: stored, head: stored.transitionFingerprint };
}

/**
 * Server-side twin of the frontend's event builder (R1-a): the backend itself extends a run's
 * research state, with the same chain rule, instead of trusting a client to compute the head.
 * Goes through appendResearchStateEvent, so every check above still applies.
 */
export function appendServerResearchStateEvent(db, agentRunId, type, payload, at = new Date().toISOString()) {
  const current = readResearchState(db, agentRunId);
  if (!current.chain.ok) return { ok: false, error: 'state_integrity_failure', chain: current.chain };
  const seq = current.events.length;
  const stored = JSON.parse(canonicalJson(payload ?? null));
  const payloadFingerprint = fnv1a(canonicalJson(stored));
  return appendResearchStateEvent(db, agentRunId, {
    seq, type, at, payload: stored, payloadFingerprint,
    transitionFingerprint: researchTransition(current.chain.head, type, payloadFingerprint, seq),
  });
}
