import { createHash, randomUUID } from 'node:crypto';

export const SCIENTIFIC_JOB_STATE = Object.freeze({
  QUEUED: 'QUEUED',
  CLAIMED: 'CLAIMED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  DEAD_LETTER: 'DEAD_LETTER',
});

export const CURRENT_WORKER_INFRASTRUCTURE = Object.freeze({
  queueBackend: 'SQLITE_ATOMIC_LEASE_SINGLE_NODE',
  queueDurability: 'DATABASE_ROWS',
  claimLease: 'IMPLEMENTED_SINGLE_NODE',
  sharedConcurrency: false,
  multiReplicaSafe: false,
  cancellation: 'PROCESS_LOCAL_FLAG_PLUS_DATABASE_STATUS',
  retryPolicy: 'BOUNDED_ATTEMPTS',
  deadLetterState: 'IMPLEMENTED',
  objectStorage: 'MISSING',
  admission: 'BLOCKED_FOR_MULTI_REPLICA_PRODUCTION',
  blockers: Object.freeze([
    'SHARED_QUEUE_BACKEND_NOT_CONFIGURED',
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
    claim: (workerId, leaseMs, filter) => backend.claim(workerId, leaseMs, filter),
    heartbeat: (jobId, leaseId, leaseMs) => backend.heartbeat(jobId, leaseId, leaseMs),
    complete: (jobId, leaseId, result) => backend.complete(jobId, leaseId, result),
    fail: (jobId, leaseId, failure) => backend.fail(jobId, leaseId, failure),
    cancel: (jobId, reason) => backend.cancel(jobId, reason),
  });
}

const parse = (value, fallback = null) => { try { return value === null ? fallback : JSON.parse(value); } catch { return fallback; } };

function scientificJob(row) {
  if (!row) return null;
  return {
    jobId: row.id, idempotencyKey: row.idempotency_key, researchRunId: row.research_run_id,
    experimentId: row.experiment_id, capabilityId: row.capability_id, priority: row.priority,
    maxAttempts: row.max_attempts, attempts: row.attempts, timeoutMs: row.timeout_ms,
    payload: parse(row.params_json, {}), state: row.status, workerId: row.worker_id ?? null,
    leaseId: row.lease_id ?? null, leaseExpiresAt: row.lease_expires_at ?? null,
    result: parse(row.result_json), failure: parse(row.failure_json), cancelReason: row.cancel_reason ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/**
 * Durable atomic queue for one SQLite deployment. `BEGIN IMMEDIATE` serializes claims across local
 * worker processes sharing this database. It is deliberately not advertised as multi-replica safe:
 * a network-mounted SQLite file and cross-host shared concurrency remain blocked.
 */
export function createSqliteScientificJobQueueBackend({ db, now = () => Date.now(), newLeaseId = () => `lease-${randomUUID()}` } = {}) {
  if (!db || typeof db.prepare !== 'function') throw new Error('db: required');
  const read = (jobId) => scientificJob(db.prepare('SELECT * FROM jobs WHERE id = ? AND idempotency_key IS NOT NULL').get(jobId));
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return Object.freeze({
    async enqueue(job) {
      return transaction(() => {
        const existing = db.prepare('SELECT * FROM jobs WHERE idempotency_key = ?').get(job.idempotencyKey);
        if (existing) return { ok: true, deduped: true, job: scientificJob(existing) };
        const timestamp = now();
        db.prepare(`INSERT INTO jobs
          (id, project_id, type, status, progress, params_json, result_json, run_ids_json, error, created_by, created_at, updated_at,
           idempotency_key, research_run_id, experiment_id, capability_id, priority, max_attempts, attempts, timeout_ms)
          VALUES (?, NULL, ?, 'QUEUED', 0, ?, NULL, '[]', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
          .run(job.jobId, `scientific:${job.capabilityId}`, JSON.stringify(job.payload), timestamp, timestamp,
            job.idempotencyKey, job.researchRunId, job.experimentId, job.capabilityId, job.priority, job.maxAttempts, job.timeoutMs);
        return { ok: true, deduped: false, job: read(job.jobId) };
      });
    },
    // `filter` narrows which capabilities this worker may take: `capabilities` (only these) and/or `excludeCapabilities`
    // (never these). It is how a remote worker and the in-process worker share one queue without taking each other's jobs.
    async claim(workerId, leaseMs, filter = {}) {
      requireId(workerId, 'workerId');
      if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 3_600_000) return { ok: false, error: 'leaseMs: invalid' };
      const only = Array.isArray(filter?.capabilities) ? filter.capabilities.map(String) : null;
      const except = Array.isArray(filter?.excludeCapabilities) ? filter.excludeCapabilities.map(String) : [];
      if (only && only.length === 0) return { ok: true, job: null };
      const marks = (list) => list.map(() => '?').join(',');
      const capabilitySql = `${only ? ` AND capability_id IN (${marks(only)})` : ''}${except.length ? ` AND capability_id NOT IN (${marks(except)})` : ''}`;
      const capabilityArgs = [...(only ?? []), ...except];
      return transaction(() => {
        const timestamp = now();
        // A worker that disappeared on the final allowed attempt must not leave a permanently
        // CLAIMED row. Expiry is the evidence; the queue records it and closes the job fail-closed.
        db.prepare(`UPDATE jobs SET status = 'DEAD_LETTER', failure_json = ?, worker_id = NULL,
          lease_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE idempotency_key IS NOT NULL
          AND status = 'CLAIMED' AND lease_expires_at <= ? AND attempts >= max_attempts`)
          .run(JSON.stringify({ code: 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS' }), timestamp, timestamp);
        const row = db.prepare(`SELECT * FROM jobs WHERE idempotency_key IS NOT NULL
          AND attempts < max_attempts AND (status = 'QUEUED' OR (status = 'CLAIMED' AND lease_expires_at <= ?))
          ${capabilitySql} ORDER BY priority DESC, created_at ASC LIMIT 1`).get(timestamp, ...capabilityArgs);
        if (!row) return { ok: true, job: null };
        const leaseId = newLeaseId();
        db.prepare(`UPDATE jobs SET status = 'CLAIMED', worker_id = ?, lease_id = ?, lease_expires_at = ?,
          attempts = attempts + 1, updated_at = ? WHERE id = ?`).run(workerId, leaseId, timestamp + leaseMs, timestamp, row.id);
        return { ok: true, job: read(row.id) };
      });
    },
    // Lease ownership is the lease_id of a CLAIMED row, not the wall clock. An expired lease that no other worker
    // reclaimed (claim() would have issued a new lease_id) and that was not swept or cancelled (status would differ)
    // still belongs to its worker: a synchronous engine call can block heartbeats past expiry without the worker
    // being dead. Refusing it would report a job that wrote its result as lost. A taken-over lease stays refused.
    async heartbeat(jobId, leaseId, leaseMs) {
      const timestamp = now();
      const changed = db.prepare(`UPDATE jobs SET lease_expires_at = ?, updated_at = ?
        WHERE id = ? AND status = 'CLAIMED' AND lease_id = ?`)
        .run(timestamp + leaseMs, timestamp, jobId, leaseId).changes;
      return changed === 1 ? { ok: true, job: read(jobId) } : { ok: false, error: 'LEASE_NOT_ACTIVE' };
    },
    async complete(jobId, leaseId, result) {
      const timestamp = now();
      const changed = db.prepare(`UPDATE jobs SET status = 'SUCCEEDED', progress = 1, result_json = ?, worker_id = NULL,
        lease_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'CLAIMED' AND lease_id = ?`)
        .run(JSON.stringify(result ?? {}), timestamp, jobId, leaseId).changes;
      return changed === 1 ? { ok: true, job: read(jobId) } : { ok: false, error: 'LEASE_NOT_ACTIVE' };
    },
    async fail(jobId, leaseId, failure) {
      return transaction(() => {
        const timestamp = now();
        const row = db.prepare(`SELECT * FROM jobs WHERE id = ? AND status = 'CLAIMED' AND lease_id = ?`).get(jobId, leaseId);
        if (!row) return { ok: false, error: 'LEASE_NOT_ACTIVE' };
        const terminal = failure?.retryable === false || row.attempts >= row.max_attempts;
        db.prepare(`UPDATE jobs SET status = ?, failure_json = ?, worker_id = NULL, lease_id = NULL,
          lease_expires_at = NULL, updated_at = ? WHERE id = ?`).run(terminal ? 'DEAD_LETTER' : 'QUEUED', JSON.stringify(failure ?? {}), timestamp, jobId);
        return { ok: true, retry: !terminal, job: read(jobId) };
      });
    },
    async cancel(jobId, reason) {
      const timestamp = now();
      const changed = db.prepare(`UPDATE jobs SET status = 'CANCELLED', cancel_reason = ?, worker_id = NULL,
        lease_id = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ? AND idempotency_key IS NOT NULL AND status IN ('QUEUED','CLAIMED')`)
        .run(String(reason ?? 'CANCELLED'), timestamp, jobId).changes;
      return changed === 1 ? { ok: true, job: read(jobId) } : { ok: false, error: 'JOB_NOT_CANCELLABLE' };
    },
    get: read,
    /** Every queue job of one ResearchRun, oldest first (read-only; used by run-level control and state views). */
    listForResearchRun: (researchRunId) => db.prepare(`SELECT * FROM jobs WHERE idempotency_key IS NOT NULL AND research_run_id = ?
      ORDER BY created_at ASC, rowid ASC`).all(String(researchRunId)).map(scientificJob),
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
