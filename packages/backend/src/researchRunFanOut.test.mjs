import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createFanOutAwareWorker, cancelFanOut, MAX_CHILD_GENERATIONS, MAX_FANOUT_CHILDREN, reconcileFanOut, retryChild, spawnChildRuns } from './researchRunFanOut.mjs';
import { getResearchRun } from './researchRun.mjs';
import { queueFor } from './researchRunJobs.mjs';

const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const CASES = [
  { name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', limit: 200 }, // molWt 180.16 < 200 → supported
  { name: 'Unparseable', smiles: 'not-a-molecule(((', limit: 200 },   // the engine rejects the input: a finished, INCONCLUSIVE experiment
  { name: 'Unrunnable', smiles: 'C C', limit: 200 },                  // never executable (whitespace): the controlled job failure
  { name: 'Ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', limit: 200 }, // molWt 206.28 < 200 → falsified
  { name: 'Caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', limit: 200 },  // molWt 194.19 < 200 → supported
];
const hypothesis = (c) => ({
  claim: `${c.name} molecular weight is below ${c.limit} Da.`, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' }, falsificationProposal: 'The frozen molWt criterion is not met.',
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: c.smiles, predictions: [{ observable: 'molWt', operator: '<', value: c.limit, critical: true }] }, parameterChanges: [] },
});
const plan = { subProblems: [{ question: 'Which molecules are light?', whyItMatters: 'Fan-out proof.' }], hypotheses: CASES.map(hypothesis), nextActions: ['Human review'] };
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});

async function setup(dbPath, email = 'fanout@genesis.test') {
  const db = openDatabase(dbPath);
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Fan-out proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Which molecules are light?' } });
  const runId = started.body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  return { db, call, owner, project, projectId: project.id, base, runId };
}
const drain = async (worker) => { const states = []; for (let i = 0; i < 12; i += 1) { const r = await worker.runOnce(); if (r.state === 'IDLE') break; states.push(r.state); } return states; };
const events = (db, runId, type) => db.prepare("SELECT observation_json FROM agent_run_steps WHERE agent_run_id = ? AND capability = ? ORDER BY step_index").all(runId, type).map((r) => JSON.parse(r.observation_json).payload);

test('fan-out: five children on the real queue, one controlled failure, per-child evidence, idempotent, retry bounded', { skip }, async () => {
  const ctx = await setup(':memory:');
  try {
    const spawned = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/fanout/spawn`, { token: ctx.owner.token, body: {} });
    assert.equal(spawned.status, 202);
    assert.equal(spawned.body.status, 'SPAWNED');
    const children = spawned.body.fanOut.children;
    assert.equal(children.length, 5);
    assert.equal(new Set(children.map((c) => c.jobId)).size, 5, 'every child owns its job identity');
    assert.equal(new Set(children.map((c) => c.childRunId)).size, 5);
    for (const c of children) {
      const run = ctx.db.prepare('SELECT budget_json FROM agent_runs WHERE id = ?').get(c.childRunId);
      assert.equal(JSON.parse(run.budget_json).lineage.parentRunId, ctx.runId, 'lineage to the parent');
      const job = ctx.db.prepare('SELECT params_json, research_run_id FROM jobs WHERE id = ?').get(c.jobId);
      assert.equal(job.research_run_id, c.childRunId);
      assert.equal(JSON.parse(job.params_json).lineage.parentRunId, ctx.runId);
    }

    const again = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/fanout/spawn`, { token: ctx.owner.token, body: {} });
    assert.equal(again.body.status, 'ALREADY_SPAWNED');
    assert.equal(events(ctx.db, ctx.runId, 'FANOUT_SPAWNED').length, 1, 'a second spawn writes nothing');
    assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE idempotency_key IS NOT NULL').get().n, 5, 'and enqueues nothing');

    const mid = await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}/fanout`, { token: ctx.owner.token });
    assert.equal(mid.body.status, 'IN_PROGRESS');
    assert.equal(events(ctx.db, ctx.runId, 'FANOUT_RECONCILED').length, 0, 'nothing is reconciled while children are pending');

    const worker = createFanOutAwareWorker(ctx.db, { workerId: 'worker-fanout-test' });
    assert.deepEqual((await drain(worker)).sort(), ['DEAD_LETTER', 'SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED'], 'the failure did not stop the others');

    const done = await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}/fanout`, { token: ctx.owner.token });
    assert.equal(done.body.status, 'PARTIAL');
    assert.deepEqual(done.body.fanOut.outcome.counts, { COMPLETED: 4, FAILED: 1 });
    assert.deepEqual(done.body.fanOut.outcome.verdicts, { SUPPORTED_WITHIN_PROTOCOL: 2, FALSIFIED_WITHIN_PROTOCOL: 1, INCONCLUSIVE: 1 });
    const completed = done.body.fanOut.children.filter((c) => c.state === 'COMPLETED');
    for (const key of ['outputHash', 'experimentId', 'evidenceContentHash', 'predictionFingerprint']) {
      assert.equal(new Set(completed.map((c) => c[key])).size, 4, `${key} is distinct per child`);
    }
    assert.deepEqual(completed.map((c) => c.replayVerdict).sort(), ['MATCH', 'MATCH', 'MATCH', 'NOT_APPLICABLE'], 'three real engine outputs replay identically; the rejected input has nothing to replay');
    const failed = done.body.fanOut.children.find((c) => c.state === 'FAILED');
    assert.equal(failed.jobState, 'DEAD_LETTER');
    assert.ok(failed.failureCode && failed.failureCode !== 'UNKNOWN');

    const recorded = events(ctx.db, ctx.runId, 'FANOUT_RECONCILED');
    assert.equal(recorded.length, 1, 'the worker reconciled once; the read recorded nothing new');
    assert.equal(recorded[0].revision, 1);
    assert.equal(ctx.db.prepare('SELECT status FROM agent_runs WHERE id = ?').get(ctx.runId).status, 'RUNNING');
    const parent = (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun;
    assert.equal(parent.researchState.chain.ok, true);
    assert.equal(parent.experiments.length, 0, 'the parent executed nothing itself');

    // Retry: the failure is deterministic, so it fails again under a new generation; the number of attempts is bounded.
    const retried = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/fanout/retry/${failed.childRunId}`, { token: ctx.owner.token, body: {} });
    assert.equal(retried.status, 202);
    assert.equal(retried.body.status, 'RETRY_QUEUED');
    assert.notEqual(retried.body.job.jobId, failed.jobId, 'a retry is a new job generation, never a revived one');
    assert.deepEqual(await drain(worker), ['DEAD_LETTER']);
    assert.equal(events(ctx.db, ctx.runId, 'FANOUT_RECONCILED').length, 2, 'the changed outcome is a new revision');
    const second = await retryChild(ctx.db, ctx.projectId, ctx.runId, failed.childRunId);
    assert.equal(second.ok, true);
    await drain(worker);
    const limit = await retryChild(ctx.db, ctx.projectId, ctx.runId, failed.childRunId);
    assert.equal(limit.status, 'RETRY_LIMIT_REACHED');
    assert.equal(limit.limit, MAX_CHILD_GENERATIONS);
    const notRetryable = await retryChild(ctx.db, ctx.projectId, ctx.runId, completed[0].childRunId);
    assert.equal(notRetryable.status, 'CHILD_NOT_RETRYABLE', 'finished science is never re-run');
    assert.equal(reconcileFanOut(ctx.db, ctx.projectId, ctx.runId).fanOut.children.filter((c) => c.state === 'COMPLETED').length, 4);
  } finally { ctx.db.close(); }
});

test('fan-out: cancelling the parent stops unstarted children, keeps finished ones, and nothing runs afterwards', { skip }, async () => {
  const ctx = await setup(':memory:', 'fanout-cancel@genesis.test');
  try {
    const hyps = ctx.db.prepare("SELECT 1").get() && (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun.plan.hypotheses.map((h) => h.hypothesisId);
    const good = [hyps[0], hyps[3], hyps[4]];
    const spawned = await spawnChildRuns(ctx.db, ctx.projectId, ctx.runId, { hypothesisIds: good });
    assert.equal(spawned.fanOut.children.length, 3);
    const worker = createFanOutAwareWorker(ctx.db, { workerId: 'worker-fanout-cancel' });
    const first = await worker.runOnce();
    assert.equal(first.state, 'SUCCEEDED', JSON.stringify(first.job?.failure));
    const cancelled = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/cancel`, { token: ctx.owner.token, body: { reason: 'Owner stopped the fan-out' } });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(cancelled.body.propagated.map((p) => p.action).sort(), ['CANCELLED', 'CANCELLED', 'KEPT_COMPLETED']);
    assert.equal(cancelled.body.researchRun.run.status, 'CANCELLED');
    assert.deepEqual(cancelled.body.fanOut.outcome.counts, { COMPLETED: 1, CANCELLED: 2 });
    for (const c of cancelled.body.fanOut.children.filter((x) => x.state === 'CANCELLED')) {
      assert.equal(c.jobState, 'CANCELLED');
      assert.match(c.cancelReason, /PARENT_CANCELLED/);
      assert.equal(ctx.db.prepare('SELECT status FROM agent_runs WHERE id = ?').get(c.childRunId).status, 'CANCELLED');
    }
    assert.equal((await worker.runOnce()).state, 'IDLE', 'no cancelled child is ever executed');
    assert.equal((await spawnChildRuns(ctx.db, ctx.projectId, ctx.runId, {})).status, 'RUN_NOT_EXECUTABLE', 'a cancelled parent spawns nothing');
    assert.equal((await retryChild(ctx.db, ctx.projectId, ctx.runId, cancelled.body.fanOut.children.find((c) => c.state === 'CANCELLED').childRunId)).status, 'RUN_NOT_EXECUTABLE');
    const parent = (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun;
    assert.equal(parent.researchState.chain.ok, true);
    assert.equal(events(ctx.db, ctx.runId, 'FANOUT_RECONCILED').at(-1).outcome.state, 'PARTIAL');
    // A second cancel is the same answer, not a second event.
    assert.equal((await cancelFanOut(ctx.db, ctx.projectId, ctx.runId)).ok, true);
  } finally { ctx.db.close(); }
});

test('fan-out: a cancelled child job can be retried under a new generation while the parent runs; limits hold', { skip }, async () => {
  const ctx = await setup(':memory:', 'fanout-limits@genesis.test');
  try {
    const hyps = (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun.plan.hypotheses.map((h) => h.hypothesisId);
    assert.equal((await spawnChildRuns(ctx.db, ctx.projectId, ctx.runId, { hypothesisIds: ['hyp-nope'] })).status, 'HYPOTHESIS_NOT_FOUND');
    assert.equal((await spawnChildRuns(ctx.db, ctx.projectId, ctx.runId, { hypothesisIds: [hyps[0], hyps[0]] })).status, 'INVALID_FANOUT_REQUEST');
    const spawned = await spawnChildRuns(ctx.db, ctx.projectId, ctx.runId, { hypothesisIds: [hyps[0], hyps[4]], timeoutMs: 10 ** 9 });
    const timeouts = ctx.db.prepare('SELECT timeout_ms FROM jobs WHERE idempotency_key IS NOT NULL').all().map((r) => r.timeout_ms);
    assert.deepEqual(timeouts, [300_000, 300_000], 'a job timeout is clamped to the fan-out maximum');
    assert.ok(MAX_FANOUT_CHILDREN >= 4);

    const victim = spawned.fanOut.children[0];
    assert.equal((await queueFor(ctx.db).cancel(victim.jobId, 'OPERATOR')).ok, true);
    const worker = createFanOutAwareWorker(ctx.db, { workerId: 'worker-fanout-limits' });
    assert.deepEqual(await drain(worker), ['SUCCEEDED'], 'the other child ran');
    const settled = reconcileFanOut(ctx.db, ctx.projectId, ctx.runId);
    assert.deepEqual(settled.fanOut.outcome.counts, { CANCELLED: 1, COMPLETED: 1 });
    const retried = await retryChild(ctx.db, ctx.projectId, ctx.runId, victim.childRunId);
    assert.equal(retried.ok, true);
    assert.deepEqual(await drain(worker), ['SUCCEEDED']);
    const final = reconcileFanOut(ctx.db, ctx.projectId, ctx.runId);
    assert.equal(final.status, 'ALL_COMPLETED');
    assert.equal(final.fanOut.children.find((c) => c.childRunId === victim.childRunId).attempts, 2);

    // A child cannot spawn children; a run without a plan cannot fan out.
    assert.equal((await spawnChildRuns(ctx.db, ctx.projectId, victim.childRunId, {})).status, 'FANOUT_NOT_NESTABLE');
    assert.equal((await spawnChildRuns(ctx.db, ctx.projectId, 'agent-run-nope', {})).status, 'NOT_FOUND');
  } finally { ctx.db.close(); }
});

test('fan-out: restart in the middle keeps children and jobs, the finished work is not repeated', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-fanout-'));
  const dbPath = path.join(dir, 'genesis.db');
  const ctx = await setup(dbPath, 'fanout-restart@genesis.test');
  const { runId, projectId } = ctx;
  const hyps = (await ctx.call('GET', `${ctx.base}/research-runs/${runId}`, { token: ctx.owner.token })).body.researchRun.plan.hypotheses.map((h) => h.hypothesisId);
  await spawnChildRuns(ctx.db, projectId, runId, { hypothesisIds: [hyps[0], hyps[4]] });
  assert.equal((await createFanOutAwareWorker(ctx.db, { workerId: 'worker-before-restart' }).runOnce()).state, 'SUCCEEDED');
  ctx.db.close();
  const reopened = openDatabase(dbPath);
  try {
    const again = await spawnChildRuns(reopened, projectId, runId, { hypothesisIds: [hyps[0], hyps[4]] });
    assert.equal(again.status, 'ALREADY_SPAWNED');
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM jobs WHERE idempotency_key IS NOT NULL').get().n, 2);
    const worker = createFanOutAwareWorker(reopened, { workerId: 'worker-after-restart' });
    assert.deepEqual(await drain(worker), ['SUCCEEDED'], 'only the unfinished child runs');
    const final = reconcileFanOut(reopened, projectId, runId);
    assert.equal(final.status, 'ALL_COMPLETED');
    assert.equal(reopened.prepare("SELECT COUNT(*) AS n FROM agent_run_steps WHERE agent_run_id = ? AND capability = 'FANOUT_RECONCILED'").get(runId).n, 1);
    for (const c of final.fanOut.children) assert.equal(getResearchRun(reopened, projectId, c.childRunId).researchState.chain.ok, true);
  } finally { reopened.close(); }
});
