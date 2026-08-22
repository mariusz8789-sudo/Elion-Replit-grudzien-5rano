import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect } from './compute/openmmAdapter.mjs';

const runtime = detect();
const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'biology-openmm-md-1vii-reference',
  domainId: 'biology-vaccine-discovery',
  sourceText: 'Uruchom OpenMM MD benchmark 1VII, steps=500.',
  inputs: { steps: 100 },
};

test('Fabric contract exposes the bounded real OpenMM CPU MD reference model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === request.modelId);
  assert.ok(model);
  assert.equal(model.domain, 'biology-vaccine-discovery');
  assert.equal(model.deterministic, true);
  assert.ok(model.outputs.some((output) => output.id === 'potentialEnergyAfterKjPerMol'));
});

if (runtime.available) {
  test('Fabric API runs real OpenMM CPU molecular dynamics for public PDB 1VII', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 200);
    assert.equal(response.body.run.status, 'ok');
    assert.equal(response.body.run.outputs.atomCountAfterHydrogenAddition, 596);
    assert.equal(response.body.run.outputs.simulatedPicoseconds, 0.2);
    assert.ok(response.body.run.outputs.potentialEnergyMinimizedKjPerMol < response.body.run.outputs.potentialEnergyBeforeKjPerMol);
    assert.equal(response.body.run.provenance.engine, 'OpenMM 8.6 CPU');
    assert.equal(response.body.run.provenance.classification, 'COMPUTATIONAL_RESULT');
    assert.equal(response.body.run.provenance.pdbId, '1VII');
    assert.equal(response.body.run.provenance.cpuThreads, 1);
    assert.equal(response.body.run.provenance.pdbSha256, 'ebecd3d6c0dd9c8b34bcbea9b57c73e4f73986cc674150f0aaa0687db66e77ef');
  });
} else {
  test('Fabric API rejects MD instead of creating synthetic output when OpenMM is unavailable', () => {
    const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
    assert.equal(response.status, 400);
    assert.equal(response.body.run.status, 'rejected');
  });
}

test('Fabric API rejects MD step count outside the bounded benchmark domain', () => {
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', query: {}, token: null, body: { ...request, inputs: { steps: 5 } } });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
});
