import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect } from './compute/meepAdapter.mjs';

const runtime = detect();
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'electrodynamics-maxwell-fdtd',
  domainId: 'electrodynamics',
  sourceText: 'FDTD granicy dielektrycznej n1=1 n2=2',
  inputs: { n1: 1, n2: 2, frequency: 1, resolution: 80 },
};

test('Fabric contract exposes the actual Maxwell/FDTD backend model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'electrodynamics-maxwell-fdtd');
  assert.ok(model);
  assert.equal(model.domain, 'electrodynamics');
  assert.equal(model.deterministic, true);
  assert.ok(model.inputs.some((input) => input.id === 'n1'));
  assert.ok(model.outputs.some((output) => output.id === 'computedTransmittance'));
});

if (runtime.available) {
  test('Fabric API runs real PyMeep FDTD through the canonical compute registry', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.contractVersion, '1.0.0');
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.modelId, 'electrodynamics-maxwell-fdtd');
    assert.ok(Math.abs(response.body.run.outputs.computedTransmittance - 8 / 9) < 0.003);
    assert.equal(response.body.run.provenance.engine, 'PyMeep');
    assert.equal(response.body.persisted, false);
  });
} else {
  test('Fabric API rejects Meep execution instead of emitting a fabricated result without runtime', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
    assert.equal(response.body.run.error, 'capability_unavailable');
  });
}
