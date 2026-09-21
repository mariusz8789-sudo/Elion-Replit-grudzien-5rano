/* Proprietary / All Rights Reserved - Genesis OS */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { runQuantum, describeQuantum, isCloudConfigured, shutdownQuantumWorker, WorkerComputeSink } from './quantumApi.mjs';

after(async () => { await shutdownQuantumWorker(); });

const keys = (o) => Object.keys(o).sort();
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('bell-state runs on the local simulator (worker thread) and returns only 00/11 as a MODEL_ESTIMATE', async () => {
  const r = await runQuantum({ preset: 'bell-state', shots: 1024, seed: 7 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.executedOn, 'LOCAL_SIMULATOR');
  assert.equal(r.label, 'MODEL_ESTIMATE');
  assert.equal(r.fallbackReason, 'NO_CLOUD_PROVIDER');
  assert.deepEqual(keys(r.counts), ['00', '11']);
  assert.equal(sum(r.counts), 1024);
  assert.equal(r.shots, 1024);
  assert.equal(r.seed, 7);
  assert.equal(r.qubits, 2);
  assert.ok(Math.abs(r.probabilities['00'] - 0.5) < 1e-12);
  assert.match(r.qasm, /^OPENQASM 3\.0;/);
  assert.match(r.fingerprint, /^[0-9a-f]{64}$/);
  assert.match(r.circuitFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(typeof r.elapsedMs, 'number');
  assert.match(r.disclaimer, /not measurements/);
});

test('deterministic: same body => identical counts and fingerprint; different seed => different counts', async () => {
  const a = await runQuantum({ preset: 'bell-state', shots: 2048, seed: 3 });
  const b = await runQuantum({ preset: 'bell-state', shots: 2048, seed: 3 });
  const c = await runQuantum({ preset: 'bell-state', shots: 2048, seed: 4 });
  assert.deepEqual(a.counts, b.counts);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notDeepEqual(a.counts, c.counts);
});

test('ghz with qubits and raw qasm both work; defaults are shots=1024 seed=1', async () => {
  const g = await runQuantum({ preset: 'ghz', qubits: 4 });
  assert.equal(g.ok, true);
  assert.deepEqual(keys(g.counts), ['0000', '1111']);
  assert.equal(g.shots, 1024);
  assert.equal(g.seed, 1);
  const q = await runQuantum({ qasm: 'OPENQASM 3.0;\ninclude "stdgates.inc";\nqubit[1] q;\nbit[1] c;\nx q[0];\nc = measure q;\n', shots: 10 });
  assert.equal(q.ok, true);
  assert.deepEqual(q.counts, { 1: 10 });
  assert.equal(q.circuitSource, 'qasm');
});

test('bad input is refused with 400-class errors, before any job is queued', async () => {
  const bad = await runQuantum({ qasm: 'OPENQASM 3.0;\nqubit[2] q;\nfoo q[0];' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'invalid_qasm');
  assert.match(bad.message, /UNSUPPORTED_GATE@line 3/);
  assert.equal((await runQuantum({ preset: 'bell-state', shots: 8193 })).error, 'invalid_shots');
  assert.equal((await runQuantum({ preset: 'bell-state', shots: 0 })).error, 'invalid_shots');
  assert.equal((await runQuantum({ preset: 'bell-state', seed: 1.5 })).error, 'invalid_seed');
  assert.equal((await runQuantum({ preset: 'nope' })).error, 'invalid_request');
  assert.equal((await runQuantum({ preset: 'ghz', qubits: 17 })).error, 'invalid_qubits');
  assert.equal((await runQuantum({ qasm: 'qubit[17] q;' })).error, 'invalid_qasm');
  assert.equal((await runQuantum(null)).error, 'invalid_request');
  assert.equal((await runQuantum({})).error, 'invalid_request');
});

test('status reports cloudConfigured=false without env and never reveals a key or URL', () => {
  const s = describeQuantum({});
  assert.deepEqual(s, { ...s, ok: true, cloudConfigured: false, maxQubits: 16, maxShots: 8192, presets: ['bell-state', 'ghz', 'superposition'] });
  assert.equal(isCloudConfigured({ QPU_API_URL: 'https://qpu.example/run' }), false, 'url alone is not enough');
  assert.equal(isCloudConfigured({ QPU_API_KEY: 'k' }), false, 'key alone is not enough');
  assert.equal(isCloudConfigured({ QPU_API_URL: 'ftp://x', QPU_API_KEY: 'k' }), false, 'non-http URL is ignored');
  assert.equal(isCloudConfigured({ QPU_API_URL: 'https://qpu.example/run', QPU_API_KEY: 'k' }), true);
  const withCloud = describeQuantum({ QPU_API_URL: 'https://qpu.example/run', QPU_API_KEY: 'super-secret' });
  assert.equal(withCloud.cloudConfigured, true);
  assert.ok(!JSON.stringify(withCloud).includes('super-secret') && !JSON.stringify(withCloud).includes('qpu.example'));
});

test('with env credentials the cloud is called (bearer key, POST body) and the result is a HARDWARE_MEASUREMENT', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { status: 200, text: async () => JSON.stringify({ counts: { '00': 5, '11': 5 } }) }; };
  const r = await runQuantum({ preset: 'bell-state', shots: 10, seed: 1 }, { env: { QPU_API_URL: 'https://qpu.example/run', QPU_API_KEY: 'super-secret' }, fetchImpl, sleeper: { sleep: async () => {} } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.executedOn, 'CLOUD_QPU');
  assert.equal(r.label, 'HARDWARE_MEASUREMENT');
  assert.equal(r.fallbackReason, null);
  assert.equal(r.probabilities, null);
  assert.deepEqual(r.counts, { '00': 5, '11': 5 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer super-secret');
  assert.deepEqual(JSON.parse(calls[0].init.body), { qasm: r.qasm, shots: 10, seed: 1 });
});

test('cloud outage => retries then honest CLOUD_UNAVAILABLE fallback to the local MODEL_ESTIMATE', async () => {
  let n = 0;
  const delays = [];
  const fetchImpl = async () => { n++; return { status: 503, text: async () => 'down' }; };
  const r = await runQuantum({ preset: 'bell-state', shots: 100, seed: 2 }, { env: { QPU_API_URL: 'https://qpu.example/run', QPU_API_KEY: 'k' }, fetchImpl, sleeper: { sleep: async (ms) => { delays.push(ms); } } });
  assert.equal(r.ok, true);
  assert.equal(n, 4, 'DEFAULT_RETRY attempts');
  assert.deepEqual(delays, [250, 500, 1000]);
  assert.equal(r.executedOn, 'LOCAL_SIMULATOR');
  assert.equal(r.label, 'MODEL_ESTIMATE');
  assert.equal(r.fallbackReason, 'CLOUD_UNAVAILABLE');
  assert.deepEqual(keys(r.counts), ['00', '11']);
});

test('WorkerComputeSink: UNKNOWN_KIND from the worker, timeout restarts the worker, shutdown is clean', async () => {
  const sink = new WorkerComputeSink({ timeoutMs: 20_000 });
  const unknown = await sink.submit('nope', {});
  assert.deepEqual(unknown, { ok: false, error: 'UNKNOWN_KIND' });
  const slow = new WorkerComputeSink({ timeoutMs: 1 });
  const t = await slow.submit('quantumSimulate', { qasm: 'OPENQASM 3.0;\nqubit[16] q;\nh q[0];\nh q[1];\nh q[2];\nh q[3];\nh q[4];\nh q[5];\nh q[6];\nh q[7];\nh q[8];\nh q[9];\nh q[10];\nh q[11];\nh q[12];\nh q[13];\nh q[14];\nh q[15];\n', shots: 8192, seed: 1 });
  assert.equal(t.ok, false);
  assert.match(t.error, /WORKER_TIMEOUT|WORKER_EXIT/);
  assert.equal(slow.worker, null, 'a timed-out worker is dropped and restarted on the next job');
  await slow.shutdown();
  await sink.shutdown();
});
