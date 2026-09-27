import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildChemistryKineticsGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'chemistry-arrhenius',
  domainId: 'chemistry',
  sourceText: 'Oblicz kinetykę Arrheniusa przy 350 K i 60 kJ/mol.',
  inputs: { temperatureK: 350, activationEnergyKJ: 60, preExponentialLog10: 11 },
};

function directOutputs(inputs) {
  const graph = buildChemistryKineticsGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    rateConstant: graph.getValue('rateConstant'),
    halfLifeFirstOrder: graph.getValue('halfLifeFirstOrder'),
    speedupVsRoom: graph.getValue('speedupVsRoom'),
  };
}

test('Fabric contract exposes all bounded Arrhenius ModelGraph inputs', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'chemistry-arrhenius');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'preExponentialLog10'), { id: 'preExponentialLog10', type: undefined, unit: 'log₁₀(1/s)', min: -10, max: 25 });
  assert.ok(model.outputs.some((output) => output.id === 'rateConstant'));
});

test('Fabric API executes the exact shared Arrhenius ModelGraph with log10 A', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(response.body.run.outputs.rateConstant > 0);
  assert.ok(response.body.run.outputs.speedupVsRoom > 1);
  assert.equal(response.body.run.provenance.engine, 'Genesis chemistry-kinetics ModelGraph (shared frontend/backend graph)');
  assert.equal(response.body.run.provenance.honesty, 'simplified');
});

test('Fabric API rejects an Arrhenius parameter outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, preExponentialLog10: 26 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
