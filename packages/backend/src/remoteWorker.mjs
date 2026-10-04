import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { createScientificWorkerRuntime } from './compute/scientificWorkerRuntime.mjs';
import { CHILD_RESULT_MARKER, runIsolatedProcess } from './compute/isolatedProcess.mjs';
import { RESEARCH_RUN_EXECUTORS, researchEngineStatus } from './researchRunEngines.mjs';
import { REMOTE_OUTCOME_KIND, RESEARCH_ADVANCE_REMOTE_CAPABILITY, WORKER_API_PREFIX } from './remoteWorkerProtocol.mjs';

/**
 * A ResearchRun worker that lives OUTSIDE the server: it has no database handle and no shared file. Everything it
 * knows comes from the server's HTTP API (remoteWorkerApi.mjs): it claims a job with a lease, keeps the lease
 * alive with heartbeats, runs the engine in a killable child process, uploads the outcome as a content-addressed
 * artifact and asks the server to complete the job. The scientific state (frozen prediction, verdict, seal,
 * Evidence, replay) is written only by the server.
 */
const CHILD_ENTRY = new URL('./remoteEngineChild.mjs', import.meta.url).pathname;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Engines this host can really run, as reported by the same probe the server uses locally. */
export const availableEngines = () => Object.keys(RESEARCH_RUN_EXECUTORS).filter((id) => researchEngineStatus(id).available);

/** The durable queue as seen over HTTP: the same claim / heartbeat / complete / fail surface the worker runtime consumes. */
export function createHttpQueueClient({ serverUrl, token, engines = availableEngines(), fetchImpl = globalThis.fetch, requestTimeoutMs = 30_000 } = {}) {
  if (typeof serverUrl !== 'string' || !/^https?:\/\//.test(serverUrl)) throw new Error('serverUrl: required');
  if (typeof token !== 'string' || token.length < 16) throw new Error('token: required');
  const base = serverUrl.replace(/\/+$/, '') + WORKER_API_PREFIX;
  const leases = new Map();
  async function call(path, body) {
    try {
      const res = await fetchImpl(`${base}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body ?? {}),
        signal: globalThis.AbortSignal.timeout(requestTimeoutMs),
      });
      const parsed = await res.json().catch(() => ({}));
      return { status: res.status, body: parsed };
    } catch (error) {
      return { status: 0, body: { error: `NETWORK: ${String(error?.message ?? error)}` } };
    }
  }
  const outcomeOf = (r) => (r.status >= 200 && r.status < 300 ? { ok: true, ...r.body } : { ok: false, error: r.body?.error ?? `HTTP_${r.status}`, status: r.status, detail: r.body });
  return Object.freeze({
    leaseOf: (jobId) => leases.get(jobId) ?? null,
    call,
    async claim(workerId, leaseMs) {
      const r = outcomeOf(await call('claim', { workerId, leaseMs, engines }));
      if (!r.ok || !r.job) return r.ok ? { ok: true, job: null } : r;
      const j = r.job;
      leases.set(j.jobId, j.leaseId);
      // The runtime hands `payload.input` to the execution port as the request input: here, the work order.
      return { ok: true, job: { jobId: j.jobId, leaseId: j.leaseId, researchRunId: j.researchRunId, experimentId: j.experimentId, capabilityId: j.capabilityId, timeoutMs: j.timeoutMs, attempt: j.attempt, payload: { input: j.workOrder } } };
    },
    async heartbeat(jobId, leaseId, leaseMs) {
      // One transient network error must not cost the job its lease; a refusal from the server is final.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const r = await call(`jobs/${jobId}/heartbeat`, { leaseId, leaseMs });
        if (r.status !== 0) return outcomeOf(r);
        await delay(200);
      }
      return { ok: false, error: 'NETWORK' };
    },
    async complete(jobId, leaseId, result) {
      const r = outcomeOf(await call(`jobs/${jobId}/complete`, { leaseId, artifactSha256: result?.result?.artifactSha256 }));
      leases.delete(jobId);
      return r.ok ? { ok: true, job: r.job } : r;
    },
    async fail(jobId, leaseId, failure) {
      const r = outcomeOf(await call(`jobs/${jobId}/fail`, { leaseId, failure }));
      leases.delete(jobId);
      return r.ok ? { ok: true, retry: r.retry, job: { state: r.state } } : r;
    },
  });
}

async function runEngineInChild(workOrder, { signal, processTimeoutMs }) {
  const ran = await runIsolatedProcess({
    command: process.execPath,
    args: ['--no-warnings', CHILD_ENTRY],
    input: JSON.stringify({ engineId: workOrder.engineId, input: workOrder.input }),
    timeoutMs: processTimeoutMs,
    signal,
  });
  if (ran.killed) return { ok: false, failureCode: ran.killed === 'TIMEOUT' ? 'CHILD_TIMEOUT' : `CHILD_${ran.killed}` };
  const line = ran.stdout.split('\n').reverse().find((l) => l.startsWith(CHILD_RESULT_MARKER));
  if (!line) return { ok: false, failureCode: `CHILD_EXITED_${ran.code}` };
  try { return { ok: true, outcome: JSON.parse(line.slice(CHILD_RESULT_MARKER.length)) }; } catch { return { ok: false, failureCode: 'CHILD_BAD_RESULT' }; }
}

const MAX_STEPS_PER_JOB = 50;

/**
 * EngineExecutionPort for the worker runtime. A single-experiment job: run the engine, upload the outcome, return
 * its digest (the runtime then completes the job). An advance job: the same, repeated under ONE lease; after each
 * upload the server applies the step and answers with the next frozen experiment or with the end of the advance.
 */
export function createRemoteExecutionPort({ client, workerId, processTimeoutMs, engines = availableEngines() } = {}) {
  async function runOne(request, workOrder, signal) {
    const leaseId = client.leaseOf(request.executionId);
    const ran = await runEngineInChild(workOrder, { signal, processTimeoutMs });
    if (!ran.ok) return { record: { status: ran.failureCode === 'CHILD_TIMEOUT' ? ENGINE_EXECUTION_STATUS.TIMEOUT : ENGINE_EXECUTION_STATUS.FAILED, failureCode: ran.failureCode } };
    const { outcome } = ran;
    // An engine that is not available HERE is not a scientific result: the job goes back to the queue.
    if (!outcome.engineResult.ok && outcome.engineResult.status === 'BLOCKED') {
      return { record: { status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME, failureCode: outcome.engineResult.reason ?? 'ENGINE_BLOCKED' } };
    }
    const artifact = {
      kind: REMOTE_OUTCOME_KIND,
      jobId: request.executionId,
      workerId,
      researchRunId: workOrder.researchRunId,
      experimentId: workOrder.experimentId,
      engineId: workOrder.engineId,
      inputHash: workOrder.inputHash,
      ...outcome,
    };
    const bytes = Buffer.from(JSON.stringify(artifact), 'utf8');
    const sha = sha256(bytes);
    const uploaded = await client.call(`jobs/${request.executionId}/artifact`, {
      leaseId, experimentId: workOrder.experimentId, sha256: sha, contentBase64: bytes.toString('base64'),
    });
    if (uploaded.status !== 201) return { record: { status: ENGINE_EXECUTION_STATUS.FAILED, failureCode: `ARTIFACT_UPLOAD_${uploaded.body?.error ?? uploaded.status}` } };
    return { ok: true, sha, ref: uploaded.body.artifactRef, leaseId };
  }

  return Object.freeze({
    async execute(request, { signal } = {}) {
      let workOrder = request.input;
      const first = workOrder;
      let last = null;
      for (let step = 1; step <= MAX_STEPS_PER_JOB; step += 1) {
        const ran = await runOne(request, workOrder, signal);
        if (!ran.ok) return ran;
        last = ran;
        if (request.capabilityId !== RESEARCH_ADVANCE_REMOTE_CAPABILITY) break;
        const stepped = await client.call(`jobs/${request.executionId}/step`, { leaseId: ran.leaseId, artifactSha256: ran.sha, engines });
        if (stepped.status !== 200) return { record: { status: ENGINE_EXECUTION_STATUS.FAILED, failureCode: `STEP_${stepped.body?.error ?? stepped.status}` } };
        // The server released the job (a next step it could not hand out): the runtime must not complete it.
        if (stepped.body.released) return { record: { status: ENGINE_EXECUTION_STATUS.FAILED, failureCode: `STEP_RELEASED_${stepped.body.released.code}` } };
        if (!stepped.body.next) break;
        workOrder = stepped.body.next.workOrder;
      }
      return {
        record: { status: ENGINE_EXECUTION_STATUS.SUCCESS, researchRunId: first.researchRunId, experimentId: workOrder.experimentId },
        result: { artifactSha256: last.sha, artifactRef: last.ref },
      };
    },
  });
}

export function createRemoteWorker({ serverUrl, token, workerId, leaseMs = 30_000, engines, processTimeoutMs, fetchImpl, idlePollMs = 500 } = {}) {
  const client = createHttpQueueClient({ serverUrl, token, engines, fetchImpl });
  const runtime = createScientificWorkerRuntime({
    queue: client,
    executionPort: createRemoteExecutionPort({ client, workerId, processTimeoutMs, engines: engines ?? availableEngines() }),
    workerId,
    leaseMs,
  });
  /** Claims and runs jobs until aborted; an unreachable server or an idle queue only costs a pause. */
  async function run({ signal, onResult } = {}) {
    while (!signal?.aborted) {
      let result;
      try { result = await runtime.runOnce(); } catch (error) { result = { ok: false, state: 'WORKER_ERROR', error: String(error?.message ?? error) }; }
      onResult?.(result);
      if (result.state === 'IDLE' || (!result.ok && !result.job && result.state !== 'LEASE_LOST')) await delay(idlePollMs);
    }
    return { ok: true, state: 'STOPPED' };
  }
  return Object.freeze({ client, runtime, run });
}
