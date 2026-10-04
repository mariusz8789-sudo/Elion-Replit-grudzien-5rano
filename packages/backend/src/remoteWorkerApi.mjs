import { createHash, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './determinism.mjs';
import { ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { RESEARCH_RUN_EXECUTORS } from './researchRunEngines.mjs';
import { recoverMissingArtifacts } from './researchRunArtifacts.mjs';
import { getResearchRun } from './researchRun.mjs';
import { ADVANCE_STOP, justifiedNextOf, recordContinuation } from './researchRunAdvance.mjs';
import { reconcileFanOut } from './researchRunFanOut.mjs';
import { jobBackendFor, queueFor } from './researchRunJobs.mjs';
import { REMOTE_OUTCOME_KIND, RESEARCH_ADVANCE_REMOTE_CAPABILITY, RESEARCH_REMOTE_CAPABILITY, WORKER_API_PREFIX } from './remoteWorkerProtocol.mjs';

/**
 * Server side of the remote ResearchRun worker (pull model). A worker is a SEPARATE process or service that has
 * no access to the database: it claims jobs from the durable lease queue through this HTTP API, runs the engine
 * where it lives, sends the outcome back as a content-addressed artifact and asks the server to complete the job.
 * Three kinds of job travel this way and all of them use the same lease, the same freeze-before-engine rule and
 * the same server-side apply: a single experiment, an advance (several justified experiments under ONE lease) and
 * a fan-out child (an ordinary experiment job of a child run).
 *
 * What stays on the server, on purpose: freezing the prediction (before any engine runs), the verdict, the seal,
 * the hash-chained run state, the Evidence proposal and the replay. The worker only supplies the engine result.
 * The server never trusts a completion by its words: the result is read from the stored artifact, whose bytes
 * must hash to the digest the worker named, and which must name this job, this worker, this frozen input.
 *
 * Auth is one shared bearer token (GENESIS_WORKER_TOKEN). The worker-reported engine status and environment are
 * therefore only as trustworthy as that token and the worker host; the record says where it ran (executedOn).
 */
export { REMOTE_OUTCOME_KIND, WORKER_API_PREFIX };
export const REMOTE_ARTIFACT_PRODUCER = 'genesis-remote-worker';
export const REMOTE_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REMOTE_CAPABILITY_SET = new Set([RESEARCH_REMOTE_CAPABILITY, RESEARCH_ADVANCE_REMOTE_CAPABILITY]);
const isAdvance = (job) => job.capabilityId === RESEARCH_ADVANCE_REMOTE_CAPABILITY;
const safeId = (value) => String(value).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
const reply = (status, body) => ({ status, body });
const fail = (status, error, extra = {}) => reply(status, { error, ...extra });

const digest = (value) => createHash('sha256').update(String(value)).digest();
export function workerTokenMatches(expected, presented) {
  if (typeof expected !== 'string' || expected.length < 16 || typeof presented !== 'string') return false;
  return timingSafeEqual(digest(expected), digest(presented));
}

/** The address an artifact has in the content-addressed store; derived, never taken from the caller. */
const artifactKeyOf = (sha256) => `sha256/${sha256.slice(0, 2)}/${sha256}`;

/* ---------------- who is out there (in memory, since this server started) ---------------- */

const SEEN_LIMIT = 200;
const seenWorkers = new Map();
const touchWorker = (workerId, extra = {}) => {
  const previous = seenWorkers.get(workerId) ?? {};
  seenWorkers.delete(workerId);
  seenWorkers.set(workerId, { ...previous, ...extra, workerId, lastSeenAt: Date.now() });
  if (seenWorkers.size > SEEN_LIMIT) seenWorkers.delete(seenWorkers.keys().next().value);
};
/** Test hook: forget every worker (the registry is process-wide). */
export const forgetRemoteWorkers = () => seenWorkers.clear();
const IDLE_WINDOW_MS = 60_000;

/**
 * Remote workers as the server knows them: every worker with a lease on a job of this project (from the durable
 * queue) plus workers that contacted this server since it started (memory only: an idle worker is only listed
 * while it keeps polling). Engine names stay under technicalDetails.
 */
export function listRemoteWorkers(db, projectId, { now = Date.now() } = {}) {
  const claimed = db.prepare(`SELECT * FROM jobs WHERE idempotency_key IS NOT NULL AND status = 'CLAIMED' AND capability_id IN (?, ?)`)
    .all(...REMOTE_CAPABILITY_SET)
    .map((row) => ({ row, payload: JSON.parse(row.params_json ?? '{}') }))
    .filter(({ payload }) => payload.projectId === projectId);
  const queued = db.prepare(`SELECT params_json FROM jobs WHERE idempotency_key IS NOT NULL AND status = 'QUEUED' AND capability_id IN (?, ?)`)
    .all(...REMOTE_CAPABILITY_SET).filter((r) => JSON.parse(r.params_json ?? '{}').projectId === projectId).length;
  const byWorker = new Map();
  for (const { row, payload } of claimed) {
    const lease = {
      jobId: row.id, researchRunId: row.research_run_id, kind: row.capability_id === RESEARCH_ADVANCE_REMOTE_CAPABILITY ? 'ADVANCE' : 'EXPERIMENT',
      fanOutParentRunId: payload.lineage?.parentRunId ?? null, attempt: row.attempts, maxAttempts: row.max_attempts,
      lastHeartbeatAt: new Date(row.updated_at).toISOString(), leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
      leaseState: row.lease_expires_at > now ? 'ACTIVE' : 'EXPIRED',
    };
    byWorker.set(row.worker_id, [...(byWorker.get(row.worker_id) ?? []), lease]);
  }
  const ids = new Set([...byWorker.keys(), ...seenWorkers.keys()]);
  const workers = [...ids].map((workerId) => {
    const leases = byWorker.get(workerId) ?? [];
    const seen = seenWorkers.get(workerId) ?? null;
    const lastSeenAt = Math.max(seen?.lastSeenAt ?? 0, ...leases.map((l) => Date.parse(l.lastHeartbeatAt)));
    const state = leases.some((l) => l.leaseState === 'ACTIVE') ? 'BUSY' : leases.length ? 'LEASE_EXPIRED' : now - lastSeenAt <= IDLE_WINDOW_MS ? 'IDLE' : 'SILENT';
    return { workerId, state, lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null, leases, technicalDetails: { engines: seen?.engines ?? null } };
  }).sort((a, b) => (a.workerId < b.workerId ? -1 : 1));
  return {
    workers, queuedRemoteJobs: queued,
    scope: 'Leases come from the durable queue. Workers without a lease are listed only while they keep contacting this server (memory since the last server start).',
  };
}

/* ---------------- shared helpers ---------------- */

function activeLease(db, jobId, leaseId) {
  const job = jobBackendFor(db).get(jobId);
  if (!job || !REMOTE_CAPABILITY_SET.has(job.capabilityId)) return null;
  if (job.state !== 'CLAIMED' || typeof leaseId !== 'string' || job.leaseId !== leaseId) return null;
  return job;
}

const remoteTools = (engines) => {
  const advertised = new Set(engines);
  return {
    executors: RESEARCH_RUN_EXECUTORS,
    engineStatus: (engineId) => (advertised.has(engineId)
      ? { available: true }
      : { available: false, reason: `WORKER_LACKS_ENGINE: ${engineId}` }),
  };
};

/** A fan-out child that settled (or was released) may complete the parent's picture: reconcile it, like the local worker does. */
function reconcileParent(db, job) {
  const parentRunId = job.payload?.lineage?.parentRunId;
  if (parentRunId && job.payload?.projectId) reconcileFanOut(db, job.payload.projectId, parentRunId);
}

const failureOf = (prepared) => {
  if (prepared.status === 'RUN_NOT_EXECUTABLE') return { code: 'RUN_NOT_RUNNING', status: ENGINE_EXECUTION_STATUS.CANCELLED, retryable: false };
  // A worker without the engine releases the job for another worker; any other refusal is permanent.
  const lacksEngine = prepared.status === 'BLOCKED' && String(prepared.reason ?? '').startsWith('WORKER_LACKS_ENGINE');
  return {
    code: prepared.reason ?? prepared.status,
    status: prepared.status === 'BLOCKED' ? ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME : ENGINE_EXECUTION_STATUS.FAILED,
    retryable: lacksEngine,
  };
};

/**
 * The next piece of work of a job, decided from the chain alone, and the freeze that must precede the engine.
 * { kind: 'WORK', prepared } — a frozen experiment waits for an engine;
 * { kind: 'DONE', ... } — nothing is left (the experiment is applied, or the advance reached its stop);
 * { kind: 'FAIL', failure } — the job cannot go on.
 * A retry after a killed worker lands here again and finds the same frozen experiment: it is resumed, never re-frozen.
 */
function prepareStep(db, job, engines) {
  const { projectId, hypothesisId = null, userId = null } = job.payload ?? {};
  const tools = remoteTools(engines);
  const run = (id) => executeResearchExperiment(db, projectId, job.researchRunId, { hypothesisId: id, userId, tools, stopAfterFreeze: true });
  if (!isAdvance(job)) {
    const prepared = run(hypothesisId);
    if (!prepared.ok) return { kind: 'FAIL', failure: failureOf(prepared) };
    return prepared.status === 'FROZEN' ? { kind: 'WORK', prepared } : { kind: 'DONE', status: prepared.status, experimentId: prepared.experimentId, deduped: true };
  }
  for (let guard = 0; guard < 20; guard += 1) {
    const state = advanceStateOf(db, job);
    if (state.kind !== 'NEXT') return state;
    const prepared = run(state.hypothesisId);
    if (!prepared.ok) return { kind: 'FAIL', failure: failureOf(prepared) };
    if (prepared.status === 'FROZEN') return { kind: 'WORK', prepared };
    // An experiment that already had its result is finished by the call above; link it and look at the next step.
    recordContinuation(db, projectId, job.researchRunId, prepared.experimentId, { userId });
  }
  return { kind: 'FAIL', failure: { code: 'ADVANCE_LOOP_GUARD', status: ENGINE_EXECUTION_STATUS.FAILED, retryable: false } };
}

/** Where an advance stands, from the chain alone and without freezing anything: NEXT (resume or start one), DONE, or FAIL. */
function advanceStateOf(db, job) {
  const view = getResearchRun(db, job.payload.projectId, job.researchRunId);
  if (!view) return { kind: 'FAIL', failure: { code: 'NOT_FOUND', status: ENGINE_EXECUTION_STATUS.FAILED, retryable: false } };
  if (view.run.status !== 'RUNNING') return { kind: 'FAIL', failure: { code: 'RUN_NOT_RUNNING', status: ENGINE_EXECUTION_STATUS.CANCELLED, retryable: false } };
  const open = view.experiments.find((e) => !e.next);
  if (open) return { kind: 'NEXT', hypothesisId: open.frozen.hypothesisId, resumed: true };
  if (view.experiments.filter((e) => e.next).length >= (job.payload.until ?? 0)) return { kind: 'DONE', status: ADVANCE_STOP.BUDGET };
  const next = justifiedNextOf(view);
  if (!next.ok) return { kind: 'DONE', status: next.stop, reason: next.reason ?? null };
  return { kind: 'NEXT', hypothesisId: next.first ? null : next.proposal.hypothesisId };
}

const workOrderOf = (job, prepared) => ({
  projectId: job.payload.projectId,
  researchRunId: job.researchRunId,
  experimentId: prepared.experimentId,
  engineId: prepared.frozen.engineId,
  input: prepared.frozen.input,
  inputHash: prepared.frozen.inputHash,
  hypothesisId: prepared.frozen.hypothesisId,
  predictionFingerprint: prepared.frozen.predictionFingerprint,
  preregistrationFingerprint: prepared.frozen.preregistrationFingerprint,
});

/** Custody of the execution bundles, then completion of the job. Returns the HTTP reply. */
async function finishJob(db, job, leaseId, artifactStorage, result) {
  const { projectId } = job.payload ?? {};
  if (artifactStorage) {
    const custody = await recoverMissingArtifacts(db, artifactStorage, projectId, job.researchRunId);
    if (custody.failed.length) {
      await queueFor(db).fail(job.jobId, leaseId, { code: custody.failed[0].status, status: ENGINE_EXECUTION_STATUS.FAILED, recordHash: null, retryable: true });
      reconcileParent(db, job);
      return fail(502, 'ARTIFACT_CUSTODY_FAILED', { reason: custody.failed[0].status });
    }
  }
  const completed = await queueFor(db).complete(job.jobId, leaseId, {
    record: { status: ENGINE_EXECUTION_STATUS.SUCCESS, researchRunId: job.researchRunId, experimentId: result.experimentId ?? null },
    result,
  });
  if (!completed.ok) return fail(409, completed.error);
  reconcileParent(db, job);
  return reply(200, { ok: true, state: 'SUCCEEDED', experimentId: result.experimentId ?? null, job: completed.job });
}

async function releaseJob(db, job, failure) {
  await queueFor(db).fail(job.jobId, job.leaseId, { recordHash: null, ...failure });
  reconcileParent(db, job);
  return reply(200, { ok: true, job: null, released: { jobId: job.jobId, code: failure.code } });
}

const advanceResult = (db, job, stop, extra = {}) => {
  const view = getResearchRun(db, job.payload.projectId, job.researchRunId);
  const done = (view?.experiments ?? []).filter((e) => e.next).slice(job.payload.baseline ?? 0);
  return { status: stop.status, reason: stop.reason ?? null, steps: done.length, experimentIds: done.map((e) => e.experimentId), ...extra };
};

/* ---------------- endpoints ---------------- */

async function claim(db, artifactStorage, body) {
  const { workerId, leaseMs } = body ?? {};
  if (typeof workerId !== 'string' || !WORKER_ID.test(workerId)) return fail(422, 'workerId: invalid');
  const engines = Array.isArray(body?.engines) ? body.engines.filter((e) => typeof e === 'string').slice(0, 50) : [];
  touchWorker(workerId, { engines });
  const claimed = await queueFor(db).claim(workerId, leaseMs, { capabilities: [...REMOTE_CAPABILITY_SET] });
  if (!claimed?.ok) return fail(422, claimed?.error ?? 'CLAIM_FAILED');
  const job = claimed.job;
  if (!job) return reply(200, { ok: true, job: null });

  // The server freezes the prediction BEFORE the engine runs anywhere.
  const step = prepareStep(db, job, engines);
  if (step.kind === 'FAIL') return releaseJob(db, job, step.failure);
  if (step.kind === 'DONE') {
    // Nothing left to run (an earlier attempt already applied its result): only custody and completion remain.
    const result = isAdvance(job)
      ? advanceResult(db, job, step)
      : { status: step.status, deduped: true, experimentId: step.experimentId, remote: null };
    const finished = await finishJob(db, job, job.leaseId, artifactStorage, result);
    return finished.status === 200 ? reply(200, { ok: true, job: null, finalized: { jobId: job.jobId } }) : finished;
  }
  return reply(200, {
    ok: true,
    job: {
      jobId: job.jobId,
      leaseId: job.leaseId,
      leaseExpiresAt: job.leaseExpiresAt,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      timeoutMs: job.timeoutMs,
      capabilityId: job.capabilityId,
      researchRunId: job.researchRunId,
      experimentId: step.prepared.experimentId,
      workOrder: workOrderOf(job, step.prepared),
    },
  });
}

async function heartbeat(db, jobId, body) {
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  touchWorker(job.workerId);
  const result = await queueFor(db).heartbeat(jobId, body.leaseId, Number.isInteger(body?.leaseMs) ? body.leaseMs : 30_000);
  return result.ok ? reply(200, { ok: true, leaseExpiresAt: result.job.leaseExpiresAt }) : fail(409, result.error);
}

async function failJob(db, jobId, body) {
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  const f = body?.failure ?? {};
  const failure = {
    code: typeof f.code === 'string' ? f.code.slice(0, 200) : 'WORKER_FAILED',
    status: Object.values(ENGINE_EXECUTION_STATUS).includes(f.status) ? f.status : ENGINE_EXECUTION_STATUS.FAILED,
    recordHash: null,
    retryable: f.retryable !== false,
    reportedBy: job.workerId,
  };
  const result = await queueFor(db).fail(jobId, body.leaseId, failure);
  if (!result.ok) return fail(409, result.error);
  reconcileParent(db, job);
  return reply(200, { ok: true, retry: result.retry, state: result.job.state });
}

async function putArtifact(db, artifactStorage, jobId, body) {
  if (!artifactStorage) return fail(503, 'NO_ARTIFACT_STORAGE');
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  if (typeof body?.contentBase64 !== 'string' || !SHA256.test(body?.sha256 ?? '')) return fail(422, 'artifact: invalid');
  const bytes = Buffer.from(body.contentBase64, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARTIFACT_BYTES) return fail(413, 'artifact: size');
  if (sha256Hex(bytes) !== body.sha256) return fail(422, 'ARTIFACT_HASH_MISMATCH');
  const view = { researchRunId: safeId(job.researchRunId), experimentId: safeId(body.experimentId ?? job.experimentId) };
  try {
    const ref = await artifactStorage.put({
      key: `research-run/${view.researchRunId}/${view.experimentId}.worker-${safeId(job.workerId)}-a${job.attempts}.json`,
      bytes, mimeType: 'application/json', producer: REMOTE_ARTIFACT_PRODUCER, researchRunId: view.researchRunId, experimentId: view.experimentId,
    });
    return reply(201, { ok: true, artifactRef: ref });
  } catch (error) {
    return fail(502, 'ARTIFACT_PERSIST_FAILED', { reason: String(error?.message ?? error) });
  }
}

/** Reads and checks the worker's outcome artifact against the job, the worker and the frozen experiment. */
function checkOutcome(outcome, job, frozen) {
  const problems = [];
  if (outcome?.kind !== REMOTE_OUTCOME_KIND) problems.push('kind');
  if (outcome?.jobId !== job.jobId) problems.push('jobId');
  if (outcome?.workerId !== job.workerId) problems.push('workerId');
  if (outcome?.researchRunId !== job.researchRunId) problems.push('researchRunId');
  if (outcome?.experimentId !== frozen.experimentId) problems.push('experimentId');
  if (outcome?.engineId !== frozen.engineId) problems.push('engineId');
  if (outcome?.inputHash !== frozen.inputHash) problems.push('inputHash');
  const res = outcome?.engineResult;
  if (!res || typeof res.ok !== 'boolean') problems.push('engineResult');
  else if (res.ok && (typeof res.output !== 'object' || res.output === null)) problems.push('engineResult.output');
  else if (!res.ok && res.status !== 'ENGINE_REJECTED_INPUT') problems.push('engineResult.status');
  if (!outcome?.engineStatus || outcome.engineStatus.available !== true) problems.push('engineStatus');
  return problems;
}

/**
 * Applies the stored worker outcome to the run, once, for the experiment that is open for this job.
 * { ok:true, experimentId, status, deduped } or { ok:false, reply }.
 */
async function applyOutcome(db, artifactStorage, job, artifactSha256, leaseId) {
  if (!artifactStorage) return { ok: false, reply: fail(503, 'NO_ARTIFACT_STORAGE') };
  if (!SHA256.test(artifactSha256 ?? '')) return { ok: false, reply: fail(422, 'artifactSha256: invalid') };
  let bytes;
  try { bytes = await artifactStorage.get({ key: artifactKeyOf(artifactSha256), sha256: artifactSha256 }); } catch (error) {
    return { ok: false, reply: fail(422, 'ARTIFACT_NOT_FOUND', { reason: String(error?.message ?? error) }) };
  }
  // From here to the queue write there is no await except custody; the lease is re-read at the moment of use.
  const current = activeLease(db, job.jobId, leaseId);
  if (!current) return { ok: false, reply: fail(409, 'LEASE_NOT_ACTIVE') };
  let outcome;
  try { outcome = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return { ok: false, reply: fail(422, 'ARTIFACT_NOT_JSON') }; }
  const { projectId, hypothesisId = null, userId = null } = current.payload ?? {};
  // An experiment job names its hypothesis. An advance job's step is the experiment the outcome names, and only if the
  // chain already holds it: a stale or invented step can never make the server freeze something new.
  let openHypothesis = hypothesisId;
  if (isAdvance(current)) {
    const target = getResearchRun(db, projectId, current.researchRunId)?.experiments.find((e) => e.experimentId === outcome?.experimentId);
    if (!target) return { ok: false, reply: fail(422, 'OUTCOME_REJECTED', { problems: ['experimentId'] }) };
    openHypothesis = target.frozen.hypothesisId;
  }
  const probe = executeResearchExperiment(db, projectId, current.researchRunId, { hypothesisId: openHypothesis, userId, tools: remoteTools([outcome?.engineId].filter(Boolean)), stopAfterFreeze: true });
  if (!probe.ok) return { ok: false, reply: fail(409, probe.status, { reason: probe.reason ?? null }) };
  if (probe.status !== 'FROZEN') return { ok: true, experimentId: probe.experimentId, status: probe.status, deduped: true, remote: null };

  const problems = checkOutcome(outcome, current, { experimentId: probe.experimentId, engineId: probe.frozen.engineId, inputHash: probe.frozen.inputHash });
  if (problems.length) return { ok: false, reply: fail(422, 'OUTCOME_REJECTED', { problems }) };

  const real = RESEARCH_RUN_EXECUTORS[probe.frozen.engineId];
  const tools = {
    executors: { ...RESEARCH_RUN_EXECUTORS, [probe.frozen.engineId]: { ...real, run: () => outcome.engineResult } },
    engineStatus: () => outcome.engineStatus,
    executionContext: {
      environment: outcome.environment ?? null,
      startedAt: outcome.startedAt,
      finishedAt: outcome.finishedAt,
      durationMs: outcome.durationMs,
      executedOn: {
        mode: 'REMOTE_HTTP', workerId: current.workerId, jobId: current.jobId, attempt: current.attempts,
        outcomeArtifactSha256: artifactSha256, outcomeArtifactBytes: bytes.byteLength,
        statement: 'The engine ran on the named worker; this record reproduces the worker\'s reported result from the stored outcome artifact.',
      },
    },
  };
  const applied = executeResearchExperiment(db, projectId, current.researchRunId, { hypothesisId: openHypothesis, userId, tools });
  if (!applied.ok) {
    const permanent = ['RUN_NOT_EXECUTABLE', 'STATE_INTEGRITY_FAILURE', 'EXPERIMENT_IN_PROGRESS'].includes(applied.status);
    await queueFor(db).fail(current.jobId, leaseId, {
      code: applied.reason ?? applied.status, status: ENGINE_EXECUTION_STATUS.FAILED, recordHash: null, retryable: !permanent,
    });
    reconcileParent(db, current);
    return { ok: false, reply: fail(409, applied.status, { reason: applied.reason ?? null }) };
  }
  return {
    ok: true, experimentId: applied.experimentId, status: applied.status, deduped: applied.deduped,
    remote: { workerId: current.workerId, attempt: current.attempts, outcomeArtifactSha256: artifactSha256, inputHash: probe.frozen.inputHash },
  };
}

async function complete(db, artifactStorage, jobId, body) {
  // Early refusal: a stale lease never reaches the scientific state.
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  if (isAdvance(job)) {
    // An advance completes only when its chain says nothing is left to run under this job.
    const state = advanceStateOf(db, job);
    if (state.kind === 'NEXT') return fail(409, 'STEPS_REMAINING', { hypothesisId: state.hypothesisId });
    if (state.kind === 'FAIL') return fail(409, state.failure.code);
    return finishJob(db, job, body.leaseId, artifactStorage, advanceResult(db, job, state));
  }
  const applied = await applyOutcome(db, artifactStorage, job, body?.artifactSha256, body?.leaseId);
  if (!applied.ok) return applied.reply;
  return finishJob(db, job, body.leaseId, artifactStorage, { status: applied.status, deduped: Boolean(applied.deduped), experimentId: applied.experimentId, remote: applied.remote });
}

/** One step of an advance: apply this result, then hand the worker the next frozen experiment or tell it to finish. */
async function advanceStep(db, artifactStorage, jobId, body) {
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  if (!isAdvance(job)) return fail(409, 'NOT_AN_ADVANCE_JOB');
  const engines = Array.isArray(body?.engines) ? body.engines.filter((e) => typeof e === 'string').slice(0, 50) : (seenWorkers.get(job.workerId)?.engines ?? []);
  const applied = await applyOutcome(db, artifactStorage, job, body?.artifactSha256, body?.leaseId);
  if (!applied.ok) return applied.reply;
  const { projectId, userId = null } = job.payload ?? {};
  if (artifactStorage) {
    const custody = await recoverMissingArtifacts(db, artifactStorage, projectId, job.researchRunId);
    if (custody.failed.length) {
      await queueFor(db).fail(job.jobId, body.leaseId, { code: custody.failed[0].status, status: ENGINE_EXECUTION_STATUS.FAILED, recordHash: null, retryable: true });
      return fail(502, 'ARTIFACT_CUSTODY_FAILED', { reason: custody.failed[0].status });
    }
  }
  recordContinuation(db, projectId, job.researchRunId, applied.experimentId, { userId });
  const step = prepareStep(db, job, engines);
  if (step.kind === 'FAIL') {
    await queueFor(db).fail(job.jobId, body.leaseId, { recordHash: null, ...step.failure });
    return reply(200, { ok: true, state: 'STEP_APPLIED', experimentId: applied.experimentId, next: null, released: { code: step.failure.code } });
  }
  if (step.kind === 'DONE') return reply(200, { ok: true, state: 'STEP_APPLIED', experimentId: applied.experimentId, next: null, stop: { status: step.status, reason: step.reason ?? null } });
  return reply(200, { ok: true, state: 'STEP_APPLIED', experimentId: applied.experimentId, next: { experimentId: step.prepared.experimentId, workOrder: workOrderOf(job, step.prepared) } });
}

/**
 * Pure router: ({ method, pathname, token, body }) -> { status, body }. `expectedToken` unset means the remote worker
 * API is switched off (503), so a deployment that never configured it exposes no worker surface.
 */
export async function handleRemoteWorkerApi(db, { method, pathname, token, body, artifactStorage, expectedToken }) {
  if (!pathname.startsWith(`${WORKER_API_PREFIX}/`)) return fail(404, 'not_found');
  if (!expectedToken) return fail(503, 'WORKER_API_DISABLED', { message: 'GENESIS_WORKER_TOKEN is not configured on this server.' });
  if (!workerTokenMatches(expectedToken, token)) return fail(401, 'unauthorized');
  if (!db) return fail(503, 'persistence_unavailable');
  const seg = pathname.slice(WORKER_API_PREFIX.length + 1).split('/').filter(Boolean);
  if (seg.length === 1 && seg[0] === 'health') return method === 'GET' ? reply(200, { ok: true, capabilities: [...REMOTE_CAPABILITY_SET] }) : fail(405, 'method_not_allowed');
  if (method !== 'POST') return fail(405, 'method_not_allowed');
  try {
    if (seg.length === 1 && seg[0] === 'claim') return await claim(db, artifactStorage, body);
    if (seg.length === 3 && seg[0] === 'jobs') {
      const jobId = seg[1];
      if (seg[2] === 'heartbeat') return await heartbeat(db, jobId, body);
      if (seg[2] === 'fail') return await failJob(db, jobId, body);
      if (seg[2] === 'artifact') return await putArtifact(db, artifactStorage, jobId, body);
      if (seg[2] === 'step') return await advanceStep(db, artifactStorage, jobId, body);
      if (seg[2] === 'complete') return await complete(db, artifactStorage, jobId, body);
    }
  } catch (error) {
    return fail(500, 'internal', { reason: String(error?.message ?? error) });
  }
  return fail(404, 'not_found');
}
