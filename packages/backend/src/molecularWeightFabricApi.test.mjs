import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { atomCount, degreeOfUnsaturation, molecularWeight, parseFormula } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'chem-molecular-weight',
  domainId: 'chemistry',
  sourceText: 'Oblicz masę molową wzór H2O.',
  inputs: { formula: 'H2O' },
};

function directOutputs(formula) {
  const parsed = parseFormula(formula);
  assert.equal(parsed.ok, true);
  return {
    molarMassGmol: molecularWeight(parsed.counts),
    atomCount: atomCount(parsed.counts),
    degreeOfUnsaturation: degreeOfUnsaturation(parsed.counts),
  };
}

test('Fabric contract exposes the bounded molecular-weight parser', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'chem-molecular-weight');
  assert.ok(model);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'formula'), { id: 'formula', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'molarMassGmol'));
});

test('Fabric API executes the exact shared molecular-weight parser', () => {
  const direct = directOutputs(request.inputs.formula);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, direct);
  assert.equal(response.body.run.outputs.atomCount, 3);
  assert.equal(response.body.run.provenance.honesty, 'exact');
});

test('Fabric API rejects a molecular formula outside the bounded parser before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { formula: 'Ca(OH)2' } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'invalid_formula');
});
