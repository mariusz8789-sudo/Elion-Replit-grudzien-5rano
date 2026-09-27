import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScienceRunRecord,
  getCapabilityContract,
  listRemoteCapabilities,
  validateCapabilityInput,
  validateCapabilityResult,
} from './scientificCapabilityContract.mjs';
import { resolveWorkerConfig, routeCapability } from './remoteScientificWorkerClient.mjs';
import { PROBE_FIXTURES } from './workerRuntimeProbe.mjs';

const input = Object.freeze({ n1: 1, n2: 2, frequency: 1, resolution: 80 });
const data = Object.freeze({
  n1: 1, n2: 2, frequency: 1, resolution: 80,
  computedReflectance: 1 / 9, computedTransmittance: 8 / 9,
  analyticReflectance: 1 / 9, analyticTransmittance: 8 / 9,
  reflectanceAbsoluteError: 0, transmittanceAbsoluteError: 0, energyClosure: 1,
  incidentFlux: 1, reflectedFlux: 1 / 9,
});
const result = Object.freeze({
  data,
  meta: { method: 'FDTD', dimension: '1D normal incidence', polarization: 'Ex', measurement: 'flux subtraction', modelScope: 'planar interface only' },
});

describe('canonical PyMeep remote contract', () => {
  test('is registered in the one shared worker contract and routed only when configured', () => {
    assert.ok(listRemoteCapabilities().includes('maxwell-fdtd'));
    assert.deepEqual(getCapabilityContract('maxwell-fdtd'), {
      capabilityId: 'maxwell-fdtd', toolId: 'pymeep', engineName: 'PyMeep', workerGroup: 'pymeep',
    });
    const local = resolveWorkerConfig({ GENESIS_SCIENTIFIC_WORKER_TOKEN: 'x'.repeat(32) });
    assert.equal(routeCapability('maxwell-fdtd', local).route, 'LOCAL');
    const remote = resolveWorkerConfig({ GENESIS_SCIENTIFIC_WORKER_TOKEN: 'x'.repeat(32), GENESIS_PYMEEP_WORKER_URL: 'http://pymeep.railway.internal:8080' });
    assert.equal(routeCapability('maxwell-fdtd', remote).route, 'REMOTE');
  });

  test('accepts only the bounded 1D interface input', () => {
    assert.equal(validateCapabilityInput('maxwell-fdtd', input).ok, true);
    assert.equal(validateCapabilityInput('maxwell-fdtd', { ...input, resolution: 256 }).ok, false);
    assert.equal(validateCapabilityInput('maxwell-fdtd', { ...input, gridSize: [64, 64] }).ok, false);
    assert.deepEqual(PROBE_FIXTURES['maxwell-fdtd'].input, input);
  });

  test('validates engine output and builds a canonical ScienceRun', () => {
    assert.equal(validateCapabilityResult('maxwell-fdtd', result, input).ok, true);
    assert.equal(validateCapabilityResult('maxwell-fdtd', { ...result, data: { ...data, n2: 3 } }, input).ok, false);
    const built = buildScienceRunRecord('maxwell-fdtd', { input, result, engineVersion: '1.34.0' });
    assert.equal(built.run.capability, 'maxwell-fdtd');
    assert.equal(built.run.engine, 'PyMeep');
    assert.equal(built.run.evidenceClass, 'MODEL_ESTIMATE');
    assert.equal(built.run.outputs.energyClosure, 1);
    assert.equal(built.extraLimitations.length, 2);
  });
});
