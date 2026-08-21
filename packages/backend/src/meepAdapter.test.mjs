import assert from 'node:assert/strict';
import test from 'node:test';
import * as meep from './compute/meepAdapter.mjs';

const runtime = meep.detect();

test('Meep adapter reports an honest runtime state', () => {
  assert.equal(typeof runtime.available, 'boolean');
  if (runtime.available) {
    assert.equal(typeof runtime.version, 'string');
    assert.match(runtime.engine, /^PyMeep /);
  } else {
    assert.equal(typeof runtime.reason, 'string');
  }
});

if (runtime.available) {
  test('PyMeep reference FDTD interface matches Fresnel transmittance', () => {
    const reference = meep.referenceCase();
    assert.equal(reference.ok, true);
    assert.equal(reference.pass, true);
    assert.ok(Math.abs(reference.actualTransmittance - 8 / 9) <= reference.tolerance);
    assert.equal(reference.data.energyClosure, 1);
    assert.equal(reference.data.n1, 1);
    assert.equal(reference.data.n2, 2);
  });

  test('PyMeep executes an explicit declared FDTD interface input', () => {
    const result = meep.interfaceTransmission({ n1: 1, n2: 1.5, frequency: 0.8, resolution: 80 });
    assert.equal(result.ok, true);
    assert.equal(result.meta.method, 'FDTD');
    assert.equal(result.data.n1, 1);
    assert.equal(result.data.n2, 1.5);
    assert.ok(result.data.transmittanceAbsoluteError < 0.003);
    assert.equal(result.data.energyClosure, 1);
  });
} else {
  test('Meep never fabricates a result when the configured runtime is unavailable', () => {
    const reference = meep.referenceCase();
    assert.equal(reference.ok, false);
    assert.equal(reference.error, 'BLOCKED_BY_RUNTIME');
  });
}
