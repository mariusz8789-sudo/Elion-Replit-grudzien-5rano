import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect } from './compute/structuralAdapter.mjs';

const runtime = detect();
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'biology-hiv-10e8-pdb-structural-comparison',
  domainId: 'biology-vaccine-discovery',
  sourceText: 'Porównaj PDB RMSD HIV MPER 10E8: 5GHW i 4G6F.',
  inputs: { referencePdb: '5GHW', mobilePdb: '4G6F' },
};

test('Fabric contract exposes the bounded real PDB structural-comparison model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === request.modelId);
  assert.ok(model);
  assert.equal(model.domain, 'biology-vaccine-discovery');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'referencePdb'), { id: 'referencePdb', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'fab10e8RmsdAngstrom'));
});

if (runtime.available) {
  test('Fabric API runs real Biopython C-alpha RMSD for public HIV MPER/10E8 structures', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.modelId, request.modelId);
    assert.equal(response.body.run.outputs.fabMatchedCaAtoms, 422);
    assert.equal(response.body.run.outputs.mperMatchedIdenticalCaAtoms, 13);
    assert.ok(Math.abs(response.body.run.outputs.fab10e8RmsdAngstrom - 8.242672750748403) < 1e-9);
    assert.ok(Math.abs(response.body.run.outputs.mperInFabAlignedFrameRmsdAngstrom - 17.041076297900034) < 1e-9);
    assert.equal(response.body.run.provenance.engine, 'Biopython 1.88');
    assert.equal(response.body.run.provenance.classification, 'COMPUTATIONAL_RESULT');
    assert.equal(response.body.run.provenance.referencePdb, '5GHW');
    assert.equal(response.body.run.provenance.mobilePdb, '4G6F');
    assert.match(response.body.run.provenance.referenceSha256, /^[a-f0-9]{64}$/);
    assert.match(response.body.run.provenance.mobileSha256, /^[a-f0-9]{64}$/);
    assert.equal(response.body.persisted, false);
  });

  test('Fabric API runs the public experimental 10E8v4 A/B structural pair without claiming functional improvement', () => {
    const variantRequest = {
      ...request,
      sourceText: 'Porównaj publiczne PDB RMSD 10E8v4 5WDF z 5GHW.',
      inputs: { referencePdb: '5GHW', mobilePdb: '5WDF' },
    };
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: variantRequest, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.outputs.fabMatchedCaAtoms, 367);
    assert.equal(response.body.run.outputs.mperMatchedIdenticalCaAtoms, 13);
    assert.ok(Math.abs(response.body.run.outputs.fab10e8RmsdAngstrom - 4.292389483139211) < 1e-9);
    assert.ok(Math.abs(response.body.run.outputs.mperInFabAlignedFrameRmsdAngstrom - 9.14309175551874) < 1e-9);
    assert.equal(response.body.run.provenance.referencePdb, '5GHW');
    assert.equal(response.body.run.provenance.mobilePdb, '5WDF');
    assert.equal(response.body.run.provenance.classification, 'COMPUTATIONAL_RESULT');
    assert.match(response.body.run.provenance.mobileSha256, /^[a-f0-9]{64}$/);
  });
} else {
  test('Fabric API rejects structural comparison rather than emitting a synthetic RMSD without runtime', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
    assert.equal(response.body.run.error, 'capability_unavailable');
  });
}

test('Fabric API rejects an unsupported PDB pair before structural execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run', query: {}, token: null,
    body: { ...request, inputs: { referencePdb: '5GHW', mobilePdb: '2PV6' } },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'unsupported_pdb_pair');
});
