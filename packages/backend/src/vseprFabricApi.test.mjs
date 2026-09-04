import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runVseprScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'chem-vsepr',
  domainId: 'chemistry',
  sourceText: 'Pokaż geometrię cząsteczki VSEPR.',
  inputs: { shapeId: 'ax3e1' },
};

function flattened(result) {
  return {
    ...result,
    bondingVecs: JSON.stringify(result.bondingVecs),
    loneVecs: JSON.stringify(result.loneVecs),
  };
}

test('Fabric contract exposes the bounded VSEPR domain-geometry model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'chem-vsepr');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'shapeId'), { id: 'shapeId', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'bondingVecs'));
});

test('Fabric API executes the exact shared VSEPR domain-geometry runner', () => {
  const direct = runVseprScenario(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, flattened(direct));
  assert.equal(response.body.run.outputs.shapeId, 'ax3e1');
  assert.equal(response.body.run.outputs.angleMeasured, true);
  assert.equal(response.body.run.provenance.engine, 'Genesis VSEPR domain-geometry runner (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'bounded_vsepr_geometry');
});

test('Fabric API rejects a VSEPR shape outside the bounded scenario before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { shapeId: 'unsupported' } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'unsupported_shape');
});
