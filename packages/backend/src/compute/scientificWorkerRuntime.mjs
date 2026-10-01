import { ENGINE_EXECUTION_STATUS } from './engineExecutionContract.mjs';
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';

const NON_RETRYABLE = new Set([
  ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION,
  ENGINE_EXECUTION_STATUS.BLOCKED_BY_DATA,
  ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE,
  ENGINE_EXECUTION_STATUS.CANCELLED,
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function failureFor(record) {
  return {
    code: record?.failureCode ?? 'EXECUTION_FAILED',
    status: record?.status ?? ENGINE_EXECUTION_STATUS.FAILED,
    recordHash: record?.recordHash ?? null,
    retryable: !NON_RETRYABLE.has(record?.status),
  };
}

/**
 * Runs canonical engine requests from the existing durable lease queue. The runtime owns no job
 * store or scientific lifecycle: SQLite remains the queue authority and EngineExecutionRecord is
 * the only execution result. An expired/cancelled lease can never be completed by a stale worker.
 */
export function createScientificWorkerRuntime({
  queue,
  executionPort,
  workerId,
  leaseMs = 30_000,
  heartbeatMs = Math.max(1_000, Math.floor(leaseMs / 3)),
} = {}) {
  if (!queue || typeof queue.claim !== 'function' || typeof queue.heartbeat !== 'function'
    || typeof queue.complete !== 'function' || typeof queue.fail !== 'function') throw new Error('queue: invalid');
  if (!executionPort || typeof executionPort.execute !== 'function') throw new Error('executionPort: invalid');
  if (typeof workerId !== 'string' || workerId.length < 3) throw new Error('workerId: invalid');
  if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) throw new Error('leaseMs: invalid');
  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 100 || heartbeatMs >= leaseMs) throw new Error('heartbeatMs: invalid');

  async function runOnce() {
    const claimed = await queue.claim(workerId, leaseMs);
    if (!claimed?.ok || !claimed.job) return claimed?.ok ? { ok: true, state: 'IDLE' } : claimed;
    const job = claimed.job;
    const controller = new globalThis.AbortController();
    let leaseLost = false;
    let heartbeatRunning = false;
    const heartbeat = setInterval(() => {
      if (heartbeatRunning || leaseLost) return;
      heartbeatRunning = true;
      void queue.heartbeat(job.jobId, job.leaseId, leaseMs)
        .then((result) => { if (!result?.ok) { leaseLost = true; controller.abort('LEASE_LOST'); } })
        .catch(() => { leaseLost = true; controller.abort('HEARTBEAT_FAILED'); })
        .finally(() => { heartbeatRunning = false; });
    }, heartbeatMs);
    heartbeat.unref?.();
    const timeout = setTimeout(() => controller.abort('JOB_TIMEOUT'), job.timeoutMs);
    timeout.unref?.();

    try {
      const outcome = await executionPort.execute({
        researchRunId: job.researchRunId,
        experimentId: job.experimentId,
        executionId: job.jobId,
        capabilityId: job.capabilityId,
        input: job.payload.input ?? job.payload,
        replayCapability: job.payload.replayCapability,
      }, { signal: controller.signal });
      if (leaseLost) return { ok: false, state: 'LEASE_LOST', jobId: job.jobId };
      if (outcome?.record?.status === ENGINE_EXECUTION_STATUS.SUCCESS) {
        const completed = await queue.complete(job.jobId, job.leaseId, { record: outcome.record, result: outcome.result });
        return completed?.ok
          ? { ok: true, state: 'SUCCEEDED', job: completed.job }
          : { ok: false, state: 'LEASE_LOST', jobId: job.jobId, error: completed?.error };
      }
      const failed = await queue.fail(job.jobId, job.leaseId, failureFor(outcome?.record));
      return failed?.ok
        ? { ok: false, state: failed.retry ? 'RETRY_QUEUED' : 'DEAD_LETTER', job: failed.job }
        : { ok: false, state: 'LEASE_LOST', jobId: job.jobId, error: failed?.error };
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
    }
  }

  async function drain({ signal, idlePollMs = 250 } = {}) {
    while (!signal?.aborted) {
      const result = await runOnce();
      if (result.state === 'IDLE') await sleep(idlePollMs);
    }
    return { ok: true, state: 'STOPPED' };
  }

  return Object.freeze({ runOnce, drain });
}
