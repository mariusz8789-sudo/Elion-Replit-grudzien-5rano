import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect } from './compute/qmAdapter.mjs';

const runtime = detect();
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-chemistry-pyscf-h2-rhf',
  domainId: 'quantum-chemistry',
  sourceText: 'Uruchom PySCF RHF dla H2 przy długości wiązania 0.74 A.',
  inputs: { bondLengthAngstrom: 0.74 },
};

test('Fabric contract exposes the bounded real PySCF H2 RHF model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-chemistry-pyscf-h2-rhf');
  assert.ok(model);
  assert.equal(model.domain, 'quantum-chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'bondLengthAngstrom'), { id: 'bondLengthAngstrom', type: 'number', unit: 'Å', min: 0.5, max: 3 });
  assert.deepEqual(model.inputs.find((input) => input.id === 'basis'), { id: 'basis', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'energyHartree'));
});

if (runtime.available) {
  test('Fabric API runs a real PySCF H2 RHF/STO-3G single point with dynamic engine provenance', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.contractVersion, '1.0.0');
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.modelId, 'quantum-chemistry-pyscf-h2-rhf');
    assert.ok(Math.abs(response.body.run.outputs.energyHartree - (-1.11676)) < 0.001);
    assert.equal(response.body.run.outputs.nElectrons, 2);
    assert.equal(response.body.run.provenance.engine, `PySCF ${runtime.version}`);
    assert.equal(response.body.run.provenance.method, 'RHF');
    assert.equal(response.body.run.provenance.basis, 'sto-3g');
    assert.equal(response.body.run.provenance.requiredEnvironmentVariable, 'GENESIS_PYSCF_PYTHON');
    assert.equal(response.body.persisted, false);
  });

  test('Fabric API runs the real PySCF H2 RHF/6-31G comparison arm', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: { ...request, inputs: { bondLengthAngstrom: 0.74, basis: '6-31g' } }, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.modelVersion, '1.1.0');
    assert.equal(response.body.run.provenance.engine, 'PySCF 2.14.0');
    assert.equal(response.body.run.provenance.method, 'RHF');
    assert.equal(response.body.run.provenance.basis, '6-31g');
    assert.ok(response.body.run.outputs.energyHartree < -1.12);
    assert.equal(response.body.run.outputs.nBasisFunctions, 4);
    assert.equal(response.body.persisted, false);
  });
  test('Fabric API rejects unsupported basis instead of passing an unregistered variant', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: { ...request, inputs: { bondLengthAngstrom: 0.74, basis: 'cc-pvdz' } }, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
    assert.equal(response.body.run.error, 'unsupported_basis');
  });
} else {
  test('Fabric API rejects PySCF execution instead of emitting fabricated quantum output without runtime', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
    assert.equal(response.body.run.error, 'capability_unavailable');
  });
}
