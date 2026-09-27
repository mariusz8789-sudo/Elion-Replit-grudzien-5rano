import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerServer, MAX_BODY_BYTES } from './workerServer.mjs';

/**
 * Real HTTP tests against `createWorkerServer` — no mocking of the HTTP layer.
 * Each server binds an ephemeral port (0) so tests can run in parallel-safe
 * isolation and are closed in `after`.
 */
function startServer(opts) {
  const server = createWorkerServer(opts);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

describe('createWorkerServer construction', () => {
  test('rejects missing workerGroup', () => {
    assert.throws(() => createWorkerServer({ engineIds: ['rdkit'] }), /workerGroup/);
  });
  test('rejects empty engineIds', () => {
    assert.throws(() => createWorkerServer({ workerGroup: 'x', engineIds: [] }), /engineIds/);
  });
  test('rejects a toolId that is not in the canonical toolchain registry', () => {
    assert.throws(
      () => createWorkerServer({ workerGroup: 'x', engineIds: ['not-a-real-engine'] }),
      /not a canonical toolId/,
    );
  });
});

describe('worker HTTP contract — chem-light group (pyscf, biopython)', () => {
  let server;
  let base;

  before(async () => {
    ({ server, base } = await startServer({ workerGroup: 'chem-light', engineIds: ['pyscf', 'biopython'] }));
  });
  after(() => server.close());

  test('GET /health reports the worker group and its allowlist', async () => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.workerGroup, 'chem-light');
    assert.deepEqual([...body.engineIds].sort(), ['biopython', 'pyscf']);
    assert.equal(typeof body.uptimeSeconds, 'number');
  });

  test('GET /engines returns ONLY this worker\'s allowlisted engines, never the full registry', async () => {
    const res = await fetch(`${base}/engines`);
    const body = await res.json();
    assert.equal(res.status, 200);
    const ids = body.engines.map((e) => e.toolId).sort();
    assert.deepEqual(ids, ['biopython', 'pyscf']);
    // Never a toolId outside this worker's group, e.g. the heavy admet/pymeep engines.
    assert.ok(!ids.includes('admet'));
    assert.ok(!ids.includes('pymeep'));
  });

  test('GET /engines never leaks an absolute local filesystem path', async () => {
    const res = await fetch(`${base}/engines`);
    const text = await res.text();
    assert.ok(!text.includes(process.cwd()), 'response must not contain the real cwd path');
  });

  test('POST /engines/:toolId/reference-case for an engine outside the allowlist is refused, not executed', async () => {
    const res = await fetch(`${base}/engines/admet/reference-case`, { method: 'POST', body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, 'ENGINE_NOT_IN_WORKER');
    assert.equal(body.toolId, 'admet');
  });

  test('POST /engines/:toolId/reference-case for an allowlisted engine returns the honest current status', async () => {
    const res = await fetch(`${base}/engines/pyscf/reference-case`, { method: 'POST', body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.toolId, 'pyscf');
    assert.equal(body.workerGroup, 'chem-light');
    assert.ok(['AVAILABLE', 'BLOCKED_BY_RUNTIME', 'VALIDATION_FAILED', 'UNVALIDATED', 'CAPABILITY_GAP', 'BLOCKED_BY_LICENSE', 'BLOCKED_BY_RESOURCES'].includes(body.status));
    assert.equal(typeof body.durationMs, 'number');
    assert.match(body.outputHash, /^[a-f0-9]{16}$/);
    assert.match(body.fingerprint, /^[a-f0-9]{16}$/);
    assert.equal(typeof body.requestId, 'string');
  });

  test('malformed JSON body is refused before reaching the adapter', async () => {
    const res = await fetch(`${base}/engines/pyscf/reference-case`, { method: 'POST', body: '{not json' });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'MALFORMED_INPUT');
  });

  test('oversized body is rejected without buffering it fully', async () => {
    const oversized = 'x'.repeat(MAX_BODY_BYTES + 1024);
    const res = await fetch(`${base}/engines/pyscf/reference-case`, { method: 'POST', body: oversized });
    const body = await res.json();
    assert.equal(res.status, 413);
    assert.equal(body.error, 'BODY_TOO_LARGE');
  });

  test('GET on a POST-only route is refused', async () => {
    const res = await fetch(`${base}/engines/pyscf/reference-case`);
    assert.equal(res.status, 405);
  });

  test('unknown route returns an honest 404, not a silent fallback', async () => {
    const res = await fetch(`${base}/nonexistent`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.error, 'NOT_FOUND');
  });
});

describe('worker HTTP contract — unavailable engine returns an honest blocked state, never a fake result', () => {
  let server;
  let base;

  before(async () => {
    // PyMeep is genuinely not installed in this sandbox (verified separately
    // in railwayWorkerReadiness.test.mjs); this proves the HTTP layer surfaces
    // that honestly instead of crashing or fabricating a passing result.
    ({ server, base } = await startServer({ workerGroup: 'pymeep', engineIds: ['pymeep'] }));
  });
  after(() => server.close());

  test('POST /engines/pymeep/reference-case succeeds at the HTTP layer but reports the true blocked status', async () => {
    const res = await fetch(`${base}/engines/pymeep/reference-case`, { method: 'POST', body: '{}' });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true, 'the HTTP request itself succeeds');
    if (body.status !== 'AVAILABLE') {
      assert.equal(body.availability, false);
      assert.equal(body.executionStatus, 'NOT_EXECUTED');
      assert.ok(body.reason, 'a blocked engine must carry an honest reason');
    }
  });
});
