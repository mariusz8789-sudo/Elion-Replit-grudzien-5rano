import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { buildPhotonGraph } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'photon-energy',
  domainId: 'electrodynamics',
  sourceText: 'Oblicz energię fotonu o długości fali 500 nm.',
  inputs: { wavelengthNm: 500 },
};

function directOutputs(wavelengthNm) {
  const graph = buildPhotonGraph();
  graph.applyParameterSnapshot({ wavelengthNm });
  return {
    photonEnergyEV: graph.getValue('photonEnergyEV'),
    photonFrequencyTHz: graph.getValue('photonFrequencyTHz'),
    photonEnergyKJmol: graph.getValue('photonEnergyKJmol'),
  };
}

test('Fabric contract exposes the exact photon-energy ModelGraph', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'photon-energy');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'electrodynamics');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'wavelengthNm'), { id: 'wavelengthNm', type: undefined, unit: 'nm', min: 0.001, max: 1e9 });
  assert.ok(model.outputs.some((output) => output.id === 'photonEnergyKJmol'));
});

test('Fabric API executes the exact shared photon-energy ModelGraph', () => {
  const direct = directOutputs(500);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.ok(Math.abs(response.body.run.outputs.photonEnergyEV - 2.479683968) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis photon-energy ModelGraph (shared frontend/backend graph)');
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects a photon wavelength outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { wavelengthNm: 0 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
