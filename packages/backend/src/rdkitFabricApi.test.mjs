import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect } from './compute/rdkitAdapter.mjs';

const runtime = detect();
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'chem-rdkit-descriptors',
  domainId: 'chemistry',
  sourceText: 'Uruchom RDKit deskryptory SMILES: CCO',
  inputs: { smiles: 'CCO' },
};

test('Fabric contract exposes the real RDKit descriptor model with string SMILES input', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'chem-rdkit-descriptors');
  assert.ok(model);
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'smiles'), { id: 'smiles', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'crippenLogP'));
});

if (runtime.available) {
  test('Fabric API runs real RDKit descriptors with a validated string SMILES input', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.contractVersion, '1.0.0');
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.modelId, 'chem-rdkit-descriptors');
    assert.equal(response.body.run.outputs.canonicalSmiles, 'CCO');
    assert.ok(Math.abs(response.body.run.outputs.molWt - 46.069) < 0.0001);
    assert.equal(response.body.run.provenance.engine, 'RDKit 2026.03.5');
    assert.equal(response.body.persisted, false);
  });
} else {
  test('Fabric API rejects RDKit execution instead of emitting fabricated descriptors without runtime', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
    assert.equal(response.body.run.error, 'capability_unavailable');
  });
}
