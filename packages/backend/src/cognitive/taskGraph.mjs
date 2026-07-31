/**
 * Scientific Task DAG (Priority 1 — cognitive ceiling).
 *
 * Promotes the previously post-hoc "discovery graph" (a flat lineage tree) into a
 * real, schedulable dependency DAG with an explicit task lifecycle. This is the
 * spine the whole cognitive loop hangs on: the Mission Planner writes tasks +
 * dependencies here; the orchestrator reads the execution frontier (READY tasks);
 * the workflow engine mutates it. Every state change is appended to an audit
 * trail so a restart reconstructs the exact frontier.
 *
 * Guarantees:
 *  - Acyclic by construction: `addDependency` rejects any edge that would create a
 *    cycle (checked against the persisted edge set), so scheduling can never loop.
 *  - Dependency-driven readiness: a task is READY iff all its dependencies are
 *    COMPLETED; otherwise BLOCKED (with a reason). Completing a task auto-unblocks
 *    dependents whose dependencies are now all satisfied.
 *  - Validated transitions: only lifecycle-legal state changes are allowed; each
 *    persists an append-only transition record (never overwritten).
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

/** Task lifecycle states (the 7 mandated + no hidden extras). */
export const TASK_STATE = Object.freeze({
  READY: 'READY', // dependencies satisfied; on the execution frontier
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED', // waiting on an incomplete/failed dependency, resource, or capability
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
});

/** Legal transitions. Terminal states (COMPLETED/REJECTED/SUPERSEDED) may only be superseded. */
const ALLOWED = Object.freeze({
  READY: ['RUNNING', 'BLOCKED', 'REJECTED', 'SUPERSEDED'],
  RUNNING: ['COMPLETED', 'FAILED', 'BLOCKED', 'REJECTED', 'SUPERSEDED'],
  BLOCKED: ['READY', 'REJECTED', 'SUPERSEDED'],
  FAILED: ['READY', 'REJECTED', 'SUPERSEDED'], // FAILED→READY = retry
  COMPLETED: ['SUPERSEDED'],
  REJECTED: ['SUPERSEDED'],
  SUPERSEDED: [],
});
export function canTransition(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

/* ---------------- Task + dependency construction ---------------- */

/**
 * Create a task. With no dependencies it starts READY (on the frontier); add
 * dependencies afterwards with `addDependency`, which re-evaluates readiness.
 */
export function addTask(db, {
  missionId, title, taskType, spec = {}, questionId = null, hypothesisId = null,
  engine = null, computeEstimate = {},
}) {
  if (!missionId) throw new Error('missionId required');
  if (!title) throw new Error('task title required');
  if (!taskType) throw new Error('task taskType required');
  const contentHash = canonicalHash({ title, taskType, spec });
  const task = store.saveTaskNode(db, {
    missionId, title, taskType, spec, questionId, hypothesisId, engine, computeEstimate,
    state: TASK_STATE.READY, contentHash,
  });
  store.saveTaskTransition(db, { taskId: task.id, missionId, fromState: null, toState: TASK_STATE.READY, reason: 'created' });
  return task;
}

/** Would adding edge dep -> task create a cycle? True iff `dep` is reachable from `task`. */
function wouldCycle(db, missionId, depId, taskId) {
  if (depId === taskId) return true;
  const edges = store.listTaskEdges(db, missionId);
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.fromTaskId)) adj.set(e.fromTaskId, []);
    adj.get(e.fromTaskId).push(e.toTaskId);
  }
  // DFS from `task` following existing dep->dependent edges; if we reach `dep`,
  // then dep already depends (transitively) on task, so dep->task closes a loop.
  const seen = new Set();
  const stack = [taskId];
  while (stack.length) {
    const n = stack.pop();
    if (n === depId) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const m of adj.get(n) ?? []) stack.push(m);
  }
  return false;
}

/** Add a dependency: `depTaskId` must COMPLETE before `taskId`. Rejects cycles. */
export function addDependency(db, missionId, depTaskId, taskId) {
  if (wouldCycle(db, missionId, depTaskId, taskId)) {
    throw new Error(`dependency ${depTaskId} -> ${taskId} would create a cycle`);
  }
  store.saveTaskEdge(db, { missionId, fromTaskId: depTaskId, toTaskId: taskId, kind: 'depends-on' });
  recomputeReadiness(db, taskId);
  return true;
}

/** Remove a dependency edge (reverses addDependency) and re-evaluate the dependent's readiness. */
export function removeDependency(db, missionId, depTaskId, taskId) {
  const edge = store.findTaskEdge(db, missionId, depTaskId, taskId, 'depends-on');
  if (!edge) return false;
  store.deleteTaskEdge(db, edge.id);
  recomputeReadiness(db, taskId);
  return true;
}

/** A task is READY iff all its dependencies are COMPLETED; else BLOCKED (with reason). */
export function recomputeReadiness(db, taskId) {
  const task = store.getTaskNode(db, taskId);
  if (!task) return null;
  // Only re-evaluate tasks that are on the waiting side of the lifecycle.
  if (task.state !== TASK_STATE.READY && task.state !== TASK_STATE.BLOCKED) return task;
  const deps = store.listDependencies(db, taskId).map((e) => store.getTaskNode(db, e.fromTaskId)).filter(Boolean);
  const unmet = deps.filter((d) => d.state !== TASK_STATE.COMPLETED);
  if (unmet.length === 0) {
    if (task.state !== TASK_STATE.READY) return transition(db, taskId, TASK_STATE.READY, 'all dependencies completed');
    return task;
  }
  const failed = unmet.filter((d) => d.state === TASK_STATE.FAILED || d.state === TASK_STATE.REJECTED);
  const reason = failed.length
    ? `blocked by ${failed.length} failed/rejected dependency(ies)`
    : `waiting on ${unmet.length} incomplete dependency(ies)`;
  if (task.state !== TASK_STATE.BLOCKED) return transition(db, taskId, TASK_STATE.BLOCKED, reason);
  return store.updateTaskNode(db, taskId, { blockedReason: reason });
}

/* ---------------- Lifecycle transitions ---------------- */

/**
 * Transition a task to `toState` (validated). Persists an append-only transition
 * record. On COMPLETED, dependents are re-evaluated and auto-unblocked where their
 * dependencies are now all satisfied.
 */
export function transition(db, taskId, toState, reason = null, { result = undefined, computeActual = undefined, resultEvidenceId = undefined } = {}) {
  const task = store.getTaskNode(db, taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (task.state === toState) return task;
  if (!canTransition(task.state, toState)) {
    throw new Error(`illegal transition ${task.state} -> ${toState} for task ${taskId}`);
  }
  const patch = { state: toState };
  if (toState === TASK_STATE.BLOCKED && reason) patch.blockedReason = reason;
  if (toState === TASK_STATE.READY) patch.blockedReason = null;
  if (result !== undefined) patch.result = result;
  if (computeActual !== undefined) patch.computeActual = computeActual;
  if (resultEvidenceId !== undefined) patch.resultEvidenceId = resultEvidenceId;
  const updated = store.updateTaskNode(db, taskId, patch);
  store.saveTaskTransition(db, { taskId, missionId: task.missionId, fromState: task.state, toState, reason });
  if (toState === TASK_STATE.COMPLETED || toState === TASK_STATE.FAILED || toState === TASK_STATE.REJECTED) {
    for (const e of store.listDependents(db, taskId)) recomputeReadiness(db, e.toTaskId);
  }
  return updated;
}

/** Supersede a task (e.g. replaced by a workflow mutation). Both persist. */
export function supersedeTask(db, taskId, reason = 'superseded by workflow mutation', supersededBy = null) {
  const task = store.getTaskNode(db, taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  store.updateTaskNode(db, taskId, { supersededBy });
  return transition(db, taskId, TASK_STATE.SUPERSEDED, reason);
}

/* ---------------- Queries ---------------- */

/** The execution frontier: tasks ready to run now (dependencies satisfied). */
export function executionFrontier(db, missionId) {
  return store.listTaskNodes(db, missionId, { state: TASK_STATE.READY });
}

/** A deterministic hash of the current DAG topology + states (for WorkflowMutation.previousWorkflowHash). */
export function workflowHash(db, missionId) {
  const nodes = store.listTaskNodes(db, missionId)
    .map((t) => ({ id: t.id, state: t.state, taskType: t.taskType }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = store.listTaskEdges(db, missionId)
    .map((e) => ({ from: e.fromTaskId, to: e.toTaskId, kind: e.kind }))
    .sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
  return canonicalHash({ nodes, edges });
}

/** Snapshot the mission's schedulable state for long-horizon restart/recovery. */
export function checkpoint(db, missionId, label = null) {
  const frontier = executionFrontier(db, missionId).map((t) => t.id);
  const all = store.listTaskNodes(db, missionId);
  const byState = {};
  for (const t of all) byState[t.state] = (byState[t.state] ?? 0) + 1;
  const summary = { tasks: all.length, tasksByState: byState };
  const stateHash = workflowHash(db, missionId);
  return store.saveMissionCheckpoint(db, { missionId, label, frontier, summary, stateHash });
}
