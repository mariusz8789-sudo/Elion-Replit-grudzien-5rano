/**
 * Dynamic Workflow Engine (Priority 3 — cognitive ceiling).
 *
 * Closes the adaptive loop: OBSERVE execution outcomes → EVALUATE whether the
 * current strategy is producing sufficient information → (if not) PROPOSE a
 * structural workflow mutation → APPLY it as an explicit, evidence-backed,
 * REVERSIBLE `WorkflowMutation` → later VERIFY the mutation against its expected
 * benefit, or ROLL IT BACK. The Scientific Task DAG is never a static list and is
 * never silently rewritten — every change is a persisted mutation record.
 *
 * Determinism & honesty:
 *  - Rule-based over persisted evidence and task state. No ML, no fabricated
 *    "information gain" numbers — expected/actual benefit are measured structural
 *    facts (e.g. "runnable tasks: 0 → 1", "failure-blocked dependents: 2 → 0").
 *  - Mutations are ADDITIVE + edge-rewire only (add tasks, delete/add dependency
 *    edges). Original tasks are never destroyed, so every mutation is fully
 *    reversible via `rollbackMutation`. Terminal task states (a real FAILED result)
 *    are preserved — the engine routes around failure, it does not hide it.
 */
import * as store from '../store.mjs';
import * as dag from './taskGraph.mjs';
import * as wf from './workflowMutation.mjs';

export const STRATEGY_VERDICT = Object.freeze({
  PROGRESSING: 'PROGRESSING', // runnable tasks remain; strategy is fine
  SUFFICIENT: 'SUFFICIENT', // plan complete and no open questions
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFO', // plan exhausted but open questions remain
  STALLED: 'STALLED', // no runnable tasks yet active work remains (dead frontier)
  FAILING: 'FAILING', // failed tasks are blocking downstream work
});

/* ---------------- OBSERVE + EVALUATE ---------------- */

/** Evidence-backed, deterministic assessment of the current strategy. */
export function evaluateStrategy(db, missionId) {
  const tasks = store.listTaskNodes(db, missionId);
  const frontier = dag.executionFrontier(db, missionId);
  const evidence = store.listEvidence(db, missionId);
  const questions = store.listQuestions(db, missionId);

  const active = tasks.filter((t) => t.state !== dag.TASK_STATE.SUPERSEDED && t.state !== dag.TASK_STATE.REJECTED);
  const failed = active.filter((t) => t.state === dag.TASK_STATE.FAILED);
  const failedBlocking = failed.filter((f) => store.listDependents(db, f.id).length > 0);
  const openQ = questions.filter((q) => q.status === 'open');
  const completed = active.filter((t) => t.state === dag.TASK_STATE.COMPLETED);
  const running = active.filter((t) => t.state === dag.TASK_STATE.RUNNING);
  const blocked = active.filter((t) => t.state === dag.TASK_STATE.BLOCKED);

  const metrics = {
    tasks: tasks.length, activeTasks: active.length, frontier: frontier.length,
    running: running.length, blocked: blocked.length,
    failed: failed.length, failedBlocking: failedBlocking.length,
    completed: completed.length, openQuestions: openQ.length, evidence: evidence.length,
  };

  const inFlight = frontier.length > 0 || running.length > 0;
  let verdict;
  const reasons = [];
  if (failedBlocking.length > 0) {
    verdict = STRATEGY_VERDICT.FAILING;
    reasons.push(`${failedBlocking.length} failed task(s) are blocking downstream work`);
  } else if (inFlight) {
    verdict = STRATEGY_VERDICT.PROGRESSING;
    reasons.push(`${frontier.length} ready, ${running.length} running`);
  } else if (blocked.length > 0) {
    verdict = STRATEGY_VERDICT.STALLED;
    reasons.push('nothing ready or running, but blocked work remains (dead frontier)');
  } else if (openQ.length > 0) {
    verdict = STRATEGY_VERDICT.INSUFFICIENT_INFO;
    reasons.push(`plan exhausted but ${openQ.length} question(s) remain open`);
  } else {
    verdict = STRATEGY_VERDICT.SUFFICIENT;
    reasons.push('all work complete and no open questions remain');
  }
  return { verdict, reasons, metrics, failedBlocking: failedBlocking.map((t) => t.id), openQuestionIds: openQ.map((q) => q.id) };
}

/* ---------------- PROPOSE ---------------- */

/**
 * Propose a structural mutation for the evaluated verdict, or null when the
 * strategy is fine (PROGRESSING/SUFFICIENT → no mutation; honest no-op).
 * Proposals are declarative; `applyMutation` executes them and records ids.
 */
export function proposeMutation(db, missionId, evaluation) {
  const { verdict } = evaluation;
  if (verdict === STRATEGY_VERDICT.PROGRESSING || verdict === STRATEGY_VERDICT.SUFFICIENT) return null;

  if (verdict === STRATEGY_VERDICT.FAILING) {
    // Route around each failure: add an alternative task and rewire the failed
    // task's dependents onto it (removing the dead dependency edge).
    const addTasks = [];
    const rewire = [];
    for (const failedId of evaluation.failedBlocking) {
      const failed = store.getTaskNode(db, failedId);
      const altTemp = `alt:${failedId}`;
      addTasks.push({
        tempId: altTemp,
        title: `Alternative to "${failed.title}"`,
        taskType: failed.taskType,
        questionId: failed.questionId ?? null,
        hypothesisId: failed.hypothesisId ?? null,
        engine: failed.engine ?? null,
        spec: { ...failed.spec, alternativeOf: failedId, reason: 'previous task FAILED' },
      });
      for (const dep of store.listDependents(db, failedId)) {
        rewire.push({ removeEdge: { from: failedId, to: dep.toTaskId }, addEdge: { fromTemp: altTemp, to: dep.toTaskId } });
      }
    }
    return {
      kind: 'ROUTE_AROUND_FAILURE',
      reason: `route around ${evaluation.failedBlocking.length} failed task(s) blocking downstream work`,
      addTasks, rewire,
      expectedBenefit: { failedBlockingBefore: evaluation.metrics.failedBlocking, targetFailedBlockingAfter: 0, computeDelta: `+${addTasks.length} task(s)`, riskDelta: 'low (additive, reversible)' },
    };
  }

  // STALLED or INSUFFICIENT_INFO: add a runnable follow-up experiment for an open question.
  const qId = evaluation.openQuestionIds[0] ?? null;
  const q = qId ? store.getQuestion(db, qId) : null;
  return {
    kind: verdict === STRATEGY_VERDICT.STALLED ? 'UNSTALL_ADD_PATH' : 'GATHER_MORE_EVIDENCE',
    reason: verdict === STRATEGY_VERDICT.STALLED
      ? 'add a runnable path to unstall a dead frontier'
      : 'gather more evidence for an unresolved question',
    addTasks: [{
      tempId: 'followup:0',
      title: q ? `Follow-up experiment for: ${q.text.slice(0, 60)}` : 'Follow-up experiment',
      taskType: 'compute',
      questionId: qId,
      spec: { reason: verdict },
    }],
    rewire: [],
    expectedBenefit: { frontierBefore: evaluation.metrics.frontier, targetFrontierAfter: evaluation.metrics.frontier + 1, computeDelta: '+1 task', riskDelta: 'low (additive, reversible)' },
  };
}

/* ---------------- APPLY (records the mutation, then mutates) ---------------- */

/**
 * Apply a proposal as an explicit WorkflowMutation. The mutation record (with the
 * previous workflow hash, expected benefit, and concrete rollback data) is written
 * as part of the same operation — the plan is never changed silently.
 */
export function applyMutation(db, missionId, proposal, { triggeringEvidence = [] } = {}) {
  if (!proposal) return null;
  const previousWorkflowHash = dag.workflowHash(db, missionId);

  // 1) Add tasks (map tempId -> real id).
  const tempToReal = {};
  const addedTaskIds = [];
  for (const spec of proposal.addTasks ?? []) {
    const t = dag.addTask(db, {
      missionId, title: spec.title, taskType: spec.taskType, spec: spec.spec ?? {},
      questionId: spec.questionId ?? null, hypothesisId: spec.hypothesisId ?? null, engine: spec.engine ?? null,
    });
    if (spec.tempId) tempToReal[spec.tempId] = t.id;
    addedTaskIds.push(t.id);
  }

  // 2) Rewire dependency edges (reversible: record what we remove and add).
  const removedEdges = [];
  const addedEdges = [];
  const affected = new Set();
  for (const r of proposal.rewire ?? []) {
    if (r.removeEdge) {
      const from = r.removeEdge.from;
      const to = r.removeEdge.to;
      if (dag.removeDependency(db, missionId, from, to)) {
        removedEdges.push({ from, to, kind: 'depends-on' });
        affected.add(to);
      }
    }
    if (r.addEdge) {
      const from = r.addEdge.from ?? tempToReal[r.addEdge.fromTemp];
      const to = r.addEdge.to;
      dag.addDependency(db, missionId, from, to);
      addedEdges.push({ from, to, kind: 'depends-on' });
      affected.add(to);
    }
  }
  for (const to of affected) dag.recomputeReadiness(db, to);

  // 3) Record the mutation with concrete rollback data.
  const rollback = { addedTaskIds, removedEdges, addedEdges };
  const mutation = wf.recordWorkflowMutation(db, {
    missionId, reason: proposal.reason, triggeringEvidence, previousWorkflowHash,
    proposed: { kind: proposal.kind, addTasks: proposal.addTasks, rewire: proposal.rewire },
    expectedBenefit: proposal.expectedBenefit, rollback,
  });
  return { mutation, newWorkflowHash: dag.workflowHash(db, missionId), addedTaskIds, frontier: dag.executionFrontier(db, missionId).map((t) => t.id) };
}

/* ---------------- VERIFY / ROLLBACK ---------------- */

/**
 * Verify a mutation against its expected structural benefit using the CURRENT
 * measured state. Sets VERIFIED when the expectation was met, REGRESSED otherwise.
 */
export function verifyMutation(db, mutationId) {
  const mutation = store.getWorkflowMutation(db, mutationId);
  if (!mutation) return null;
  const evalNow = evaluateStrategy(db, mutation.missionId);
  const exp = mutation.expectedBenefit ?? {};
  let met = true;
  const checks = [];
  if (exp.targetFailedBlockingAfter !== undefined) {
    const ok = evalNow.metrics.failedBlocking <= exp.targetFailedBlockingAfter;
    checks.push({ metric: 'failedBlocking', target: exp.targetFailedBlockingAfter, actual: evalNow.metrics.failedBlocking, ok });
    met = met && ok;
  }
  if (exp.targetFrontierAfter !== undefined) {
    const ok = evalNow.metrics.frontier >= exp.targetFrontierAfter;
    checks.push({ metric: 'frontier', target: exp.targetFrontierAfter, actual: evalNow.metrics.frontier, ok });
    met = met && ok;
  }
  const verificationStatus = met ? wf.MUTATION_VERIFICATION.VERIFIED : wf.MUTATION_VERIFICATION.REGRESSED;
  return wf.completeWorkflowMutation(db, mutationId, { actualResult: { checks, metrics: evalNow.metrics }, verificationStatus });
}

/** Reverse a mutation's additive changes (supersede added tasks, restore edges). */
export function rollbackMutation(db, mutationId) {
  const mutation = store.getWorkflowMutation(db, mutationId);
  if (!mutation) return null;
  const rb = mutation.rollback ?? {};
  // Remove edges this mutation added.
  for (const e of rb.addedEdges ?? []) dag.removeDependency(db, mutation.missionId, e.from, e.to);
  // Supersede the tasks this mutation added (terminal; removed from the frontier).
  for (const id of rb.addedTaskIds ?? []) {
    const t = store.getTaskNode(db, id);
    if (t && t.state !== dag.TASK_STATE.SUPERSEDED) dag.supersedeTask(db, id, 'workflow mutation rolled back');
  }
  // Restore edges this mutation removed.
  for (const e of rb.removedEdges ?? []) dag.addDependency(db, mutation.missionId, e.from, e.to);
  return wf.completeWorkflowMutation(db, mutationId, { actualResult: mutation.actualResult ?? { rolledBack: true }, verificationStatus: wf.MUTATION_VERIFICATION.ROLLED_BACK });
}

/* ---------------- One-shot adapt convenience ---------------- */

/** OBSERVE→EVALUATE→PROPOSE→APPLY in one call. Returns { evaluation, mutation } (mutation null if none needed). */
export function adapt(db, missionId, { triggeringEvidence = [] } = {}) {
  const evaluation = evaluateStrategy(db, missionId);
  const proposal = proposeMutation(db, missionId, evaluation);
  if (!proposal) return { evaluation, mutation: null };
  const applied = applyMutation(db, missionId, proposal, { triggeringEvidence });
  return { evaluation, mutation: applied.mutation, applied };
}
