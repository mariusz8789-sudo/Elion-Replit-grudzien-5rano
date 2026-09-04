import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runTunnelingScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-tunneling-1d',
  domainId: 'quantum',
  sourceText: 'Uruchom tunelowanie kwantowe energy=0.55 barrier=1 width=3.',
  inputs: { energy: 0.55, barrier: 1, width: 3 },
};

test('Fabric contract exposes the shared split-step Fourier tunneling model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-tunneling-1d');
  assert.ok(model);
  assert.equal(model.domain, 'quantum');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'energy'), { id: 'energy', type: 'number', unit: '', min: 0.2, max: 1.6 });
  assert.ok(model.outputs.some((output) => output.id === 'transmission'));
});

test('Fabric API uses the exact shared split-step Fourier runner and preserves numerical provenance', () => {
  const direct = runTunnelingScenario({ energy: 0.55, barrier: 1, width: 3 });
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.equal(response.body.run.modelId, 'quantum-tunneling-1d');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(response.body.run.outputs.transmission >= 0 && response.body.run.outputs.transmission <= 1);
  assert.ok(response.body.run.outputs.reflection >= 0 && response.body.run.outputs.reflection <= 1);
  assert.ok(Math.abs(response.body.run.outputs.transmission + response.body.run.outputs.reflection + response.body.run.outputs.remainingProbability - 1) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis split-step Fourier 1D (shared Canvas/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'real_shared_numerical_engine');
  assert.equal(response.body.persisted, false);
});

test('Fabric API rejects tunneling inputs outside the shared runner domain', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, width: 9 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
