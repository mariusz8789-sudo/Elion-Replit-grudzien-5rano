import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateManifold, systemTelemetry, validatePoints, ManifoldEngine } from './manifoldApi.mjs';
import { Genesis5DManifoldEngine } from './compute/manifold-core.mjs';

const pt = (x, y, z, temporalT = 0, hyperspaceW = 0) => ({ x, y, z, temporalT, hyperspaceW });
const sampler = { sample: () => ({ totalMemBytes: 16e9, freeMemBytes: 4e9, loadAvg: [2, 1.5, 1], cpuCount: 12 }) };
const clock = { now: () => 777 };

test('the API evaluates real geometry through the core engine class, not a stub', () => {
  assert.equal(ManifoldEngine, Genesis5DManifoldEngine);
  const line = Array.from({ length: 8 }, (_, i) => pt(i, i, 0, i, 0));
  const r = evaluateManifold({ nodeId: 'CI', points: line }, { sampler, clock });
  assert.equal(r.ok, true);
  assert.equal(r.label, 'GEOMETRIC_MODEL');
  assert.equal(r.manifold.curvature.mean, 0);
  assert.equal(r.manifold.temporalStabilityIndex, 1);
  assert.equal(r.manifold.metricTensor.length, 25);
  assert.equal(r.manifold.cryptographicProof.length, 64);
  assert.deepEqual(r.modulesExecuted, ['manifold5d', 'telemetry']);
});

test('telemetry in the receipt is the injected machine sample — never a constant', () => {
  const r = evaluateManifold({ points: [pt(0, 0, 0), pt(1, 0, 0), pt(1, 1, 0)] }, { sampler, clock });
  assert.equal(r.telemetry.cpuCount, 12);
  assert.equal(r.telemetry.totalMemBytes, 16e9);
  assert.equal(r.telemetry.freeMemBytes, 4e9);
  assert.deepEqual(r.telemetry.loadAvg, [2, 1.5, 1]);
  assert.equal(r.telemetry.source, 'os');
  assert.equal(r.telemetry.sampledAt, 777);
  assert.equal(r.manifold.evaluatedAt, 777);
});

test('the same path gives the same proof and manifoldId regardless of the machine', () => {
  const pts = [pt(0, 0, 0, 0, 1), pt(1, 2, 0, 1, 1), pt(2, 2, 1, 2, 1)];
  const a = evaluateManifold({ points: pts }, { sampler, clock });
  const b = evaluateManifold({ points: pts }, { sampler: { sample: () => ({ totalMemBytes: 1e9, freeMemBytes: 5e8, loadAvg: [0, 0, 0], cpuCount: 2 }) }, clock });
  assert.equal(a.manifold.cryptographicProof, b.manifold.cryptographicProof);
  assert.notEqual(a.compositeChecksum, b.compositeChecksum);
});

test('bad input is refused with 400-class errors, never coerced', () => {
  assert.equal(validatePoints('nope').error, 'invalid_request');
  assert.equal(validatePoints([{ x: 1 }]).error, 'invalid_point');
  assert.equal(validatePoints([pt(Number.NaN, 0, 0)]).error, 'invalid_point');
  assert.equal(validatePoints(Array.from({ length: 4097 }, () => pt(0, 0, 0))).error, 'too_many_points');
  const r = evaluateManifold({ points: [{ x: 'a' }] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('GET /api/system/telemetry reports this machine (cpu ≥ 1, memory > 0) and is labelled MEASURED', () => {
  const t = systemTelemetry();
  assert.equal(t.ok, true);
  assert.ok(t.cpuCount >= 1);
  assert.ok(t.totalMemBytes > 0);
  assert.ok(t.freeMemBytes >= 0 && t.freeMemBytes <= t.totalMemBytes);
  assert.equal(t.loadAvg.length, 3);
  assert.equal(t.source, 'os');
  assert.equal(t.label, 'MEASURED');
  assert.equal(t.process.node, process.versions.node);
  assert.ok(t.process.uptimeSec >= 0);
});
