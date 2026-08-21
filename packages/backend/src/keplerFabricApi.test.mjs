import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildOrbitalModelGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'universe-kepler',
  domainId: 'universe',
  sourceText: 'Oblicz orbitę planety przy 2 AU i 1 masie Słońca.',
  inputs: { centralMassSolar: 1, orbitalRadiusAu: 2 },
};

function directOutputs(inputs) {
  const graph = buildOrbitalModelGraph();
  graph.applyParameterSnapshot(inputs);
  return {
    orbitalPeriodYears: graph.getValue('orbitalPeriodYears'),
    orbitalSpeedAuPerYear: graph.getValue('orbitalSpeedAuPerYear'),
    relativeTidalStrength: graph.getValue('relativeTidalStrength'),
  };
}

test('Fabric contract exposes the bounded circular Kepler ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'universe-kepler');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'universe');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'orbitalRadiusAu'), { id: 'orbitalRadiusAu', type: undefined, unit: 'AU', min: 0.001, max: 1e5 });
  assert.ok(model.outputs.some((output) => output.id === 'orbitalPeriodYears'));
});

test('Fabric API executes the exact shared Kepler ModelGraph', () => {
  const direct = directOutputs(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(Math.abs(response.body.run.outputs.orbitalPeriodYears - Math.sqrt(8)) < 1e-12);
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects an orbital radius outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, orbitalRadiusAu: 0 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
