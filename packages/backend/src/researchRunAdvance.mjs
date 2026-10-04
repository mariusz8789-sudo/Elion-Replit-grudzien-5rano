import { canonicalJson, fnv1a } from './determinism.mjs';
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { getResearchRun, inWriteTransaction, MAX_HYPOTHESES, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';

/**
 * The next justified experiment as a mechanism, not only a suggestion. After a result the run's fixed rule has
 * already recorded a NEXT_EXPERIMENT proposal (with its decision trace) in the verified chain. advance() executes
 * exactly that recorded choice, never one the caller names, links the new experiment to the one that justified it
 * (EXPERIMENT_CONTINUED), and stops the moment the rule hands the run to a person, an execution fails, or the step
 * budget is spent. The criteria of every step are frozen by the ordinary ResearchRun path, so advance can never
 * change what counts as success; it only decides which already-planned hypothesis is tested next.
 */
export const MAX_ADVANCE_STEPS = MAX_HYPOTHESES;
export const ADVANCE_STOP = Object.freeze({
  BUDGET: 'STEP_BUDGET_REACHED', HUMAN_REVIEW: 'AWAITING_HUMAN_REVIEW', FAILED: 'EXECUTION_FAILED', NOT_ADVANCEABLE: 'NOT_ADVANCEABLE', INTEGRITY: 'STATE_INTEGRITY_FAILURE',
});

export function justifiedNextOf(view) {
  if (!view.researchState.chain.ok) return { ok: false, stop: ADVANCE_STOP.INTEGRITY };
  if (view.run.status !== 'RUNNING' || !view.plan) return { ok: false, stop: ADVANCE_STOP.NOT_ADVANCEABLE, reason: view.run.status };
  if (view.experiments.some((e) => e.conflicts?.length)) return { ok: false, stop: ADVANCE_STOP.INTEGRITY, reason: 'STEP_RECORDED_TWICE' };
  if (view.experiments.some((e) => !e.next)) return { ok: false, stop: ADVANCE_STOP.NOT_ADVANCEABLE, reason: view.nextStep };
  const last = view.experiments.at(-1);
  if (!last) return { ok: true, first: true };
  const proposal = last.next.proposal;
  if (proposal?.action !== 'EXECUTE_NEXT_HYPOTHESIS') return { ok: false, stop: ADVANCE_STOP.HUMAN_REVIEW, reason: proposal?.reason ?? null };
  if (view.experiments.some((e) => e.frozen.hypothesisId === proposal.hypothesisId)) return { ok: false, stop: ADVANCE_STOP.NOT_ADVANCEABLE, reason: 'PROPOSED_HYPOTHESIS_ALREADY_EXECUTED' };
  return { ok: true, from: last, proposal, proposalFingerprint: fnv1a(canonicalJson(proposal)), decisionId: last.next.decisionTrace?.decisionId ?? null };
}

/**
 * Links an executed experiment to the one whose recorded proposal justified it (EXPERIMENT_CONTINUED), from the chain
 * alone. Idempotent. An experiment the proposal did not name (a plain run, steering) is left unlinked.
 */
export function recordContinuation(db, projectId, runId, experimentId, { userId = null } = {}) {
  return inWriteTransaction(db, () => {
    const view = getResearchRun(db, projectId, runId);
    const index = view?.experiments.findIndex((e) => e.experimentId === experimentId) ?? -1;
    if (index <= 0) return { ok: true, linked: false };
    const current = view.experiments[index];
    const from = view.experiments[index - 1];
    const proposal = from.next?.proposal;
    if (current.continuedFrom || proposal?.action !== 'EXECUTE_NEXT_HYPOTHESIS' || proposal.hypothesisId !== current.frozen.hypothesisId) return { ok: true, linked: false };
    const appended = appendServerResearchStateEvent(db, runId, 'EXPERIMENT_CONTINUED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: runId, experimentId,
      fromExperimentId: from.experimentId, hypothesisId: proposal.hypothesisId, reason: proposal.reason,
      proposalFingerprint: fnv1a(canonicalJson(proposal)), decisionId: from.next.decisionTrace?.decisionId ?? null, decidedBy: 'GENESIS_FIXED_RULE', actor: { kind: 'USER', userId },
    });
    if (!appended.ok) throw new Error(`advance_state:${appended.error}`);
    return { ok: true, linked: true };
  });
}

/** Runs up to maxSteps justified experiments. `afterStep(runId)` lets the caller store artifacts between steps. */
export async function advanceResearchRun(db, projectId, runId, { maxSteps = 1, userId = null, afterStep = null, execOptions = {} } = {}) {
  const budget = Math.min(MAX_ADVANCE_STEPS, Math.max(1, Number.isInteger(maxSteps) ? maxSteps : 1));
  const first = getResearchRun(db, projectId, runId);
  if (!first) return { ok: false, status: 'NOT_FOUND' };
  const steps = [];
  let stop = ADVANCE_STOP.BUDGET;
  let stopReason = null;
  for (let i = 0; i < budget; i += 1) {
    const view = getResearchRun(db, projectId, runId);
    const next = justifiedNextOf(view);
    if (!next.ok) { stop = next.stop; stopReason = next.reason ?? null; break; }
    const result = executeResearchExperiment(db, projectId, runId, { ...execOptions, userId, hypothesisId: next.first ? null : next.proposal.hypothesisId });
    if (!result.ok) { stop = ADVANCE_STOP.FAILED; stopReason = result.reason ?? result.status; steps.push({ ok: false, status: result.status, reason: result.reason ?? null }); break; }
    if (afterStep) await afterStep(runId);
    const done = getResearchRun(db, projectId, runId).experiments.find((e) => e.experimentId === result.experimentId);
    if (!next.first) recordContinuation(db, projectId, runId, result.experimentId, { userId });
    steps.push({
      ok: true, experimentId: result.experimentId, hypothesisId: done?.frozen?.hypothesisId ?? null, verdict: done?.falsification?.verdict ?? null,
      selectedBy: next.first ? 'FIRST_EXECUTABLE_HYPOTHESIS_IN_PLAN' : next.proposal.reason, justifiedBy: next.first ? null : { experimentId: next.from.experimentId, proposalFingerprint: next.proposalFingerprint },
    });
  }
  if (stop === ADVANCE_STOP.BUDGET) {
    const after = justifiedNextOf(getResearchRun(db, projectId, runId));
    if (!after.ok) { stop = after.stop; stopReason = after.reason ?? null; }
  }
  return { ok: true, status: stop, reason: stopReason, steps, researchRun: getResearchRun(db, projectId, runId) };
}
