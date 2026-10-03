import { createHash, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from './determinism.mjs';
import { ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { RESEARCH_RUN_EXECUTORS } from './researchRunEngines.mjs';
import { recoverMissingArtifacts } from './researchRunArtifacts.mjs';
import { jobBackendFor, queueFor, RESEARCH_REMOTE_CAPABILITY } from './researchRunJobs.mjs';

/**
 * Server side of the remote ResearchRun worker (pull model). A worker is a SEPARATE process or service that has
 * no access to the database: it claims jobs from the durable lease queue through this HTTP API, runs the engine
 * where it lives, sends the outcome back as a content-addressed artifact and asks the server to complete the job.
 *
 * What stays on the server, on purpose: freezing the prediction (before any engine runs), the verdict, the seal,
 * the hash-chained run state, the Evidence proposal and the replay. The worker only supplies the engine result.
 * The server never trusts a completion by its words: the result is read from the stored artifact, whose bytes
 * must hash to the digest the worker named, and which must name this job, this worker, this frozen input.
 *
 * Auth is one shared bearer token (GENESIS_WORKER_TOKEN). The worker-reported engine status and environment are
 * therefore only as trustworthy as that token and the worker host; the record says where it ran (executedOn).
 */
export const WORKER_API_PREFIX = '/api/worker/v1';
export const REMOTE_OUTCOME_KIND = 'genesis-remote-engine-outcome/v1';
export const REMOTE_ARTIFACT_PRODUCER = 'genesis-remote-worker';
export const REMOTE_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const WORKER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/;
const SHA256 = /^[a-f0-9]{64}$/;
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

function activeLease(db, jobId, leaseId) {
  const job = jobBackendFor(db).get(jobId);
  if (!job || job.capabilityId !== RESEARCH_REMOTE_CAPABILITY) return null;
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

/** Custody of the execution bundle, then completion of the job. Used when the experiment is already applied. */
async function finalize(db, job, leaseId, projectId, artifactStorage, extra = {}) {
  if (artifactStorage) {
    const custody = await recoverMissingArtifacts(db, artifactStorage, projectId, job.researchRunId);
    if (custody.failed.length) {
      await queueFor(db).fail(job.jobId, leaseId, { code: custody.failed[0].status, status: ENGINE_EXECUTION_STATUS.FAILED, recordHash: null, retryable: true });
      return fail(502, 'ARTIFACT_CUSTODY_FAILED', { reason: custody.failed[0].status });
    }
  }
  const completed = await queueFor(db).complete(job.jobId, leaseId, {
    record: { status: ENGINE_EXECUTION_STATUS.SUCCESS, researchRunId: job.researchRunId, experimentId: extra.experimentId },
    result: { status: extra.status ?? 'EXECUTED', deduped: Boolean(extra.deduped), experimentId: extra.experimentId, remote: extra.remote ?? null },
  });
  if (!completed.ok) return fail(409, completed.error);
  return reply(200, { ok: true, state: 'SUCCEEDED', experimentId: extra.experimentId, job: completed.job });
}

async function claim(db, artifactStorage, body) {
  const { workerId, leaseMs } = body ?? {};
  if (typeof workerId !== 'string' || !WORKER_ID.test(workerId)) return fail(422, 'workerId: invalid');
  const engines = Array.isArray(body?.engines) ? body.engines.filter((e) => typeof e === 'string').slice(0, 50) : [];
  const claimed = await queueFor(db).claim(workerId, leaseMs, { capabilities: [RESEARCH_REMOTE_CAPABILITY] });
  if (!claimed?.ok) return fail(422, claimed?.error ?? 'CLAIM_FAILED');
  const job = claimed.job;
  if (!job) return reply(200, { ok: true, job: null });

  const { projectId, hypothesisId = null, userId = null } = job.payload ?? {};
  const closeJob = async (failure) => {
    await queueFor(db).fail(job.jobId, job.leaseId, { recordHash: null, ...failure });
    return reply(200, { ok: true, job: null, released: { jobId: job.jobId, code: failure.code } });
  };
  // The server freezes the prediction BEFORE the engine runs anywhere. A retry after a killed worker finds the same
  // frozen experiment and hands out the same work order.
  const prepared = executeResearchExperiment(db, projectId, job.researchRunId, { hypothesisId, userId, tools: remoteTools(engines), stopAfterFreeze: true });
  if (!prepared.ok) {
    if (prepared.status === 'RUN_NOT_EXECUTABLE') return closeJob({ code: 'RUN_NOT_RUNNING', status: ENGINE_EXECUTION_STATUS.CANCELLED, retryable: false });
    // A worker without the engine releases the job for another worker; any other refusal is permanent.
    const lacksEngine = prepared.status === 'BLOCKED' && String(prepared.reason ?? '').startsWith('WORKER_LACKS_ENGINE');
    return closeJob({
      code: prepared.reason ?? prepared.status,
      status: prepared.status === 'BLOCKED' ? ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME : ENGINE_EXECUTION_STATUS.FAILED,
      retryable: lacksEngine,
    });
  }
  if (prepared.status !== 'FROZEN') {
    // Nothing left to run (an earlier attempt already applied its result): only custody and completion remain.
    const finished = await finalize(db, job, job.leaseId, projectId, artifactStorage, { experimentId: prepared.experimentId, status: prepared.status, deduped: true });
    return finished.status === 200 ? reply(200, { ok: true, job: null, finalized: { jobId: job.jobId } }) : finished;
  }
  const frozen = prepared.frozen;
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
      experimentId: prepared.experimentId,
      workOrder: {
        projectId,
        researchRunId: job.researchRunId,
        experimentId: prepared.experimentId,
        engineId: frozen.engineId,
        input: frozen.input,
        inputHash: frozen.inputHash,
        hypothesisId: frozen.hypothesisId,
        predictionFingerprint: frozen.predictionFingerprint,
        preregistrationFingerprint: frozen.preregistrationFingerprint,
      },
    },
  });
}

async function heartbeat(db, jobId, body) {
  const job = activeLease(db, jobId, body?.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
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
  return result.ok ? reply(200, { ok: true, retry: result.retry, state: result.job.state }) : fail(409, result.error);
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

async function complete(db, artifactStorage, jobId, body) {
  if (!artifactStorage) return fail(503, 'NO_ARTIFACT_STORAGE');
  // Early refusal: a stale lease never reaches the scientific state.
  if (!activeLease(db, jobId, body?.leaseId)) return fail(409, 'LEASE_NOT_ACTIVE');
  if (!SHA256.test(body?.artifactSha256 ?? '')) return fail(422, 'artifactSha256: invalid');
  let bytes;
  try { bytes = await artifactStorage.get({ key: artifactKeyOf(body.artifactSha256), sha256: body.artifactSha256 }); } catch (error) {
    return fail(422, 'ARTIFACT_NOT_FOUND', { reason: String(error?.message ?? error) });
  }
  // From here to queue.complete() there is no await except custody; the lease is re-read at the moment of use.
  const job = activeLease(db, jobId, body.leaseId);
  if (!job) return fail(409, 'LEASE_NOT_ACTIVE');
  let outcome;
  try { outcome = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return fail(422, 'ARTIFACT_NOT_JSON'); }
  const { projectId, hypothesisId = null, userId = null } = job.payload ?? {};
  const probe = executeResearchExperiment(db, projectId, job.researchRunId, { hypothesisId, userId, tools: remoteTools([outcome?.engineId].filter(Boolean)), stopAfterFreeze: true });
  if (!probe.ok) return fail(409, probe.status, { reason: probe.reason ?? null });
  if (probe.status !== 'FROZEN') return finalize(db, job, body.leaseId, projectId, artifactStorage, { experimentId: probe.experimentId, status: probe.status, deduped: true });

  const problems = checkOutcome(outcome, job, { experimentId: probe.experimentId, engineId: probe.frozen.engineId, inputHash: probe.frozen.inputHash });
  if (problems.length) return fail(422, 'OUTCOME_REJECTED', { problems });

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
        mode: 'REMOTE_HTTP', workerId: job.workerId, jobId: job.jobId, attempt: job.attempts,
        outcomeArtifactSha256: body.artifactSha256, outcomeArtifactBytes: bytes.byteLength,
        statement: 'The engine ran on the named worker; this record reproduces the worker\'s reported result from the stored outcome artifact.',
      },
    },
  };
  const applied = executeResearchExperiment(db, projectId, job.researchRunId, { hypothesisId, userId, tools });
  if (!applied.ok) {
    const permanent = ['RUN_NOT_EXECUTABLE', 'STATE_INTEGRITY_FAILURE', 'EXPERIMENT_IN_PROGRESS'].includes(applied.status);
    await queueFor(db).fail(job.jobId, body.leaseId, {
      code: applied.reason ?? applied.status, status: ENGINE_EXECUTION_STATUS.FAILED, recordHash: null, retryable: !permanent,
    });
    return fail(409, applied.status, { reason: applied.reason ?? null });
  }
  return finalize(db, job, body.leaseId, projectId, artifactStorage, {
    experimentId: applied.experimentId, status: applied.status, deduped: applied.deduped,
    remote: { workerId: job.workerId, attempt: job.attempts, outcomeArtifactSha256: body.artifactSha256, inputHash: probe.frozen.inputHash },
  });
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
  if (seg.length === 1 && seg[0] === 'health') return method === 'GET' ? reply(200, { ok: true, capability: RESEARCH_REMOTE_CAPABILITY }) : fail(405, 'method_not_allowed');
  if (method !== 'POST') return fail(405, 'method_not_allowed');
  try {
    if (seg.length === 1 && seg[0] === 'claim') return await claim(db, artifactStorage, body);
    if (seg.length === 3 && seg[0] === 'jobs') {
      const jobId = seg[1];
      if (seg[2] === 'heartbeat') return await heartbeat(db, jobId, body);
      if (seg[2] === 'fail') return await failJob(db, jobId, body);
      if (seg[2] === 'artifact') return await putArtifact(db, artifactStorage, jobId, body);
      if (seg[2] === 'complete') return await complete(db, artifactStorage, jobId, body);
    }
  } catch (error) {
    return fail(500, 'internal', { reason: String(error?.message ?? error) });
  }
  return fail(404, 'not_found');
}
