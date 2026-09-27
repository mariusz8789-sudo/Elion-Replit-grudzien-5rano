import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildRelativisticEnergyGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'particle-relativistic-energy',
  domainId: 'particle',
  sourceText: 'Oblicz energię relatywistyczną cząstki beta=0.8.',
  inputs: { restMassMeV: 0.511, velocityFraction: 0.8 },
};

function directOutputs(inputs) {
  const graph = buildRelativisticEnergyGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    totalEnergyMeV: graph.getValue('totalEnergyMeV'),
    kineticEnergyMeV: graph.getValue('kineticEnergyMeV'),
    momentumMeVc: graph.getValue('momentumMeVc'),
  };
}

test('Fabric contract exposes the bounded relativistic-energy ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'particle-relativistic-energy');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'particle');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'velocityFraction'), { id: 'velocityFraction', type: undefined, unit: '', min: 0, max: 0.999999 });
  assert.ok(model.outputs.some((output) => output.id === 'totalEnergyMeV'));
});

test('Fabric API executes the exact shared relativistic-energy ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(response.body.run.outputs.totalEnergyMeV > request.inputs.restMassMeV);
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects relativistic beta outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, velocityFraction: 1 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
