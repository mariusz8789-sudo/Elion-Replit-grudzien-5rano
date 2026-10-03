import { canonicalJson, fnv1a, sha256Hex } from './determinism.mjs';
import { AGENT_RUN_STATUS, appendServerResearchStateEvent, createAgentRun, listAgentRuns, updateAgentRunStatus } from './agentRun.mjs';
import { controlResearchRun, getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION, RESEARCH_RUN_DOMAIN } from './researchRun.mjs';
import { createResearchRunWorker, enqueueResearchExperiment, jobBackendFor, queueFor } from './researchRunJobs.mjs';

/**
 * Bounded fan-out: one parent ResearchRun spawns child ResearchRuns, one per plan hypothesis. A child is a
 * complete ResearchRun of its own (own chain, own frozen prediction, own evidence, own artifact) and its work
 * is an ordinary job on the same durable queue, so nothing here executes science. The parent only records
 * who it spawned (FANOUT_SPAWNED) and what came back (FANOUT_RECONCILED); it never merges child verdicts
 * into one claim. Lineage lives in the child run's budget and in its job payload.
 */
export const MAX_FANOUT_CHILDREN = 6;
export const MAX_CHILD_GENERATIONS = 3;
export const FANOUT_TIMEOUT_MS = Object.freeze({ min: 1_000, max: 300_000, default: 60_000 });
const CHILD_STATE = Object.freeze({ COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED', PENDING: 'PENDING', NOT_QUEUED: 'NOT_QUEUED' });
const SETTLED = new Set([CHILD_STATE.COMPLETED, CHILD_STATE.FAILED, CHILD_STATE.CANCELLED]);

const childrenOf = (db, projectId, parentId) => listAgentRuns(db, projectId)
  .filter((r) => r.domain === RESEARCH_RUN_DOMAIN && r.budget?.lineage?.parentRunId === parentId)
  .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));

function latestJobOf(db, childRunId) {
  const row = db.prepare('SELECT id FROM jobs WHERE research_run_id = ? AND idempotency_key IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1').get(childRunId);
  return row ? jobBackendFor(db).get(row.id) : null;
}
const generationCount = (db, childRunId) => db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE research_run_id = ? AND idempotency_key IS NOT NULL').get(childRunId).n;

const clampTimeout = (ms) => Math.min(FANOUT_TIMEOUT_MS.max, Math.max(FANOUT_TIMEOUT_MS.min, Number.isFinite(ms) ? Math.trunc(ms) : FANOUT_TIMEOUT_MS.default));

function createChild(db, projectId, parent, hypothesis, userId, at) {
  const lineage = { parentRunId: parent.researchRunId, hypothesisId: hypothesis.hypothesisId };
  const run = createAgentRun(db, {
    projectId, goal: hypothesis.claim, domain: RESEARCH_RUN_DOMAIN, createdBy: userId,
    budget: { contractVersion: RESEARCH_RUN_CONTRACT_VERSION, dedupeKey: `fanout-${fnv1a(canonicalJson(lineage))}`, lineage },
  });
  const fixed = { contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: run.id };
  const problem = appendServerResearchStateEvent(db, run.id, 'PROBLEM_FORMALIZED', {
    ...fixed, projectId, question: hypothesis.claim, problemId: `fanout-${fnv1a(canonicalJson(lineage))}`,
    problemFingerprint: fnv1a(canonicalJson({ question: hypothesis.claim })),
    origin: { kind: 'FANOUT_CHILD', parentRunId: parent.researchRunId, hypothesisId: hypothesis.hypothesisId, userId },
  }, at);
  const generatedBy = { kind: 'FANOUT_PARENT_PLAN', parentRunId: parent.researchRunId, parentPlanFingerprint: fnv1a(canonicalJson(parent.plan.hypotheses)) };
  const plan = appendServerResearchStateEvent(db, run.id, 'HYPOTHESES_GENERATED', {
    ...fixed, question: hypothesis.claim, subProblems: [], hypotheses: [{ ...hypothesis, researchRunId: run.id, lineage }], nextActions: [], rejected: [],
    generatedBy, status: 'PROPOSED', epistemicStatus: 'NOT_EVIDENCE',
  }, at);
  if (!problem.ok || !plan.ok) throw new Error(`fanout_child_state:${problem.error ?? plan.error}`);
  return run;
}

/** Starts the missing jobs of a parent's children (a child that already has a job is never enqueued again here). */
async function ensureJobs(db, projectId, parentId, children, { userId, timeoutMs }) {
  const jobs = [];
  for (const child of children) {
    if (['CANCELLED', 'FAILED'].includes(child.status)) continue;
    if (latestJobOf(db, child.id)) continue;
    const queued = await enqueueResearchExperiment(db, projectId, child.id, {
      hypothesisId: child.budget.lineage.hypothesisId, userId, timeoutMs,
      lineage: { parentRunId: parentId, childRunId: child.id, hypothesisId: child.budget.lineage.hypothesisId },
    });
    jobs.push({ childRunId: child.id, ok: queued.ok, status: queued.status ?? null, jobId: queued.job?.jobId ?? null });
  }
  return jobs;
}

/**
 * Spawns (or resumes) the fan-out. Idempotent: a hypothesis that already has a child never gets a second one,
 * and a second call with nothing new neither writes an event nor enqueues anything.
 */
export async function spawnChildRuns(db, projectId, parentId, { hypothesisIds = null, userId = null, timeoutMs = FANOUT_TIMEOUT_MS.default } = {}) {
  const parent = getResearchRun(db, projectId, parentId);
  if (!parent) return { ok: false, status: 'NOT_FOUND' };
  if (!parent.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  if (!parent.plan) return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: 'PLAN_NOT_AVAILABLE' };
  if (parent.run.status !== AGENT_RUN_STATUS.RUNNING) return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: parent.run.status };
  if (parent.run.budget?.lineage) return { ok: false, status: 'FANOUT_NOT_NESTABLE', reason: 'A child run cannot spawn children.' };
  const wanted = hypothesisIds === null ? parent.plan.hypotheses.map((h) => h.hypothesisId) : hypothesisIds;
  if (!Array.isArray(wanted) || wanted.some((id) => typeof id !== 'string') || new Set(wanted).size !== wanted.length) return { ok: false, status: 'INVALID_FANOUT_REQUEST' };
  const unknown = wanted.filter((id) => !parent.plan.hypotheses.some((h) => h.hypothesisId === id));
  if (unknown.length) return { ok: false, status: 'HYPOTHESIS_NOT_FOUND', reason: unknown[0] };
  const timeout = clampTimeout(timeoutMs);

  const created = inWriteTransaction(db, () => {
    const existing = childrenOf(db, projectId, parentId);
    const known = new Set(existing.map((c) => c.budget.lineage.hypothesisId));
    if (known.size + wanted.filter((id) => !known.has(id)).length > MAX_FANOUT_CHILDREN) return { ok: false, status: 'FANOUT_LIMIT_EXCEEDED', limit: MAX_FANOUT_CHILDREN };
    const at = new Date().toISOString();
    const fresh = wanted.filter((id) => !known.has(id)).map((id) => createChild(db, projectId, parent, parent.plan.hypotheses.find((h) => h.hypothesisId === id), userId, at));
    if (fresh.length) {
      const appended = appendServerResearchStateEvent(db, parentId, 'FANOUT_SPAWNED', {
        contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: parentId, limit: MAX_FANOUT_CHILDREN, timeoutMs: timeout,
        children: fresh.map((c) => ({ childRunId: c.id, hypothesisId: c.budget.lineage.hypothesisId })), actor: { kind: 'USER', userId },
      }, at);
      if (!appended.ok) throw new Error(`fanout_parent_state:${appended.error}`);
    }
    return { ok: true, fresh: fresh.length };
  });
  if (!created.ok) return created;
  const children = childrenOf(db, projectId, parentId).filter((c) => wanted.includes(c.budget.lineage.hypothesisId));
  const jobs = await ensureJobs(db, projectId, parentId, children, { userId, timeoutMs: timeout });
  if (jobs.some((j) => !j.ok)) return { ok: false, status: 'ENQUEUE_FAILED', jobs };
  return { ok: true, status: created.fresh ? 'SPAWNED' : 'ALREADY_SPAWNED', deduped: !created.fresh, fanOut: reconcileFanOut(db, projectId, parentId).fanOut };
}

function describeChild(db, projectId, child) {
  const job = latestJobOf(db, child.id);
  const view = getResearchRun(db, projectId, child.id);
  const x = view?.experiments?.find((e) => e.next) ?? null;
  let state;
  if (x) state = CHILD_STATE.COMPLETED; // finished science is never undone by a later cancel
  else if (!job) state = child.status === AGENT_RUN_STATUS.CANCELLED ? CHILD_STATE.CANCELLED : CHILD_STATE.NOT_QUEUED;
  else if (job.state === 'CANCELLED' || child.status === AGENT_RUN_STATUS.CANCELLED) state = CHILD_STATE.CANCELLED;
  else if (['DEAD_LETTER', 'FAILED'].includes(job.state)) state = CHILD_STATE.FAILED;
  else if (job.state === 'SUCCEEDED') state = CHILD_STATE.COMPLETED;
  else state = CHILD_STATE.PENDING;
  const entry = {
    childRunId: child.id, hypothesisId: child.budget.lineage.hypothesisId, state,
    jobId: job?.jobId ?? null, jobState: job?.state ?? null, attempts: generationCount(db, child.id),
  };
  if (state === CHILD_STATE.COMPLETED && x) {
    Object.assign(entry, {
      experimentId: x.experimentId, verdict: x.falsification?.verdict ?? null, predictionFingerprint: x.frozen?.predictionFingerprint ?? null,
      outputHash: x.execution?.outputHash ?? null, evidenceContentHash: x.evidence?.evidenceContentHash ?? null,
      replayVerdict: x.next?.replay?.verdict ?? null,
    });
  }
  if (state === CHILD_STATE.FAILED) entry.failureCode = job?.failure?.code ?? job?.failure?.status ?? 'UNKNOWN';
  if (state === CHILD_STATE.CANCELLED) entry.cancelReason = job?.cancelReason ?? child.status;
  return entry;
}

const countBy = (items, key) => items.reduce((acc, item) => ({ ...acc, [item[key] ?? 'NONE']: (acc[item[key] ?? 'NONE'] ?? 0) + 1 }), {});

/**
 * Reads every child and, once all of them are settled (completed, failed or cancelled), records the outcome in
 * the parent's chain. The same outcome is never recorded twice; a retry that changes a child records a new revision.
 * Child verdicts stay per child: the parent states how many were completed, failed or cancelled and never
 * invents a combined scientific verdict.
 */
export function reconcileFanOut(db, projectId, parentId) {
  const parent = getResearchRun(db, projectId, parentId);
  if (!parent) return { ok: false, status: 'NOT_FOUND' };
  const children = childrenOf(db, projectId, parentId).map((c) => describeChild(db, projectId, c));
  const settled = children.length > 0 && children.every((c) => SETTLED.has(c.state));
  const outcome = {
    state: !children.length ? 'EMPTY' : !settled ? 'IN_PROGRESS' : children.every((c) => c.state === CHILD_STATE.COMPLETED) ? 'ALL_COMPLETED' : children.some((c) => c.state === CHILD_STATE.COMPLETED) ? 'PARTIAL' : 'NONE_COMPLETED',
    counts: countBy(children, 'state'), verdicts: countBy(children.filter((c) => c.state === CHILD_STATE.COMPLETED), 'verdict'),
  };
  const fanOut = { parentRunId: parentId, outcome, children };
  if (!settled) return { ok: true, status: 'IN_PROGRESS', recorded: false, fanOut };
  const fingerprint = sha256Hex(canonicalJson({ parentRunId: parentId, children }));
  const recorded = inWriteTransaction(db, () => {
    const previous = readLast(db, parentId);
    if (previous?.fingerprint === fingerprint) return { ok: true, recorded: false, revision: previous.revision };
    const revision = (previous?.revision ?? 0) + 1;
    const appended = appendServerResearchStateEvent(db, parentId, 'FANOUT_RECONCILED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: parentId, revision, fingerprint, outcome, children,
      scope: 'Per-child results only. Genesis never combines child verdicts into one scientific claim.',
    });
    return appended.ok ? { ok: true, recorded: true, revision } : { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
  });
  if (!recorded.ok) return recorded;
  return { ok: true, status: outcome.state, recorded: recorded.recorded, revision: recorded.revision, fanOut: { ...fanOut, fingerprint, revision: recorded.revision } };
}

function readLast(db, parentId) {
  const rows = db.prepare("SELECT observation_json FROM agent_run_steps WHERE tool_invoked = 'mind.researchState' AND agent_run_id = ? AND capability = 'FANOUT_RECONCILED' ORDER BY step_index DESC LIMIT 1").all(parentId);
  const event = rows[0] ? JSON.parse(rows[0].observation_json) : null;
  return event ? event.payload : null;
}

/** Re-runs one failed or cancelled child under a new job generation, bounded by MAX_CHILD_GENERATIONS. */
export async function retryChild(db, projectId, parentId, childRunId, { userId = null, timeoutMs = FANOUT_TIMEOUT_MS.default } = {}) {
  const parent = getResearchRun(db, projectId, parentId);
  if (!parent) return { ok: false, status: 'NOT_FOUND' };
  if (parent.run.status !== AGENT_RUN_STATUS.RUNNING) return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: parent.run.status };
  const child = childrenOf(db, projectId, parentId).find((c) => c.id === childRunId);
  if (!child) return { ok: false, status: 'NOT_FOUND' };
  const current = describeChild(db, projectId, child);
  if (![CHILD_STATE.FAILED, CHILD_STATE.CANCELLED].includes(current.state)) return { ok: false, status: 'CHILD_NOT_RETRYABLE', reason: current.state };
  if (current.attempts >= MAX_CHILD_GENERATIONS) return { ok: false, status: 'RETRY_LIMIT_REACHED', limit: MAX_CHILD_GENERATIONS };
  if (child.status === AGENT_RUN_STATUS.CANCELLED) {
    // A cancelled child is reopened through the chain, never by editing its status silently.
    const reopened = inWriteTransaction(db, () => {
      const appended = appendServerResearchStateEvent(db, child.id, 'RUN_CONTROLLED', {
        contractVersion: RESEARCH_RUN_CONTRACT_VERSION, researchRunId: child.id, action: 'RESUME', fromStatus: AGENT_RUN_STATUS.CANCELLED,
        toStatus: AGENT_RUN_STATUS.RUNNING, reason: 'FANOUT_RETRY', actor: { kind: 'USER', userId },
      });
      if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
      updateAgentRunStatus(db, child.id, AGENT_RUN_STATUS.RUNNING);
      return { ok: true };
    });
    if (!reopened.ok) return reopened;
  }
  const queued = await enqueueResearchExperiment(db, projectId, child.id, {
    hypothesisId: child.budget.lineage.hypothesisId, userId, timeoutMs: clampTimeout(timeoutMs),
    lineage: { parentRunId: parentId, childRunId: child.id, hypothesisId: child.budget.lineage.hypothesisId },
  });
  if (!queued.ok) return { ok: false, status: queued.status, reason: queued.reason ?? null };
  return { ok: true, status: 'RETRY_QUEUED', job: queued.job, fanOut: reconcileFanOut(db, projectId, parentId).fanOut };
}

/** Cancels the parent and propagates to every child that has not finished; finished children keep their results. */
export async function cancelFanOut(db, projectId, parentId, { userId = null, reason = 'PARENT_CANCELLED' } = {}) {
  const parent = getResearchRun(db, projectId, parentId);
  if (!parent) return { ok: false, status: 'NOT_FOUND' };
  if ([AGENT_RUN_STATUS.RUNNING, AGENT_RUN_STATUS.PAUSED].includes(parent.run.status)) {
    const cancelled = controlResearchRun(db, projectId, parentId, 'CANCEL', { userId, reason });
    if (!cancelled.ok) return cancelled;
  }
  const propagated = [];
  for (const child of childrenOf(db, projectId, parentId)) {
    const before = describeChild(db, projectId, child);
    if (before.state === CHILD_STATE.COMPLETED) { propagated.push({ childRunId: child.id, action: 'KEPT_COMPLETED' }); continue; }
    const job = latestJobOf(db, child.id);
    if (job && ['QUEUED', 'CLAIMED'].includes(job.state)) await queueFor(db).cancel(job.jobId, `PARENT_CANCELLED:${reason}`);
    if ([AGENT_RUN_STATUS.RUNNING, AGENT_RUN_STATUS.PAUSED].includes(child.status)) controlResearchRun(db, projectId, child.id, 'CANCEL', { userId, reason: `PARENT_CANCELLED:${reason}` });
    propagated.push({ childRunId: child.id, action: 'CANCELLED' });
  }
  return { ok: true, status: 'CANCELLED', propagated, fanOut: reconcileFanOut(db, projectId, parentId).fanOut, researchRun: getResearchRun(db, projectId, parentId) };
}

export function readFanOut(db, projectId, parentId) {
  return reconcileFanOut(db, projectId, parentId);
}

/**
 * The ordinary ResearchRun worker plus one duty: after a job that belongs to a fan-out finishes (any outcome),
 * the parent is reconciled. The parent is also reconciled on every read, so a crash between the two loses nothing.
 */
export function createFanOutAwareWorker(db, options = {}) {
  const worker = createResearchRunWorker(db, options);
  return Object.freeze({
    ...worker,
    async runOnce() {
      const outcome = await worker.runOnce();
      const lineage = outcome?.job?.payload?.lineage;
      if (lineage?.parentRunId && outcome.job.payload.projectId) reconcileFanOut(db, outcome.job.payload.projectId, lineage.parentRunId);
      return outcome;
    },
  });
}

export const hasFanOutChildren = (db, projectId, parentId) => childrenOf(db, projectId, parentId).length > 0;
