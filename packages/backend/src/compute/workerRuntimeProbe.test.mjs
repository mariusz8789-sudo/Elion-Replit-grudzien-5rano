import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { VERIFICATION_LEVEL, probeWorker, spawnLocalWorker } from './workerRuntimeProbe.mjs';
import { capabilityAvailable } from '../campaign/toolchain.mjs';
import { executeCapability } from './scientificCapabilityContract.mjs';
import { TEST_WORKER_TOKEN, startCountingWorker } from './remoteScientificWorkerTestUtils.mjs';

/**
 * The runtime probe is the evidence behind every LOCAL_RUNTIME_VERIFIED /
 * LOCAL_CONTAINER_VERIFIED / RAILWAY_VERIFIED claim, so it is tested against
 * real workers (real PySCF + Biopython here) and against broken ones: a probe
 * that cannot fail proves nothing.
 */
const CHEM_ON = capabilityAvailable('quantum-chemistry') && capabilityAvailable('protein-structure-ingestion');
const chemSkip = !CHEM_ON && 'PySCF and Biopython must both be installed in this runtime';

describe('probe arguments', () => {
  test('an unknown verification level or worker group is refused outright', async () => {
    await assert.rejects(probeWorker({ url: 'http://127.0.0.1:9', token: TEST_WORKER_TOKEN, workerGroup: 'chem-light', level: 'READY' }), /unknown verification level/);
    await assert.rejects(probeWorker({ url: 'http://127.0.0.1:9', token: TEST_WORKER_TOKEN, workerGroup: 'gpu', level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED }), /unknown worker group/);
  });
});

describe('a healthy real worker passes every check', () => {
  test('chem-light: health, inventory, references, execution, idempotency, conflict, timeout, auth, allowlist, no leakage', { skip: chemSkip }, async () => {
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] });
    try {
      const report = await probeWorker({
        url: worker.url, token: TEST_WORKER_TOKEN, workerGroup: 'chem-light', level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED,
      });
      assert.equal(report.ok, true, JSON.stringify(report.failedChecks));
      assert.equal(report.verificationLevel, VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED);
      const names = report.checks.map((c) => c.name);
      for (const expected of [
        'health', 'engine-inventory', 'reference-case:pyscf', 'reference-case:biopython',
        'execute:quantum-chemistry', 'execution-id-preserved:quantum-chemistry', 'input-fingerprint:quantum-chemistry',
        'idempotent-replay:quantum-chemistry', 'idempotency-conflict:quantum-chemistry',
        'execute:protein-structure-ingestion', 'timeout-then-idempotent-retry', 'auth-required', 'group-allowlist',
        'no-secret-or-path-leakage',
      ]) assert.ok(names.includes(expected), `missing check ${expected}`);
      assert.deepEqual(report.references.map((r) => r.status), ['AVAILABLE', 'AVAILABLE']);
      assert.ok(report.executions.every((e) => e.ok && /^[a-f0-9]{64}$/.test(e.outputFingerprint)));
      assert.ok(!JSON.stringify(report).includes(TEST_WORKER_TOKEN), 'the report never contains the token');
    } finally {
      await worker.close();
    }
  });
});

describe('a broken worker can never be reported at the requested level', () => {
  test('a worker without an execution token is FAILED, not LOCAL_RUNTIME_VERIFIED', { skip: chemSkip }, async () => {
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'], authToken: null });
    try {
      const report = await probeWorker({ url: worker.url, token: TEST_WORKER_TOKEN, workerGroup: 'chem-light', level: VERIFICATION_LEVEL.RAILWAY_VERIFIED });
      assert.equal(report.ok, false);
      assert.equal(report.verificationLevel, 'FAILED');
      assert.ok(report.failedChecks.includes('health'));
      assert.ok(report.failedChecks.includes('execute:quantum-chemistry'));
      assert.equal(worker.calls.length, 0, 'nothing was executed without authentication');
    } finally {
      await worker.close();
    }
  });

  test('an engine that fails its computation fails the probe', { skip: chemSkip }, async () => {
    const failing = (capabilityId, input) => (capabilityId === 'protein-structure-ingestion'
      ? { ok: false, state: 'ENGINE_FAILED', error: 'engine_failed', reason: 'simulated failure', durationMs: 1 }
      : executeCapability(capabilityId, input));
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'], executor: failing });
    try {
      const report = await probeWorker({ url: worker.url, token: TEST_WORKER_TOKEN, workerGroup: 'chem-light', level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED });
      assert.equal(report.verificationLevel, 'FAILED');
      assert.ok(report.failedChecks.includes('execute:protein-structure-ingestion'));
    } finally {
      await worker.close();
    }
  });

  test('the leakage check trips when a forbidden string appears in any response', { skip: chemSkip }, async () => {
    const worker = await startCountingWorker({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] });
    try {
      // "chem-light" is legitimately in /health; declaring it forbidden proves the detector reads every response.
      const report = await probeWorker({
        url: worker.url, token: TEST_WORKER_TOKEN, workerGroup: 'chem-light', level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED,
        forbiddenStrings: ['chem-light'],
      });
      assert.ok(report.failedChecks.includes('no-secret-or-path-leakage'));
      assert.equal(report.verificationLevel, 'FAILED');
    } finally {
      await worker.close();
    }
  });
});

describe('a real worker process (workerEntrypoint.mjs) — LOCAL_RUNTIME_VERIFIED', () => {
  test('spawned as its own process (non-root when possible), probed, then shut down cleanly on SIGTERM', { skip: chemSkip }, async () => {
    const asNobody = typeof process.getuid === 'function' && process.getuid() === 0;
    const worker = await spawnLocalWorker({ workerGroup: 'chem-light', python: null, ...(asNobody ? { uid: 65534, gid: 65534 } : {}) });
    let report;
    try {
      report = await probeWorker({
        url: worker.url, token: worker.token, workerGroup: 'chem-light', level: VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED,
        forbiddenStrings: [worker.tmpdir],
      });
    } finally {
      const stopped = await worker.stop();
      assert.ok(stopped.code === 0 || stopped.signal === 'SIGTERM', `clean shutdown expected, got ${JSON.stringify({ code: stopped.code, signal: stopped.signal })}`);
      assert.ok(!stopped.output.includes(worker.token), 'the worker never logs its token');
    }
    assert.equal(report.ok, true, JSON.stringify(report.failedChecks));
    assert.equal(report.verificationLevel, VERIFICATION_LEVEL.LOCAL_RUNTIME_VERIFIED);
  });
});
