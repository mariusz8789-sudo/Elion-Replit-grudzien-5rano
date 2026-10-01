import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENT_WORKER_INFRASTRUCTURE,
  admitMultiReplicaWorkerInfrastructure,
  createArtifactStoragePort,
  createScientificJobQueuePort,
  createSqliteScientificJobQueueBackend,
  validateArtifactRef,
  validateScientificJobEnvelope,
} from './compute/workerInfrastructureContract.mjs';
import { openDatabase } from './store.mjs';

const JOB = {
  jobId: 'job-001',
  idempotencyKey: 'idem-001',
  researchRunId: 'research-run-001',
  experimentId: 'experiment-001',
  capabilityId: 'quantum-chemistry',
  priority: 5,
  maxAttempts: 3,
  timeoutMs: 60_000,
  payload: { inputHash: 'a'.repeat(64) },
};

describe('shared scientific job contract', () => {
  it('requires durable identity, bounded retries and timeout', () => {
    assert.equal(validateScientificJobEnvelope(JOB).ok, true);
    assert.equal(validateScientificJobEnvelope({ ...JOB, maxAttempts: 0 }).ok, false);
    assert.equal(validateScientificJobEnvelope({ ...JOB, timeoutMs: 999 }).ok, false);
    assert.equal(validateScientificJobEnvelope({ ...JOB, idempotencyKey: 'x' }).ok, false);
  });

  it('requires a complete shared backend rather than pretending the local runner is distributed', () => {
    assert.throws(() => createScientificJobQueuePort(), /SHARED_QUEUE_BACKEND_REQUIRED/);
    assert.throws(
      () => createScientificJobQueuePort({ backend: { enqueue() {} } }),
      /SHARED_QUEUE_BACKEND_REQUIRED/,
    );
  });

  it('delegates lifecycle operations to an injected lease-capable backend', async () => {
    const calls = [];
    const backend = Object.fromEntries(
      ['enqueue', 'claim', 'heartbeat', 'complete', 'fail', 'cancel'].map((method) => [
        method,
        async (...args) => { calls.push([method, ...args]); return { ok: true, method }; },
      ]),
    );
    const queue = createScientificJobQueuePort({ backend });
    assert.equal((await queue.enqueue(JOB)).method, 'enqueue');
    assert.equal((await queue.claim('worker-001', 30_000)).method, 'claim');
    assert.equal((await queue.heartbeat('job-001', 'lease-001', 30_000)).method, 'heartbeat');
    assert.equal((await queue.complete('job-001', 'lease-001', { outputHash: 'b'.repeat(64) })).method, 'complete');
    assert.equal((await queue.fail('job-001', 'lease-001', { code: 'TIMEOUT' })).method, 'fail');
    assert.equal((await queue.cancel('job-001', 'USER_REQUEST')).method, 'cancel');
    assert.deepEqual(calls.map((call) => call[0]), ['enqueue', 'claim', 'heartbeat', 'complete', 'fail', 'cancel']);
  });

  it('blocks multi-replica admission for the current process-local queue', () => {
    assert.equal(CURRENT_WORKER_INFRASTRUCTURE.multiReplicaSafe, false);
    assert.equal(CURRENT_WORKER_INFRASTRUCTURE.sharedConcurrency, false);
    assert.equal(CURRENT_WORKER_INFRASTRUCTURE.objectStorage, 'MISSING');
    const admission = admitMultiReplicaWorkerInfrastructure();
    assert.equal(admission.ok, false);
    assert.equal(admission.failureCode, 'SHARED_WORKER_INFRASTRUCTURE_INCOMPLETE');
    assert.equal(CURRENT_WORKER_INFRASTRUCTURE.claimLease, 'IMPLEMENTED_SINGLE_NODE');
    assert.ok(admission.blockers.includes('SHARED_CONCURRENCY_NOT_IMPLEMENTED'));
  });

  it('atomically leases, heartbeats and completes a durable SQLite scientific job', async () => {
    const db = openDatabase();
    let time = 1_000_000;
    let leases = 0;
    const backend = createSqliteScientificJobQueueBackend({ db, now: () => time, newLeaseId: () => `lease-${++leases}` });
    const queue = createScientificJobQueuePort({ backend });
    assert.equal((await queue.enqueue(JOB)).deduped, false);
    assert.equal((await queue.enqueue(JOB)).deduped, true);
    const claimed = await queue.claim('worker-001', 30_000);
    assert.equal(claimed.job.state, 'CLAIMED');
    assert.equal(claimed.job.attempts, 1);
    assert.equal((await queue.claim('worker-002', 30_000)).job, null, 'an active lease cannot be claimed twice');
    time += 10_000;
    assert.equal((await queue.heartbeat(JOB.jobId, claimed.job.leaseId, 30_000)).ok, true);
    const completed = await queue.complete(JOB.jobId, claimed.job.leaseId, { outputHash: 'b'.repeat(64) });
    assert.equal(completed.job.state, 'SUCCEEDED');
    assert.equal(completed.job.result.outputHash, 'b'.repeat(64));
    assert.equal((await queue.complete(JOB.jobId, claimed.job.leaseId, {})).error, 'LEASE_NOT_ACTIVE');
  });

  it('reclaims expired leases, retries within the bound and then dead-letters', async () => {
    const db = openDatabase();
    let time = 2_000_000;
    let leases = 0;
    const backend = createSqliteScientificJobQueueBackend({ db, now: () => time, newLeaseId: () => `lease-${++leases}` });
    const queue = createScientificJobQueuePort({ backend });
    await queue.enqueue({ ...JOB, jobId: 'job-retry', idempotencyKey: 'idem-retry', maxAttempts: 2 });
    const first = await queue.claim('worker-001', 1_000);
    time += 1_001;
    assert.equal((await queue.heartbeat('job-retry', first.job.leaseId, 1_000)).error, 'LEASE_NOT_ACTIVE');
    const reclaimed = await queue.claim('worker-002', 1_000);
    assert.equal(reclaimed.job.attempts, 2);
    const failed = await queue.fail('job-retry', reclaimed.job.leaseId, { code: 'TIMEOUT' });
    assert.equal(failed.retry, false);
    assert.equal(failed.job.state, 'DEAD_LETTER');
    assert.equal((await queue.claim('worker-003', 1_000)).job, null);
  });

  it('dead-letters an expired final lease even when the worker disappeared without reporting failure', async () => {
    const db = openDatabase();
    let time = 3_000_000;
    const backend = createSqliteScientificJobQueueBackend({ db, now: () => time, newLeaseId: () => 'lease-final' });
    const queue = createScientificJobQueuePort({ backend });
    await queue.enqueue({ ...JOB, jobId: 'job-abandoned', idempotencyKey: 'idem-abandoned', maxAttempts: 1 });
    await queue.claim('worker-001', 1_000);
    time += 1_001;
    assert.equal((await queue.claim('worker-002', 1_000)).job, null);
    const abandoned = backend.get('job-abandoned');
    assert.equal(abandoned.state, 'DEAD_LETTER');
    assert.equal(abandoned.failure.code, 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS');
  });

  it('cancels queued work durably', async () => {
    const db = openDatabase();
    const backend = createSqliteScientificJobQueueBackend({ db });
    const queue = createScientificJobQueuePort({ backend });
    await queue.enqueue({ ...JOB, jobId: 'job-cancel', idempotencyKey: 'idem-cancel' });
    const cancelled = await queue.cancel('job-cancel', 'USER_REQUEST');
    assert.equal(cancelled.job.state, 'CANCELLED');
    assert.equal(cancelled.job.cancelReason, 'USER_REQUEST');
    assert.equal((await queue.claim('worker-001', 1_000)).job, null);
  });
});

describe('ArtifactRef and object-storage port', () => {
  it('stores bytes through the provider and returns only identity metadata', async () => {
    let received = null;
    const port = createArtifactStoragePort({
      storageProvider: 's3-compatible',
      putObject: async (input) => { received = input; return { key: input.key }; },
      now: () => new Date('2026-10-01T00:00:00Z'),
    });
    const ref = await port.put({
      key: 'research/run-001/result.bin',
      bytes: Buffer.from('real artifact bytes'),
      mimeType: 'application/octet-stream',
      producer: 'openmm-worker',
      researchRunId: 'research-run-001',
      experimentId: 'experiment-001',
    });
    assert.equal(received.bytes.toString(), 'real artifact bytes');
    assert.equal(ref.storageProvider, 's3-compatible');
    assert.equal(ref.size, 19);
    assert.match(ref.sha256, /^[a-f0-9]{64}$/);
    assert.equal(ref.artifactId, 'artifact:' + ref.sha256);
    assert.equal(ref.bytes, undefined);
    assert.equal(validateArtifactRef(ref).ok, true);
  });

  it('rejects traversal keys and malformed externally supplied refs', async () => {
    const port = createArtifactStoragePort({
      storageProvider: 's3-compatible',
      putObject: async ({ key }) => ({ key }),
    });
    await assert.rejects(
      () => port.put({
        key: '../secret',
        bytes: Buffer.from('x'),
        mimeType: 'text/plain',
        producer: 'worker-001',
        researchRunId: 'research-run-001',
        experimentId: 'experiment-001',
      }),
      /key: invalid/,
    );
    assert.equal(validateArtifactRef({ sha256: 'fake' }).ok, false);
  });
});
