import { createHash } from 'node:crypto';

export const SCIENTIFIC_JOB_STATE = Object.freeze({
  QUEUED: 'QUEUED',
  CLAIMED: 'CLAIMED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  DEAD_LETTER: 'DEAD_LETTER',
});

export const CURRENT_WORKER_INFRASTRUCTURE = Object.freeze({
  queueBackend: 'SQLITE_ROWS_WITH_IN_PROCESS_SETIMMEDIATE',
  queueDurability: 'DATABASE_ROWS',
  claimLease: 'MISSING',
  sharedConcurrency: false,
  multiReplicaSafe: false,
  cancellation: 'PROCESS_LOCAL_FLAG_PLUS_DATABASE_STATUS',
  retryPolicy: 'MISSING',
  deadLetterState: 'MISSING',
  objectStorage: 'MISSING',
  admission: 'BLOCKED_FOR_MULTI_REPLICA_PRODUCTION',
  blockers: Object.freeze([
    'SHARED_QUEUE_BACKEND_NOT_CONFIGURED',
    'ATOMIC_CLAIM_LEASE_NOT_IMPLEMENTED',
    'SHARED_CONCURRENCY_NOT_IMPLEMENTED',
    'OBJECT_STORAGE_NOT_CONFIGURED',
  ]),
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,499}$/;

function requireId(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(name + ': invalid');
}

export function validateScientificJobEnvelope(job) {
  try {
    for (const field of ['jobId', 'idempotencyKey', 'researchRunId', 'experimentId', 'capabilityId']) requireId(job?.[field], field);
    if (!Number.isInteger(job.maxAttempts) || job.maxAttempts < 1 || job.maxAttempts > 10) throw new Error('maxAttempts: invalid');
    if (!Number.isInteger(job.timeoutMs) || job.timeoutMs < 1_000 || job.timeoutMs > 86_400_000) throw new Error('timeoutMs: invalid');
    if (!Number.isInteger(job.priority) || job.priority < 0 || job.priority > 9) throw new Error('priority: invalid');
    if (job.payload === null || typeof job.payload !== 'object' || Array.isArray(job.payload)) throw new Error('payload: invalid');
    return { ok: true, value: Object.freeze({ ...job }) };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

const REQUIRED_QUEUE_METHODS = ['enqueue', 'claim', 'heartbeat', 'complete', 'fail', 'cancel'];

export function createScientificJobQueuePort({ backend } = {}) {
  if (!backend || REQUIRED_QUEUE_METHODS.some((method) => typeof backend[method] !== 'function')) {
    throw new Error('SHARED_QUEUE_BACKEND_REQUIRED');
  }
  return Object.freeze({
    async enqueue(rawJob) {
      const validated = validateScientificJobEnvelope(rawJob);
      if (!validated.ok) return validated;
      return backend.enqueue(validated.value);
    },
    claim: (workerId, leaseMs) => backend.claim(workerId, leaseMs),
    heartbeat: (jobId, leaseId, leaseMs) => backend.heartbeat(jobId, leaseId, leaseMs),
    complete: (jobId, leaseId, result) => backend.complete(jobId, leaseId, result),
    fail: (jobId, leaseId, failure) => backend.fail(jobId, leaseId, failure),
    cancel: (jobId, reason) => backend.cancel(jobId, reason),
  });
}

export function validateArtifactRef(ref) {
  const errors = [];
  for (const field of ['artifactId', 'storageProvider', 'key', 'mimeType', 'sha256', 'producer', 'researchRunId', 'experimentId']) {
    if (typeof ref?.[field] !== 'string' || ref[field].length === 0) errors.push(field + ': required');
  }
  if (typeof ref?.key === 'string' && (!KEY.test(ref.key) || ref.key.includes('..'))) errors.push('key: invalid');
  if (typeof ref?.sha256 === 'string' && !/^[a-f0-9]{64}$/.test(ref.sha256)) errors.push('sha256: invalid');
  if (!Number.isInteger(ref?.size) || ref.size < 0) errors.push('size: invalid');
  if (typeof ref?.createdAt !== 'string' || !Number.isFinite(Date.parse(ref.createdAt))) errors.push('createdAt: invalid');
  return errors.length ? { ok: false, errors } : { ok: true, value: Object.freeze({ ...ref }) };
}

export function createArtifactStoragePort({ storageProvider, putObject, now = () => new Date() } = {}) {
  if (typeof storageProvider !== 'string' || !ID.test(storageProvider)) throw new Error('storageProvider: invalid');
  if (typeof putObject !== 'function') throw new Error('putObject: required');

  return Object.freeze({
    async put({ key, bytes, mimeType, producer, researchRunId, experimentId }) {
      if (typeof key !== 'string' || !KEY.test(key) || key.includes('..')) throw new Error('key: invalid');
      const body = bytes instanceof Uint8Array ? bytes : Buffer.from(bytes ?? []);
      if (body.byteLength === 0) throw new Error('bytes: empty');
      if (typeof mimeType !== 'string' || !/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(mimeType)) throw new Error('mimeType: invalid');
      for (const [value, name] of [[producer, 'producer'], [researchRunId, 'researchRunId'], [experimentId, 'experimentId']]) requireId(value, name);
      const sha256 = createHash('sha256').update(body).digest('hex');
      const stored = await putObject({ key, bytes: body, mimeType, sha256 });
      const finalKey = stored?.key ?? key;
      const ref = {
        artifactId: 'artifact:' + sha256,
        storageProvider,
        key: finalKey,
        mimeType,
        size: body.byteLength,
        sha256,
        createdAt: now().toISOString(),
        producer,
        researchRunId,
        experimentId,
      };
      const validated = validateArtifactRef(ref);
      if (!validated.ok) throw new Error('ARTIFACT_REF_INVALID:' + validated.errors.join(','));
      return validated.value;
    },
  });
}

export function admitMultiReplicaWorkerInfrastructure(state = CURRENT_WORKER_INFRASTRUCTURE) {
  if (!state.multiReplicaSafe || !state.sharedConcurrency || state.objectStorage === 'MISSING') {
    return {
      ok: false,
      status: 'BLOCKED_BY_CONFIGURATION',
      failureCode: 'SHARED_WORKER_INFRASTRUCTURE_INCOMPLETE',
      blockers: [...(state.blockers ?? [])],
    };
  }
  return { ok: true };
}
