import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CURRENT_WORKER_INFRASTRUCTURE,
  admitMultiReplicaWorkerInfrastructure,
  createArtifactStoragePort,
  createScientificJobQueuePort,
  validateArtifactRef,
  validateScientificJobEnvelope,
} from './compute/workerInfrastructureContract.mjs';

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
    assert.ok(admission.blockers.includes('ATOMIC_CLAIM_LEASE_NOT_IMPLEMENTED'));
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
