import assert from 'node:assert/strict';
import test from 'node:test';
import { getModel, runModel } from './compute/engine.mjs';
import { detect } from './compute/meepAdapter.mjs';
import { getTool } from './campaign/toolchain.mjs';

const runtime = detect();

test('Maxwell/FDTD compute model declares its bounded real-engine contract', () => {
  const model = getModel('electrodynamics-maxwell-fdtd');
  assert.ok(model);
  assert.equal(model.backendExecutable, true);
  assert.equal(model.kind, 'external-engine');
  assert.match(model.validity, /1D/);
  assert.match(model.provenance.source, /meep_worker/);
});

if (runtime.available) {
  test('Toolchain marks PyMeep AVAILABLE only with passed FDTD reference evidence', () => {
    const tool = getTool('pymeep');
    assert.equal(tool.status, 'AVAILABLE');
    assert.equal(tool.validation[0].pass, true);
    assert.ok(Math.abs(tool.validation[0].actualTransmittance - 8 / 9) < tool.validation[0].tolerance);
  });

  test('Maxwell/FDTD compute model executes PyMeep and retains a Fresnel check', () => {
    const run = runModel('electrodynamics-maxwell-fdtd', { n1: 1, n2: 2, frequency: 1, resolution: 80 });
    assert.equal(run.status, 'ok');
    assert.equal(run.deterministic, true);
    assert.ok(Math.abs(run.outputs.computedTransmittance - 8 / 9) < 0.003);
    assert.ok(run.outputs.energyClosure > 0.999999 && run.outputs.energyClosure < 1.000001);
    assert.match(run.warnings.join(' '), /PyMeep 1\.34\.0/);
  });
} else {
  test('Toolchain reports PyMeep as blocked instead of available when runtime is absent', () => {
    const tool = getTool('pymeep');
    assert.equal(tool.status, 'BLOCKED_BY_RUNTIME');
  });

  test('Maxwell/FDTD compute model rejects execution when PyMeep is absent', () => {
    const run = runModel('electrodynamics-maxwell-fdtd', {});
    assert.equal(run.status, 'rejected');
    assert.equal(run.error, 'capability_unavailable');
    assert.match(run.message, /PyMeep niedostępny/);
  });
}
