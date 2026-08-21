import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runChshCorrelationScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-chsh-correlation',
  domainId: 'quantum',
  sourceText: 'Oblicz korelację CHSH dla nierówności Bella.',
  inputs: { a: 0, aP: 90, b: 45, bP: 135 },
};

function flattened(result) {
  return {
    eAB: result.eAB,
    eABP: result.eABP,
    eAPB: result.eAPB,
    eAPBP: result.eAPBP,
    s: result.s,
    absS: result.absS,
    tsirelsonBound: result.tsirelsonBound,
  };
}

test('Fabric contract exposes the bounded analytical CHSH singlet model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-chsh-correlation');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'quantum');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'a'), { id: 'a', type: 'number', unit: 'deg', min: 0, max: 180 });
  assert.ok(model.outputs.some((output) => output.id === 'tsirelsonBound'));
});

test('Fabric API executes the exact shared analytical CHSH singlet runner', () => {
  const direct = runChshCorrelationScenario(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, flattened(direct));
  assert.ok(Math.abs(response.body.run.outputs.absS - 2 * Math.SQRT2) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis analytical singlet CHSH correlation (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'exact_ideal_singlet_correlation');
});

test('Fabric API rejects CHSH angles outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, a: 181 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
