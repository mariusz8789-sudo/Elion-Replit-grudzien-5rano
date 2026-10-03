import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createResearchRunWorker } from './researchRunJobs.mjs';

const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const prediction = { observable: 'molWt', operator: '<', value: 200, critical: true };
const plan = {
  subProblems: [{ question: 'Aspirin molecular weight?', whyItMatters: 'Queue proof.' }],
  hypotheses: [{
    claim: 'Aspirin molecular weight is below 200 Da.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});

async function setup(dbPath) {
  const db = openDatabase(dbPath);
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
  const owner = call('POST', '/api/auth/register', { body: { email: 'queue@genesis.test', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Queue proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Aspirin molecular weight?' } });
  const runId = started.body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  return { db, call, owner, project, base, runId };
}

test('async experiment: enqueue → claim → same ResearchRun path → restart keeps job and run, no double execution', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-queue-'));
  const dbPath = path.join(dir, 'genesis.db');
  let ctx = await setup(dbPath);
  try {
    const url = `${ctx.base}/research-runs/${ctx.runId}/experiments`;
    const queued = await ctx.call('POST', url, { token: ctx.owner.token, body: { async: true } });
    assert.equal(queued.status, 202);
    assert.equal(queued.body.job.state, 'QUEUED');
    const again = await ctx.call('POST', url, { token: ctx.owner.token, body: { async: true } });
    assert.equal(again.body.deduped, true);
    assert.equal(again.body.job.jobId, queued.body.job.jobId, 'same ordinal and hypothesis never enqueue twice');
    assert.equal((await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun.experiments.length, 0, 'nothing executed before a worker claims');

    const worker = createResearchRunWorker(ctx.db, { workerId: 'worker-rr-test' });
    assert.equal((await worker.runOnce()).state, 'SUCCEEDED');
    assert.equal((await worker.runOnce()).state, 'IDLE');
    const polled = await ctx.call('GET', queued.body.poll, { token: ctx.owner.token });
    assert.equal(polled.body.job.state, 'SUCCEEDED');
    const run = (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun;
    assert.equal(run.experiments.length, 1);
    assert.equal(run.experiments[0].execution.status, 'EXECUTED');
    assert.equal(run.researchState.chain.ok, true);
    const fingerprint = run.experiments[0].frozen.predictionFingerprint;

    ctx.db.close();
  } finally { try { ctx.db.close(); } catch { /* closed */ } }
  const reopened = openDatabase(dbPath);
  try {
    const call = (method, pathname, { token, body } = {}) => handleApi(reopened, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
    const login = call('POST', '/api/auth/login', { body: { email: 'queue@genesis.test', password: 'password123' } }).body;
    const project = call('GET', '/api/projects', { token: login.token }).body.projects[0];
    const runId = ctx.runId;
    const survivingRun = call('GET', `/api/projects/${project.id}/research-runs/${runId}`, { token: login.token }).body.researchRun;
    assert.equal(survivingRun.experiments.length, 1);
    assert.equal(survivingRun.researchState.chain.ok, true);
    const worker = createResearchRunWorker(reopened, { workerId: 'worker-rr-after-restart' });
    assert.equal((await worker.runOnce()).state, 'IDLE', 'the finished job is not claimed or executed again after restart');
    assert.equal(call('GET', `/api/projects/${project.id}/research-runs/${runId}`, { token: login.token }).body.researchRun.experiments.length, 1);
  } finally { reopened.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('queued job survives a restart before execution, is claimed once by competing workers, and runs once', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-queue-claim-'));
  const dbPath = path.join(dir, 'genesis.db');
  const first = await setup(dbPath);
  const url = `${first.base}/research-runs/${first.runId}/experiments`;
  const queued = await first.call('POST', url, { token: first.owner.token, body: { async: true } });
  assert.equal(queued.status, 202);
  first.db.close();
  const db = openDatabase(dbPath);
  const second = openDatabase(dbPath);
  try {
    const workers = [createResearchRunWorker(db, { workerId: 'worker-rr-a' }), createResearchRunWorker(second, { workerId: 'worker-rr-b' })];
    const results = await Promise.all(workers.map((w) => w.runOnce()));
    assert.deepEqual(results.map((r) => r.state).sort(), ['IDLE', 'SUCCEEDED'], 'exactly one worker claims the job');
    const call = (method, pathname, { token } = {}) => handleApi(db, { method, pathname, token, query: {}, reasoningProvider: provider() });
    const login = handleApi(db, { method: 'POST', pathname: '/api/auth/login', body: { email: 'queue@genesis.test', password: 'password123' }, query: {} }).body;
    assert.equal(call('GET', `/api/projects/${first.project.id}/research-runs/${first.runId}`, { token: login.token }).body.researchRun.experiments.length, 1);
  } finally { db.close(); second.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('cancelling a queued job means it never executes; a corrupted run chain dead-letters on the first attempt', { skip }, async () => {
  const ctx = await setup();
  try {
    const url = `${ctx.base}/research-runs/${ctx.runId}/experiments`;
    const queued = await ctx.call('POST', url, { token: ctx.owner.token, body: { async: true } });
    const cancelled = await ctx.call('POST', `${queued.body.poll}/cancel`, { token: ctx.owner.token });
    assert.equal(cancelled.body.job.state, 'CANCELLED');
    const worker = createResearchRunWorker(ctx.db, { workerId: 'worker-rr-cancel' });
    assert.equal((await worker.runOnce()).state, 'IDLE');
    assert.equal((await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun.experiments.length, 0);

    // Corrupt the persisted chain; a fresh job must fail honestly with no retry and no fabricated execution.
    const step = ctx.db.prepare('SELECT id FROM agent_run_steps ORDER BY step_index LIMIT 1').get();
    ctx.db.prepare('UPDATE agent_run_steps SET observation_json = ? WHERE id = ?').run('{"tampered":true}', step.id);
    const second = await ctx.call('POST', url, { token: ctx.owner.token, body: { async: true } });
    assert.equal(second.status, 202);
    assert.notEqual(second.body.job.jobId, queued.body.job.jobId, 'a cancelled job is not silently revived');
    const result = await worker.runOnce();
    assert.equal(result.state, 'DEAD_LETTER');
    const dead = (await ctx.call('GET', second.body.poll, { token: ctx.owner.token })).body.job;
    assert.equal(dead.attempts, 1);
    assert.equal(dead.failure.code, 'STATE_INTEGRITY_FAILURE');
    assert.equal(dead.result, null);
  } finally { ctx.db.close(); }
});
