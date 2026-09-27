/**
 * Phase 4 Formal Reality Kernel tests + hostile benchmark. Deterministic.
 * Buckingham-Pi is real linear algebra (benchmarked vs known physics), consistency
 * catches inconsistent equations, Necropolis changes a decision, priority beats baselines.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as fk from './cognitive/formalKernel.mjs';
import * as ev from './cognitive/evidenceStore.mjs';

test('Buckingham-Pi on the pendulum yields t^2 g / l (dimensionless)', () => {
  const r = fk.buckinghamPi([
    { symbol: 't', dimension: fk.DIM.TIME }, { symbol: 'l', dimension: fk.DIM.LENGTH },
    { symbol: 'm', dimension: fk.DIM.MASS }, { symbol: 'g', dimension: fk.DIM.GRAVITY },
  ]);
  assert.equal(r.nGroups, 1);
  const g = Object.fromEntries(r.groups[0].map((t) => [t.symbol, t.exponent]));
  // proportional to {t:2, l:-1, g:1}; mass drops out
  assert.equal(g.t / g.l, -2); assert.equal(g.g / g.l, -1); assert.equal(g.m, undefined);
});

test('Buckingham-Pi on Reynolds gives one group in {rho,v,L,mu} (== 1/Re up to sign)', () => {
  const r = fk.buckinghamPi([
    { symbol: 'rho', dimension: fk.DIM.DENSITY }, { symbol: 'v', dimension: fk.DIM.VELOCITY },
    { symbol: 'L', dimension: fk.DIM.LENGTH }, { symbol: 'mu', dimension: fk.DIM.DYN_VISCOSITY },
  ]);
  assert.equal(r.nGroups, 1);
  const g = Object.fromEntries(r.groups[0].map((t) => [t.symbol, t.exponent]));
  // rho^a v^a L^a mu^-a  → all four appear with equal magnitude (Reynolds)
  assert.equal(Math.abs(g.rho), Math.abs(g.mu));
  assert.equal(Math.abs(g.v), Math.abs(g.mu));
  assert.equal(Math.abs(g.L), Math.abs(g.mu));
});

test('dimensional consistency accepts F=ma and rejects F=mv', () => {
  const ma = fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION);
  assert.equal(fk.checkDimensionalConsistency([{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: ma }]).consistent, true);
  const mv = fk.dimMul(fk.DIM.MASS, fk.DIM.VELOCITY);
  const bad = fk.checkDimensionalConsistency([{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'mv', dimension: mv }]);
  assert.equal(bad.consistent, false);
  assert.deepEqual(bad.offenders, ['mv']);
});

test('a model-asserted equation is UNVERIFIED_FORMALIZATION until checked', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const f = fk.recordFormalRelation(db, { missionId: m.id, kind: 'EQUATION', expression: 'E=mc^2', status: fk.FORMAL_STATUS.UNVERIFIED_FORMALIZATION, source: 'model' });
  assert.equal(f.status, 'UNVERIFIED_FORMALIZATION');
  assert.ok(/^[0-9a-f]{64}$/.test(f.contentHash));
  assert.throws(() => fk.recordFormalRelation(db, { missionId: m.id, kind: 'EQUATION', status: 'PROVEN_TRUE' }), /invalid formal status/);
  db.close();
});

test('assumption attack reports what collapses if an assumption fails', () => {
  const a = fk.assumptionAttack({ text: 'flow is laminar' }, ['pressure-drop-model', 'friction-factor']);
  assert.equal(a.severity, 'CRITICAL');
  assert.deepEqual(a.collapses, ['pressure-drop-model', 'friction-factor']);
});

test('limit analyzer: stable, singular, and validity-domain-exceeded', () => {
  assert.equal(fk.analyzeLimit((x) => x * x, 2).status, 'STABLE_IN_TESTED_REGION');
  assert.equal(fk.analyzeLimit((x) => 1 / x, 0).status, 'SINGULAR_REGION_DETECTED');
  assert.equal(fk.analyzeLimit((x) => x, 100, { validityDomain: { min: 0, max: 10 } }).status, 'VALIDITY_DOMAIN_EXCEEDED');
  assert.equal(fk.analyzeLimit(null, 1).status, 'INSUFFICIENT_FORMAL_MODEL');
});

test('NECROPOLIS 2 changes a decision: a near-failure region is avoided, a far one proceeds', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  // A prior campaign failed at laminar->turbulent transition (Re ~ 2300).
  fk.recordFailureRegion(db, { missionId: m.id, failureClass: 'FAILED_PARAMETER_REGION', context: 'pipe-flow', parameterVector: { Re: 2300 }, scales: { Re: 2300 }, failureMode: 'transition instability' });
  const near = fk.assessRegion(db, m.id, { context: 'pipe-flow', parameterVector: { Re: 2350 }, scales: { Re: 2300 } });
  const far = fk.assessRegion(db, m.id, { context: 'pipe-flow', parameterVector: { Re: 100000 }, scales: { Re: 2300 } });
  assert.ok(['KNOWN_DEAD_END', 'HIGH_FAILURE_SIMILARITY'].includes(near.verdict), 'near a known failure → flagged');
  assert.equal(far.verdict, 'NOVEL_REGION', 'far from known failure → proceed');
  // The decision changes: we would AVOID `near` and RUN `far`.
  const avoidNear = near.verdict !== 'NOVEL_REGION';
  assert.equal(avoidNear, true);
  db.close();
});

test('EPISTEMIC PRIORITY beats fixed-order and cost-only baselines', () => {
  // The best info-per-cost action (A) is neither first nor cheapest.
  const actions = [
    { type: 'RETRIEVE_EVIDENCE', expectedInfoGainProxy: 0.1, computeCost: 0, decisionRelevance: 1, reversibility: 1, riskOfInvalidInference: 0 }, // first + cheapest
    { type: 'RUN_SENSITIVITY_ANALYSIS', expectedInfoGainProxy: 0.9, computeCost: 1, decisionRelevance: 1, reversibility: 1, riskOfInvalidInference: 0 }, // A: best value
    { type: 'INCREASE_FIDELITY', expectedInfoGainProxy: 0.95, computeCost: 50, decisionRelevance: 1, reversibility: 0.2, riskOfInvalidInference: 1 }, // expensive/risky
  ];
  const chosen = fk.selectNextAction(actions).action;
  assert.equal(chosen.type, 'RUN_SENSITIVITY_ANALYSIS', 'priority selects the best information-per-cost action');
  assert.notEqual(fk.baselineFixedOrder(actions).action.type, chosen.type, 'fixed-order would pick a worse action');
  assert.notEqual(fk.baselineCostOnly(actions).action.type, chosen.type, 'cost-only would pick a worse action');
  assert.equal(fk.selectNextAction([]).action.type, 'NO_VALID_ACTION');
});

/* -------- HOSTILE BENCHMARK: try to make the kernel accept nonsense -------- */
test('HOSTILE: kernel refuses to call an unverified formalization verified', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const f = fk.recordFormalRelation(db, { missionId: m.id, kind: 'EQUATION', expression: 'made-up-law', status: fk.FORMAL_STATUS.UNVERIFIED_FORMALIZATION });
  assert.notEqual(f.status, 'COMPUTATIONALLY_VERIFIED');
  db.close();
});

test('HOSTILE: a dimensionally inconsistent "equation" is caught before any compute', () => {
  // "energy = force" — a classic dimensional error a chatbot might accept.
  const bad = fk.checkDimensionalConsistency([{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }]);
  assert.equal(bad.consistent, false);
});

test('HOSTILE: false pruning guard — a novel valid region is NOT flagged as a dead end', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  fk.recordFailureRegion(db, { missionId: m.id, failureClass: 'FAILED_PARAMETER_REGION', context: 'c', parameterVector: { x: 1 }, scales: { x: 1 } });
  const novel = fk.assessRegion(db, m.id, { context: 'c', parameterVector: { x: 100 }, scales: { x: 1 } });
  assert.equal(novel.verdict, 'NOVEL_REGION', 'a far, untested region must not be falsely pruned');
  db.close();
});
