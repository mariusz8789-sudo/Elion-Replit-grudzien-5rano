import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runTokamakLawsonScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'nuclear-tokamak-lawson',
  domainId: 'nuclear',
  sourceText: 'Sprawdź kryterium Lawsona tokamak.',
  inputs: { densityExponent: 20, temperatureKeV: 15, confinementSeconds: 1.5 },
};

test('Fabric contract exposes the bounded D–T Lawson 0D criterion', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'nuclear-tokamak-lawson');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'nuclear');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'temperatureKeV'), { id: 'temperatureKeV', type: 'number', unit: 'keV', min: 2, max: 40 });
  assert.ok(model.outputs.some((output) => output.id === 'lawsonRatio'));
});

test('Fabric API executes the exact shared Lawson 0D runner', () => {
  const direct = runTokamakLawsonScenario(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.lawsonRatio, 0.75);
  assert.equal(response.body.run.outputs.ignitionCriterionMet, false);
  assert.equal(response.body.run.provenance.engine, 'Genesis D–T Lawson 0D criterion (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'bounded_0d_lawson_criterion');
});

test('Fabric API rejects Lawson input outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, temperatureKeV: 41 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
