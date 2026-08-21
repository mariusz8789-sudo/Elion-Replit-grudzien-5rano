import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runQuantumTeleportScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-teleportation',
  domainId: 'quantum',
  sourceText: 'Uruchom teleportację kwantową stan=plusI.',
  inputs: { state: 'plusI' },
};

function flattened(scenario) {
  const outputs = {
    state: scenario.state,
    stateLabel: scenario.stateLabel,
    branchCount: scenario.branchCount,
    minFidelity: scenario.minFidelity,
    averageFidelity: scenario.averageFidelity,
    allRecovered: scenario.allRecovered,
  };
  for (const branch of scenario.branches) {
    const suffix = `${branch.outcome0}${branch.outcome1}`;
    outputs[`branch${suffix}Correction`] = branch.correction;
    outputs[`branch${suffix}Fidelity`] = branch.fidelity;
  }
  return outputs;
}

test('Fabric contract exposes the bounded exact three-qubit teleportation model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-teleportation');
  assert.ok(model);
  assert.equal(model.domain, 'quantum');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'state'), { id: 'state', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'branch11Fidelity'));
});

test('Fabric API executes the shared exact state-vector runner for every measurement branch', () => {
  const direct = runQuantumTeleportScenario({ state: 'plusI' });
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, flattened(direct));
  assert.equal(response.body.run.outputs.branchCount, 4);
  assert.equal(response.body.run.outputs.allRecovered, true);
  assert.ok(Math.abs(response.body.run.outputs.minFidelity - 1) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis three-qubit state-vector teleportation (shared Canvas/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'exact_ideal_state_vector_protocol');
});

test('Fabric API rejects an unrecognized teleportation preset before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { state: 'nope' } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'invalid_input');
});
