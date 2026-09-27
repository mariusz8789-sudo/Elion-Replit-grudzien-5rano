import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildGaussianGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'math-gaussian',
  domainId: 'mathematics',
  sourceText: 'Oblicz rozkład normalny.',
  inputs: { mean: 0, sigma: 1, xValue: 1 },
};

function directOutputs(inputs) {
  const graph = buildGaussianGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    zScore: graph.getValue('zScore'),
    pdfValue: graph.getValue('pdfValue'),
    probWithinZ: graph.getValue('probWithinZ'),
  };
}

test('Fabric contract exposes the deterministic Gaussian ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'math-gaussian');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'mathematics');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'sigma'), { id: 'sigma', type: undefined, unit: '', min: 0.001, max: 100 });
  assert.ok(model.outputs.some((output) => output.id === 'probWithinZ'));
});

test('Fabric API executes the exact shared Gaussian ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.zScore, 1);
  assert.ok(Math.abs(response.body.run.outputs.pdfValue - 0.24197072451914337) < 1e-15);
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects Gaussian sigma outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, sigma: 0 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
