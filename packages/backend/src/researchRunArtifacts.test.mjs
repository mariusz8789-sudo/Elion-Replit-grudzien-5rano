import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, truncateSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { createResearchRunWorker } from './researchRunJobs.mjs';
import { experimentsMissingArtifact } from './researchRunArtifacts.mjs';

const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const prediction = { observable: 'molWt', operator: '<', value: 200, critical: true };
const plan = {
  subProblems: [{ question: 'Aspirin molecular weight?', whyItMatters: 'Artifact custody proof.' }],
  hypotheses: [{
    claim: 'Aspirin molecular weight is below 200 Da.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: 'CC(=O)Oc1ccccc1C(=O)O', predictions: [prediction] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});

async function setup(dir, storage) {
  const db = openDatabase(path.join(dir, 'genesis.db'));
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider(), artifactStorage: storage });
  const owner = call('POST', '/api/auth/register', { body: { email: 'artifact@genesis.test', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Artifact proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Aspirin molecular weight?' } })).body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  const enqueue = () => call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true } });
  const view = async () => (await call('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
  return { db, call, owner, project, base, runId, enqueue, view };
}
const artifactEvents = (run) => run.researchState.events.filter((e) => e.type === 'ARTIFACT_PERSISTED');

test('artifact custody: stored by the worker, recorded in the chain, verified, survives restart, never stored twice', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-artifact-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const ctx = await setup(dir, storage);
  let ref;
  try {
    await ctx.enqueue();
    assert.equal((await createResearchRunWorker(ctx.db, { artifactStorage: storage }).runOnce()).state, 'SUCCEEDED');
    const run = await ctx.view();
    assert.equal(artifactEvents(run).length, 1);
    assert.equal(run.researchState.chain.ok, true);
    const x = run.experiments[0];
    const url = `${ctx.base}/research-runs/${ctx.runId}/experiments/${x.experimentId}/artifact`;
    const got = await ctx.call('GET', url, { token: ctx.owner.token });
    assert.equal(got.status, 200, JSON.stringify(got.body));
    ref = got.body.artifactRef;
    assert.equal(got.body.verified, true);
    assert.match(ref.sha256, /^[a-f0-9]{64}$/);
    assert.equal(ref.researchRunId, ctx.runId);
    const bundle = JSON.parse(readFileSync(path.join(storage.rootDir, ref.key), 'utf8'));
    assert.equal(bundle.outputHash, x.execution.outputHash, 'the artifact is the bundle of this exact execution');
    assert.equal(bundle.inputHash, x.execution.inputHash);
    ctx.db.close();
    // Restart: new database handle and a new storage instance over the same directory.
    const storage2 = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
    const db2 = openDatabase(path.join(dir, 'genesis.db'));
    const call2 = (method, pathname, { token } = {}) => handleApi(db2, { method, pathname, token, query: {}, artifactStorage: storage2 });
    const login = handleApi(db2, { method: 'POST', pathname: '/api/auth/login', body: { email: 'artifact@genesis.test', password: 'password123' }, query: {} }).body;
    const again = await call2('GET', url, { token: login.token });
    assert.equal(again.status, 200);
    assert.equal(again.body.artifactRef.sha256, ref.sha256, 'same artifact identity after restart');
    assert.equal((await createResearchRunWorker(db2, { artifactStorage: storage2 }).runOnce()).state, 'IDLE');
    db2.close();
  } finally { try { ctx.db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); }
});

test('artifact custody: tampered or deleted objects are rejected fail-closed, never repaired silently', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-artifact-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const ctx = await setup(dir, storage);
  try {
    await ctx.enqueue();
    await createResearchRunWorker(ctx.db, { artifactStorage: storage }).runOnce();
    const x = (await ctx.view()).experiments[0];
    const url = `${ctx.base}/research-runs/${ctx.runId}/experiments/${x.experimentId}/artifact`;
    const ref = (await ctx.call('GET', url, { token: ctx.owner.token })).body.artifactRef;
    const file = path.join(storage.rootDir, ref.key);
    truncateSync(file, 10);
    const tampered = await ctx.call('GET', url, { token: ctx.owner.token });
    assert.equal(tampered.status, 409);
    assert.equal(tampered.body.error, 'ARTIFACT_INTEGRITY_MISMATCH');
    assert.equal(tampered.body.verified, false);
    unlinkSync(file);
    const missing = await ctx.call('GET', url, { token: ctx.owner.token });
    assert.equal(missing.status, 409);
    assert.equal(missing.body.error, 'ARTIFACT_MISSING');
  } finally { ctx.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('artifact custody: a failed store is not a success; the retry records one artifact and does not execute again', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-artifact-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const ctx = await setup(dir, storage);
  try {
    const broken = { ...storage, async put() { throw new Error('disk full'); } };
    const first = (await ctx.enqueue()).body.job;
    const failedRun = await createResearchRunWorker(ctx.db, { artifactStorage: broken }).runOnce();
    assert.notEqual(failedRun.state, 'SUCCEEDED');
    const midway = await ctx.view();
    assert.equal(artifactEvents(midway).length, 0);
    assert.deepEqual(experimentsMissingArtifact(ctx.db, ctx.project.id, ctx.runId), [midway.experiments[0].experimentId], 'the gap is detectable');
    const outputHash = midway.experiments[0].execution.outputHash;
    const retry = (await ctx.enqueue()).body.job;
    assert.notEqual(retry.jobId, first.jobId, 'a dead-lettered job is not silently revived');
    const retried = await createResearchRunWorker(ctx.db, { artifactStorage: storage }).runOnce();
    assert.equal(retried.state, 'SUCCEEDED', JSON.stringify(retried));
    const done = await ctx.view();
    assert.equal(done.experiments.length, 1, 'still one experiment: no second execution');
    assert.equal(done.experiments[0].execution.outputHash, outputHash);
    assert.equal(artifactEvents(done).length, 1);
    assert.equal(done.researchState.chain.ok, true);
    assert.deepEqual(experimentsMissingArtifact(ctx.db, ctx.project.id, ctx.runId), []);
  } finally { ctx.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('artifact custody: a cancelled job executes nothing and stores no artifact', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-artifact-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const ctx = await setup(dir, storage);
  try {
    const job = (await ctx.enqueue()).body.job;
    const cancelled = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/experiment-jobs/${job.jobId}/cancel`, { token: ctx.owner.token });
    assert.equal(cancelled.status, 200);
    assert.equal((await createResearchRunWorker(ctx.db, { artifactStorage: storage }).runOnce()).state, 'IDLE');
    const run = await ctx.view();
    assert.equal(run.experiments.length, 0);
    assert.equal(artifactEvents(run).length, 0);
  } finally { ctx.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('artifact route: no token is 401, another account cannot read it, the response never carries the storage root path', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-rr-artifact-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const ctx = await setup(dir, storage);
  try {
    await ctx.enqueue();
    await createResearchRunWorker(ctx.db, { artifactStorage: storage }).runOnce();
    const x = (await ctx.view()).experiments[0];
    const url = `${ctx.base}/research-runs/${ctx.runId}/experiments/${x.experimentId}/artifact`;
    assert.equal((await ctx.call('GET', url)).status, 401);
    const stranger = ctx.call('POST', '/api/auth/register', { body: { email: 'stranger@genesis.test', password: 'password123' } }).body;
    assert.ok([403, 404].includes((await ctx.call('GET', url, { token: stranger.token })).status));
    const ok = await ctx.call('GET', url, { token: ctx.owner.token });
    assert.equal(ok.status, 200);
    assert.ok(!JSON.stringify(ok.body).includes(dir), 'no server path leaks');
  } finally { ctx.db.close(); rmSync(dir, { recursive: true, force: true }); }
});
