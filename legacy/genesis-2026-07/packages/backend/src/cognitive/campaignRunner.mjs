/**
 * Autonomous Campaign Runner (Phase 3A — ZEFIR).
 *
 * Closes the autonomy gap: instead of a script sequencing steps, this runner derives
 * the next action from the PERSISTED DAG + recovery.nextSafeAction and drives the
 * campaign itself. It executes the execution frontier, verifies results, runs
 * adversarial review, adapts the workflow on failure, enforces budgets + stop
 * conditions, checkpoints every iteration, and resumes from the next safe action
 * after interruption WITHOUT duplicating completed scientific work.
 *
 * The per-task `executor` is injected: tests pass a deterministic stub; the real
 * ZEFIR campaign passes an executor that drives real scientific engines. The runner
 * never fabricates results — an executor that returns FAILED/CAPABILITY_GAP is
 * recorded honestly and drives adaptation, not a faked success.
 */
import * as store from '../store.mjs';
import * as dag from './taskGraph.mjs';
import * as rec from './recovery.mjs';
import * as we from './workflowEngine.mjs';
import * as vb from './verificationBridge.mjs';

export const RUN_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED', PAUSED_BUDGET: 'PAUSED_BUDGET', PAUSED_APPROVAL: 'PAUSED_APPROVAL',
  INSUFFICIENT_INFO: 'INSUFFICIENT_INFO', FAILED: 'FAILED', MAX_ITERATIONS: 'MAX_ITERATIONS',
});

const DEFAULT_BUDGETS = { maxIterations: 100, wallClockMs: Infinity, computeMs: Infinity, perEngineMs: {} };

/**
 * Run a mission autonomously. Options:
 *   executor(db, task) -> { status:'COMPLETED'|'FAILED'|'CAPABILITY_GAP'|'BLOCKED_BY_RUNTIME',
 *                           evidenceId?, engine?, computeMs?, reason? }
 *   budgets, now() (injectable clock), approvalGate(task)->bool, adaptOnFailure (default true),
 *   capabilityResolver(engineCapId)->bool.
 */
export function runCampaign(db, missionId, {
  executor, budgets = {}, now = () => Date.now(), approvalGate = null,
  adaptOnFailure = true, capabilityResolver = () => true,
} = {}) {
  if (typeof executor !== 'function') throw new Error('executor function required');
  const B = { ...DEFAULT_BUDGETS, ...budgets, perEngineMs: { ...(budgets.perEngineMs ?? {}) } };
  const start = now();
  const spent = { iterations: 0, computeMs: 0, perEngineMs: {} };
  const trace = [];
  let status = null;

  while (spent.iterations < B.maxIterations) {
    // OBSERVE + reconcile interruptions; derive the next safe action from state.
    const recovery = rec.recoverMission(db, missionId);
    const action = recovery.nextSafeAction.action;

    // STOP conditions derived from state.
    if (action === rec.NEXT_ACTION.MISSION_COMPLETE) { status = RUN_STATUS.COMPLETED; break; }
    if (action === rec.NEXT_ACTION.MISSION_NOT_FOUND) { status = RUN_STATUS.FAILED; break; }

    // BUDGET checks (wall-clock, iteration).
    if (now() - start >= B.wallClockMs) { status = RUN_STATUS.PAUSED_BUDGET; break; }

    spent.iterations++;
    let step = { iteration: spent.iterations, action };

    if (action === rec.NEXT_ACTION.EXECUTE_TASK) {
      const task = store.getTaskNode(db, recovery.nextSafeAction.taskId);
      step.taskId = task.id; step.title = task.title;

      // HUMAN APPROVAL gate for tasks that require it (e.g. escalation / synthesis).
      // Leave the task READY so the campaign resumes here once approval is granted.
      if (task.spec?.requiresApproval && !(approvalGate && approvalGate(task))) {
        step.result = 'PAUSED_APPROVAL'; trace.push(step);
        status = RUN_STATUS.PAUSED_APPROVAL; break;
      }
      // CAPABILITY check.
      if (task.engine && !capabilityResolver(task.engine)) {
        dag.transition(db, task.id, 'BLOCKED', `capability unavailable: ${task.engine}`);
        step.result = 'CAPABILITY_GAP'; trace.push(step);
        // a blocked capability doesn't halt the whole campaign unless it blocks everything
        dag.checkpoint(db, missionId, `iter-${spent.iterations}`);
        if (dag.executionFrontier(db, missionId).length === 0) { status = RUN_STATUS.INSUFFICIENT_INFO; break; }
        continue;
      }
      // PER-ENGINE + COMPUTE budget pre-check (estimate).
      const est = Number(task.computeEstimate?.ms) || 0;
      const engineSpent = spent.perEngineMs[task.engine] ?? 0;
      const engineCap = B.perEngineMs[task.engine];
      if (engineCap != null && engineSpent + est > engineCap) {
        dag.transition(db, task.id, 'BLOCKED', `per-engine budget exhausted for ${task.engine}`);
        step.result = 'PAUSED_BUDGET'; trace.push(step); status = RUN_STATUS.PAUSED_BUDGET; break;
      }
      if (spent.computeMs + est > B.computeMs) {
        dag.transition(db, task.id, 'BLOCKED', 'compute budget exhausted');
        step.result = 'PAUSED_BUDGET'; trace.push(step); status = RUN_STATUS.PAUSED_BUDGET; break;
      }

      // EXECUTE.
      dag.transition(db, task.id, 'RUNNING');
      const out = executor(db, task) ?? { status: 'FAILED', reason: 'executor returned nothing' };
      const computeMs = Number(out.computeMs) || est;
      spent.computeMs += computeMs;
      spent.perEngineMs[task.engine] = engineSpent + computeMs;

      if (out.status === 'COMPLETED') {
        dag.transition(db, task.id, 'COMPLETED', 'executed', { result: out.result ?? null, computeActual: { durationMs: computeMs }, resultEvidenceId: out.evidenceId ?? null });
        // VERIFY produced evidence if it is replay-backed.
        if (out.evidenceId) { const v = vb.verifyEvidence(db, out.evidenceId); step.verify = v.verdict; }
        step.result = 'COMPLETED';
      } else if (out.status === 'CAPABILITY_GAP' || out.status === 'BLOCKED_BY_RUNTIME' || out.status === 'BLOCKED_BY_RESOURCES') {
        dag.transition(db, task.id, 'BLOCKED', out.reason ?? out.status);
        step.result = out.status;
      } else {
        dag.transition(db, task.id, 'FAILED', out.reason ?? 'execution failed');
        step.result = 'FAILED';
        if (adaptOnFailure) { const a = we.adapt(db, missionId); step.adapted = Boolean(a.mutation); }
      }
    } else if (action === rec.NEXT_ACTION.VERIFY_EVIDENCE) {
      const v = vb.verifyEvidence(db, recovery.nextSafeAction.evidenceId);
      step.result = 'VERIFIED'; step.verify = v.verdict;
    } else if (action === rec.NEXT_ACTION.RESOLVE_MUTATION) {
      we.verifyMutation(db, recovery.nextSafeAction.mutationId);
      step.result = 'MUTATION_RESOLVED';
    } else if (action === rec.NEXT_ACTION.ADAPT_WORKFLOW) {
      const a = we.adapt(db, missionId);
      step.result = 'ADAPTED'; step.adapted = Boolean(a.mutation);
      if (!a.mutation) { status = RUN_STATUS.FAILED; trace.push(step); break; } // cannot adapt → real failure
    } else if (action === rec.NEXT_ACTION.GATHER_MORE_EVIDENCE) {
      step.result = 'INSUFFICIENT_INFO'; trace.push(step); status = RUN_STATUS.INSUFFICIENT_INFO; break;
    }

    trace.push(step);
    dag.checkpoint(db, missionId, `iter-${spent.iterations}`);
  }
  if (!status) status = RUN_STATUS.MAX_ITERATIONS;

  return {
    status, iterations: spent.iterations, computeMs: spent.computeMs, perEngineMs: spent.perEngineMs,
    wallClockMs: now() - start, trace,
    finalFrontier: dag.executionFrontier(db, missionId).map((t) => t.id),
  };
}
