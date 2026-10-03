import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { createResearchRunWorker, enqueueResearchExperiment, queueFor, RESEARCH_REMOTE_CAPABILITY } from './researchRunJobs.mjs';
import { handleRemoteWorkerApi, REMOTE_OUTCOME_KIND, workerTokenMatches } from './remoteWorkerApi.mjs';

const TOKEN = 'unit-test-worker-token-0123456789';
const plan = {
  subProblems: [{ question: 'Aspirin molecular weight?', whyItMatters: 'Remote worker API proof.' }],
  hypotheses: [{
    claim: 'Aspirin molecular weight is below 200 Da.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Remote execution.', parameters: { smiles: 'CC(=O)Oc1ccccc1C(=O)O', predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = {
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
};

async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-remote-api-'));
  const db = openDatabase(':memory:');
  const artifactStorage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider });
  const owner = call('POST', '/api/auth/register', { body: { email: 'remote-api@genesis.test', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Remote API proof' } }).body.project;
  const runId = (await call('POST', `/api/projects/${project.id}/research-runs`, { token: owner.token, body: { question: 'Aspirin molecular weight?' } })).body.researchRun.researchRunId;
  await call('POST', `/api/projects/${project.id}/research-runs/${runId}/proposals`, { token: owner.token });
  const worker = (method, pathname, body, token = TOKEN) => handleRemoteWorkerApi(db, { method, pathname: `/api/worker/v1/${pathname}`, token, body, artifactStorage, expectedToken: TOKEN });
  return { db, dir, project, runId, worker, artifactStorage, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the queue claim filter: capabilities / excludeCapabilities decide which jobs a worker may take', async () => {
  const db = openDatabase(':memory:');
  const backend = createSqliteScientificJobQueueBackend({ db });
  const queue = queueFor(db);
  const base = { priority: 5, maxAttempts: 1, timeoutMs: 10_000, payload: {} };
  for (const [n, capabilityId] of [['one', 'cap-alpha'], ['two', 'cap-beta']]) {
    assert.equal((await queue.enqueue({ ...base, jobId: `job-filter-${n}`, idempotencyKey: `idem-filter-${n}`, researchRunId: `run-filter-${n}`, experimentId: `exp-filter-${n}`, capabilityId })).ok, true);
  }
  assert.equal((await backend.claim('worker-filter-x', 5_000, { capabilities: [] })).job, null, 'an empty allow-list takes nothing');
  assert.equal((await backend.claim('worker-filter-x', 5_000, { capabilities: ['cap-gamma'] })).job, null);
  assert.equal((await backend.claim('worker-filter-x', 5_000, { capabilities: ['cap-beta'] })).job.capabilityId, 'cap-beta');
  assert.equal((await backend.claim('worker-filter-x', 5_000, { excludeCapabilities: ['cap-alpha'] })).job, null, 'only the excluded capability is left');
  assert.equal((await backend.claim('worker-filter-x', 5_000)).job.capabilityId, 'cap-alpha', 'no filter keeps the old behaviour');
  db.close();
});

test('the worker API is off without a token and refuses anything but the worker token', async () => {
  const ctx = await setup();
  try {
    const off = await handleRemoteWorkerApi(ctx.db, { method: 'POST', pathname: '/api/worker/v1/claim', token: TOKEN, body: {}, expectedToken: undefined });
    assert.equal(off.status, 503);
    assert.equal((await ctx.worker('POST', 'claim', { workerId: 'worker-unit-a', leaseMs: 5_000 }, 'wrong-token-wrong-token')).status, 401);
    assert.equal((await ctx.worker('POST', 'claim', { workerId: 'worker-unit-a', leaseMs: 5_000 }, null)).status, 401);
    assert.equal(workerTokenMatches('short', 'short'), false, 'a token under 16 characters is never accepted');
    assert.equal((await ctx.worker('POST', 'claim', { workerId: 'x', leaseMs: 5_000 })).status, 422, 'invalid worker id');
    assert.equal((await ctx.worker('POST', 'claim', { workerId: 'worker-unit-a', leaseMs: 5_000 })).body.job, null, 'an empty queue is idle, not an error');
  } finally { ctx.done(); }
});

test('a remote job is invisible to the in-process worker; a worker without the engine releases it until the attempts are spent', async () => {
  const ctx = await setup();
  try {
    const queued = await enqueueResearchExperiment(ctx.db, ctx.project.id, ctx.runId, { remote: true });
    assert.equal(queued.ok, true);
    assert.equal(queued.job.capabilityId, RESEARCH_REMOTE_CAPABILITY);
    assert.equal(queued.job.maxAttempts, 3);
    assert.equal((await createResearchRunWorker(ctx.db, { workerId: 'worker-local-unit' }).runOnce()).state, 'IDLE', 'the in-process worker leaves it alone');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const released = await ctx.worker('POST', 'claim', { workerId: 'worker-unit-b', leaseMs: 5_000, engines: [] });
      assert.equal(released.status, 200);
      assert.equal(released.body.job, null);
      assert.equal(released.body.released.code.startsWith('WORKER_LACKS_ENGINE'), true);
    }
    assert.equal(ctx.db.prepare('SELECT status FROM jobs WHERE id = ?').get(queued.job.jobId).status, 'DEAD_LETTER');
    assert.equal(ctx.db.prepare(`SELECT count(*) n FROM agent_run_steps WHERE agent_run_id = ? AND capability = 'PREDICTIONS_FROZEN'`).get(ctx.runId).n, 0, 'nothing was frozen for a worker that could not run it');
  } finally { ctx.done(); }
});

test('a completion is only as good as its artifact: wrong digest, wrong worker, wrong input and a missing artifact are refused and write nothing', async () => {
  const ctx = await setup();
  try {
    const queued = await enqueueResearchExperiment(ctx.db, ctx.project.id, ctx.runId, { remote: true });
    const claimed = (await ctx.worker('POST', 'claim', { workerId: 'worker-unit-c', leaseMs: 5_000, engines: ['rdkit'] })).body.job;
    assert.equal(claimed.jobId, queued.job.jobId);
    assert.equal(claimed.workOrder.engineId, 'rdkit');
    assert.match(claimed.workOrder.inputHash, /^[a-f0-9]{64}$/);
    const frozenEvents = () => ctx.db.prepare(`SELECT capability FROM agent_run_steps WHERE agent_run_id = ? AND tool_invoked = 'mind.researchState' ORDER BY step_index`).all(ctx.runId).map((r) => r.capability);
    assert.equal(frozenEvents().at(-1), 'PREDICTIONS_FROZEN', 'the server froze the prediction at claim time');
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const upload = async (artifact, override = {}) => {
      const bytes = Buffer.from(JSON.stringify(artifact));
      return ctx.worker('POST', `jobs/${claimed.jobId}/artifact`, { leaseId: claimed.leaseId, experimentId: claimed.experimentId, sha256: sha(bytes), contentBase64: bytes.toString('base64'), ...override });
    };
    const good = {
      kind: REMOTE_OUTCOME_KIND, jobId: claimed.jobId, workerId: 'worker-unit-c', researchRunId: ctx.runId, experimentId: claimed.experimentId,
      engineId: 'rdkit', inputHash: claimed.workOrder.inputHash, engineResult: { ok: true, output: { molWt: 180.16 } },
      engineStatus: { available: true }, environment: {}, startedAt: 'x', finishedAt: 'y', durationMs: 1,
    };
    const bad = await ctx.worker('POST', `jobs/${claimed.jobId}/artifact`, { leaseId: claimed.leaseId, sha256: sha('other'), contentBase64: Buffer.from('payload').toString('base64') });
    assert.equal(bad.body.error, 'ARTIFACT_HASH_MISMATCH', 'the bytes must hash to the digest named');
    assert.equal((await ctx.worker('POST', `jobs/${claimed.jobId}/artifact`, { leaseId: 'lease-not-mine', sha256: sha('x'), contentBase64: 'eA==' })).body.error, 'LEASE_NOT_ACTIVE');
    for (const [label, artifact, problem] of [
      ['another worker', { ...good, workerId: 'worker-impostor' }, 'workerId'],
      ['another input', { ...good, inputHash: 'f'.repeat(64) }, 'inputHash'],
      ['another job', { ...good, jobId: 'job-someone-else' }, 'jobId'],
      ['an engine that was not available', { ...good, engineStatus: { available: false } }, 'engineStatus'],
      ['a result that is neither output nor rejection', { ...good, engineResult: { ok: false, status: 'BLOCKED' } }, 'engineResult.status'],
    ]) {
      const up = await upload(artifact);
      assert.equal(up.status, 201, label);
      const refused = await ctx.worker('POST', `jobs/${claimed.jobId}/complete`, { leaseId: claimed.leaseId, artifactSha256: up.body.artifactRef.sha256 });
      assert.equal(refused.status, 422, label);
      assert.deepEqual(refused.body.problems, [problem], label);
    }
    assert.equal((await ctx.worker('POST', `jobs/${claimed.jobId}/complete`, { leaseId: claimed.leaseId, artifactSha256: 'a'.repeat(64) })).body.error, 'ARTIFACT_NOT_FOUND');
    assert.equal(frozenEvents().at(-1), 'PREDICTIONS_FROZEN', 'no refused completion produced a result');
    assert.equal(ctx.db.prepare('SELECT status FROM jobs WHERE id = ?').get(claimed.jobId).status, 'CLAIMED', 'the lease stays with its worker');
  } finally { ctx.done(); }
});
