import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildSpecialRelativityGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'sr-lorentz',
  domainId: 'spacetime-einstein',
  sourceText: 'Oblicz dylatację czasu dla beta=0.8.',
  inputs: { velocityFraction: 0.8, properTimeSeconds: 1, restLengthMeters: 1 },
};

function directOutputs(inputs) {
  const graph = buildSpecialRelativityGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    lorentzGammaFactor: graph.getValue('lorentzGammaFactor'),
    dilatedTimeSeconds: graph.getValue('dilatedTimeSeconds'),
    contractedLengthMeters: graph.getValue('contractedLengthMeters'),
  };
}

test('Fabric contract exposes the bounded Lorentz ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'sr-lorentz');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'spacetime');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'velocityFraction'), { id: 'velocityFraction', type: undefined, unit: '', min: 0, max: 0.999999 });
  assert.ok(model.outputs.some((output) => output.id === 'lorentzGammaFactor'));
});

test('Fabric API executes the exact shared Lorentz ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.lorentzGammaFactor, 1.666666666666667);
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects Lorentz beta outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, velocityFraction: 1 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
