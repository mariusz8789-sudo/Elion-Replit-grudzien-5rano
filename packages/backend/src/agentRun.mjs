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
