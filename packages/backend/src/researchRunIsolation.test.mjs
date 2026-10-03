import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setInterval, clearInterval } from 'node:timers';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as pyscfDetect } from './compute/qmAdapter.mjs';
import { runIsolatedProcess } from './compute/isolatedProcess.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { getResearchRun } from './researchRun.mjs';
import { createResearchRunWorker, enqueueResearchExperiment, queueFor } from './researchRunJobs.mjs';
import { createFanOutAwareWorker, spawnChildRuns } from './researchRunFanOut.mjs';

const skipProcess = process.platform === 'win32' ? 'process-group kill is POSIX' : false;
const skipPyscf = engineUnavailable('pyscf', pyscfDetect()) || engineUnavailable('rdkit', rdkitDetect());
const skipRdkit = engineUnavailable('rdkit', rdkitDetect());
// A killed process nobody has reaped yet is a zombie: dead, but still visible to kill(pid, 0).
const alive = (pid) => {
  try { process.kill(pid, 0); } catch { return false; }
  try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
};
const strays = (pattern) => { try { return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; } catch { return 0; } };
// Anchored at the start of the command line so a shell whose text merely mentions the script is not counted.
const ENGINE_PROCESS = '^\\S*python\\S* \\S*qm_worker\\.py';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('isolated process: a timeout or abort kills the child AND what it started, and the loop stays free', { skip: skipProcess }, async () => {
  const script = "const {spawn}=require('node:child_process');const g=spawn('sleep',['30']);console.log('GRANDCHILD '+g.pid);setInterval(()=>{},1000);";
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 20);
  try {
    const t0 = Date.now();
    const timedOut = await runIsolatedProcess({ command: process.execPath, args: ['-e', script], timeoutMs: 600 });
    assert.equal(timedOut.killed, 'TIMEOUT');
    assert.ok(Date.now() - t0 < 3000, 'killed at the deadline, not after the 30 s the descendant wanted');
    assert.ok(ticks >= 15, `the event loop kept running while the child ran (${ticks} ticks)`);
    const grandchild = Number(/GRANDCHILD (\d+)/.exec(timedOut.stdout)?.[1]);
    assert.ok(grandchild > 0);
    await sleep(100);
    assert.equal(alive(timedOut.pid), false);
    assert.equal(alive(grandchild), false, 'the engine process started by the child died with it');

    const controller = new globalThis.AbortController();
    setTimeout(() => controller.abort('LEASE_LOST'), 300);
    const aborted = await runIsolatedProcess({ command: process.execPath, args: ['-e', script], signal: controller.signal, timeoutMs: 20_000 });
    assert.equal(aborted.killed, 'ABORTED');
    const early = await runIsolatedProcess({ command: process.execPath, args: ['-e', 'console.log(1)'], signal: globalThis.AbortSignal.abort() });
    assert.equal(early.killed, 'ABORTED');
    const fine = await runIsolatedProcess({ command: process.execPath, args: ['-e', 'console.log("ok")'], timeoutMs: 5_000 });
    assert.deepEqual([fine.ok, fine.stdout.trim(), fine.killed], [true, 'ok', null]);
  } finally { clearInterval(ticker); }
});

const pyscfPlan = {
  subProblems: [{ question: 'Does acetone converge?', whyItMatters: 'Timeout proof.' }],
  hypotheses: [{
    claim: 'Acetone RHF/6-31G converges.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' }, falsificationProposal: 'The SCF does not converge.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'pyscf', description: 'Real PySCF single point (about 2 s).', parameters: { smiles: 'CC(C)=O', basis: '6-31g', predictions: [{ observable: 'converged', operator: '==', value: true, critical: true }] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = (plan) => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});
async function setup(plan, email) {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-iso-'));
  const db = openDatabase(path.join(dir, 'genesis.db'));
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider(plan) });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Isolation proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Does it run?' } })).body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  return { db, call, owner, project, projectId: project.id, base, runId };
}

test('a real PySCF job that outlives its timeout is killed (not ignored); the retry resumes the same experiment and succeeds', { skip: skipPyscf || skipProcess }, async () => {
  const ctx = await setup(pyscfPlan, 'iso-timeout@genesis.test');
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 25);
  try {
    const worker = createResearchRunWorker(ctx.db, { workerId: 'worker-iso-timeout' });
    const first = await enqueueResearchExperiment(ctx.db, ctx.projectId, ctx.runId, { timeoutMs: 1_000 });
    const t0 = Date.now();
    const out = await worker.runOnce();
    const elapsed = Date.now() - t0;
    assert.equal(out.state, 'DEAD_LETTER');
    assert.equal(out.job.failure.code, 'JOB_TIMEOUT');
    assert.ok(elapsed < 1_900, `stopped at the deadline, not after the ~2 s engine run (${elapsed} ms)`);
    assert.ok(ticks >= 20, `the server's event loop stayed free while the engine ran (${ticks} ticks)`);
    await sleep(300);
    assert.equal(strays(ENGINE_PROCESS), 0, 'no engine process outlived the killed job');
    let run = getResearchRun(ctx.db, ctx.projectId, ctx.runId);
    assert.equal(run.experiments.filter((e) => e.execution).length, 0, 'nothing was executed or sealed by the killed attempt');
    assert.equal(run.researchState.chain.ok, true);

    const retry = await enqueueResearchExperiment(ctx.db, ctx.projectId, ctx.runId, { timeoutMs: 120_000 });
    assert.notEqual(retry.job.jobId, first.job.jobId, 'a retry is a new job generation');
    const ok = await worker.runOnce();
    assert.equal(ok.state, 'SUCCEEDED', JSON.stringify(ok.job?.failure));
    run = getResearchRun(ctx.db, ctx.projectId, ctx.runId);
    assert.equal(run.experiments.length, 1);
    assert.equal(run.experiments[0].execution.status, 'EXECUTED');
    assert.equal(run.experiments[0].falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
    assert.equal(run.researchState.chain.ok, true);
  } finally { clearInterval(ticker); ctx.db.close(); }
});

test('a job cancelled while its real engine runs loses its lease, the engine is killed and no result is written', { skip: skipPyscf || skipProcess }, async () => {
  const ctx = await setup(pyscfPlan, 'iso-cancel@genesis.test');
  try {
    const worker = createResearchRunWorker(ctx.db, { workerId: 'worker-iso-cancel', leaseMs: 3_000 });
    const queued = await enqueueResearchExperiment(ctx.db, ctx.projectId, ctx.runId, { timeoutMs: 120_000 });
    const running = worker.runOnce();
    // Cancel only once the real engine process exists (the child needs a moment to boot, longer on a loaded runner).
    const deadline = Date.now() + 15_000;
    while (strays(ENGINE_PROCESS) === 0 && Date.now() < deadline) await sleep(50);
    assert.ok(strays(ENGINE_PROCESS) >= 1, 'the engine is running in a child');
    assert.equal((await queueFor(ctx.db).cancel(queued.job.jobId, 'OPERATOR')).ok, true);
    const t0 = Date.now();
    const out = await running;
    assert.equal(out.state, 'LEASE_LOST');
    assert.ok(Date.now() - t0 < 2_500, 'the worker noticed the cancel at its next heartbeat');
    await sleep(500);
    assert.equal(strays(ENGINE_PROCESS), 0, 'the engine process was killed');
    const run = getResearchRun(ctx.db, ctx.projectId, ctx.runId);
    assert.equal(run.experiments.filter((e) => e.execution).length, 0, 'a cancelled job produced no result');
    assert.equal(run.researchState.chain.ok, true);
    assert.equal((await worker.runOnce()).state, 'IDLE');
  } finally { ctx.db.close(); }
});

const rdkitPlan = (() => {
  const h = (claim, smiles, operator, value, extra = {}) => ({
    claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' }, falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles, predictions: [{ observable: 'molWt', operator, value, critical: true }] }, parameterChanges: [] }, ...extra,
  });
  return {
    subProblems: [{ question: 'Are these molecules light?', whyItMatters: 'Queued advance proof.' }],
    hypotheses: [h('Aspirin molecular weight is below 200 Da.', 'CC(=O)Oc1ccccc1C(=O)O', '<', 200), h('Caffeine molecular weight is below 200 Da.', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', '<', 200), h('Challenge: aspirin molecular weight is at least 200 Da.', 'CC(=O)Oc1ccccc1C(=O)O', '>=', 200, { challengesHypothesisIndex: 0 })],
    nextActions: ['Human review'],
  };
})();

test('queued advance and queued fan-out run in child processes: the worker finishes them while the server loop stays free', { skip: skipRdkit || skipProcess }, async () => {
  const ctx = await setup(rdkitPlan, 'iso-advance@genesis.test');
  let ticks = 0;
  const ticker = setInterval(() => { ticks += 1; }, 25);
  try {
    const queued = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/advance`, { token: ctx.owner.token, body: { async: true, maxSteps: 5 } });
    assert.equal(queued.status, 202);
    assert.equal(queued.body.job.capabilityId, 'research-run-advance');
    const again = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/advance`, { token: ctx.owner.token, body: { async: true, maxSteps: 5 } });
    assert.equal(again.body.deduped, true, 'the same advance request never queues twice');
    assert.equal(getResearchRun(ctx.db, ctx.projectId, ctx.runId).experiments.length, 0, 'the request executed nothing itself');

    const worker = createFanOutAwareWorker(ctx.db, { workerId: 'worker-iso-advance' });
    const out = await worker.runOnce();
    assert.equal(out.state, 'SUCCEEDED', JSON.stringify(out.job?.failure));
    assert.equal(out.job.result.result.steps, 3);
    assert.equal(out.job.result.result.status, 'AWAITING_HUMAN_REVIEW');
    const run = getResearchRun(ctx.db, ctx.projectId, ctx.runId);
    assert.equal(run.experiments.length, 3);
    assert.equal(run.experiments[1].continuedFrom.fromExperimentId, run.experiments[0].experimentId);
    assert.equal(run.researchState.chain.ok, true);
    const polled = await ctx.call('GET', queued.body.poll, { token: ctx.owner.token });
    assert.equal(polled.body.job.state, 'SUCCEEDED');
    assert.ok(ticks >= 5, `the server loop kept running (${ticks} ticks)`);

    // Fan-out on the same file database: every child job also runs in its own killable process.
    const other = await setup(rdkitPlan, 'iso-fanout@genesis.test');
    try {
      const spawned = await spawnChildRuns(other.db, other.projectId, other.runId, {});
      assert.equal(spawned.fanOut.children.length, 3);
      const fanWorker = createFanOutAwareWorker(other.db, { workerId: 'worker-iso-fanout' });
      const states = [];
      for (let i = 0; i < 5; i += 1) { const r = await fanWorker.runOnce(); if (r.state === 'IDLE') break; states.push(r.state); }
      assert.deepEqual(states, ['SUCCEEDED', 'SUCCEEDED', 'SUCCEEDED']);
      const done = (await other.call('GET', `${other.base}/research-runs/${other.runId}/fanout`, { token: other.owner.token })).body;
      assert.equal(done.status, 'ALL_COMPLETED');
    } finally { other.db.close(); }
  } finally { clearInterval(ticker); ctx.db.close(); }
});
