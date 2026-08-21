import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildNuclearModelGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'nuclear-semf',
  domainId: 'nuclear',
  sourceText: 'Oblicz energię wiązania jądra protony=26 neutrony=30.',
  inputs: { protonNumber: 26, neutronNumber: 30 },
};

function directOutputs(inputs) {
  const graph = buildNuclearModelGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    bindingEnergy: graph.getValue('bindingEnergy'),
    bindingPerNucleon: graph.getValue('bindingPerNucleon'),
    massNumber: graph.getValue('massNumber'),
  };
}

test('Fabric contract exposes the bounded semi-empirical mass-formula ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'nuclear-semf');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'nuclear');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'protonNumber'), { id: 'protonNumber', type: undefined, unit: '', min: 1, max: 118 });
  assert.ok(model.outputs.some((output) => output.id === 'bindingPerNucleon'));
});

test('Fabric API executes the exact shared SEMF ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.massNumber, 56);
  assert.ok(response.body.run.outputs.bindingEnergy > 0);
  assert.equal(response.body.run.provenance.honesty, 'simplified');
});

test('Fabric API rejects a SEMF input outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, protonNumber: 119 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
