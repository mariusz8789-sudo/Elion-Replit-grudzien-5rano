import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runTitrationScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'chemistry-titration',
  domainId: 'chemistry',
  sourceText: 'Oblicz miareczkowanie kwasowo-zasadowe NaOH.',
  inputs: { acid: 'acetic', vb: 25 },
};

test('Fabric contract exposes the bounded weak-acid titration scenario', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'chemistry-titration');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'acid'), { id: 'acid', type: 'string', unit: '', min: undefined, max: undefined });
  assert.deepEqual(model.inputs.find((input) => input.id === 'vb'), { id: 'vb', type: 'number', unit: 'mL', min: 0, max: 60 });
  assert.ok(model.outputs.some((output) => output.id === 'veq'));
});

test('Fabric API executes the exact shared weak-acid charge-balance runner', () => {
  const direct = runTitrationScenario(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.acid, 'acetic');
  assert.equal(response.body.run.outputs.veq, 25);
  assert.ok(response.body.run.outputs.ph > 7);
  assert.equal(response.body.run.provenance.engine, 'Genesis weak-acid charge-balance titration (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'bounded_charge_balance_scenario');
});

test('Fabric API rejects an acid outside the bounded scenario before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, acid: 'unknown' } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'unsupported_acid');
});
