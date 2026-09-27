/**
 * Long-Horizon Checkpoint & Recovery (Priority 9 — cognitive ceiling).
 *
 * Turns the mission_checkpoints substrate (P1) into deterministic recovery. On
 * restart Genesis reconstructs mission state, active hypotheses, evidence, the DAG
 * frontier, pending verification, agent decisions, workflow-mutation history, and
 * computes the single NEXT SAFE ACTION — without duplicating completed scientific
 * work. Survives process restart, partial completion, interrupted tasks/verification,
 * and mutations in progress.
 *
 * Interruption model: a task left RUNNING when the process died is reconciled to a
 * re-runnable state (RUNNING → BLOCKED → readiness recompute), never silently
 * treated as complete. Completed tasks are never re-run (no duplicated evidence).
 */
import * as store from '../store.mjs';
import * as dag from './taskGraph.mjs';
import * as ev from './evidenceStore.mjs';
import * as we from './workflowEngine.mjs';

export const NEXT_ACTION = Object.freeze({
  EXECUTE_TASK: 'EXECUTE_TASK',
  VERIFY_EVIDENCE: 'VERIFY_EVIDENCE',
  RESOLVE_MUTATION: 'RESOLVE_MUTATION',
  ADAPT_WORKFLOW: 'ADAPT_WORKFLOW',
  GATHER_MORE_EVIDENCE: 'GATHER_MORE_EVIDENCE',
  MISSION_COMPLETE: 'MISSION_COMPLETE',
  MISSION_NOT_FOUND: 'MISSION_NOT_FOUND',
});

/** Reconcile tasks interrupted mid-run: RUNNING → BLOCKED → readiness recompute. */
export function reconcileInterrupted(db, missionId) {
  const running = store.listTaskNodes(db, missionId, { state: dag.TASK_STATE.RUNNING });
  const reconciled = [];
  for (const t of running) {
    dag.transition(db, t.id, dag.TASK_STATE.BLOCKED, 'interrupted at restart; reset for safe retry');
    dag.recomputeReadiness(db, t.id);
    reconciled.push(t.id);
  }
  return reconciled;
}

/** Evidence backed by a Scientific Run but not yet verified = interrupted/pending verification. */
export function pendingVerification(db, missionId) {
  return store.listEvidence(db, missionId)
    .filter((e) => e.scienceRunId && e.verificationStatus === ev.EPISTEMIC_STATUS.UNVERIFIED)
    .map((e) => e.id);
}

/** Workflow mutations recorded but neither verified nor rolled back = in progress. */
export function inProgressMutations(db, missionId) {
  return store.listWorkflowMutations(db, missionId)
    .filter((m) => m.verificationStatus === 'UNVERIFIED' && m.actualResult == null)
    .map((m) => m.id);
}

/**
 * Full deterministic recovery. Reconciles interruptions, reconstructs state, and
 * returns the next safe action. Idempotent: calling it again yields the same action.
 */
export function recoverMission(db, missionId) {
  const mission = store.getMission(db, missionId);
  if (!mission) return { ok: false, missionId, nextSafeAction: { action: NEXT_ACTION.MISSION_NOT_FOUND } };

  const reconciledTasks = reconcileInterrupted(db, missionId);
  const state = ev.reconstructMissionState(db, missionId, { frontier: dag.executionFrontier(db, missionId).map((t) => t.id) });
  const frontier = dag.executionFrontier(db, missionId);
  const pending = pendingVerification(db, missionId);
  const mutations = inProgressMutations(db, missionId);
  const strategy = we.evaluateStrategy(db, missionId);
  const agentInvocations = store.listAgentInvocations(db, missionId);

  // Deterministic next-safe-action priority: finish interrupted verification/mutation
  // first, then execute the frontier, then adapt, then gather, else complete.
  let nextSafeAction;
  if (mutations.length > 0) {
    nextSafeAction = { action: NEXT_ACTION.RESOLVE_MUTATION, mutationId: mutations[0] };
  } else if (pending.length > 0) {
    nextSafeAction = { action: NEXT_ACTION.VERIFY_EVIDENCE, evidenceId: pending[0] };
  } else if (frontier.length > 0) {
    nextSafeAction = { action: NEXT_ACTION.EXECUTE_TASK, taskId: frontier[0].id, title: frontier[0].title };
  } else if (strategy.verdict === 'FAILING' || strategy.verdict === 'STALLED') {
    nextSafeAction = { action: NEXT_ACTION.ADAPT_WORKFLOW, verdict: strategy.verdict };
  } else if (strategy.verdict === 'INSUFFICIENT_INFO') {
    nextSafeAction = { action: NEXT_ACTION.GATHER_MORE_EVIDENCE };
  } else {
    nextSafeAction = { action: NEXT_ACTION.MISSION_COMPLETE };
  }

  return {
    ok: true, missionId, replaySafe: true,
    reconciledTasks,
    counts: state.counts,
    frontier: frontier.map((t) => t.id),
    pendingVerification: pending,
    inProgressMutations: mutations,
    agentInvocations: agentInvocations.length,
    strategyVerdict: strategy.verdict,
    nextSafeAction,
  };
}
