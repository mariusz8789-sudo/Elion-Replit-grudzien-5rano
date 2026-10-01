import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngineExecutionPort, ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { createScientificWorkerRuntime } from './compute/scientificWorkerRuntime.mjs';
import { createScientificJobQueuePort, createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { openDatabase } from './store.mjs';

const JOB = {
  jobId: 'job-runtime-001',
  idempotencyKey: 'idem-runtime-001',
  researchRunId: 'research-run-001',
  experimentId: 'experiment-001',
  capabilityId: 'quantum-chemistry',
  priority: 5,
  maxAttempts: 2,
  timeoutMs: 5_000,
  payload: { input: {
    smiles: '[H][H]',
    atoms: [{ element: 'H', x: 0, y: 0, z: 0 }, { element: 'H', x: 0, y: 0, z: 0.74 }],
    charge: 0,
    basis: 'sto-3g',
    method: 'RHF',
    forceField: 'ETKDGv3',
  } },
};

function setup(executionPort) {
  const db = openDatabase();
  const backend = createSqliteScientificJobQueueBackend({ db });
  const queue = createScientificJobQueuePort({ backend });
  const runtime = createScientificWorkerRuntime({ queue, executionPort, workerId: 'worker-runtime-001', leaseMs: 2_000, heartbeatMs: 500 });
  return { backend, queue, runtime };
}

describe('durable scientific worker runtime', () => {
  it('claims, executes through the canonical port and persists the EngineExecutionRecord', async () => {
    const executionPort = createEngineExecutionPort({
      executor: { execute: async () => ({
        ok: true,
        engine: { toolId: 'pyscf', version: 'real-test-runtime' },
        environmentFingerprint: 'env-real-test',
        result: { energyHartree: -1.1 },
      }) },
    });
    const { backend, queue, runtime } = setup(executionPort);
    await queue.enqueue(JOB);
    const result = await runtime.runOnce();
    assert.equal(result.state, 'SUCCEEDED');
    const persisted = backend.get(JOB.jobId);
    assert.equal(persisted.state, 'SUCCEEDED');
    assert.equal(persisted.result.record.status, ENGINE_EXECUTION_STATUS.SUCCESS);
    assert.equal(persisted.result.record.researchRunId, JOB.researchRunId);
    assert.equal(persisted.result.result.energyHartree, -1.1);
  });

  it('retries transient execution failure and succeeds after a new runtime claims the same row', async () => {
    let calls = 0;
    const executionPort = createEngineExecutionPort({
      executor: { execute: async () => (++calls === 1
        ? { ok: false, state: 'ENGINE_FAILED', error: 'TRANSIENT_ENGINE_FAILURE' }
        : { ok: true, engine: { toolId: 'pyscf', version: 'real-test-runtime' }, result: { energyHartree: -1.1 } }) },
    });
    const { backend, queue, runtime } = setup(executionPort);
    await queue.enqueue({ ...JOB, jobId: 'job-runtime-retry', idempotencyKey: 'idem-runtime-retry' });
    assert.equal((await runtime.runOnce()).state, 'RETRY_QUEUED');
    const restarted = createScientificWorkerRuntime({ queue, executionPort, workerId: 'worker-after-restart', leaseMs: 2_000, heartbeatMs: 500 });
    assert.equal((await restarted.runOnce()).state, 'SUCCEEDED');
    assert.equal(backend.get('job-runtime-retry').attempts, 2);
  });

  it('dead-letters a non-retryable admission blocker on its first attempt', async () => {
    const executionPort = createEngineExecutionPort({
      executor: { execute: async () => { throw new Error('must not execute'); } },
      admit: async () => ({ ok: false, status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE, failureCode: 'LICENSE_UNKNOWN' }),
    });
    const { backend, queue, runtime } = setup(executionPort);
    await queue.enqueue({ ...JOB, jobId: 'job-runtime-blocked', idempotencyKey: 'idem-runtime-blocked', maxAttempts: 3 });
    assert.equal((await runtime.runOnce()).state, 'DEAD_LETTER');
    const blocked = backend.get('job-runtime-blocked');
    assert.equal(blocked.attempts, 1);
    assert.equal(blocked.failure.code, 'LICENSE_UNKNOWN');
    assert.equal(blocked.failure.retryable, false);
  });

  it('does not persist stale output after cancellation removes the active lease', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const executionPort = { execute: async () => { await gate; return { record: { status: ENGINE_EXECUTION_STATUS.SUCCESS }, result: { unsafe: true } }; } };
    const { backend, queue, runtime } = setup(executionPort);
    await queue.enqueue({ ...JOB, jobId: 'job-runtime-cancel', idempotencyKey: 'idem-runtime-cancel' });
    const running = runtime.runOnce();
    await new Promise((resolve) => setImmediate(resolve));
    await queue.cancel('job-runtime-cancel', 'USER_REQUEST');
    release();
    assert.equal((await running).state, 'LEASE_LOST');
    const cancelled = backend.get('job-runtime-cancel');
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal(cancelled.result, null);
  });
});
