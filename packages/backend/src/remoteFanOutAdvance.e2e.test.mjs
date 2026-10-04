import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { GLYCEROL, WORKER_TOKEN, boot, gateEnv, hypothesis, inspect, jobStatus, skip, spawnWorker, startModel, waitFor, writeGate } from './remoteWorkerTestKit.mjs';

/**
 * REMOTE FAN-OUT AND ADVANCE E2E (area 11, part 2): the real server and SEPARATE worker processes that only speak
 * HTTP. Fan-out children and advance steps travel the same /api/worker/v1 lease as a single experiment: the server
 * freezes before any engine runs, applies the worker's stored outcome and replays it on its own engine. A worker is
 * killed with SIGKILL inside the real RDKit engine and another one finishes the work. Without RDKit: SKIPPED.
 */
const ETHANOL = 'CCO';
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const ACETIC = 'CC(=O)O';
const light = (claim, smiles, value = 200) => hypothesis(claim, { observable: 'molWt', operator: '<', value, critical: true }, smiles);
const planOf = (question, hypotheses) => ({ subProblems: [{ question, whyItMatters: 'Remote worker proof.' }], hypotheses, nextActions: ['Human review'] });

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function start(plan, name) {
  const dir = mkdtempSync(path.join(tmpdir(), `genesis-remote-${name}-`));
  const dbPath = path.join(dir, 'genesis.db');
  const model = await startModel(plan);
  const workerCwd = path.join(dir, 'worker-cwd');
  mkdirSync(workerCwd);
  const server = await boot(dbPath, model.url);
  const owner = (await server.api('POST', '/api/auth/register', { body: { email: `${name}@genesis.test`, password: 'password123' } })).body;
  const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: `Remote ${name}` } })).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Remote worker proof?' } })).body.researchRun.researchRunId;
  assert.equal((await server.api('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
  const url = `http://127.0.0.1:${server.port}`;
  return {
    dir, dbPath, model, server, owner, project, base, runId, url, workerCwd, workers: [],
    get: async (p) => (await server.api('GET', `${base}${p}`, { token: owner.token })),
    post: async (p, body) => (await server.api('POST', `${base}${p}`, { token: owner.token, body })),
    worker: (opts) => { const w = spawnWorker({ url, cwd: workerCwd, ...opts }); ctx.workers.push(w); return w; },
    async done() {
      for (const w of this.workers) await w.kill();
      await server.kill();
      await model.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
let ctx;

const once = (events, type) => events.filter((e) => e.type === type).length;

describe('remote fan-out and advance over HTTP only', () => {
  test('fan-out of 3 children on 2 workers: one worker is killed inside the engine, every child ends with exactly one result', { skip, timeout: 300_000 }, async () => {
    ctx = await start(planOf('Which of these are light?', [light('Glycerol is below 200 Da.', GLYCEROL), light('Ethanol is below 100 Da.', ETHANOL, 100), light('Acetic acid is below 100 Da.', ACETIC, 100)]), 'fanout');
    try {
      const spawned = await ctx.post(`/research-runs/${ctx.runId}/fanout/spawn`, { remote: true });
      assert.equal(spawned.status, 202, JSON.stringify(spawned.body));
      assert.equal(spawned.body.fanOut.children.length, 3);
      const jobIds = spawned.body.fanOut.children.map((c) => c.jobId);
      assert.equal(new Set(jobIds).size, 3);
      await delay(1_500);
      assert.deepEqual(jobIds.map((id) => jobStatus(ctx.dbPath, id)), ['QUEUED', 'QUEUED', 'QUEUED'], 'the in-process worker takes none of the remote children');

      // Worker A runs alone until it is inside the engine call of the glycerol child, then it is killed.
      const wrapper = writeGate(ctx.dir);
      const gateA = gateEnv(ctx.dir, wrapper, 'worker-a', 1);
      const workerA = ctx.worker({ id: 'worker-remote-a', extraEnv: gateA.env });
      await waitFor(() => existsSync(gateA.hitFile), 'worker A inside the glycerol engine call', 120_000);
      const hit = JSON.parse(readFileSync(gateA.hitFile, 'utf8'));
      const seen = (await ctx.get('/remote-workers')).body;
      const a = seen.workers.find((w) => w.workerId === 'worker-remote-a');
      assert.equal(a.state, 'BUSY', 'the worker view shows the lease');
      assert.equal(a.leases.length, 1);
      assert.equal(a.leases[0].kind, 'EXPERIMENT');
      assert.equal(a.leases[0].fanOutParentRunId, ctx.runId);
      assert.equal(a.leases[0].leaseState, 'ACTIVE');
      assert.ok(Date.parse(a.leases[0].lastHeartbeatAt) > 0);
      const glycerolJob = a.leases[0].jobId;

      // Worker B joins while A is stuck: it takes the children A has not touched.
      const workerB = ctx.worker({ id: 'worker-remote-b' });
      await workerA.kill();
      if (Number.isInteger(hit.parent)) { try { process.kill(hit.parent, 'SIGKILL'); } catch { /* already gone */ } }
      await waitFor(() => jobIds.every((id) => jobStatus(ctx.dbPath, id) === 'SUCCEEDED'), 'all three children to succeed', 150_000);

      const fan = (await ctx.get(`/research-runs/${ctx.runId}/fanout`)).body.fanOut;
      assert.equal(fan.outcome.state, 'ALL_COMPLETED');
      assert.equal(fan.children.length, 3);
      const workersSeen = new Set();
      for (const child of fan.children) {
        assert.equal(child.state, 'COMPLETED');
        assert.equal(child.replayVerdict, 'MATCH', 'each child is replayed on the server');
        const state = inspect(ctx.dbPath, child.childRunId);
        for (const type of ['PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT', 'ARTIFACT_PERSISTED']) assert.equal(once(state.events.map((e) => ({ type: e.type })), type), 1, `${child.childRunId}: exactly one ${type}`);
        assert.equal(state.scienceRuns, 1);
        assert.equal(state.verifications, 1);
        assert.equal(state.jobs.length, 1, 'one job per child');
        const run = (await ctx.get(`/research-runs/${child.childRunId}`)).body.researchRun;
        assert.equal(run.researchState.chain.ok, true);
        assert.equal(run.experiments.length, 1);
        workersSeen.add(run.experiments[0].execution.executedOn.workerId);
        assert.equal(run.experiments[0].execution.executedOn.mode, 'REMOTE_HTTP');
      }
      const takenOver = inspect(ctx.dbPath, fan.children.find((c) => c.jobId === glycerolJob).childRunId);
      assert.equal(takenOver.jobs[0].attempts, 2, 'the killed worker\'s child was taken over once');
      const takenOverRun = (await ctx.get(`/research-runs/${fan.children.find((c) => c.jobId === glycerolJob).childRunId}`)).body.researchRun;
      assert.equal(takenOverRun.experiments[0].execution.executedOn.workerId, 'worker-remote-b');
      assert.equal(takenOverRun.experiments[0].execution.executedOn.attempt, 2);
      assert.ok(workersSeen.has('worker-remote-b'));
      const parent = inspect(ctx.dbPath, ctx.runId);
      assert.equal(once(parent.events.map((e) => ({ type: e.type })), 'FANOUT_RECONCILED'), 1, 'the parent recorded the outcome once');
      assert.equal(workerB.output().includes('LEASE_LOST'), false);
    } finally { await ctx.done(); }
  });

  test('remote advance: 3 steps under one lease, the worker is killed in step 2, another one resumes the same frozen experiment and finishes', { skip, timeout: 300_000 }, async () => {
    ctx = await start(planOf('Are these molecules light?', [light('Aspirin is below 200 Da.', ASPIRIN), light('Glycerol is below 200 Da.', GLYCEROL), light('Ethanol is below 100 Da.', ETHANOL, 100)]), 'advance');
    try {
      const queued = await ctx.post(`/research-runs/${ctx.runId}/advance`, { async: true, remote: true, maxSteps: 3 });
      assert.equal(queued.status, 202, JSON.stringify(queued.body));
      const jobId = queued.body.job.jobId;
      assert.equal(queued.body.job.capabilityId, 'research-run-advance-remote');
      assert.equal(queued.body.job.maxAttempts, 3);

      const wrapper = writeGate(ctx.dir);
      const gateA = gateEnv(ctx.dir, wrapper, 'worker-a', 1);
      const workerA = ctx.worker({ id: 'worker-remote-a', extraEnv: gateA.env });
      await waitFor(() => existsSync(gateA.hitFile), 'worker A inside the engine call of step 2', 120_000);
      const hit = JSON.parse(readFileSync(gateA.hitFile, 'utf8'));
      const mid = inspect(ctx.dbPath, ctx.runId);
      assert.equal(once(mid.events.map((e) => ({ type: e.type })), 'PREDICTIONS_FROZEN'), 2, 'step 1 is applied and step 2 is frozen before its engine runs');
      assert.equal(once(mid.events.map((e) => ({ type: e.type })), 'EXPERIMENT_HANDOFF'), 1);
      assert.equal(once(mid.events.map((e) => ({ type: e.type })), 'EXPERIMENT_CONTINUED'), 0);
      assert.equal(mid.jobs[0].status, 'CLAIMED');
      assert.equal(mid.jobs[0].attempts, 1);
      const frozen2 = mid.events.filter((e) => e.type === 'PREDICTIONS_FROZEN')[1].event;
      const leaseA = mid.jobs[0].lease_id;
      const workerRows = (await ctx.get('/remote-workers')).body.workers;
      assert.equal(workerRows.find((w) => w.workerId === 'worker-remote-a').leases[0].kind, 'ADVANCE');

      await workerA.kill();
      if (Number.isInteger(hit.parent)) { try { process.kill(hit.parent, 'SIGKILL'); } catch { /* already gone */ } }
      ctx.worker({ id: 'worker-remote-b' });
      await waitFor(() => ['SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'].includes(jobStatus(ctx.dbPath, jobId)), 'worker B to finish the advance', 150_000);

      const done = inspect(ctx.dbPath, ctx.runId);
      assert.equal(done.jobs.length, 1);
      assert.equal(done.jobs[0].status, 'SUCCEEDED', `${done.jobs[0].failure_json}`);
      assert.equal(done.jobs[0].attempts, 2);
      const result = JSON.parse(done.jobs[0].result_json).result;
      assert.equal(result.steps, 3);
      assert.equal(result.status, 'STEP_BUDGET_REACHED');
      const events = done.events.map((e) => ({ type: e.type }));
      for (const [type, n] of [['PREDICTIONS_FROZEN', 3], ['EXPERIMENT_HANDOFF', 3], ['SELF_FALSIFICATION', 3], ['EVIDENCE_UPDATE', 3], ['NEXT_EXPERIMENT', 3], ['ARTIFACT_PERSISTED', 3], ['EXPERIMENT_CONTINUED', 2]]) assert.equal(once(events, type), n, `${n} x ${type}`);
      assert.deepEqual(done.events.filter((e) => e.type === 'PREDICTIONS_FROZEN')[1].event, frozen2, 'step 2 was resumed, not frozen again');
      assert.equal(done.scienceRuns, 3);
      assert.equal(done.verifications, 3);
      const run = (await ctx.get(`/research-runs/${ctx.runId}`)).body.researchRun;
      assert.equal(run.researchState.chain.ok, true);
      assert.equal(run.experiments.length, 3);
      assert.deepEqual(run.experiments.map((x) => x.execution.executedOn.workerId), ['worker-remote-a', 'worker-remote-b', 'worker-remote-b']);
      assert.deepEqual(run.experiments.map((x) => x.next.replay.verdict), ['MATCH', 'MATCH', 'MATCH']);
      assert.equal(run.experiments[1].continuedFrom.fromExperimentId, run.experiments[0].experimentId);
      assert.equal(run.experiments[2].continuedFrom.fromExperimentId, run.experiments[1].experimentId);
      // The dead worker's lease is dead for good.
      const stale = await ctx.server.api('POST', `/api/worker/v1/jobs/${jobId}/step`, { token: WORKER_TOKEN, body: { leaseId: leaseA, artifactSha256: 'a'.repeat(64) } });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error, 'LEASE_NOT_ACTIVE');
      assert.equal(inspect(ctx.dbPath, ctx.runId).events.length, done.events.length, 'a refused zombie wrote nothing');
    } finally { await ctx.done(); }
  });

  test('cancelling the fan-out parent stops the remote worker: its lease is withdrawn and the engine process is killed', { skip, timeout: 300_000 }, async () => {
    ctx = await start(planOf('Which of these are light?', [light('Glycerol is below 200 Da.', GLYCEROL), light('Ethanol is below 100 Da.', ETHANOL, 100)]), 'cancel');
    try {
      const spawned = await ctx.post(`/research-runs/${ctx.runId}/fanout/spawn`, { remote: true });
      assert.equal(spawned.status, 202, JSON.stringify(spawned.body));
      const wrapper = writeGate(ctx.dir);
      const gateA = gateEnv(ctx.dir, wrapper, 'worker-a', 1);
      const workerA = ctx.worker({ id: 'worker-remote-a', extraEnv: gateA.env });
      await waitFor(() => existsSync(gateA.hitFile), 'worker A inside the glycerol engine call', 120_000);
      const hit = JSON.parse(readFileSync(gateA.hitFile, 'utf8'));
      assert.ok(alive(hit.parent), 'the engine process is running');

      const cancelled = await ctx.post(`/research-runs/${ctx.runId}/cancel`, { reason: 'proof' });
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      await waitFor(() => workerA.output().includes('LEASE_LOST'), 'worker A to learn that its lease is gone', 30_000);
      await waitFor(() => !alive(hit.parent), 'the engine process to be killed', 30_000);

      const fan = (await ctx.get(`/research-runs/${ctx.runId}/fanout`)).body.fanOut;
      for (const child of fan.children) {
        const state = inspect(ctx.dbPath, child.childRunId);
        assert.ok(['CANCELLED', 'COMPLETED'].includes(child.state), child.state);
        // Which child worker A reached first depends on the queue order; a child that finished before the cancel keeps its result.
        if (child.state === 'CANCELLED') {
          assert.equal(state.events.some((e) => e.type === 'EXPERIMENT_HANDOFF'), false, 'a cancelled child produced no result');
          assert.equal(state.scienceRuns, 0);
          assert.equal(jobStatus(ctx.dbPath, child.jobId), 'CANCELLED');
        } else {
          assert.equal(state.events.filter((e) => e.type === 'EXPERIMENT_HANDOFF').length, 1, 'a finished child keeps exactly its one result');
        }
      }
      assert.ok(fan.children.some((c) => c.state === 'CANCELLED'));
      const parent = (await ctx.get(`/research-runs/${ctx.runId}`)).body.researchRun;
      assert.equal(parent.run.status, 'CANCELLED');
      // The worker is free again and finds nothing to claim.
      await delay(1_500);
      const rows = (await ctx.get('/remote-workers')).body;
      assert.equal(rows.queuedRemoteJobs, 0);
      assert.equal(rows.workers.find((w) => w.workerId === 'worker-remote-a').leases.length, 0);
    } finally { await ctx.done(); }
  });
});
