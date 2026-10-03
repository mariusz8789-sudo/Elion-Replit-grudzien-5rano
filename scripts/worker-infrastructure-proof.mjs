#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalContentAddressedArtifactStorage } from '../packages/backend/src/compute/localArtifactStorageBackend.mjs';
import {
  CURRENT_WORKER_INFRASTRUCTURE,
  admitMultiReplicaWorkerInfrastructure,
  createScientificJobQueuePort,
  createSqliteScientificJobQueueBackend,
} from '../packages/backend/src/compute/workerInfrastructureContract.mjs';
import { openDatabase } from '../packages/backend/src/store.mjs';

const JOB_COUNT = 64;
const WORKER_COUNT = 4;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) if (argv[index].startsWith('--')) args[argv[index].slice(2)] = argv[++index];
  return args;
}

function job(index) {
  return {
    jobId: `proof-job-${String(index).padStart(3, '0')}`,
    idempotencyKey: `proof-idem-${String(index).padStart(3, '0')}`,
    researchRunId: 'proof-research-run-001',
    experimentId: `proof-experiment-${String(index).padStart(3, '0')}`,
    capabilityId: 'proof-capability',
    priority: index % 10,
    maxAttempts: 2,
    timeoutMs: 30_000,
    payload: { index },
  };
}

export async function runWorkerInfrastructureProof({ commit = null, now = () => new Date('2026-10-02T00:00:00.000Z') } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'genesis-worker-infrastructure-'));
  const databasePath = path.join(directory, 'genesis.db');
  const artifactRoot = path.join(directory, 'artifacts');
  const databases = Array.from({ length: WORKER_COUNT }, () => openDatabase(databasePath));
  try {
    const queues = databases.map((db) => createScientificJobQueuePort({
      backend: createSqliteScientificJobQueueBackend({ db }),
    }));
    for (let index = 0; index < JOB_COUNT; index += 1) {
      const inserted = await queues[0].enqueue(job(index));
      assert(inserted.ok && !inserted.deduped, `job ${index} did not enqueue`);
    }

    const claimedIds = new Set();
    const workerClaims = Object.fromEntries(Array.from({ length: WORKER_COUNT }, (_, index) => [`worker-${index + 1}`, 0]));
    while (claimedIds.size < JOB_COUNT) {
      const claims = await Promise.all(queues.map((queue, index) => queue.claim(`worker-${index + 1}`, 10_000)));
      let progress = false;
      for (let index = 0; index < claims.length; index += 1) {
        const claimed = claims[index];
        if (!claimed.ok || !claimed.job) continue;
        progress = true;
        assert(!claimedIds.has(claimed.job.jobId), `duplicate claim: ${claimed.job.jobId}`);
        claimedIds.add(claimed.job.jobId);
        workerClaims[`worker-${index + 1}`] += 1;
        const completed = await queues[index].complete(claimed.job.jobId, claimed.job.leaseId, {
          outputHash: sha256(Buffer.from(claimed.job.jobId)),
        });
        assert(completed.ok && completed.job.state === 'SUCCEEDED', `completion failed: ${claimed.job.jobId}`);
      }
      assert(progress, 'queue became idle before every job completed');
    }
    const finalClaims = await Promise.all(queues.map((queue, index) => queue.claim(`worker-${index + 1}`, 10_000)));
    assert(finalClaims.every((claim) => claim.ok && claim.job === null), 'completed queue was not empty');

    for (const db of databases) db.close();
    const restartedDb = openDatabase(databasePath);
    try {
      const restartedBackend = createSqliteScientificJobQueueBackend({ db: restartedDb });
      for (let index = 0; index < JOB_COUNT; index += 1) {
        assert(restartedBackend.get(job(index).jobId)?.state === 'SUCCEEDED', `restart lost job ${index}`);
      }
    } finally {
      restartedDb.close();
    }

    const bytes = Buffer.from('Genesis durable external artifact proof');
    const storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactRoot, now });
    const firstRef = await storage.put({
      key: 'requested/proof.txt',
      bytes,
      mimeType: 'text/plain',
      producer: 'worker-proof-001',
      researchRunId: 'proof-research-run-001',
      experimentId: 'proof-experiment-artifact',
    });
    const restartedStorage = createLocalContentAddressedArtifactStorage({ rootDir: artifactRoot, now });
    const recoveredBytes = await restartedStorage.get(firstRef);
    const duplicateRef = await restartedStorage.put({
      key: 'different/requested-name.txt',
      bytes,
      mimeType: 'text/plain',
      producer: 'worker-proof-002',
      researchRunId: 'proof-research-run-001',
      experimentId: 'proof-experiment-artifact',
    });
    assert(Buffer.compare(recoveredBytes, bytes) === 0, 'artifact bytes changed after restart');
    assert(firstRef.key === duplicateRef.key && firstRef.sha256 === duplicateRef.sha256, 'content address did not deduplicate');

    const admission = admitMultiReplicaWorkerInfrastructure();
    assert(!admission.ok, 'local proof must not unlock multi-replica admission');
    const proof = {
      schemaVersion: '1.0.0',
      generatedAt: now().toISOString(),
      commit,
      scope: 'REAL_SINGLE_NODE_QUEUE_AND_LOCAL_ARTIFACT_PROOF_NOT_DISTRIBUTED_INFRASTRUCTURE',
      queue: {
        backend: CURRENT_WORKER_INFRASTRUCTURE.queueBackend,
        jobsEnqueued: JOB_COUNT,
        uniqueClaims: claimedIds.size,
        duplicateClaims: 0,
        workerConnections: WORKER_COUNT,
        workerClaims,
        restartRecoveredSucceededJobs: JOB_COUNT,
      },
      artifact: {
        storageProvider: firstRef.storageProvider,
        bytesOutsideSqlite: true,
        artifactId: firstRef.artifactId,
        key: firstRef.key,
        sha256: firstRef.sha256,
        size: firstRef.size,
        restartReadHash: sha256(recoveredBytes),
        contentAddressDeduplicated: true,
        integrityVerifiedOnRead: true,
      },
      admission: {
        multiReplicaSafe: CURRENT_WORKER_INFRASTRUCTURE.multiReplicaSafe,
        sharedConcurrency: CURRENT_WORKER_INFRASTRUCTURE.sharedConcurrency,
        productionObjectStorage: CURRENT_WORKER_INFRASTRUCTURE.objectStorage,
        decision: admission.status,
        failureCode: admission.failureCode,
        blockers: admission.blockers,
      },
      ownerActions: {
        BLOCKED_EXTERNAL_SHARED_QUEUE: 'Select and provision an atomic shared lease backend.',
        BLOCKED_EXTERNAL_SHARED_CONCURRENCY: 'Provision shared quota and concurrency coordination.',
        BLOCKED_EXTERNAL_OBJECT_STORAGE: 'Select object storage and provide scoped deployment credentials.',
      },
      ok: true,
    };
    return { ...proof, receiptSha256: sha256(Buffer.from(JSON.stringify(proof))) };
  } finally {
    for (const db of databases) {
      try { db.close(); } catch { /* already closed before restart proof */ }
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('--out is required');
  const proof = await runWorkerInfrastructureProof({ commit: args.commit ?? null });
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    await main();
  } catch (error) {
    console.error(String(error?.stack ?? error?.message ?? error));
    process.exitCode = 1;
  }
}