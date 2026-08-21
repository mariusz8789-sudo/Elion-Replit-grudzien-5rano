import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildAtmosphericEscapeGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'universe-atmospheric-escape',
  domainId: 'universe',
  sourceText: 'Oblicz ucieczkę atmosfery planety.',
  inputs: {
    stellarLuminositySolar: 1, orbitalDistanceAu: 1, planetAlbedo: 0.3,
    planetMassEarth: 1, planetRadiusEarth: 1, moleculeMassAmu: 18,
  },
};

function directOutputs(inputs) {
  const graph = buildAtmosphericEscapeGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    equilibriumTempK: graph.getValue('equilibriumTempK'),
    escapeVelocityMs: graph.getValue('escapeVelocityMs'),
    thermalVelocityMs: graph.getValue('thermalVelocityMs'),
    jeansParameter: graph.getValue('jeansParameter'),
  };
}

test('Fabric contract exposes the bounded thermal Jeans-escape ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'universe-atmospheric-escape');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'universe');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'planetAlbedo'), { id: 'planetAlbedo', type: undefined, unit: '', min: 0, max: 0.9 });
  assert.ok(model.outputs.some((output) => output.id === 'jeansParameter'));
});

test('Fabric API executes the exact shared thermal Jeans-escape ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(response.body.run.outputs.equilibriumTempK > 0);
  assert.ok(response.body.run.outputs.jeansParameter > 0);
  assert.equal(response.body.run.provenance.honesty, 'simplified');
});

test('Fabric API rejects a Jeans-escape input outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, planetAlbedo: 1 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
