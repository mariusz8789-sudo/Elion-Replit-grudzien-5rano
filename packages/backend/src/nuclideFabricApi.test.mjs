import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runNuclideChartScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'nuclear-nuclide-chart',
  domainId: 'nuclear',
  sourceText: 'Pokaż mapę nuklidów dla protony = 26 neutrony = 30.',
  inputs: { protonNumber: 26, neutronNumber: 30 },
};

test('Fabric contract exposes the bounded SEMF nuclide model and local catalog', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'nuclear-nuclide-chart');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'nuclear');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'protonNumber'), { id: 'protonNumber', type: 'number', unit: '', min: 1, max: 100 });
  assert.ok(model.outputs.some((output) => output.id === 'knownNuclide'));
});

test('Fabric API executes the exact shared SEMF plus bounded-catalog runner', () => {
  const direct = runNuclideChartScenario(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.deepEqual(response.body.run.outputs, {
    ...direct,
    massNumber: 56,
    knownNuclide: true,
    measuredSymbol: 'Fe-56',
    measuredDecayMode: 'stabilny',
  });
  assert.equal(response.body.run.provenance.engine, 'Genesis nuclide SEMF + bounded measured catalog (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'semf_model_plus_bounded_measured_catalog');
});

test('Fabric API rejects a nuclide parameter outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, protonNumber: 101 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
