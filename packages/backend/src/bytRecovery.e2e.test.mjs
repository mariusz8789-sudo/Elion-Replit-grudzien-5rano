import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { openDatabase } from './store.mjs';

/**
 * BYT RECOVERY E2E with REAL process death (docs/genesis1/BYT-VERIFICATION.md).
 *
 * The backend (src/server.mjs, its own queue worker included) runs as a child process on a temp SQLite file.
 * The engine is the real RDKit. To kill the process at an exact point INSIDE a job, GENESIS_RDKIT_PYTHON points
 * at a gate: a wrapper that passes every RDKit call through to the real interpreter, except the N-th
 * `descriptors` call, where it records that it was reached and blocks. The test then SIGKILLs the backend (only
 * the PID it spawned); the gate notices its parent is gone and exits. Nothing in the backend is mocked or told
 * about the gate. Without RDKit the tests are SKIPPED as ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME), never passed.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RDKIT = rdkitDetect();
const skip = engineUnavailable('rdkit', RDKIT);
const REAL_PYTHON = (process.env.GENESIS_RDKIT_PYTHON || process.env.GENESIS_PYTHON || '').trim() || 'python3';
const LEASE_MS = 5_000;
// Glycerol: no reference case, benchmark or toolchain probe in the backend computes it, so the gate sees only this run.
const GLYCEROL = 'OCC(O)CO';
const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: GLYCEROL, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is glycerol below 200 Da?', whyItMatters: 'BYT recovery proof.' }],
  hypotheses: [hypothesis('Glycerol molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true })],
  nextActions: ['Human review'],
};

const GATE_PY = `
import json, os, subprocess, sys, time
raw = sys.stdin.read()
gate_dir = os.environ['GENESIS_TEST_GATE_DIR']
target = os.environ.get('GENESIS_TEST_GATE_CMD', '')
nth = int(os.environ.get('GENESIS_TEST_GATE_NTH', '0'))
try:
    req = json.loads(raw)
except Exception:
    req = {}
cmd = req.get('cmd')
with open(os.path.join(gate_dir, 'calls'), 'a') as log:
    log.write(json.dumps({'cmd': cmd, 'smiles': req.get('smiles')}) + '\\n')
if cmd == target and req.get('smiles') == os.environ.get('GENESIS_TEST_GATE_SMILES') and nth > 0:
    counter = os.path.join(gate_dir, 'count')
    n = (int(open(counter).read()) if os.path.exists(counter) else 0) + 1
    open(counter, 'w').write(str(n))
    if n == nth:
        parent = os.getppid()
        tmp = os.path.join(gate_dir, 'hit.tmp')
        open(tmp, 'w').write(json.dumps({'cmd': cmd, 'n': n, 'pid': os.getpid(), 'parent': parent}))
        os.replace(tmp, os.path.join(gate_dir, 'hit'))
        deadline = time.time() + 30
        while os.getppid() == parent and time.time() < deadline:
            time.sleep(0.05)
        sys.exit(70)
done = subprocess.run([os.environ['GENESIS_TEST_REAL_PYTHON']] + sys.argv[1:], input=raw.encode(), stdout=subprocess.PIPE)
sys.stdout.buffer.write(done.stdout)
sys.exit(done.returncode)
`;

function writeGate(dir) {
  const script = path.join(dir, 'gate.py');
  const wrapper = path.join(dir, 'gate-python');
  writeFileSync(script, GATE_PY);
  writeFileSync(wrapper, `#!/bin/sh\nexec "${REAL_PYTHON}" "${script}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

/** A gated environment: the n-th `descriptors` call of this process blocks. */
function gateEnv(dir, wrapper, name, nth) {
  const gateDir = path.join(dir, `gate-${name}`);
  mkdirSync(gateDir, { recursive: true });
  return {
    env: { GENESIS_RDKIT_PYTHON: wrapper, GENESIS_TEST_REAL_PYTHON: REAL_PYTHON, GENESIS_TEST_GATE_DIR: gateDir, GENESIS_TEST_GATE_CMD: 'descriptors', GENESIS_TEST_GATE_SMILES: GLYCEROL, GENESIS_TEST_GATE_NTH: String(nth) },
    callsFile: path.join(gateDir, 'calls'),
    hitFile: path.join(gateDir, 'hit'),
  };
}

function boot(dbPath, modelUrl, extraEnv = {}) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
      GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: modelUrl, GENESIS_REASONING_MODEL: 'fake-local-model',
      GENESIS_RESEARCH_WORKER_LEASE_MS: String(LEASE_MS),
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('server did not start in time')); }, 60_000);
    let buf = '';
    proc.stderr.on('data', () => {});
    proc.on('exit', (code, signal) => { if (buf !== null) reject(new Error(`server exited before start: ${code ?? signal}`)); });
    proc.stdout.on('data', (chunk) => {
      if (buf === null) return;
      buf += chunk.toString();
      const started = buf.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j?.msg === 'started');
      if (!started) return;
      buf = null;
      clearTimeout(timer);
      const url = `http://127.0.0.1:${started.port}`;
      const api = async (method, p, { token, body } = {}) => {
        const res = await fetch(`${url}${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: res.status, body: await res.json().catch(() => ({})) };
      };
      const kill = () => new Promise((done) => {
        if (proc.exitCode !== null || proc.signalCode !== null) { done(); return; }
        proc.once('exit', () => done());
        proc.kill('SIGKILL'); // only the PID this test spawned
      });
      resolve({ api, kill, pid: proc.pid });
    });
  });
}

async function startModel() {
  const model = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'fake-local-model', choices: [{ message: { content: JSON.stringify(PLAN) } }] }));
    });
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${model.address().port}/v1`, close: () => new Promise((r) => model.close(r)) };
}

async function waitFor(check, what, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await delay(100);
  }
}

/**
 * A look at the file a killed process left behind: plain SELECTs, no migration. Not opened readOnly: after a
 * SIGKILL the WAL index must be recovered, which a read-only handle cannot do (it would see stale pages).
 */
function inspect(dbPath, runId) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  try {
    const events = db.prepare(`SELECT step_index, capability, observation_json FROM agent_run_steps WHERE agent_run_id = ? AND tool_invoked = 'mind.researchState' ORDER BY step_index`).all(runId)
      .map((r) => ({ seq: r.step_index, type: r.capability, event: JSON.parse(r.observation_json) }));
    const jobs = db.prepare(`SELECT id, status, worker_id, attempts, result_json, failure_json FROM jobs WHERE research_run_id = ? ORDER BY created_at, rowid`).all(runId);
    const n = (sql, ...args) => db.prepare(sql).get(...args).n;
    return {
      events,
      types: events.map((e) => e.type),
      jobs,
      records: n(`SELECT count(*) n FROM experiment_records WHERE campaign_id LIKE ?`, `research-run:${runId}:%`),
      scienceRuns: n(`SELECT count(*) n FROM science_runs WHERE provenance_json LIKE ?`, `%${runId}%`),
      verifications: n(`SELECT count(*) n FROM science_run_verifications v JOIN science_runs s ON s.id = v.science_run_id WHERE s.provenance_json LIKE ?`, `%${runId}%`),
    };
  } finally { db.close(); }
}

function jobStatus(dbPath, jobId) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    return db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId)?.status ?? null;
  } finally { db.close(); }
}

describe('BYT recovery with real process death', () => {
  test('SIGKILL inside the engine call and inside the replay: a new process restores the same run and produces exactly one valid result', { skip, timeout: 240_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-kill-'));
    const dbPath = path.join(dir, 'genesis.db');
    const wrapper = writeGate(dir);
    const model = await startModel();
    let server = null;
    try {
      // ---- Process 1: run + plan; the queued job is killed while RDKit computes the frozen experiment.
      const gate1 = gateEnv(dir, wrapper, 'p1', 1);
      server = await boot(dbPath, model.url, gate1.env);
      const firstPid = server.pid;
      const owner = (await server.api('POST', '/api/auth/register', { body: { email: 'byt-kill@genesis.test', password: 'password123' } })).body;
      const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: 'BYT kill proof' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const runId = (await server.api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is glycerol below 200 Da?' } })).body.researchRun.researchRunId;
      assert.equal((await server.api('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
      const planned = (await server.api('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
      const j1 = (await server.api('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true } })).body.job;
      await waitFor(() => existsSync(gate1.hitFile), 'the engine call of process 1');
      assert.equal(JSON.parse(readFileSync(gate1.hitFile, 'utf8')).cmd, 'descriptors');
      await server.kill();
      server = null;

      const crash1 = inspect(dbPath, runId);
      assert.deepEqual(crash1.types, ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN'], 'killed after the freeze, before any result');
      assert.equal(crash1.records, 1, 'the preregistration is in Scientific Memory');
      assert.equal(crash1.scienceRuns, 0);
      assert.equal(crash1.jobs.length, 1);
      assert.equal(crash1.jobs[0].id, j1.jobId);
      assert.equal(crash1.jobs[0].status, 'CLAIMED');
      assert.equal(crash1.jobs[0].worker_id, `worker-research-run-${firstPid}`);
      assert.equal(crash1.jobs[0].result_json, null, 'no phantom result');
      const frozen = crash1.events[2].event;

      // ---- Process 2: same run identity; the abandoned lease is closed, a new job resumes the SAME experiment;
      //      killed again inside the replay (the engine already ran and was sealed, evidence proposed).
      const gate2 = gateEnv(dir, wrapper, 'p2', 2);
      server = await boot(dbPath, model.url, gate2.env);
      let token = (await server.api('POST', '/api/auth/login', { body: { email: 'byt-kill@genesis.test', password: 'password123' } })).body.token;
      const restored = (await server.api('GET', `${base}/research-runs/${runId}`, { token })).body.researchRun;
      assert.equal(restored.researchRunId, runId);
      assert.equal(restored.researchState.chain.ok, true);
      assert.deepEqual(restored.researchState.events.slice(0, 2), planned.researchState.events, 'the plan is restored event for event');
      assert.deepEqual(restored.researchState.events[2], frozen);
      assert.equal(restored.nextStep, 'EXECUTE_EXPERIMENT');
      const zombie = (await server.api('POST', `${base}/research-runs/${runId}/experiments`, { token, body: { async: true } })).body;
      assert.equal(zombie.deduped, true, 'a resubmit while the dead lease is live does not enqueue a second job');
      assert.equal(zombie.job.jobId, j1.jobId);
      // Job states are polled straight from SQLite: the HTTP API is rate limited (60/min) and this is a wait, not a check.
      await waitFor(() => jobStatus(dbPath, j1.jobId) === 'DEAD_LETTER', 'the abandoned lease to expire', LEASE_MS * 6);
      const dead1 = (await server.api('GET', `${base}/research-runs/${runId}/experiment-jobs/${j1.jobId}`, { token })).body.job;
      assert.equal(dead1.state, 'DEAD_LETTER');
      assert.equal(dead1.failure.code, 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS');
      assert.equal(dead1.result, null);
      const j2 = (await server.api('POST', `${base}/research-runs/${runId}/experiments`, { token, body: { async: true } })).body.job;
      assert.notEqual(j2.jobId, j1.jobId);
      await waitFor(() => existsSync(gate2.hitFile), 'the replay call of process 2');
      await server.kill();
      server = null;

      const crash2 = inspect(dbPath, runId);
      assert.deepEqual(crash2.types, ['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION']);
      assert.equal(crash2.records, 2, 'preregistration + one sealed session');
      assert.equal(crash2.scienceRuns, 1);
      assert.equal(crash2.verifications, 0, 'killed inside the replay: no verification row yet');
      assert.deepEqual(crash2.events[2].event, frozen, 'the frozen prediction was not re-frozen');
      assert.equal(crash2.events[3].event.payload.experimentId, frozen.payload.experimentId, 'the resumed execution is the same experiment');
      assert.deepEqual(crash2.jobs.map((j) => j.status), ['DEAD_LETTER', 'CLAIMED']);
      const handoff = crash2.events[3].event;

      // ---- Process 3 (no gate): restore, close the second abandoned lease, finish once.
      server = await boot(dbPath, model.url);
      token = (await server.api('POST', '/api/auth/login', { body: { email: 'byt-kill@genesis.test', password: 'password123' } })).body.token;
      const mid = (await server.api('GET', `${base}/research-runs/${runId}`, { token })).body.researchRun;
      assert.equal(mid.researchState.chain.ok, true);
      assert.deepEqual(mid.researchState.events, crash2.events.map((e) => e.event), 'the exact persisted chain is restored');
      assert.equal(mid.nextStep, 'PROPOSE_EVIDENCE');
      await waitFor(() => jobStatus(dbPath, j2.jobId) === 'DEAD_LETTER', 'the second abandoned lease to expire', LEASE_MS * 6);
      const j3 = (await server.api('POST', `${base}/research-runs/${runId}/experiments`, { token, body: { async: true } })).body.job;
      await waitFor(() => ['SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'].includes(jobStatus(dbPath, j3.jobId)), 'the recovery job');
      const finished = (await server.api('GET', `${base}/research-runs/${runId}/experiment-jobs/${j3.jobId}`, { token })).body.job;
      assert.equal(finished.state, 'SUCCEEDED', JSON.stringify(finished.failure));

      const run = (await server.api('GET', `${base}/research-runs/${runId}`, { token })).body.researchRun;
      assert.equal(run.researchRunId, runId);
      assert.equal(run.researchState.chain.ok, true);
      const once = (type) => run.researchState.events.filter((e) => e.type === type).length;
      for (const type of ['PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT', 'ARTIFACT_PERSISTED']) assert.equal(once(type), 1, `exactly one ${type}`);
      assert.equal(run.experiments.length, 1);
      const [x] = run.experiments;
      assert.deepEqual(run.researchState.events[3], handoff, 'the engine output of process 2 stands: nothing was executed twice');
      assert.equal(x.experimentId, frozen.payload.experimentId);
      assert.equal(x.frozen.predictionFingerprint, frozen.payload.predictionFingerprint);
      assert.equal(x.execution.engine.engineId, 'rdkit');
      assert.equal(x.execution.engine.version, RDKIT.version);
      assert.equal(x.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
      assert.equal(x.evidence.status, 'PROPOSED');
      assert.equal(x.next.replay.verdict, 'MATCH');
      assert.equal(x.next.replay.originalOutputHash, x.next.replay.replayOutputHash);
      const done = inspect(dbPath, runId);
      assert.equal(done.records, 2);
      assert.equal(done.scienceRuns, 1);
      assert.equal(done.verifications, 1);
      assert.deepEqual(done.jobs.map((j) => j.status), ['DEAD_LETTER', 'DEAD_LETTER', 'SUCCEEDED'], 'exactly one job reports success');
      const proposals = (await server.api('GET', '/api/knowledge/proposals')).body.proposals.filter((p) => p.proposalId === x.evidence.evidenceProposalId);
      assert.equal(proposals.length, 1, 'the evidence proposed before the second kill is the one recorded, not a duplicate');
      const artifact = await server.api('GET', `${base}/research-runs/${runId}/experiments/${x.experimentId}/artifact`, { token });
      assert.equal(artifact.status, 200, JSON.stringify(artifact.body));
      assert.equal(artifact.body.verified, true);
      const pack = await server.api('GET', `${base}/research-runs/${runId}/evidence-pack`, { token });
      assert.equal(pack.status, 200, JSON.stringify(pack.body));
      const verified = await server.api('POST', `${base}/research-runs/${runId}/evidence-pack/verify`, { token, body: { pack: pack.body.pack } });
      assert.equal(verified.body.verification.ok, true, JSON.stringify(verified.body));
      assert.equal(verified.body.verification.status, 'VALID_INTEGRITY_ONLY');
      assert.equal(verified.body.verification.anchored, true, 'the pack verifies against the persisted records');
      const byt = (await server.api('GET', `${base}/cognitive-state`, { token })).body.cognitiveState.byt;
      assert.ok(byt.identity, 'Genesis identity is part of the projection');
      assert.deepEqual(byt.continuity, { researchRuns: 1, verifiedRuns: 1, brokenRuns: 0 });
      assert.equal(byt.predictionLedger.length, 1);
      assert.equal(byt.predictionLedger[0].verdict, 'SUPPORTED_WITHIN_PROTOCOL');
      await server.kill();
      server = null;

      // ---- Process 4: deterministic restoration — same chain, same projection, same pack, nothing runs.
      server = await boot(dbPath, model.url);
      token = (await server.api('POST', '/api/auth/login', { body: { email: 'byt-kill@genesis.test', password: 'password123' } })).body.token;
      const again = (await server.api('GET', `${base}/research-runs/${runId}`, { token })).body.researchRun;
      assert.deepEqual(again.researchState, run.researchState);
      assert.deepEqual(again.experiments, run.experiments);
      // `capabilities` is the LIVE self model (is RDKit validated in this process yet?), not persisted state.
      const { capabilities: liveNow, ...bytAgain } = (await server.api('GET', `${base}/cognitive-state`, { token })).body.cognitiveState.byt;
      const { capabilities: liveThen, ...bytThen } = byt;
      assert.deepEqual(bytAgain, bytThen, 'the projection of persisted state is identical after the restart');
      assert.ok(liveNow && liveThen);
      const packAgain = (await server.api('GET', `${base}/research-runs/${runId}/evidence-pack`, { token })).body.pack;
      assert.equal(packAgain.integrity.stateChainHead, pack.body.pack.integrity.stateChainHead);
      assert.deepEqual(packAgain.experiments, pack.body.pack.experiments);
      await delay(1_500); // three worker polls
      assert.deepEqual(inspect(dbPath, runId).jobs.map((j) => j.status), ['DEAD_LETTER', 'DEAD_LETTER', 'SUCCEEDED'], 'nothing is claimed or executed after the restart');
    } finally {
      await server?.kill();
      await model.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ---------------- multiple processes on one SQLite file ---------------- */

const CLAIMER = `
import { openDatabase } from ${JSON.stringify(pathToFileURL(path.join(HERE, 'store.mjs')).href)};
import { createSqliteScientificJobQueueBackend } from ${JSON.stringify(pathToFileURL(path.join(HERE, 'compute/workerInfrastructureContract.mjs')).href)};
const [dbPath, workerId, leaseMs, startAt, mode] = process.argv.slice(2);
const db = openDatabase(dbPath);
const backend = createSqliteScientificJobQueueBackend({ db });
await new Promise((r) => setTimeout(r, Math.max(0, Number(startAt) - Date.now() - 20)));
while (Date.now() < Number(startAt)) { /* align the race */ }
const claimed = await backend.claim(workerId, Number(leaseMs));
let completed = null;
if (mode === 'complete' && claimed.job) completed = await backend.complete(claimed.job.jobId, claimed.job.leaseId, { record: { status: 'SUCCESS', workerId } });
process.stdout.write(JSON.stringify({ workerId, pid: process.pid, ok: claimed.ok, error: claimed.error ?? null, job: claimed.job, completed: completed?.ok ?? null }) + '\\n');
if (mode === 'hold') setInterval(() => {}, 1000); else db.close();
`;

function runClaimer(script, dbPath, workerId, leaseMs, startAt, mode) {
  const proc = spawn(process.execPath, [script, dbPath, workerId, String(leaseMs), String(startAt), mode], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stderr.on('data', () => {});
  const line = new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => {
      out += d.toString();
      const nl = out.indexOf('\n');
      if (nl >= 0) resolve(JSON.parse(out.slice(0, nl)));
    });
    proc.on('exit', (code) => { if (!out.includes('\n')) reject(new Error(`claimer ${workerId} exited ${code} without output`)); });
  });
  const exited = new Promise((resolve) => proc.on('exit', resolve));
  return { proc, line, exited, kill: () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); return exited; } };
}

const scientificJob = (n, maxAttempts) => ({
  jobId: `job-mp-${n}`, idempotencyKey: `idem-mp-${n}`, researchRunId: `run-mp-${n}`, experimentId: `exp-mp-${n}`,
  capabilityId: 'capability-mp', priority: 1, maxAttempts, timeoutMs: 60_000, payload: { n },
});

describe('BYT shared durable storage: several OS processes on one SQLite file', () => {
  test('six processes race for one job: exactly one claims it; an expired lease of a SIGKILLed holder is reclaimed exactly once', { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-mp-'));
    const dbPath = path.join(dir, 'genesis.db');
    const script = path.join(dir, 'claimer.mjs');
    writeFileSync(script, CLAIMER);
    const children = [];
    try {
      const db = openDatabase(dbPath);
      const backend = createSqliteScientificJobQueueBackend({ db });
      assert.equal((await backend.enqueue(scientificJob(1, 2))).ok, true);
      db.close();

      // Race 1: six fresh processes, one queued job.
      let startAt = Date.now() + 1_500;
      const race1 = Array.from({ length: 6 }, (_, i) => runClaimer(script, dbPath, `worker-mp-a${i}`, 1_000, startAt, i === 0 ? 'hold' : 'exit'));
      children.push(...race1);
      const results1 = await Promise.all(race1.map((c) => c.line));
      const winners1 = results1.filter((r) => r.job);
      assert.ok(results1.every((r) => r.ok), JSON.stringify(results1));
      assert.equal(winners1.length, 1, `exactly one claim: ${JSON.stringify(results1.map((r) => r.workerId + ':' + Boolean(r.job)))}`);
      assert.equal(winners1[0].job.attempts, 1);
      const holder = race1.find((c) => c.proc.pid === winners1[0].pid);
      // The holder dies without completing (it may be the 'hold' process or one that already exited).
      await Promise.all(race1.map((c) => c.kill()));
      assert.ok(holder);

      // Race 2: after the lease expired, six new processes race; exactly one reclaims it, attempt 2, and completes.
      await delay(1_200);
      startAt = Date.now() + 1_500;
      const race2 = Array.from({ length: 6 }, (_, i) => runClaimer(script, dbPath, `worker-mp-b${i}`, 30_000, startAt, 'complete'));
      children.push(...race2);
      const results2 = await Promise.all(race2.map((c) => c.line));
      await Promise.all(race2.map((c) => c.exited));
      const winners2 = results2.filter((r) => r.job);
      assert.equal(winners2.length, 1, `exactly one reclaim: ${JSON.stringify(results2.map((r) => r.workerId + ':' + Boolean(r.job)))}`);
      assert.equal(winners2[0].job.attempts, 2);
      assert.notEqual(winners2[0].job.leaseId, winners1[0].job.leaseId);
      assert.equal(winners2[0].completed, true);

      const check = openDatabase(dbPath);
      try {
        const queue = createSqliteScientificJobQueueBackend({ db: check });
        assert.deepEqual(await queue.complete('job-mp-1', winners1[0].job.leaseId, { record: { status: 'SUCCESS', stale: true } }), { ok: false, error: 'LEASE_NOT_ACTIVE' }, 'the dead holder can never complete');
        const job = queue.get('job-mp-1');
        assert.equal(job.state, 'SUCCEEDED');
        assert.equal(job.attempts, 2);
        assert.deepEqual(job.result, { record: { status: 'SUCCESS', workerId: winners2[0].workerId } });
        assert.equal((await queue.claim('worker-mp-late', 30_000)).job, null, 'nothing left to execute');
      } finally { check.close(); }
    } finally {
      await Promise.all(children.map((c) => c.kill()));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('two backend instances on one database: every queued experiment is executed exactly once and both read the same state', { skip, timeout: 180_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-byt-2srv-'));
    const dbPath = path.join(dir, 'genesis.db');
    const model = await startModel();
    const servers = [];
    try {
      servers.push(await boot(dbPath, model.url, { GENESIS_RESEARCH_WORKER: '0' }));
      const [a] = servers;
      const owner = (await a.api('POST', '/api/auth/register', { body: { email: 'byt-2srv@genesis.test', password: 'password123' } })).body;
      const project = (await a.api('POST', '/api/projects', { token: owner.token, body: { name: 'BYT two instances' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const runIds = [];
      for (const q of ['Is glycerol below 200 Da? (A)', 'Is glycerol below 200 Da? (B)', 'Is glycerol below 200 Da? (C)']) {
        const id = (await a.api('POST', `${base}/research-runs`, { token: owner.token, body: { question: q } })).body.researchRun.researchRunId;
        assert.equal((await a.api('POST', `${base}/research-runs/${id}/proposals`, { token: owner.token })).status, 201);
        assert.equal((await a.api('POST', `${base}/research-runs/${id}/experiments`, { token: owner.token, body: { async: true } })).status, 202);
        runIds.push(id);
      }
      await a.kill();
      servers.length = 0;
      // Both instances start their worker loops on the same file at the same time.
      servers.push(...await Promise.all([boot(dbPath, model.url), boot(dbPath, model.url)]));
      const [s1, s2] = servers;
      const t1 = (await s1.api('POST', '/api/auth/login', { body: { email: 'byt-2srv@genesis.test', password: 'password123' } })).body.token;
      const t2 = (await s2.api('POST', '/api/auth/login', { body: { email: 'byt-2srv@genesis.test', password: 'password123' } })).body.token;
      await waitFor(async () => {
        const states = runIds.map((id) => inspect(dbPath, id).jobs.map((j) => j.status)).flat();
        return states.every((s) => ['SUCCEEDED', 'DEAD_LETTER', 'CANCELLED'].includes(s));
      }, 'all queued experiments', 120_000);
      for (const id of runIds) {
        const state = inspect(dbPath, id);
        assert.deepEqual(state.jobs.map((j) => j.status), ['SUCCEEDED'], JSON.stringify(state.jobs));
        assert.equal(state.types.filter((t) => t === 'EXPERIMENT_HANDOFF').length, 1, 'executed once');
        assert.equal(state.records, 2);
        assert.equal(state.scienceRuns, 1);
        const v1 = (await s1.api('GET', `${base}/research-runs/${id}`, { token: t1 })).body.researchRun;
        const v2 = (await s2.api('GET', `${base}/research-runs/${id}`, { token: t2 })).body.researchRun;
        assert.equal(v1.researchState.chain.ok, true);
        assert.deepEqual(v2.researchState, v1.researchState, 'both instances read one state');
        // The evidence proposal written by whichever instance ran the job is in the ONE ledger, once, on both.
        const proposalId = v1.experiments[0].evidence.evidenceProposalId;
        for (const s of [s1, s2]) {
          const ledger = (await s.api('GET', '/api/knowledge/proposals')).body;
          assert.equal(ledger.ledgerOk, true);
          assert.equal(ledger.proposals.filter((p) => p.proposalId === proposalId).length, 1, 'evidence proposal present exactly once');
        }
      }
      const ledgerDb = new DatabaseSync(dbPath);
      try {
        assert.equal(ledgerDb.prepare("SELECT COUNT(*) n FROM evidence_ledger_entries WHERE kind = 'PROPOSE'").get().n, runIds.length, 'one proposal per run, none lost');
      } finally { ledgerDb.close(); }
      assert.deepEqual((await s1.api('GET', '/api/knowledge/proposals')).body, (await s2.api('GET', '/api/knowledge/proposals')).body, 'both instances serve one ledger');
    } finally {
      await Promise.all(servers.map((s) => s.kill()));
      await model.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
