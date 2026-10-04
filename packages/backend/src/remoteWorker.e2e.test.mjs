import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './determinism.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';

/**
 * REMOTE WORKER E2E (area 11): the real server (src/server.mjs) and a SEPARATE worker process (src/remoteWorkerMain.mjs)
 * that has no database and no shared file; they talk only over HTTP. The worker is killed with SIGKILL while the real
 * RDKit engine runs (a gate holds the engine call), a second worker takes the job over after the lease expires, and the
 * run ends with exactly one result. Without RDKit the test is SKIPPED as ENGINE_UNAVAILABLE, never passed.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RDKIT = rdkitDetect();
const skip = engineUnavailable('rdkit', RDKIT);
const REAL_PYTHON = (process.env.GENESIS_RDKIT_PYTHON || process.env.GENESIS_PYTHON || '').trim() || 'python3';
const LEASE_MS = 4_000;
const WORKER_TOKEN = 'remote-worker-test-token-0123456789';
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
      GENESIS_RESEARCH_WORKER_LEASE_MS: String(LEASE_MS), GENESIS_WORKER_TOKEN: WORKER_TOKEN,
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
      resolve({ api, kill, pid: proc.pid, port: started.port });
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
    const jobs = db.prepare(`SELECT id, status, worker_id, lease_id, lease_expires_at, capability_id, attempts, result_json, failure_json FROM jobs WHERE research_run_id = ? ORDER BY created_at, rowid`).all(runId);
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


function spawnWorker({ url, id, extraEnv = {}, cwd }) {
  const env = { ...process.env, ...extraEnv, GENESIS_SERVER_URL: url, GENESIS_WORKER_TOKEN: WORKER_TOKEN, GENESIS_WORKER_ID: id, GENESIS_REMOTE_WORKER_LEASE_MS: String(LEASE_MS), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
  // The worker gets no way to reach the database: no path, an empty working directory.
  for (const name of ['GENESIS_DB_PATH', 'GENESIS_ARTIFACT_DIR']) delete env[name];
  const proc = spawn(process.execPath, [path.join(HERE, 'remoteWorkerMain.mjs')], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (c) => { out += c; });
  proc.stderr.on('data', (c) => { out += c; });
  const kill = () => new Promise((done) => {
    if (proc.exitCode !== null || proc.signalCode !== null) { done(); return; }
    proc.once('exit', () => done());
    proc.kill('SIGKILL'); // only the PID this test spawned
  });
  return { proc, pid: proc.pid, kill, output: () => out };
}

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
