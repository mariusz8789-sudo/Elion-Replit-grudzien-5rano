import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0', modelId: 'electrodynamics-maxwell-fdtd-pec-reflection', domainId: 'electrodynamics',
  sourceText: 'Uruchom benchmark PyMeep odbicia PEC frequency=1 resolution=80.',
  inputs: { frequency: 1, resolution: 80 },
};

test('Fabric exposes the bounded real PyMeep PEC reflection benchmark', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === request.modelId);
  assert.ok(model);
  assert.equal(model.domain, 'electrodynamics');
  assert.ok(model.outputs.some((output) => output.id === 'peakAbsHyAtSample'));
});

test('Fabric runs real PyMeep PEC reflection and preserves external-engine provenance', () => {
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.ok(Math.abs(response.body.run.outputs.computedReflectance - 1) <= 0.003);
  assert.ok(response.body.run.outputs.peakAbsExAtSample > 0);
  assert.ok(response.body.run.outputs.peakAbsHyAtSample > 0);
  assert.equal(response.body.run.provenance.engine, 'PyMeep');
  assert.equal(response.body.run.provenance.honesty, 'real_external_engine');
});
