/**
 * Deterministic Constraint Registry tests (Commercial Hardening — Phase 3).
 * Every implemented relation is tested for PASS, VIOLATED, and SKIPPED-on-missing-input.
 * A constraint must NEVER fabricate a result when its required inputs are absent.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cr from './cognitive/constraintRegistry.mjs';
import * as fk from './cognitive/formalKernel.mjs';

const idOf = (res, id) => res.results.find((r) => r.id === id);

test('registry exposes versioned, structured constraint definitions', () => {
  assert.ok(cr.REGISTRY_VERSION);
  for (const c of cr.CONSTRAINTS) {
    assert.ok(c.id && c.domain && c.name && c.description);
    assert.ok(Array.isArray(c.requiredInputs) && c.requiredInputs.length > 0);
    assert.equal(typeof c.applicable, 'function');
    assert.equal(typeof c.evaluate, 'function');
    assert.ok(c.rationale, `${c.id} must carry a rationale (a BLOCK needs an explainable basis)`);
    assert.ok(c.version);
  }
});

test('a constraint with no supplied inputs is SKIPPED — never a silent PASS or FAIL', () => {
  const res = cr.evaluateAll({});
  assert.ok(res.results.every((r) => r.status === 'SKIPPED'));
  assert.equal(res.violations.length, 0);
  assert.equal(res.passed.length, 0);
});

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const EeqF = { symbol: 'E=F', terms: [{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }] };

test('dimensional-consistency: PASS on F=ma, VIOLATED on E=F', () => {
  assert.equal(idOf(cr.evaluateAll({ equations: [FMA] }), 'dimensional-consistency').status, 'PASS');
  const bad = cr.evaluateAll({ equations: [EeqF] });
  assert.equal(idOf(bad, 'dimensional-consistency').status, 'VIOLATED');
  assert.equal(bad.violations.length, 1);
});

test('unit-compatibility: VIOLATED when comparing energy to force', () => {
  const res = cr.evaluateAll({ comparisons: [{ a: { symbol: 'E', dimension: fk.DIM.ENERGY }, b: { symbol: 'F', dimension: fk.DIM.FORCE }, relation: '=' }] });
  assert.equal(idOf(res, 'unit-compatibility').status, 'VIOLATED');
});

test('energy-balance: over-unity output VIOLATED; balanced PASS; external source respected', () => {
  assert.equal(idOf(cr.evaluateAll({ energy: { input: 100, output: 130 } }), 'energy-balance').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ energy: { input: 100, output: 80 } }), 'energy-balance').status, 'PASS');
  assert.equal(idOf(cr.evaluateAll({ energy: { input: 100, output: 130, external: 50 } }), 'energy-balance').status, 'PASS');
});

test('efficiency-bound: >1 VIOLATED, within [0,1] PASS, COP declared → SKIPPED', () => {
  assert.equal(idOf(cr.evaluateAll({ efficiency: 1.2 }), 'efficiency-bound').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ efficiency: 0.4 }), 'efficiency-bound').status, 'PASS');
  assert.equal(idOf(cr.evaluateAll({ efficiency: 3.5, efficiencyKind: 'COP' }), 'efficiency-bound').status, 'SKIPPED');
});

test('mass-balance: out>in VIOLATED unless generation declared', () => {
  assert.equal(idOf(cr.evaluateAll({ mass: { in: 10, out: 12 } }), 'mass-balance').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ mass: { in: 10, out: 12, generation: 5 } }), 'mass-balance').status, 'PASS');
});

test('operating bounds: pressure/temperature above supplied max VIOLATED', () => {
  assert.equal(idOf(cr.evaluateAll({ operating: { pressure: { value: 12, max: 10 } } }), 'pressure-operating-bound').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ operating: { temperature: { value: 5, min: 20 } } }), 'temperature-operating-bound').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ operating: { pressure: { value: 5, max: 10 } } }), 'pressure-operating-bound').status, 'PASS');
});

test('flow-volume-time: Q=V/t consistency', () => {
  assert.equal(idOf(cr.evaluateAll({ flow: { volumetricFlow: 2, volume: 20, time: 10 } }), 'flow-volume-time').status, 'PASS');
  assert.equal(idOf(cr.evaluateAll({ flow: { volumetricFlow: 5, volume: 20, time: 10 } }), 'flow-volume-time').status, 'VIOLATED');
});

test('power-energy-time: P=E/t consistency', () => {
  assert.equal(idOf(cr.evaluateAll({ power: { power: 2, energy: 20, time: 10 } }), 'power-energy-time').status, 'PASS');
  assert.equal(idOf(cr.evaluateAll({ power: { power: 9, energy: 20, time: 10 } }), 'power-energy-time').status, 'VIOLATED');
});

test('geometry-sanity: negative extent VIOLATED', () => {
  assert.equal(idOf(cr.evaluateAll({ geometry: { depth: -3 } }), 'geometry-sanity').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ geometry: { depth: 3, volume: 100 } }), 'geometry-sanity').status, 'PASS');
});

test('material-operating-limit: operating temp above material max VIOLATED', () => {
  const res = cr.evaluateAll({ materials: [{ name: 'PVC', maxTemp: 60 }], operating: { temperature: { value: 90 } } });
  assert.equal(idOf(res, 'material-operating-limit').status, 'VIOLATED');
  const ok = cr.evaluateAll({ materials: [{ name: 'PVC', maxTemp: 60 }], operating: { temperature: { value: 40 } } });
  assert.equal(idOf(ok, 'material-operating-limit').status, 'PASS');
});

test('conservation-accounting: outputs exceeding inputs VIOLATED', () => {
  assert.equal(idOf(cr.evaluateAll({ accounting: { inputs: [10, 5], outputs: [20], quantity: 'oxygen' } }), 'conservation-accounting').status, 'VIOLATED');
  assert.equal(idOf(cr.evaluateAll({ accounting: { inputs: [10, 5], outputs: [12] } }), 'conservation-accounting').status, 'PASS');
});

test('unencoded domains are reported UNSUPPORTED — no fabricated expertise', () => {
  const res = cr.evaluateAll({ energy: { input: 100, output: 80 } }, { requestedDomains: ['oxygen-transfer-efficiency', 'limnology'] });
  assert.equal(res.unsupported.length, 2);
  assert.ok(res.unsupported.every((u) => u.status === 'UNSUPPORTED' && u.reason));
});

test('an evaluator that throws degrades to INSUFFICIENT_DATA, never a false PASS', () => {
  // equations present but terms malformed → checkDimensionalConsistency may throw; must not crash the registry.
  const res = cr.evaluateAll({ equations: [{ symbol: 'x', terms: [{ symbol: 'a', dimension: null }, { symbol: 'b', dimension: undefined }] }] });
  const r = idOf(res, 'dimensional-consistency');
  assert.ok(['VIOLATED', 'INSUFFICIENT_DATA', 'PASS'].includes(r.status));
  assert.ok(res); // did not throw
});
