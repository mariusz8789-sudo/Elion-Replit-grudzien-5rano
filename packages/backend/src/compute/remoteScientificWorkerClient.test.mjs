import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRemoteScientificWorkerClient,
  describeWorkerConfig,
  resolveWorkerConfig,
  routeCapability,
} from './remoteScientificWorkerClient.mjs';
import {
  DISPATCH_STATE,
  WORKER_CONTRACT_VERSION,
  computeInputFingerprint,
  computeOutputFingerprint,
  executeCapability,
} from './scientificCapabilityContract.mjs';
import { embed3d } from './rdkitAdapter.mjs';
import { capabilityAvailable } from '../campaign/toolchain.mjs';
import {
  TEST_WORKER_TOKEN,
  closedPortUrl,
  startCountingWorker,
  startFakeServer,
  startTamperingProxy,
} from './remoteScientificWorkerTestUtils.mjs';

/**
 * Remote scientific execution — transport and contract level. Every test talks
 * to a real node:http server on an ephemeral local port: either the real worker
 * (compute/workerServer.mjs executing the real PySCF/Biopython adapters) or a
 * deliberately hostile fake. No Railway project is involved.
 */
const QM_ON = capabilityAvailable('quantum-chemistry');
const PROT_ON = capabilityAvailable('protein-structure-ingestion');
const skipReason = (name) => `${name} is not installed in this runtime`;

const REAL_REFERENCE_PDB = `HEADER    GENESIS REFERENCE (software validation)
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

function waterQmInput() {
  const emb = embed3d('O');
  assert.equal(emb.ok, true, 'RDKit must embed water for the QM fixture');
  return {
    smiles: 'O', method: 'RHF', basis: 'sto-3g', charge: emb.charge ?? 0, forceField: emb.forceField,
    atoms: emb.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z })),
  };
}

function configFor(env) {
  return resolveWorkerConfig({ GENESIS_SCIENTIFIC_WORKER_TOKEN: TEST_WORKER_TOKEN, ...env });
}

let executionCounter = 0;
const nextExecutionId = (tag) => `TEST-${tag}-${Date.now().toString(36)}-${(executionCounter += 1)}`;

describe('worker configuration and routing', () => {
  test('the token is never enumerable, serialized or described', () => {
    const config = configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: 'http://chem-light.railway.internal:8090' });
    assert.equal(config.token, TEST_WORKER_TOKEN, 'the client can still read it');
    assert.ok(!JSON.stringify(config).includes(TEST_WORKER_TOKEN));
    assert.ok(!Object.keys(config).includes('token'));
    const described = describeWorkerConfig(config);
    assert.ok(!JSON.stringify(described).includes(TEST_WORKER_TOKEN));
    assert.equal(described.token, 'configured');
    assert.equal(described.groups['chem-light'].origin, 'http://chem-light.railway.internal:8090');
  });

  test('plain http is refused outside private hosts, and URLs with credentials or queries are refused', () => {
    const config = configFor({
      GENESIS_CHEM_LIGHT_WORKER_URL: 'http://worker.example.com',
      GENESIS_STRUCTURAL_WORKER_URL: 'https://user:pass@worker.example.com',
      GENESIS_ADMET_WORKER_URL: 'https://worker.example.com/?token=abc',
    });
    assert.equal(config.groups['chem-light'].error, 'WORKER_URL_INSECURE');
    assert.equal(config.groups.structural.error, 'WORKER_URL_HAS_CREDENTIALS');
    assert.equal(config.groups.admet.error, 'WORKER_URL_HAS_QUERY');
    const ok = configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: 'https://chem.example.com/genesis/' });
    assert.equal(ok.groups['chem-light'].url, 'https://chem.example.com/genesis');
  });

  test('a token shorter than the minimum counts as not configured', () => {
    const config = resolveWorkerConfig({ GENESIS_SCIENTIFIC_WORKER_TOKEN: 'short' });
    assert.equal(config.token, null);
    assert.equal(config.tokenError, 'WORKER_TOKEN_TOO_SHORT');
  });

  test('RDKit descriptors always stay LOCAL; worker capabilities go REMOTE only when their group URL is set', () => {
    const all = configFor({
      GENESIS_CHEM_LIGHT_WORKER_URL: 'http://a.railway.internal', GENESIS_STRUCTURAL_WORKER_URL: 'http://b.railway.internal', GENESIS_ADMET_WORKER_URL: 'http://c.railway.internal', GENESIS_PYMEEP_WORKER_URL: 'http://d.railway.internal',
    });
    assert.equal(routeCapability('molecular-descriptors', all).route, 'LOCAL');
    assert.equal(routeCapability('maxwell-fdtd', all).route, 'REMOTE');
    assert.equal(routeCapability('maxwell-fdtd', all).workerGroup, 'pymeep');
    for (const cap of ['quantum-chemistry', 'protein-structure-ingestion']) assert.equal(routeCapability(cap, all).workerGroup, 'chem-light');
    for (const cap of ['molecular-dynamics', 'molecular-docking']) assert.equal(routeCapability(cap, all).workerGroup, 'structural');
    for (const cap of ['admet-estimation', 'toxicity-risk-estimation']) assert.equal(routeCapability(cap, all).workerGroup, 'admet');
    for (const cap of ['quantum-chemistry', 'molecular-docking', 'admet-estimation']) assert.equal(routeCapability(cap, all).route, 'REMOTE');
    const none = configFor({});
    assert.equal(routeCapability('quantum-chemistry', none).route, 'LOCAL');
    // A value that is set but unusable still routes REMOTE, so it blocks instead of silently running elsewhere.
    const broken = configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: 'not a url' });
    assert.equal(routeCapability('quantum-chemistry', broken).route, 'REMOTE');
  });
});

describe('client refuses to dispatch without a usable configuration (no network call is made)', () => {
  let networkCalls = 0;
  const spyFetch = (...args) => { networkCalls += 1; return fetch(...args); };

  test('missing worker URL -> BLOCKED_WORKER_NOT_CONFIGURED', async () => {
    const client = createRemoteScientificWorkerClient({ config: configFor({}), fetchImpl: spyFetch });
    const r = await client.execute({ capabilityId: 'quantum-chemistry', executionId: nextExecutionId('nourl'), input: { smiles: 'O' } });
    assert.equal(r.ok, false);
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED);
    assert.equal(r.error, 'WORKER_URL_MISSING');
    assert.equal(networkCalls, 0);
  });

  test('missing token -> BLOCKED_WORKER_NOT_CONFIGURED', async () => {
    const config = resolveWorkerConfig({ GENESIS_CHEM_LIGHT_WORKER_URL: 'http://127.0.0.1:9' });
    const client = createRemoteScientificWorkerClient({ config, fetchImpl: spyFetch });
    const r = await client.execute({ capabilityId: 'quantum-chemistry', executionId: nextExecutionId('notoken'), input: { smiles: 'O' } });
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED);
    assert.equal(r.error, 'WORKER_TOKEN_MISSING');
    assert.equal(networkCalls, 0);
  });

  test('RDKit descriptors are not a remote capability at all', async () => {
    const client = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: 'http://127.0.0.1:9' }), fetchImpl: spyFetch });
    const r = await client.execute({ capabilityId: 'molecular-descriptors', executionId: nextExecutionId('rdkit'), input: { smiles: 'O' } });
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_INVALID_INPUT);
    assert.equal(r.error, 'CAPABILITY_NOT_REMOTE_EXECUTABLE');
    assert.equal(networkCalls, 0);
  });

  test('an input outside the capability schema is refused before it leaves the service', async () => {
    const client = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: 'http://127.0.0.1:9' }), fetchImpl: spyFetch });
    const r = await client.execute({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId('schema'), input: { pdbText: 'too short' } });
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_INVALID_INPUT);
    assert.equal(networkCalls, 0);
  });
});

describe('real chem-light worker (PySCF + Biopython) over HTTP', () => {
  let worker;
  let client;
  before(async () => {
    worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] });
    client = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: worker.url }) });
  });
  after(() => worker.close());

  test('health still works and advertises exactly the executable capabilities', async () => {
    const health = await (await fetch(`${worker.url}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.contractVersion, WORKER_CONTRACT_VERSION);
    assert.deepEqual([...health.executableCapabilities].sort(), ['protein-structure-ingestion', 'quantum-chemistry']);
    assert.equal(health.executionAuth, 'configured');
    assert.ok(!JSON.stringify(health).includes(TEST_WORKER_TOKEN));
  });

  test('configured PySCF worker receives a real bounded request and returns a verified result', { skip: !QM_ON && skipReason('PySCF') }, async () => {
    const input = waterQmInput();
    const executionId = nextExecutionId('qm');
    const before = worker.calls.length;
    const r = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.state, DISPATCH_STATE.REMOTE_EXECUTION);
    assert.equal(r.engine.name, 'PySCF');
    assert.equal(r.engine.toolId, 'pyscf');
    assert.match(r.engine.version, /^\d+\.\d+/);
    assert.equal(r.outputFingerprint, computeOutputFingerprint(r.result), 'fingerprint recomputed by the client');
    assert.equal(r.inputFingerprint, computeInputFingerprint('quantum-chemistry', input));
    assert.match(r.environmentFingerprint, /^[a-f0-9]{64}$/);
    assert.ok(r.result.data.energyHartree < -74 && r.result.data.energyHartree > -76, 'real RHF/STO-3G water energy');
    assert.equal(worker.calls.length, before + 1);
    // Exactly the bounded scientific input reached the engine: no tenancy, no paths, no commands.
    assert.deepEqual(Object.keys(worker.calls.at(-1).input).sort(), ['atoms', 'basis', 'charge', 'forceField', 'method', 'smiles']);
  });

  test('idempotent retry: the same execution id and input replays the first result without re-running the engine', { skip: !QM_ON && skipReason('PySCF') }, async () => {
    const input = waterQmInput();
    const executionId = nextExecutionId('idem');
    const first = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    const calls = worker.calls.length;
    const second = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.idempotentReplay, true);
    assert.equal(second.outputFingerprint, first.outputFingerprint);
    assert.equal(worker.calls.length, calls, 'the engine ran once');
  });

  test('conflicting idempotency key: the same execution id with a different input is refused', { skip: !QM_ON && skipReason('PySCF') }, async () => {
    const executionId = nextExecutionId('conflict');
    const input = waterQmInput();
    const first = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    assert.equal(first.ok, true);
    const calls = worker.calls.length;
    const second = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input: { ...input, basis: '6-31g' } });
    assert.equal(second.ok, false);
    assert.equal(second.state, DISPATCH_STATE.BLOCKED_INVALID_INPUT);
    assert.equal(second.error, 'IDEMPOTENCY_CONFLICT');
    assert.equal(second.httpStatus, 409);
    assert.equal(worker.calls.length, calls, 'no second engine run');
  });

  test('a real engine failure is ENGINE_FAILED (not a transport error) and is not re-run on retry', { skip: !QM_ON && skipReason('PySCF') }, async () => {
    // One hydrogen atom has one electron: a closed-shell RHF is physically inconsistent, and PySCF says so.
    const input = { smiles: '[H]', method: 'RHF', basis: 'sto-3g', charge: 0, forceField: 'MMFF', atoms: [{ element: 'H', x: 0, y: 0, z: 0 }] };
    const executionId = nextExecutionId('enginefail');
    const first = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    assert.equal(first.ok, false);
    assert.equal(first.state, DISPATCH_STATE.ENGINE_FAILED);
    assert.equal(first.retryable, false);
    const calls = worker.calls.length;
    const second = await client.execute({ capabilityId: 'quantum-chemistry', executionId, input });
    assert.equal(second.state, DISPATCH_STATE.ENGINE_FAILED);
    assert.equal(worker.calls.length, calls, 'a deterministic failure is remembered, not recomputed');
  });

  test('protein structure validation runs remotely on Biopython', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const r = await client.execute({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId('pdb'), input: { pdbText: REAL_REFERENCE_PDB } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.engine.name, 'Biopython');
    assert.equal(r.result.report.aminoAcids, 2);
  });

  test('cross-capability request refusal: a chem-light worker will not run docking', async () => {
    const misrouted = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_STRUCTURAL_WORKER_URL: worker.url }) });
    const calls = worker.calls.length;
    const r = await misrouted.execute({
      capabilityId: 'molecular-docking', executionId: nextExecutionId('cross'),
      input: { ligandSmiles: 'c1ccccc1O', receptorSmiles: 'c1ccc2[nH]ccc2c1', boxSize: [20, 20, 20], exhaustiveness: 4, nPoses: 3, seed: 7 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);
    assert.equal(r.error, 'CAPABILITY_NOT_IN_WORKER');
    assert.equal(worker.calls.length, calls);
  });

  test('authentication failure: a wrong token is rejected before any engine runs', async () => {
    const wrong = createRemoteScientificWorkerClient({
      config: resolveWorkerConfig({ GENESIS_CHEM_LIGHT_WORKER_URL: worker.url, GENESIS_SCIENTIFIC_WORKER_TOKEN: 'another-token-that-is-long-enough-000000000' }),
    });
    const calls = worker.calls.length;
    const r = await wrong.execute({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId('auth'), input: { pdbText: REAL_REFERENCE_PDB } });
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);
    assert.equal(r.error, 'WORKER_AUTH_REJECTED');
    assert.equal(r.httpStatus, 401);
    assert.equal(worker.calls.length, calls);
    // No token at all is equally refused.
    const raw = await fetch(`${worker.url}/capabilities/protein-structure-ingestion/execute`, { method: 'POST', body: '{}' });
    assert.equal(raw.status, 401);
  });

  test('the worker validates every request strictly (never trusts the client)', async () => {
    const post = (capabilityId, body) => fetch(`${worker.url}/capabilities/${capabilityId}/execute`, {
      method: 'POST', headers: { authorization: `Bearer ${TEST_WORKER_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, body: await res.json() }));
    const envelope = (capabilityId, input, extra = {}) => ({
      contractVersion: WORKER_CONTRACT_VERSION, executionId: nextExecutionId('strict'), capabilityId,
      inputFingerprint: computeInputFingerprint(capabilityId, input), input, ...extra,
    });
    const calls = worker.calls.length;

    // A caller cannot smuggle outputs or a classification in as "input".
    const smuggled = { pdbText: REAL_REFERENCE_PDB, outputs: { aminoAcids: 999 }, epistemicClassification: 'IN_SILICO_SUPPORT' };
    let r = await post('protein-structure-ingestion', envelope('protein-structure-ingestion', smuggled));
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'INVALID_INPUT');

    // A path is not a SMILES string.
    const pathLike = { ...waterQmInputSafe(), smiles: '/etc/passwd' };
    r = await post('quantum-chemistry', envelope('quantum-chemistry', pathLike));
    assert.equal(r.status, 400);

    // The fingerprint must describe exactly the input sent.
    r = await post('protein-structure-ingestion', { ...envelope('protein-structure-ingestion', { pdbText: REAL_REFERENCE_PDB }), inputFingerprint: 'a'.repeat(64) });
    assert.equal(r.body.error, 'INPUT_FINGERPRINT_MISMATCH');

    // The body's capability must be the route's capability.
    r = await post('quantum-chemistry', envelope('protein-structure-ingestion', { pdbText: REAL_REFERENCE_PDB }));
    assert.equal(r.body.error, 'CAPABILITY_MISMATCH');

    // Unknown envelope fields (e.g. a module or command to run) are refused.
    r = await post('protein-structure-ingestion', envelope('protein-structure-ingestion', { pdbText: REAL_REFERENCE_PDB }, { command: 'rm -rf /' }));
    assert.equal(r.body.error, 'INVALID_REQUEST');

    // Unknown capability.
    r = await post('shell', envelope('protein-structure-ingestion', { pdbText: REAL_REFERENCE_PDB }));
    assert.equal(r.status, 404);

    assert.equal(worker.calls.length, calls, 'no invalid request reached an engine');
  });

  test('the reference-case route is unchanged and still unauthenticated', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const res = await fetch(`${worker.url}/engines/biopython/reference-case`, { method: 'POST', body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.toolId, 'biopython');
  });
});

function waterQmInputSafe() {
  return { smiles: 'O', method: 'RHF', basis: 'sto-3g', charge: 0, forceField: 'MMFF', atoms: [{ element: 'O', x: 0, y: 0, z: 0 }] };
}

describe('a worker without a configured token fails closed', () => {
  test('503 WORKER_AUTH_NOT_CONFIGURED, surfaced as BLOCKED_WORKER_UNAVAILABLE', async () => {
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'], authToken: null });
    try {
      const health = await (await fetch(`${worker.url}/health`)).json();
      assert.equal(health.executionAuth, 'not_configured');
      const client = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: worker.url }) });
      const r = await client.execute({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId('noauth'), input: { pdbText: REAL_REFERENCE_PDB } });
      assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);
      assert.equal(r.error, 'WORKER_AUTH_NOT_CONFIGURED');
      assert.equal(worker.calls.length, 0);
    } finally {
      await worker.close();
    }
  });
});

describe('hostile or broken workers are never trusted', () => {
  let worker;
  before(async () => {
    worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] });
  });
  after(() => worker.close());

  const clientFor = (url, options = {}) => createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: url }), ...options });
  const pdbRequest = (tag) => ({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId(tag), input: { pdbText: REAL_REFERENCE_PDB } });

  test('unreachable worker -> honest BLOCKED_WORKER_UNAVAILABLE, retried once with the same execution id', async () => {
    const r = await clientFor(await closedPortUrl(), { retryDelayMs: 1 }).execute(pdbRequest('down'));
    assert.equal(r.ok, false);
    assert.equal(r.state, DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE);
    assert.equal(r.error, 'WORKER_UNREACHABLE');
    assert.equal(r.retryable, true);
    assert.equal(r.attempts, 2);
  });

  test('timeout -> WORKER_TIMEOUT, aborted and not retried', async () => {
    const hanging = await startFakeServer(() => { /* never answers */ });
    try {
      const started = Date.now();
      const r = await clientFor(hanging.url, { timeoutMs: 250 }).execute(pdbRequest('timeout'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_TIMEOUT);
      assert.equal(r.attempts, 1);
      assert.ok(Date.now() - started < 5000, 'the abort is prompt');
    } finally {
      await hanging.close();
    }
  });

  test('invalid response: non-JSON, an extra envelope field, an oversized body', async () => {
    const notJson = await startFakeServer((req, res) => { res.writeHead(200); res.end('<html>proxy error</html>'); });
    const huge = await startFakeServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(`{"pad":"${'x'.repeat(4096)}"}`); });
    const extra = await startTamperingProxy(worker.url, (json) => ({ ...json, debug: 'extra field' }));
    try {
      let r = await clientFor(notJson.url).execute(pdbRequest('nonjson'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(r.error, 'RESPONSE_NOT_JSON');
      r = await clientFor(huge.url, { maxResponseBytes: 1024 }).execute(pdbRequest('huge'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(r.error, 'RESPONSE_TOO_LARGE');
      if (PROT_ON) {
        r = await clientFor(extra.url).execute(pdbRequest('extra'));
        assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
        assert.equal(r.error, 'ENVELOPE_SHAPE_INVALID');
      }
    } finally {
      await Promise.all([notJson.close(), huge.close(), extra.close()]);
    }
  });

  test('wrong engine identity is rejected', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const proxy = await startTamperingProxy(worker.url, (json) => ({ ...json, engine: { ...json.engine, name: 'SomeOtherEngine' } }));
    try {
      const r = await clientFor(proxy.url).execute(pdbRequest('engine'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(r.error, 'ENGINE_IDENTITY_MISMATCH');
    } finally {
      await proxy.close();
    }
  });

  test('output-hash mismatch: a result altered in transit is rejected', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const proxy = await startTamperingProxy(worker.url, (json) => ({ ...json, result: { report: { ...json.result.report, aminoAcids: 999 } } }));
    try {
      const r = await clientFor(proxy.url).execute(pdbRequest('hash'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(r.error, 'OUTPUT_HASH_MISMATCH');
    } finally {
      await proxy.close();
    }
  });

  test('a worker cannot hand back a classification, even with a matching fingerprint', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const proxy = await startTamperingProxy(worker.url, (json) => {
      const result = { report: { ...json.result.report, epistemicClassification: 'IN_SILICO_SUPPORT' } };
      return { ...json, result, outputFingerprint: computeOutputFingerprint(result) };
    });
    try {
      const r = await clientFor(proxy.url).execute(pdbRequest('classification'));
      assert.equal(r.state, DISPATCH_STATE.WORKER_RESPONSE_INVALID);
      assert.equal(r.error, 'RESULT_SCHEMA_INVALID');
    } finally {
      await proxy.close();
    }
  });

  test('client-level retry of a gateway failure reuses the execution id; the engine runs once', { skip: !PROT_ON && skipReason('Biopython') }, async () => {
    const proxy = await startTamperingProxy(worker.url, null, { failFirst: 1 });
    try {
      const calls = worker.calls.length;
      const r = await clientFor(proxy.url, { retryDelayMs: 1 }).execute(pdbRequest('flaky'));
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.attempts, 2);
      assert.equal(worker.calls.length, calls + 1);
      const ids = proxy.requests.map((q) => JSON.parse(q.body).executionId);
      assert.equal(new Set(ids).size, 1, 'both attempts carried the same execution id');
    } finally {
      await proxy.close();
    }
  });
});

describe('path and secret redaction', () => {
  test('neither an absolute path nor the token ever reaches the caller', async () => {
    const leaky = (capabilityId) => ({
      ok: false, state: DISPATCH_STATE.ENGINE_FAILED, error: 'engine_failed', durationMs: 1,
      reason: `Traceback: /home/runner/secret/genesis/qm_worker.py line 42 while using ${TEST_WORKER_TOKEN} for ${capabilityId}`,
    });
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'], executor: leaky });
    try {
      const raw = await fetch(`${worker.url}/capabilities/protein-structure-ingestion/execute`, {
        method: 'POST', headers: { authorization: `Bearer ${TEST_WORKER_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          contractVersion: WORKER_CONTRACT_VERSION, executionId: nextExecutionId('leak-raw'), capabilityId: 'protein-structure-ingestion',
          inputFingerprint: computeInputFingerprint('protein-structure-ingestion', { pdbText: REAL_REFERENCE_PDB }), input: { pdbText: REAL_REFERENCE_PDB },
        }),
      });
      const rawText = await raw.text();
      assert.ok(!rawText.includes('/home/runner/secret'), 'the worker itself redacts paths');
      assert.ok(!rawText.includes(TEST_WORKER_TOKEN), 'the worker itself scrubs its token');

      const client = createRemoteScientificWorkerClient({ config: configFor({ GENESIS_CHEM_LIGHT_WORKER_URL: worker.url }) });
      const r = await client.execute({ capabilityId: 'protein-structure-ingestion', executionId: nextExecutionId('leak'), input: { pdbText: REAL_REFERENCE_PDB } });
      assert.equal(r.state, DISPATCH_STATE.ENGINE_FAILED);
      const text = JSON.stringify(r);
      assert.ok(!text.includes('/home/runner/secret'));
      assert.ok(!text.includes(TEST_WORKER_TOKEN));
      assert.ok(r.reason.includes('<path-redacted>'));
    } finally {
      await worker.close();
    }
  });

  test('the worker-side executor never returns artifact paths for docking', () => {
    if (!capabilityAvailable('molecular-docking')) return;
    const r = executeCapability('molecular-docking', {
      ligandSmiles: 'c1ccccc1O', receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], boxSize: [20, 20, 20], exhaustiveness: 4, nPoses: 3, seed: 7,
    });
    assert.equal(r.ok, true);
    assert.ok(r.result.artifacts.length >= 1);
    for (const artifact of r.result.artifacts) assert.deepEqual(Object.keys(artifact).sort(), ['kind', 'sha256']);
    assert.ok(!JSON.stringify(r).includes('/tmp'), 'no temp-directory path leaks');
  });
});
