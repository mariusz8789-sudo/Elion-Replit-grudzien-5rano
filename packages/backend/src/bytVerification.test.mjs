import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, describe } from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase, CURRENT_SCHEMA_VERSION } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { createResearchRunWorker, queueFor, RESEARCH_EXPERIMENT_CAPABILITY } from './researchRunJobs.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { DEFAULT_RESEARCH_TOOLS } from './researchRunEngines.mjs';
import { buildProjectBytProjection } from './cognitiveState.mjs';
import { buildResearchRunEvidencePack } from './researchRunEvidencePack.mjs';
import { controlResearchRun } from './researchRun.mjs';
import { RESEARCH_STATE_TOOL } from './agentRun.mjs';
import { listProposals } from './knowledgeApi.mjs';

/**
 * BYT VERIFICATION (docs/genesis1/BYT-VERIFICATION.md). Persistent scientific state is the canonical
 * ResearchRun chain (agent_run_steps), Scientific Memory (experiment_records), science_runs/replays,
 * the evidence ledger and the lease queue (jobs). BYT is only their projection. These tests corrupt,
 * truncate, forge and migrate that state and require: refused loudly or restored identically, never a
 * phantom result and never a second execution. Real RDKit only; without it the tests are SKIPPED as
 * ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME), never passed.
 */
const RDKIT = rdkitDetect();
const skip = engineUnavailable('rdkit', RDKIT);
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is aspirin small and hydrophilic?', whyItMatters: 'BYT verification.' }],
  hypotheses: [
    hypothesis('Aspirin molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true }),
    hypothesis('Aspirin Crippen logP is above 3.', { observable: 'crippenLogP', operator: '>', value: 3, critical: true }),
  ],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(PLAN), model: 'fixture' }; },
});

let seq = 0;
async function setup(db) {
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
  seq += 1;
  const email = `byt-verify-${seq}-${process.pid}@genesis.test`;
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: `BYT verification ${seq}` } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: `Is aspirin small and hydrophilic? (${seq})` } })).body.researchRun.researchRunId;
  assert.equal((await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
  const view = () => call('GET', `${base}/research-runs/${runId}`, { token: owner.token }).body.researchRun;
  return { call, owner, project, base, runId, view, email };
}

/** The real RDKit executor, wrapped only to COUNT engine invocations (the result is the engine's own). */
function countingTools() {
  const counter = { runs: 0 };
  const real = DEFAULT_RESEARCH_TOOLS.executors.rdkit;
  const tools = { ...DEFAULT_RESEARCH_TOOLS, executors: { ...DEFAULT_RESEARCH_TOOLS.executors, rdkit: { ...real, run(input) { counter.runs += 1; return real.run(input); } } } };
  return { tools, counter };
}

const stepsOf = (db, runId) => db.prepare('SELECT step_index, capability FROM agent_run_steps WHERE agent_run_id = ? AND tool_invoked = ? ORDER BY step_index').all(runId, RESEARCH_STATE_TOOL);
const count = (db, sql, ...args) => db.prepare(sql).get(...args).n;

describe('BYT verification — corrupted, truncated and forged state', () => {
  for (const [label, keep] of [
    ['PREDICTIONS_FROZEN and everything after it', 2],
    ['EXPERIMENT_HANDOFF and everything after it', 3],
    ['SELF_FALSIFICATION and everything after it', 4],
  ]) {
    test(`tail truncation that loses ${label} is detected against Scientific Memory: refused loudly, the engine never re-runs, no phantom result`, { skip }, async () => {
      const db = openDatabase();
      try {
        const ctx = await setup(db);
        assert.equal(executeResearchExperiment(db, ctx.project.id, ctx.runId).status, 'EXECUTED');
        assert.deepEqual(stepsOf(db, ctx.runId).map((s) => s.capability), ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT']);
        const scienceRuns = count(db, 'SELECT count(*) n FROM science_runs');
        const records = count(db, 'SELECT count(*) n FROM experiment_records');

        // A prefix of a valid hash chain is itself valid: the chain alone cannot see this.
        db.prepare('DELETE FROM agent_run_steps WHERE agent_run_id = ? AND step_index >= ?').run(ctx.runId, keep);
        const broken = ctx.view();
        assert.equal(broken.researchState.chain.ok, false);
        assert.equal(broken.researchState.chain.reason, 'chain_truncated_behind_scientific_memory');
        assert.equal(broken.researchState.chain.brokenAt, keep);
        assert.equal(broken.nextStep, 'STATE_INTEGRITY_FAILURE');

        const byt = buildProjectBytProjection(db, ctx.project.id);
        assert.deepEqual(byt.continuity, { researchRuns: 1, verifiedRuns: 0, brokenRuns: 1 });
        assert.deepEqual(byt.predictionLedger, [], 'a broken run contributes no prediction, verdict or Necropolis row');

        const { tools, counter } = countingTools();
        const sync = executeResearchExperiment(db, ctx.project.id, ctx.runId, { tools });
        assert.equal(sync.ok, false);
        assert.equal(sync.status, 'STATE_INTEGRITY_FAILURE');
        assert.equal(counter.runs, 0, 'the engine is not executed again behind a sealed record');

        const queued = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/experiments`, { token: ctx.owner.token, body: { async: true } });
        assert.equal(queued.status, 202);
        const result = await createResearchRunWorker(db, { workerId: 'worker-byt-truncated', tools }).runOnce();
        assert.equal(result.state, 'DEAD_LETTER');
        const job = ctx.call('GET', queued.body.poll, { token: ctx.owner.token }).body.job;
        assert.equal(job.failure.code, 'STATE_INTEGRITY_FAILURE');
        assert.equal(job.result, null, 'never a phantom COMPLETED');
        assert.equal(counter.runs, 0);

        assert.equal(controlResearchRun(db, ctx.project.id, ctx.runId, 'PAUSE').status, 'STATE_INTEGRITY_FAILURE', 'a truncated run accepts no further event');
        const pack = await buildResearchRunEvidencePack(db, ctx.project.id, ctx.runId);
        assert.equal(pack.ok, false);
        assert.equal(pack.status, 'STATE_INTEGRITY_FAILURE');
        assert.equal(count(db, 'SELECT count(*) n FROM science_runs'), scienceRuns, 'no second Scientific Run');
        assert.equal(count(db, 'SELECT count(*) n FROM experiment_records'), records, 'no second preregistration or seal');
      } finally { db.close(); }
    });
  }

  test('a tail lost after the last Scientific Memory record is restored deterministically: same events, same head, nothing re-run', { skip }, async () => {
    const db = openDatabase();
    try {
      const ctx = await setup(db);
      assert.equal(executeResearchExperiment(db, ctx.project.id, ctx.runId).status, 'EXECUTED');
      const original = ctx.view();
      const proposals = listProposals().proposals.filter((p) => p.sourceUrl?.includes(ctx.runId)).length;
      const verifications = count(db, 'SELECT count(*) n FROM science_run_verifications');
      db.prepare('DELETE FROM agent_run_steps WHERE agent_run_id = ? AND step_index >= 5').run(ctx.runId);
      assert.equal(ctx.view().nextStep, 'PROPOSE_EVIDENCE');

      const { tools, counter } = countingTools();
      const resumed = executeResearchExperiment(db, ctx.project.id, ctx.runId, { tools });
      assert.equal(resumed.ok, true);
      assert.equal(counter.runs, 0, 'the engine output is not recomputed');
      const restored = ctx.view();
      assert.equal(restored.researchState.chain.ok, true);
      assert.equal(restored.researchState.chain.head, original.researchState.chain.head, 'the same head: the lost events are re-derived from append-only records, identically');
      const strip = (events) => events.map((e) => Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'at')));
      assert.deepEqual(strip(restored.researchState.events), strip(original.researchState.events));
      assert.equal(listProposals().proposals.filter((p) => p.sourceUrl?.includes(ctx.runId)).length, proposals, 'the evidence proposal is not duplicated');
      assert.equal(count(db, 'SELECT count(*) n FROM science_run_verifications'), verifications, 'the first replay row is reused, not replayed again');
    } finally { db.close(); }
  });

  test('a partially written (truncated) event row is detected: STATE_INTEGRITY_FAILURE everywhere, nothing executes', { skip }, async () => {
    const db = openDatabase();
    try {
      const ctx = await setup(db);
      const row = db.prepare('SELECT id, observation_json FROM agent_run_steps WHERE agent_run_id = ? AND step_index = 1').get(ctx.runId);
      db.prepare('UPDATE agent_run_steps SET observation_json = ? WHERE id = ?').run(row.observation_json.slice(0, Math.floor(row.observation_json.length / 2)), row.id);
      const v = ctx.view();
      assert.equal(v.researchState.chain.ok, false);
      assert.equal(v.researchState.chain.brokenAt, 1);
      assert.equal(v.researchState.chain.reason, 'malformed_event');
      const { tools, counter } = countingTools();
      assert.equal(executeResearchExperiment(db, ctx.project.id, ctx.runId, { tools }).status, 'STATE_INTEGRITY_FAILURE');
      assert.equal(counter.runs, 0);
      assert.equal(buildProjectBytProjection(db, ctx.project.id).continuity.brokenRuns, 1);
      assert.equal(count(db, 'SELECT count(*) n FROM experiment_records'), 0, 'nothing was preregistered on a broken chain');
    } finally { db.close(); }
  });

  test('a job row whose ResearchRun does not exist dead-letters on its only attempt; no run, record or result is created', async () => {
    const db = openDatabase();
    try {
      const runsBefore = count(db, 'SELECT count(*) n FROM agent_runs');
      const queued = await queueFor(db).enqueue({
        jobId: 'job-rr-orphan-0001', idempotencyKey: 'idem-rr-orphan-0001', experimentId: 'queued-orphan-0001',
        researchRunId: 'missing-research-run', capabilityId: RESEARCH_EXPERIMENT_CAPABILITY,
        priority: 5, maxAttempts: 1, timeoutMs: 120_000, payload: { projectId: 'missing-project', hypothesisId: null, userId: null },
      });
      assert.equal(queued.ok, true);
      const result = await createResearchRunWorker(db, { workerId: 'worker-byt-orphan' }).runOnce();
      assert.equal(result.state, 'DEAD_LETTER');
      const job = createSqliteScientificJobQueueBackend({ db }).get('job-rr-orphan-0001');
      assert.equal(job.state, 'DEAD_LETTER');
      assert.equal(job.failure.code, 'NOT_FOUND');
      assert.equal(job.result, null);
      assert.equal(job.attempts, 1);
      assert.equal(count(db, 'SELECT count(*) n FROM agent_runs'), runsBefore);
      assert.equal(count(db, 'SELECT count(*) n FROM experiment_records'), 0);
      assert.equal((await createResearchRunWorker(db, { workerId: 'worker-byt-orphan-2' }).runOnce()).state, 'IDLE', 'not retried');
    } finally { db.close(); }
  });

  test('a forged SUCCEEDED job row creates no result: the run, BYT and the Evidence Pack read the chain, never the job row', { skip }, async () => {
    const db = openDatabase();
    try {
      const ctx = await setup(db);
      const queued = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/experiments`, { token: ctx.owner.token, body: { async: true } });
      db.prepare(`UPDATE jobs SET status = 'SUCCEEDED', result_json = ? WHERE id = ?`)
        .run(JSON.stringify({ record: { status: 'SUCCESS', experimentId: 'exp-forged' }, result: { status: 'EXECUTED' } }), queued.body.job.jobId);
      const v = ctx.view();
      assert.equal(v.experiments.length, 0);
      assert.equal(v.nextStep, 'AWAITING_EXECUTION');
      const byt = buildProjectBytProjection(db, ctx.project.id);
      assert.deepEqual(byt.predictionLedger, []);
      const pack = await buildResearchRunEvidencePack(db, ctx.project.id, ctx.runId);
      assert.equal(pack.ok, false);
      assert.equal(pack.status, 'BLOCKED');
    } finally { db.close(); }
  });
});

describe('BYT verification — idempotency of the lease queue', () => {
  test('repeat submit, claim, complete, fail and cancel never change a finished job or execute it twice', async () => {
    const db = openDatabase();
    try {
      const backend = createSqliteScientificJobQueueBackend({ db });
      const job = {
        jobId: 'job-idem-0001', idempotencyKey: 'idem-idem-0001', experimentId: 'exp-idem-0001', researchRunId: 'run-idem-0001',
        capabilityId: 'capability-idem', priority: 1, maxAttempts: 1, timeoutMs: 60_000, payload: {},
      };
      const first = await backend.enqueue(job);
      const again = await backend.enqueue({ ...job, jobId: 'job-idem-0002' });
      assert.equal(first.deduped, false);
      assert.equal(again.deduped, true);
      assert.equal(again.job.jobId, 'job-idem-0001', 'the idempotency key, not the job id, decides');
      assert.equal(count(db, 'SELECT count(*) n FROM jobs WHERE idempotency_key IS NOT NULL'), 1);

      const claimed = (await backend.claim('worker-idem-a', 30_000)).job;
      assert.equal((await backend.claim('worker-idem-b', 30_000)).job, null, 'a live lease is never claimed twice');
      assert.equal((await backend.complete(claimed.jobId, claimed.leaseId, { record: { status: 'SUCCESS', n: 1 } })).ok, true);
      assert.deepEqual(await backend.complete(claimed.jobId, claimed.leaseId, { record: { status: 'SUCCESS', n: 2 } }), { ok: false, error: 'LEASE_NOT_ACTIVE' });
      assert.deepEqual(await backend.fail(claimed.jobId, claimed.leaseId, { code: 'LATE' }), { ok: false, error: 'LEASE_NOT_ACTIVE' });
      assert.deepEqual(await backend.heartbeat(claimed.jobId, claimed.leaseId, 30_000), { ok: false, error: 'LEASE_NOT_ACTIVE' });
      assert.deepEqual(await backend.cancel(claimed.jobId, 'LATE'), { ok: false, error: 'JOB_NOT_CANCELLABLE' });
      assert.equal((await backend.claim('worker-idem-c', 30_000)).job, null);
      const final = backend.get('job-idem-0001');
      assert.equal(final.state, 'SUCCEEDED');
      assert.equal(final.attempts, 1);
      assert.deepEqual(final.result, { record: { status: 'SUCCESS', n: 1 } }, 'the first completion stands');
      assert.equal((await backend.enqueue(job)).deduped, true, 'resubmitting a finished job does not reopen it');
    } finally { db.close(); }
  });
});

describe('BYT verification — a live worker is not mistaken for a dead one', () => {
  test('an engine call that blocks the event loop past the lease still completes its job once when no other worker took the lease', { skip }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-slow-'));
    const db = openDatabase();
    try {
      const ctx = await setup(db);
      const real = DEFAULT_RESEARCH_TOOLS.executors.rdkit;
      // The real RDKit result, delivered after the 1.5 s lease has run out; heartbeats cannot fire meanwhile.
      const slow = { ...DEFAULT_RESEARCH_TOOLS, executors: { ...DEFAULT_RESEARCH_TOOLS.executors, rdkit: { ...real, run(input) { const out = real.run(input); const until = Date.now() + 2_000; while (Date.now() < until) { /* synchronous, like execFileSync */ } return out; } } } };
      const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
      const queued = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/experiments`, { token: ctx.owner.token, body: { async: true } });
      const result = await createResearchRunWorker(db, { workerId: 'worker-byt-slow', leaseMs: 1_500, tools: slow, artifactStorage: storage }).runOnce();
      assert.equal(result.state, 'SUCCEEDED', JSON.stringify(result));
      const job = ctx.call('GET', queued.body.poll, { token: ctx.owner.token }).body.job;
      assert.equal(job.state, 'SUCCEEDED');
      assert.equal(job.attempts, 1);
      const v = ctx.view();
      assert.equal(v.experiments.length, 1);
      assert.equal(v.researchState.events.filter((e) => e.type === 'ARTIFACT_PERSISTED').length, 1);
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('BYT verification — schema migration of persistent scientific state', () => {
  test('a schema v14 database holding a ResearchRun opens as v15 with the same chain, BYT and Evidence Pack, and its queue works', { skip }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-v14-'));
    const dbPath = path.join(dir, 'genesis.db');
    let db = openDatabase(dbPath);
    try {
      const ctx = await setup(db);
      assert.equal(executeResearchExperiment(db, ctx.project.id, ctx.runId).status, 'EXECUTED');
      const before = ctx.view();
      const bytBefore = buildProjectBytProjection(db, ctx.project.id);
      const packBefore = await buildResearchRunEvidencePack(db, ctx.project.id, ctx.runId);
      assert.equal(packBefore.ok, true);

      // Rewind the file to the v14 shape: the V15 lease columns and their indexes did not exist yet.
      db.exec('DROP INDEX IF EXISTS idx_jobs_idempotency; DROP INDEX IF EXISTS idx_jobs_scientific_claim;');
      for (const column of ['idempotency_key', 'research_run_id', 'experiment_id', 'capability_id', 'priority', 'max_attempts', 'attempts', 'timeout_ms', 'worker_id', 'lease_id', 'lease_expires_at', 'failure_json', 'cancel_reason']) {
        db.exec(`ALTER TABLE jobs DROP COLUMN ${column}`);
      }
      db.exec('PRAGMA user_version = 14');
      db.close();

      db = openDatabase(dbPath);
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
      assert.ok(db.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === 'lease_expires_at'));
      const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider() });
      const token = call('POST', '/api/auth/login', { body: { email: ctx.email, password: 'password123' } }).body.token;
      const after = call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token }).body.researchRun;
      assert.deepEqual(after.researchState, before.researchState);
      assert.deepEqual(after.experiments, before.experiments);
      assert.deepEqual(buildProjectBytProjection(db, ctx.project.id), bytBefore);
      const packAfter = await buildResearchRunEvidencePack(db, ctx.project.id, ctx.runId);
      assert.equal(packAfter.pack.integrity.stateChainHead, packBefore.pack.integrity.stateChainHead);
      assert.deepEqual(packAfter.pack.experiments, packBefore.pack.experiments);

      // The migrated queue runs the second hypothesis through the same path, once.
      const queued = await call('POST', `${ctx.base}/research-runs/${ctx.runId}/experiments`, { token, body: { async: true } });
      assert.equal(queued.status, 202, JSON.stringify(queued.body));
      assert.equal((await createResearchRunWorker(db, { workerId: 'worker-byt-migrated' }).runOnce()).state, 'SUCCEEDED');
      const run = call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token }).body.researchRun;
      assert.equal(run.experiments.length, 2);
      assert.equal(run.researchState.chain.ok, true);
      assert.equal(run.experiments[1].falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    } finally { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); }
  });
});
