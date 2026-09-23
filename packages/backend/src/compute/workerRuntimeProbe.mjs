/**
 * Scientific worker runtime probe.
 *
 * One set of checks for a running worker (compute/workerServer.mjs), wherever it
 * runs: a local process started from a clean pinned venv, a local container, or a
 * private Railway service. The probe talks HTTP only and validates every execution
 * through the real client (compute/remoteScientificWorkerClient.mjs), so a pass
 * means the same thing the Virtual Lab relies on.
 *
 * The verification level is never inferred. The caller states where the worker
 * runs; the report carries that level only if every check passed, and FAILED
 * otherwise. Nothing here can turn a local run into a Railway claim.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, chownSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKER_URL_ENV, createRemoteScientificWorkerClient, resolveWorkerConfig } from './remoteScientificWorkerClient.mjs';
import {
  DISPATCH_STATE,
  WORKER_CONTRACT_VERSION,
  WORKER_GROUPS,
  computeInputFingerprint,
  getCapabilityContract,
  listRemoteCapabilities,
} from './scientificCapabilityContract.mjs';

export const VERIFICATION_LEVEL = Object.freeze({
  LOCAL_RUNTIME_VERIFIED: 'LOCAL_RUNTIME_VERIFIED',
  LOCAL_CONTAINER_VERIFIED: 'LOCAL_CONTAINER_VERIFIED',
  RAILWAY_VERIFIED: 'RAILWAY_VERIFIED',
});

const ENTRYPOINT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'workerEntrypoint.mjs');

const REFERENCE_PDB = `HEADER    GENESIS REFERENCE (software validation)
ATOM      1  N   ALA A   1      -0.677  -1.230  -0.491  1.00  0.00           N
ATOM      2  CA  ALA A   1      -0.001   0.064  -0.491  1.00  0.00           C
ATOM      3  C   ALA A   1       1.499  -0.110  -0.491  1.00  0.00           C
ATOM      4  O   ALA A   1       2.030  -1.227  -0.502  1.00  0.00           O
ATOM      5  CB  ALA A   1      -0.509   0.856   0.708  1.00  0.00           C
ATOM      6  N   ALA A   2       2.203   1.006  -0.480  1.00  0.00           N
ATOM      7  CA  ALA A   2       3.660   1.014  -0.469  1.00  0.00           C
ATOM      8  C   ALA A   2       4.220   2.428  -0.469  1.00  0.00           C
ATOM      9  O   ALA A   2       3.486   3.417  -0.485  1.00  0.00           O
ATOM     10  CB  ALA A   2       4.180   0.271   0.759  1.00  0.00           C
END
`;

/**
 * Small, fixed, bounded inputs per capability, plus a variant with a different
 * input used to prove idempotency conflicts. The QM geometry is an explicit water
 * molecule so the probe needs no RDKit of its own.
 */
export const PROBE_FIXTURES = Object.freeze({
  'quantum-chemistry': {
    input: {
      smiles: 'O', method: 'RHF', basis: 'sto-3g', charge: 0, forceField: 'MMFF',
      atoms: [
        { element: 'O', x: 0, y: 0, z: 0.1173 },
        { element: 'H', x: 0, y: 0.7572, z: -0.4692 },
        { element: 'H', x: 0, y: -0.7572, z: -0.4692 },
      ],
    },
    variant: (input) => ({ ...input, basis: '3-21g' }),
  },
  'protein-structure-ingestion': {
    input: { pdbText: REFERENCE_PDB },
    variant: (input) => ({ pdbText: input.pdbText.replace('HEADER    GENESIS REFERENCE', 'HEADER    GENESIS VARIANT  ') }),
  },
  'molecular-dynamics': {
    input: { steps: 100 },
    variant: () => ({ steps: 120 }),
  },
  'molecular-docking': {
    input: { ligandSmiles: 'c1ccccc1O', receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], boxSize: [20, 20, 20], exhaustiveness: 4, nPoses: 3, seed: 7 },
    variant: (input) => ({ ...input, seed: 8 }),
  },
  'admet-estimation': {
    input: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
    variant: () => ({ smiles: 'CCO' }),
  },
  'toxicity-risk-estimation': {
    input: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
    variant: () => ({ smiles: 'CCO' }),
  },
});

function executableCapabilitiesFor(workerGroup) {
  const toolIds = WORKER_GROUPS[workerGroup] ?? [];
  return listRemoteCapabilities().filter((capabilityId) => toolIds.includes(getCapabilityContract(capabilityId).toolId));
}

async function getJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { status: res.status, body, text };
}

/**
 * Runs every check against a live worker. `forbiddenStrings` are values that must
 * never appear in any response (the token, interpreter and checkout paths...).
 */
export async function probeWorker({
  url,
  token,
  workerGroup,
  level,
  forbiddenStrings = [],
  requireEngines = true,
  timeoutProbeMs = 25,
  log = () => {},
}) {
  if (!Object.values(VERIFICATION_LEVEL).includes(level)) throw new Error(`probeWorker: unknown verification level ${level}`);
  if (!WORKER_GROUPS[workerGroup]) throw new Error(`probeWorker: unknown worker group ${workerGroup}`);
  const base = url.replace(/\/+$/, '');
  const checks = [];
  const transcripts = [];
  const record = (name, pass, detail = {}) => {
    checks.push({ name, pass: Boolean(pass), ...detail });
    log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  };
  const runId = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const toolIds = [...WORKER_GROUPS[workerGroup]];
  const capabilities = executableCapabilitiesFor(workerGroup);
  const config = resolveWorkerConfig({ ...(WORKER_URL_ENV[workerGroup] ? { [WORKER_URL_ENV[workerGroup]]: base } : {}), GENESIS_SCIENTIFIC_WORKER_TOKEN: token });
  const client = createRemoteScientificWorkerClient({ config, retries: 0 });
  const impatient = createRemoteScientificWorkerClient({ config, retries: 0, timeoutMs: timeoutProbeMs });

  // 1. Health.
  const health = await getJson(`${base}/health`);
  transcripts.push(health.text);
  record('health', health.status === 200 && health.body?.ok === true && health.body.workerGroup === workerGroup
    && health.body.contractVersion === WORKER_CONTRACT_VERSION && health.body.executionAuth === 'configured'
    && JSON.stringify([...(health.body.executableCapabilities ?? [])].sort()) === JSON.stringify([...capabilities].sort()),
  { observed: health.body ? { workerGroup: health.body.workerGroup, executionAuth: health.body.executionAuth, executableCapabilities: health.body.executableCapabilities, node: health.body.node } : { status: health.status } });

  // 2. Engine inventory — exactly this group's engines, each READY only after its real reference case.
  const engines = await getJson(`${base}/engines`);
  transcripts.push(engines.text);
  const inventory = (engines.body?.engines ?? []).map((e) => ({ toolId: e.toolId, status: e.status, version: e.version }));
  record('engine-inventory', engines.status === 200 && JSON.stringify(inventory.map((e) => e.toolId).sort()) === JSON.stringify([...toolIds].sort()), { observed: inventory });

  const references = [];
  for (const toolId of toolIds) {
    const ref = await getJson(`${base}/engines/${toolId}/reference-case`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    transcripts.push(ref.text);
    references.push({ toolId, status: ref.body?.status ?? null, version: ref.body?.version ?? null, durationMs: ref.body?.durationMs ?? null, outputHash: ref.body?.outputHash ?? null, validation: ref.body?.validation ?? null, reason: ref.body?.reason ?? null });
    if (requireEngines) record(`reference-case:${toolId}`, ref.status === 200 && ref.body?.status === 'AVAILABLE' && Boolean(ref.body?.outputHash), { status: ref.body?.status ?? ref.status });
  }

  // 3-7. Real capability execution through the strict client.
  const executions = [];
  for (const capabilityId of capabilities) {
    const fixture = PROBE_FIXTURES[capabilityId];
    const executionId = `PROBE-${capabilityId}-${runId}`;
    const first = await client.execute({ capabilityId, executionId, input: fixture.input });
    record(`execute:${capabilityId}`, first.ok && first.state === DISPATCH_STATE.REMOTE_EXECUTION, { state: first.state, error: first.error ?? null });
    record(`execution-id-preserved:${capabilityId}`, first.ok && first.executionId === executionId);
    record(`input-fingerprint:${capabilityId}`, first.ok && first.inputFingerprint === computeInputFingerprint(capabilityId, fixture.input));

    const again = await client.execute({ capabilityId, executionId, input: fixture.input });
    record(`idempotent-replay:${capabilityId}`, again.ok && again.idempotentReplay === true && again.outputFingerprint === first.outputFingerprint);

    const conflict = await client.execute({ capabilityId, executionId, input: fixture.variant(fixture.input) });
    record(`idempotency-conflict:${capabilityId}`, !conflict.ok && conflict.error === 'IDEMPOTENCY_CONFLICT' && conflict.httpStatus === 409);

    executions.push({
      capabilityId, executionId, ok: first.ok, state: first.state,
      engine: first.ok ? first.engine : null,
      durationMs: first.ok ? first.durationMs : null,
      roundTripMs: first.ok ? first.roundTripMs : null,
      inputFingerprint: first.ok ? first.inputFingerprint : null,
      outputFingerprint: first.ok ? first.outputFingerprint : null,
      environmentFingerprint: first.ok ? first.environmentFingerprint : null,
      error: first.ok ? null : first.error,
    });
  }

  // 8. Timeout: the client gives up promptly; the worker finishes and a retry with
  //    the same execution id is served from its idempotency cache, not re-run.
  if (capabilities.length) {
    const capabilityId = capabilities.includes('molecular-dynamics') ? 'molecular-dynamics' : capabilities[0];
    const input = PROBE_FIXTURES[capabilityId].variant(PROBE_FIXTURES[capabilityId].input);
    const executionId = `PROBE-timeout-${capabilityId}-${runId}`;
    const hurried = await impatient.execute({ capabilityId, executionId, input });
    const settled = await client.execute({ capabilityId, executionId, input });
    record('timeout-then-idempotent-retry', !hurried.ok && hurried.state === DISPATCH_STATE.WORKER_TIMEOUT && settled.ok && settled.idempotentReplay === true,
      { hurried: hurried.state, settled: settled.ok ? 'idempotentReplay' : settled.state });
  }

  // 9. Authentication.
  const firstCapability = capabilities[0];
  if (firstCapability) {
    const fixture = PROBE_FIXTURES[firstCapability];
    const body = JSON.stringify({
      contractVersion: WORKER_CONTRACT_VERSION, executionId: `PROBE-auth-${runId}`, capabilityId: firstCapability,
      inputFingerprint: computeInputFingerprint(firstCapability, fixture.input), input: fixture.input,
    });
    const anonymous = await getJson(`${base}/capabilities/${firstCapability}/execute`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const wrong = await getJson(`${base}/capabilities/${firstCapability}/execute`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${'x'.repeat(48)}` }, body });
    transcripts.push(anonymous.text, wrong.text);
    record('auth-required', anonymous.status === 401 && wrong.status === 401);
  }

  // 10. Allowlist: a capability from another group is refused, never executed.
  const foreign = listRemoteCapabilities().find((c) => !capabilities.includes(c));
  if (foreign) {
    // The client routes by capability group, so aim the foreign capability at this worker explicitly.
    const misrouted = createRemoteScientificWorkerClient({
      config: resolveWorkerConfig({ [WORKER_URL_ENV[getCapabilityContract(foreign).workerGroup]]: base, GENESIS_SCIENTIFIC_WORKER_TOKEN: token }),
      retries: 0,
    });
    const r = await misrouted.execute({ capabilityId: foreign, executionId: `PROBE-foreign-${runId}`, input: PROBE_FIXTURES[foreign].input });
    record('group-allowlist', !r.ok && r.error === 'CAPABILITY_NOT_IN_WORKER', { foreignCapability: foreign });
  }

  // 11. Redaction / no leakage across every raw response collected above.
  const everything = transcripts.join('\n') + JSON.stringify(executions);
  const leaked = [token, ...forbiddenStrings].filter((s) => typeof s === 'string' && s.length >= 6 && everything.includes(s));
  record('no-secret-or-path-leakage', leaked.length === 0, { leakedCount: leaked.length });

  const failed = checks.filter((c) => !c.pass);
  return {
    workerGroup,
    requestedLevel: level,
    verificationLevel: failed.length === 0 ? level : 'FAILED',
    ok: failed.length === 0,
    checks,
    failedChecks: failed.map((c) => c.name),
    references,
    executions,
    probedAt: new Date().toISOString(),
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const CONTAINER_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/**
 * Starts workerEntrypoint.mjs as its own OS process — optionally as an
 * unprivileged uid/gid, like the image's `USER node` — with a fresh random token
 * that is returned to the caller and never logged. Only the given interpreter is
 * visible to the worker: every per-engine GENESIS_*_PYTHON override is cleared.
 */
export async function spawnLocalWorker({ workerGroup, python, uid = null, gid = null, env = {}, startupTimeoutMs = 60_000, token = randomBytes(32).toString('hex') }) {
  const port = await freePort();
  const tmpdir = mkdtempSync(path.join(os.tmpdir(), `genesis-worker-${workerGroup}-`));
  if (uid !== null) chownSync(tmpdir, uid, gid ?? uid);
  // The worker images' PATH (node:22-slim), not the caller's: no user-local interpreter leaks in.
  const childEnv = { PATH: CONTAINER_PATH, HOME: tmpdir, TMPDIR: tmpdir, NODE_ENV: 'production' };
  Object.assign(childEnv, {
    PORT: String(port), GENESIS_WORKER_GROUP: workerGroup, GENESIS_SCIENTIFIC_WORKER_TOKEN: token,
    ...(python ? { GENESIS_PYTHON: python } : {}), ...env,
  });
  const child = spawn(process.execPath, [ENTRYPOINT], {
    env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], ...(uid !== null ? { uid, gid: gid ?? uid } : {}),
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + startupTimeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`worker exited during startup (code ${child.exitCode}): ${output.slice(0, 400)}`);
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error('worker did not become healthy in time'); }
    await new Promise((r) => { setTimeout(r, 200); });
  }
  const stop = () => new Promise((resolve) => {
    const started = Date.now();
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 8000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      rmSync(tmpdir, { recursive: true, force: true });
      resolve({ code, signal, shutdownMs: Date.now() - started, output });
    });
    child.kill('SIGTERM');
  });
  return { url, token, pid: child.pid, tmpdir, stop, output: () => output };
}
