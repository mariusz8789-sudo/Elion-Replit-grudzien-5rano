import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { solveKitaevBulk } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-kitaev-bulk',
  domainId: 'quantum',
  sourceText: 'Zasymuluj łańcuch Kitaeva mu=0 t=1 delta=1.',
  inputs: { chemicalPotential: 0, hopping: 1, pairing: 1 },
};

function flattened(result) {
  return {
    bulkGap: result.bulkGap,
    momentumAtGap: result.momentumAtGap,
    topologicalInvariant: result.topologicalInvariant,
    phase: result.phase,
    criticalChemicalPotentialNegative: result.criticalChemicalPotentialNegative,
    criticalChemicalPotentialPositive: result.criticalChemicalPotentialPositive,
  };
}

test('Fabric contract exposes the bounded analytical Kitaev bulk model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-kitaev-bulk');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'quantum');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'chemicalPotential'), { id: 'chemicalPotential', type: 'number', unit: 'jedn. energii', min: -10, max: 10 });
  assert.ok(model.outputs.some((output) => output.id === 'topologicalInvariant'));
});

test('Fabric API executes the exact shared bulk BdG analytical minimizer', () => {
  const direct = solveKitaevBulk(request.inputs);
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, flattened(direct));
  assert.equal(response.body.run.outputs.phase, 'TOPOLOGICAL_REGIME');
  assert.equal(response.body.run.outputs.topologicalInvariant, -1);
  assert.ok(Math.abs(response.body.run.outputs.bulkGap - 2) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis Kitaev bulk BdG analytical minimizer (shared frontend/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'exact_bounded_analytic_bulk_model');
});

test('Fabric API rejects Kitaev inputs outside the bounded contract before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { ...request.inputs, hopping: 0 } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'out_of_range');
});
