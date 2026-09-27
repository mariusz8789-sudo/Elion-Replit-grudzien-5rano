/**
 * ZEFIR Truth Engine — scientific adversarial audit (Verification Mandate Mission 3).
 * Adversarial proposals attempt to obtain GO despite contradictions or missing content.
 * The objective is NOT to maximize BLOCK — it is correct behavior:
 *   provable contradiction → BLOCK; incomplete info → INSUFFICIENT_DATA / qualified WARN;
 *   unsupported science → explicit capability gap; supported consistent input → GO/justified WARN.
 * No fabricated certainty may be produced.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as te from './cognitive/truthEngine.mjs';
import * as fk from './cognitive/formalKernel.mjs';

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const d = (p) => te.analyze(p).decision.decision;

test('ATTACK missing technical content (hype only) → INSUFFICIENT_DATA, never GO', () => {
  assert.equal(d({ problemStatement: 'the future of energy', claimedResult: 'infinite output' }), 'INSUFFICIENT_DATA');
});

test('ATTACK incompatible units in a comparison → BLOCK', () => {
  const out = te.analyze({ claimedResult: 'x', assumptions: ['a'], comparisons: [{ a: { symbol: 'E', dimension: fk.DIM.ENERGY }, b: { symbol: 'F', dimension: fk.DIM.FORCE }, relation: '=' }] });
  assert.equal(out.decision.decision, 'BLOCK');
  assert.ok(out.decision.constraintViolations.some((c) => c.id === 'unit-compatibility'));
});

test('ATTACK impossible efficiency (>100%) → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], efficiency: 1.5 }), 'BLOCK');
});

test('ATTACK energy accounting contradiction → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], energy: { input: 100, output: 200 } }), 'BLOCK');
});

test('ATTACK mass accounting contradiction → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], mass: { in: 5, out: 12 } }), 'BLOCK');
});

test('ATTACK inconsistent flow/volume/time → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], flow: { volumetricFlow: 9, volume: 20, time: 10 } }), 'BLOCK');
});

test('ATTACK inconsistent power/energy/time → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], power: { power: 9, energy: 20, time: 10 } }), 'BLOCK');
});

test('ATTACK geometric impossibility (negative depth) → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], geometry: { depth: -5 } }), 'BLOCK');
});

test('ATTACK explicit material operating-limit violation → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], materials: [{ name: 'PVC', maxTemp: 60 }], operating: { temperature: { value: 120 } } }), 'BLOCK');
});

test('ATTACK contradictory supplied constraints (temp above own max) → BLOCK', () => {
  assert.equal(d({ claimedResult: 'x', assumptions: ['a'], operating: { temperature: { value: 200, max: 100 } } }), 'BLOCK');
});

test('ATTACK unsupported domain science → capability gap, NOT GO (no fabricated certainty)', () => {
  const out = te.analyze({ claimedResult: 'aeration', assumptions: ['a'], flow: { volumetricFlow: 2, volume: 20, time: 10 }, requestedDomains: ['oxygen-transfer-efficiency', 'limnology'] });
  assert.notEqual(out.decision.decision, 'GO');
  assert.ok(out.decision.capabilityGaps.includes('oxygen-transfer-efficiency'));
  assert.ok(out.decision.unsupportedDomains.length >= 1);
});

test('ATTACK revolutionary marketing language does not improve the decision', () => {
  const plain = d({ claimedResult: 'x', assumptions: ['a'], energy: { input: 100, output: 200 } });
  const hyped = d({ problemStatement: 'PARADIGM-SHIFTING NOBEL BREAKTHROUGH', claimedResult: 'x', assumptions: ['a'], energy: { input: 100, output: 200 } });
  assert.equal(plain, hyped); // both BLOCK
  assert.equal(plain, 'BLOCK');
});

test('ATTACK huge evidence text with no structured inputs → NOT GO', () => {
  const out = te.analyze({ problemStatement: 'x'.repeat(3000), claimedResult: 'it works', evidence: Array.from({ length: 40 }, (_, i) => `ref ${i}`) });
  assert.notEqual(out.decision.decision, 'GO');
});

test('ATTACK duplicate equations do not manufacture false confidence (same decision as single)', () => {
  const single = d({ claimedResult: 'x', equations: [FMA], assumptions: ['a', 'b'] });
  const dup = d({ claimedResult: 'x', equations: [FMA, FMA, FMA], assumptions: ['a', 'b'] });
  assert.equal(single, dup); // both GO — duplication adds no strength
});

test('reordered canonical (object key order) inputs → identical decision hash', () => {
  const a = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a', 'b'] });
  const b = te.analyze({ assumptions: ['a', 'b'], equations: [FMA], claimedResult: 'x' }); // keys reordered
  assert.equal(a.certificate.decisionHash, b.certificate.decisionHash);
});

test('ATTACK irrelevant technical jargon with no substance → NOT GO', () => {
  assert.notEqual(d({ problemStatement: 'quantum synergy blockchain graphene metamaterial', claimedResult: 'disruptive' }), 'GO');
});

test('CONTROL: a genuinely consistent, well-specified proposal earns GO', () => {
  assert.equal(d({ claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod'], energy: { input: 100, output: 80 }, efficiency: 0.8 }), 'GO');
});
