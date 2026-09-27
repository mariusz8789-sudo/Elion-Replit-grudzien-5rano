import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { kardashevPower } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'civilization-kardashev',
  domainId: 'civilization',
  sourceText: 'Oblicz Kardaszew typ K=1.',
  inputs: { kardashevType: 1 },
};

test('Fabric contract exposes the bounded theoretical Kardashev power formula', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'civilization-kardashev');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'civilization');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'kardashevType'), { id: 'kardashevType', type: undefined, unit: '', min: 0, max: 3 });
  assert.ok(model.outputs.some((output) => output.id === 'powerWatts'));
});

test('Fabric API executes the exact shared Kardashev power function', () => {
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, { powerWatts: kardashevPower(1) });
  assert.equal(response.body.run.outputs.powerWatts, 1e16);
  assert.equal(response.body.run.provenance.honesty, 'theoretical');
});

test('Fabric API rejects a Kardashev type outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { kardashevType: 4 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
