import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildLogisticGrowthGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'biology-logistic',
  domainId: 'biology',
  sourceText: 'Oblicz wzrost logistyczny populacji.',
  inputs: { growthRate: 0.5, carryingCapacity: 1000, initialPopulation: 10, timeElapsed: 10 },
};

function directOutputs(inputs) {
  const graph = buildLogisticGrowthGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    populationAtT: graph.getValue('populationAtT'),
    fractionOfCapacity: graph.getValue('fractionOfCapacity'),
  };
}

test('Fabric contract exposes the bounded logistic-growth ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'biology-logistic');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'biology');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'growthRate'), { id: 'growthRate', type: undefined, unit: '1/czas', min: 0, max: 5 });
  assert.ok(model.outputs.some((output) => output.id === 'populationAtT'));
});

test('Fabric API executes the exact shared logistic-growth ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(response.body.run.outputs.populationAtT > request.inputs.initialPopulation);
  assert.ok(response.body.run.outputs.fractionOfCapacity > 0);
  assert.equal(response.body.run.provenance.honesty, 'simplified');
});

test('Fabric API rejects logistic initial population above carrying capacity before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, initialPopulation: 1001 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'invalid_input');
});
