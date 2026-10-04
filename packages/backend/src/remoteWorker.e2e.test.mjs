import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson } from './determinism.mjs';
import { RDKIT, WORKER_TOKEN, boot, gateEnv, inspect, jobStatus, skip, spawnWorker, startModel, waitFor, writeGate } from './remoteWorkerTestKit.mjs';

/**
 * REMOTE WORKER E2E (area 11): the real server (src/server.mjs) and a SEPARATE worker process (src/remoteWorkerMain.mjs)
 * that has no database and no shared file; they talk only over HTTP. The worker is killed with SIGKILL while the real
 * RDKit engine runs (a gate holds the engine call), a second worker takes the job over after the lease expires, and the
 * run ends with exactly one result. Without RDKit the test is SKIPPED as ENGINE_UNAVAILABLE, never passed.
 */

describe('remote ResearchRun worker over HTTP only', () => {
  test('a worker killed mid-engine is replaced by a second worker; exactly one result, verified from the worker artifact', { skip, timeout: 240_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-remote-worker-'));
    const dbPath = path.join(dir, 'genesis.db');
    const wrapper = writeGate(dir);
    const model = await startModel();
    const workerCwd = path.join(dir, 'worker-cwd');
    mkdirSync(workerCwd);
    let server = null;
    const workers = [];
    try {
      server = await boot(dbPath, model.url);
      const url = `http://127.0.0.1:${server.port}`;

      // ---- The worker surface is authenticated and separate from the user API.
      const claimBody = { body: { workerId: 'worker-intruder', leaseMs: 5_000, engines: ['rdkit'] } };
      assert.equal((await server.api('POST', '/api/worker/v1/claim', claimBody)).status, 401, 'no token');
      assert.equal((await server.api('POST', '/api/worker/v1/claim', { ...claimBody, token: 'not-the-worker-token-at-all' })).status, 401, 'wrong token');
      const owner = (await server.api('POST', '/api/auth/register', { body: { email: 'remote-worker@genesis.test', password: 'password123' } })).body;
      assert.equal((await server.api('POST', '/api/worker/v1/claim', { ...claimBody, token: owner.token })).status, 401, 'a user session is not a worker credential');

      const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: 'Remote worker proof' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const runId = (await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is glycerol below 200 Da?' } })).body.researchRun.researchRunId;
      assert.equal((await server.api('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
      const queued = await server.api('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true, remote: true } });
      assert.equal(queued.status, 202, JSON.stringify(queued.body));
      const jobId = queued.body.job.jobId;
      assert.equal(queued.body.job.capabilityId, 'research-run-experiment-remote');
      assert.equal(queued.body.job.maxAttempts, 3);
      // The in-process worker never takes a remote job.
      await delay(1_500);
      assert.equal(jobStatus(dbPath, jobId), 'QUEUED', 'the local worker leaves remote jobs to remote workers');
      assert.equal(inspect(dbPath, runId).types.includes('PREDICTIONS_FROZEN'), false, 'nothing is frozen before a worker claims');

      // ---- Worker A claims over HTTP; the engine call is held inside the real RDKit call, then A is killed.
      const gateA = gateEnv(dir, wrapper, 'worker-a', 1);
      const workerA = spawnWorker({ url, id: 'worker-remote-a', extraEnv: gateA.env, cwd: workerCwd });
      workers.push(workerA);
      await waitFor(() => existsSync(gateA.hitFile), 'the engine call of worker A', 90_000);
      const hit = JSON.parse(readFileSync(gateA.hitFile, 'utf8'));
      const midA = inspect(dbPath, runId);
      assert.deepEqual(midA.types, ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN'], 'the server froze the prediction before the engine ran');
      assert.equal(midA.jobs[0].status, 'CLAIMED');
      assert.equal(midA.jobs[0].worker_id, 'worker-remote-a');
      assert.equal(midA.jobs[0].attempts, 1);
      const leaseA = midA.jobs[0].lease_id;
      // The engine blocks its own process, not the worker: heartbeats keep extending the lease while it is held.
      const expiry1 = midA.jobs[0].lease_expires_at;
      await waitFor(() => inspect(dbPath, runId).jobs[0].lease_expires_at > expiry1, 'a heartbeat from worker A during the engine call', 20_000);
      await workerA.kill();
      if (Number.isInteger(hit.parent)) { try { process.kill(hit.parent, 'SIGKILL'); } catch { /* already gone */ } }

      const crashed = inspect(dbPath, runId);
      assert.deepEqual(crashed.types, ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN'], 'no result from a dead worker');
      assert.equal(crashed.scienceRuns, 0);
      assert.equal(crashed.jobs[0].result_json, null);
      const frozen = crashed.events[2].event;

      // ---- Worker B takes over after the lease expires; it does not hold anything.
      const workerB = spawnWorker({ url, id: 'worker-remote-b', cwd: workerCwd });
      workers.push(workerB);
      await waitFor(() => ['SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'].includes(jobStatus(dbPath, jobId)), 'worker B to finish the job', 120_000);
      const done = inspect(dbPath, runId);
      assert.equal(done.jobs.length, 1, 'one job');
      assert.equal(done.jobs[0].status, 'SUCCEEDED', `${done.jobs[0].failure_json} ${workerB.output()}`);
      assert.equal(done.jobs[0].attempts, 2, 'second attempt, by the second worker');
      const result = JSON.parse(done.jobs[0].result_json);
      assert.equal(result.result.remote.workerId, 'worker-remote-b');

      // ---- Exactly one result, and it is the same experiment that was frozen before the kill.
      const token = owner.token;
      const run = (await server.api('GET', `${base}/research-runs/${runId}`, { token })).body.researchRun;
      assert.equal(run.researchState.chain.ok, true);
      const once = (type) => run.researchState.events.filter((e) => e.type === type).length;
      for (const type of ['PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT', 'ARTIFACT_PERSISTED']) assert.equal(once(type), 1, `exactly one ${type}`);
      assert.deepEqual(run.researchState.events[2], frozen, 'the frozen prediction was not re-frozen');
      assert.equal(run.experiments.length, 1);
      const [x] = run.experiments;
      assert.equal(x.experimentId, frozen.payload.experimentId);
      assert.equal(x.frozen.predictionFingerprint, frozen.payload.predictionFingerprint);
      assert.equal(x.execution.engine.engineId, 'rdkit');
      assert.equal(x.execution.engine.version, RDKIT.version);
      assert.equal(x.execution.executedOn.mode, 'REMOTE_HTTP');
      assert.equal(x.execution.executedOn.workerId, 'worker-remote-b');
      assert.equal(x.execution.executedOn.attempt, 2);
      assert.equal(x.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
      assert.equal(x.evidence.status, 'PROPOSED');
      assert.equal(x.next.replay.verdict, 'MATCH', 'the server replays the worker result on its own engine');
      assert.equal(x.next.replay.originalOutputHash, x.next.replay.replayOutputHash);
      assert.equal(done.records, 2, 'preregistration + one sealed session');
      assert.equal(done.scienceRuns, 1);
      assert.equal(done.verifications, 1);
      const proposals = (await server.api('GET', '/api/knowledge/proposals')).body.proposals.filter((p) => p.proposalId === x.evidence.evidenceProposalId);
      assert.equal(proposals.length, 1, 'one Evidence proposal');

      // ---- Provenance: the stored worker artifact is what the record was built from.
      const sha = x.execution.executedOn.outcomeArtifactSha256;
      const stored = readFileSync(path.join(dir, 'artifacts', 'sha256', sha.slice(0, 2), sha));
      assert.equal(createHash('sha256').update(stored).digest('hex'), sha, 'content-addressed: the bytes hash to their address');
      const outcome = JSON.parse(stored.toString('utf8'));
      assert.equal(outcome.workerId, 'worker-remote-b');
      assert.equal(outcome.jobId, jobId);
      assert.equal(outcome.inputHash, x.execution.inputHash);
      assert.equal(createHash('sha256').update(canonicalJson(outcome.engineResult.output)).digest('hex'), x.execution.outputHash);
      const artifact = await server.api('GET', `${base}/research-runs/${runId}/experiments/${x.experimentId}/artifact`, { token });
      assert.equal(artifact.status, 200, JSON.stringify(artifact.body));
      assert.equal(artifact.body.verified, true);
      const pack = await server.api('GET', `${base}/research-runs/${runId}/evidence-pack`, { token });
      assert.equal(pack.status, 200, JSON.stringify(pack.body));
      const verified = await server.api('POST', `${base}/research-runs/${runId}/evidence-pack/verify`, { token, body: { pack: pack.body.pack } });
      assert.equal(verified.body.verification.ok, true, JSON.stringify(verified.body));

      // ---- A zombie: worker A's old lease can neither heartbeat, upload nor complete, and writes nothing.
      const zombie = (path_, body) => server.api('POST', `/api/worker/v1/jobs/${jobId}/${path_}`, { token: WORKER_TOKEN, body: { leaseId: leaseA, ...body } });
      assert.equal((await zombie('heartbeat', { leaseMs: 5_000 })).status, 409);
      const stale = await zombie('complete', { artifactSha256: sha });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error, 'LEASE_NOT_ACTIVE');
      assert.equal((await zombie('fail', { failure: { code: 'ZOMBIE' } })).status, 409);
      const after = inspect(dbPath, runId);
      assert.deepEqual(after.types, done.types, 'a refused zombie wrote nothing');
      assert.equal(after.jobs[0].status, 'SUCCEEDED');
      assert.equal(after.jobs.length, 1);
    } finally {
      for (const w of workers) await w.kill();
      await server?.kill();
      await model.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
