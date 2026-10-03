import { createHash } from 'node:crypto';
import { ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { createScientificWorkerRuntime } from './compute/scientificWorkerRuntime.mjs';
import { createScientificJobQueuePort, createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { getResearchRun } from './researchRun.mjs';

/**
 * Asynchronous front door to the ONE ResearchRun execution path. A queued job owns no scientific state:
 * the worker calls the same executeResearchExperiment() as the synchronous route, so freezing, falsifying,
 * evidence and the hash-chained run state are written exactly once and by the same code. The job row
 * (the existing durable lease queue) only records who ran it, how it ended and why it failed.
 * maxAttempts is 1 on purpose: a silent retry must never change the scientific conditions of a run.
 */
export const RESEARCH_EXPERIMENT_CAPABILITY = 'research-run-experiment';
const sha = (value) => createHash('sha256').update(value).digest('hex');

export const queueFor = (db) => createScientificJobQueuePort({ backend: createSqliteScientificJobQueueBackend({ db }) });
export const jobBackendFor = (db) => createSqliteScientificJobQueueBackend({ db });

export function researchJobIdentity(runId, ordinal, hypothesisId, generation = 0) {
  const key = `${runId}|${ordinal}|${hypothesisId ?? 'next'}|${generation}`;
  const digest = sha(key).slice(0, 24);
  return { jobId: `job-rr-${digest}`, idempotencyKey: `idem-rr-${digest}`, experimentId: `queued-${digest}` };
}

export async function enqueueResearchExperiment(db, projectId, runId, { hypothesisId = null, userId = null, timeoutMs = 120_000 } = {}) {
  const view = getResearchRun(db, projectId, runId);
  if (!view) return { ok: false, status: 'NOT_FOUND' };
  // A cancelled or dead-lettered job is history, never revived: the next request opens a new generation.
  const backend = jobBackendFor(db);
  let generation = 0;
  let identity = researchJobIdentity(runId, view.experiments.length, hypothesisId, generation);
  for (let prior = backend.get(identity.jobId); prior && ['CANCELLED', 'DEAD_LETTER', 'FAILED'].includes(prior.state); prior = backend.get(identity.jobId)) {
    generation += 1;
    identity = researchJobIdentity(runId, view.experiments.length, hypothesisId, generation);
  }
  const queued = await queueFor(db).enqueue({
    ...identity,
    researchRunId: runId,
    capabilityId: RESEARCH_EXPERIMENT_CAPABILITY,
    priority: 5,
    maxAttempts: 1,
    timeoutMs,
    payload: { projectId, hypothesisId, userId },
  });
  if (!queued?.ok) return { ok: false, status: 'ENQUEUE_FAILED', reason: queued?.error ?? null };
  return { ok: true, deduped: Boolean(queued.deduped), job: queued.job };
}

export function readResearchJob(db, runId, jobId) {
  const job = jobBackendFor(db).get?.(jobId) ?? null;
  return job && job.researchRunId === runId ? job : null;
}

/** Adapts executeResearchExperiment() to the EngineExecutionPort shape the worker runtime already consumes. */
export function createResearchRunExecutionPort(db, { tools, proposeEvidence, now } = {}) {
  return Object.freeze({
    async execute(request) {
      const { projectId, hypothesisId, userId } = request.input ?? {};
      const options = { hypothesisId: hypothesisId ?? null, userId: userId ?? null };
      if (tools) options.tools = tools;
      if (proposeEvidence) options.proposeEvidence = proposeEvidence;
      if (now) options.now = now;
      const result = executeResearchExperiment(db, projectId, request.researchRunId, options);
      if (result.ok) {
        return { record: { status: ENGINE_EXECUTION_STATUS.SUCCESS, researchRunId: request.researchRunId, experimentId: result.experimentId }, result: { status: result.status, deduped: Boolean(result.deduped), experimentId: result.experimentId } };
      }
      const blocked = result.status === 'BLOCKED';
      return { record: { status: blocked ? ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME : ENGINE_EXECUTION_STATUS.FAILED, failureCode: result.reason ?? result.status } };
    },
  });
}

export function createResearchRunWorker(db, { workerId = 'worker-research-run-local', leaseMs = 30_000, ...options } = {}) {
  return createScientificWorkerRuntime({
    queue: queueFor(db),
    executionPort: createResearchRunExecutionPort(db, options),
    workerId,
    leaseMs,
  });
}
