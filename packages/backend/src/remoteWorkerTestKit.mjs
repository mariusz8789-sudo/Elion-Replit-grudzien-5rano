import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';

/**
 * Shared kit of the remote-worker end-to-end tests: boots the REAL server as a child process, starts REAL worker
 * processes that only know the server's URL, and gates the real RDKit engine so a process can be killed at an exact
 * point INSIDE an engine call (see remoteWorker.e2e.test.mjs). Not a test file.
 */
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RDKIT = rdkitDetect();
export const skip = engineUnavailable('rdkit', RDKIT);
const REAL_PYTHON = (process.env.GENESIS_RDKIT_PYTHON || process.env.GENESIS_PYTHON || '').trim() || 'python3';
export const LEASE_MS = 4_000;
export const WORKER_TOKEN = 'remote-worker-test-token-0123456789';
// Glycerol: no reference case, benchmark or toolchain probe in the backend computes it, so the gate sees only this run.
export const GLYCEROL = 'OCC(O)CO';
export const hypothesis = (claim, prediction, smiles = GLYCEROL) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles, predictions: [prediction] }, parameterChanges: [] },
});
export const PLAN = {
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

export function writeGate(dir) {
  const script = path.join(dir, 'gate.py');
  const wrapper = path.join(dir, 'gate-python');
  writeFileSync(script, GATE_PY);
  writeFileSync(wrapper, `#!/bin/sh\nexec "${REAL_PYTHON}" "${script}" "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
}

/** A gated environment: the n-th `descriptors` call of this process blocks. */
export function gateEnv(dir, wrapper, name, nth, smiles = GLYCEROL) {
  const gateDir = path.join(dir, `gate-${name}`);
  mkdirSync(gateDir, { recursive: true });
  return {
    env: { GENESIS_RDKIT_PYTHON: wrapper, GENESIS_TEST_REAL_PYTHON: REAL_PYTHON, GENESIS_TEST_GATE_DIR: gateDir, GENESIS_TEST_GATE_CMD: 'descriptors', GENESIS_TEST_GATE_SMILES: smiles, GENESIS_TEST_GATE_NTH: String(nth) },
    callsFile: path.join(gateDir, 'calls'),
    hitFile: path.join(gateDir, 'hit'),
  };
}

export function boot(dbPath, modelUrl, extraEnv = {}) {
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

export async function startModel(plan = PLAN) {
  const model = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ model: 'fake-local-model', choices: [{ message: { content: JSON.stringify(plan) } }] }));
    });
  });
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${model.address().port}/v1`, close: () => new Promise((r) => model.close(r)) };
}

export async function waitFor(check, what, timeoutMs = 60_000) {
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
export function inspect(dbPath, runId) {
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

export function jobStatus(dbPath, jobId) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    return db.prepare('SELECT status FROM jobs WHERE id = ?').get(jobId)?.status ?? null;
  } finally { db.close(); }
}


export function spawnWorker({ url, id, extraEnv = {}, cwd }) {
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

