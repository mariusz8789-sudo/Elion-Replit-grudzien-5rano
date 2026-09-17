/* Proprietary / All Rights Reserved - Genesis OS */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.mjs';

const request = (solverId, params = {}) => handleApi(null, { method: 'POST', pathname: '/api/speculative/run', token: null, query: {}, body: { solverId, params, context: { allowUnphysicalSandbox: true, dt: 0.1, seed: 7 } } });

test('speculative API rejects disabled sandbox before execution', () => {
  const result = handleApi(null, { method: 'POST', pathname: '/api/speculative/run', body: { solverId: 'warp-metric', params: {}, context: { allowUnphysicalSandbox: false, dt: 0.1, seed: 7 } } });
  assert.equal(result.status, 403);
  assert.equal(result.body.error, 'sandbox_disabled');
});

test('speculative API runs all three solvers with explicit epistemic metadata', () => {
  for (const [solverId, params] of [['retrocausal-tree', { depth: 3 }], ['torsion-boundary', { gridSize: 12 }], ['warp-metric', { vS: 1.2 }]]) {
    const result = request(solverId, params);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.allowUnphysicalSandbox, true);
    assert.equal(result.body.source, 'backend-registry');
    assert.match(result.body.fingerprint, /^[0-9a-f]{64}$/);
    assert.match(result.body.provenanceHash, /^[0-9a-f]{64}$/);
    assert.ok(result.body.warnings.length > 0);
  }
});

test('speculative API is deterministic for identical request', () => {
  const a = request('warp-metric', { R: 1, sigma: 2, vS: 0.6, pathLength: 10 });
  const b = request('warp-metric', { R: 1, sigma: 2, vS: 0.6, pathLength: 10 });
  assert.equal(a.body.fingerprint, b.body.fingerprint);
  assert.equal(a.body.provenanceHash, b.body.provenanceHash);
});

test('speculative API rejects unknown solver and malformed context', () => {
  assert.equal(handleApi(null, { method: 'POST', pathname: '/api/speculative/run', body: { solverId: 'unknown', context: { allowUnphysicalSandbox: true, dt: 0.1, seed: 7 } } }).status, 400);
  assert.equal(handleApi(null, { method: 'POST', pathname: '/api/speculative/run', body: { solverId: 'warp-metric', context: { allowUnphysicalSandbox: true, dt: 99, seed: 7 } } }).status, 400);
});
