import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { runBlochCircuitScenario } from './compute/core.bundle.mjs';

const db = openDatabase(':memory:');
const request = {
  contractVersion: '1.0.0',
  modelId: 'quantum-bloch-circuit',
  domainId: 'quantum',
  sourceText: 'Wykonaj obwód kubitowy: H X.',
  inputs: { circuit: 'H X' },
};

function flattened(scenario) {
  return {
    gates: scenario.gates.join(' '),
    finalAmplitude0Re: scenario.finalAmplitude0[0],
    finalAmplitude0Im: scenario.finalAmplitude0[1],
    finalAmplitude1Re: scenario.finalAmplitude1[0],
    finalAmplitude1Im: scenario.finalAmplitude1[1],
    probability0: scenario.probability0,
    probability1: scenario.probability1,
    blochX: scenario.bloch[0],
    blochY: scenario.bloch[1],
    blochZ: scenario.bloch[2],
    normSquared: scenario.normSquared,
  };
}

test('Fabric contract exposes the bounded exact single-qubit Bloch circuit model', () => {
  const response = handleApi(db, { method: 'GET', pathname: '/api/compute/fabric/contract', body: {}, query: {}, token: null });
  assert.equal(response.status, 200);
  const model = response.body.contract.models.find((candidate) => candidate.id === 'quantum-bloch-circuit');
  assert.ok(model);
  assert.equal(model.version, '1.1.0');
  assert.equal(model.domain, 'quantum');
  assert.equal(model.deterministic, true);
  assert.deepEqual(model.inputs.find((input) => input.id === 'circuit'), { id: 'circuit', type: 'string', unit: '', min: undefined, max: undefined });
  assert.ok(model.outputs.some((output) => output.id === 'normSquared'));
});

test('Fabric API executes the exact shared single-qubit state-vector runner', () => {
  const direct = runBlochCircuitScenario({ circuit: 'H X' });
  const response = handleApi(db, { method: 'POST', pathname: '/api/compute/fabric/run', body: request, query: {}, token: null });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.status, 'ok');
  assert.deepEqual(response.body.run.outputs, flattened(direct));
  assert.ok(Math.abs(response.body.run.outputs.probability0 - 0.5) < 1e-12);
  assert.ok(Math.abs(response.body.run.outputs.probability1 - 0.5) < 1e-12);
  assert.ok(Math.abs(response.body.run.outputs.normSquared - 1) < 1e-12);
  assert.equal(response.body.run.provenance.engine, 'Genesis single-qubit unitary state-vector (shared Canvas/backend runner)');
  assert.equal(response.body.run.provenance.honesty, 'exact_ideal_single_qubit_state_vector');
});

test('Fabric API rejects a gate outside the bounded single-qubit alphabet before execution', () => {
  const response = handleApi(db, {
    method: 'POST', pathname: '/api/compute/fabric/run',
    body: { ...request, inputs: { circuit: 'H CNOT' } }, query: {}, token: null,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.run.status, 'rejected');
  assert.equal(response.body.run.error, 'invalid_circuit');
});
