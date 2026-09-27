/**
 * ZEFIR Truth Engine + R&D Kill-Switch — pipeline tests + 12-case HOSTILE benchmark.
 * The system must resist hype: marketing language must not improve the decision.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as fk from './cognitive/formalKernel.mjs';
import * as te from './cognitive/truthEngine.mjs';

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };
const EeqF = { symbol: 'E=F', terms: [{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }] };

test('pipeline runs applicable engines and skips the rest with reasons (missing info is first-class)', () => {
  const out = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['isothermal'] });
  const byStage = Object.fromEntries(out.stages.map((s) => [s.stage, s.status]));
  assert.equal(byStage.DIMENSIONAL_ANALYSIS, 'EXECUTED');
  assert.equal(byStage.NECROPOLIS_CHECK, 'SKIPPED'); // no parameter vector supplied
  assert.ok(out.certificate.enginesSkipped.some((s) => s.stage === 'NECROPOLIS_CHECK'));
});

test('the decision certificate has a reproducible decisionHash (timestamp excluded)', () => {
  const p = { claimedResult: 'x', equations: [FMA], assumptions: ['a'] };
  const a = te.analyze(p); const b = te.analyze(p);
  assert.equal(a.certificate.decisionHash, b.certificate.decisionHash);
  assert.ok(/^[0-9a-f]{64}$/.test(a.certificate.decisionHash));
});

/* ---------------- 12-case HOSTILE benchmark ---------------- */
test('H1 dimensionally invalid equation, confidently presented → BLOCK', () => {
  const out = te.analyze({ problemStatement: 'Revolutionary breakthrough energy law', claimedResult: 'E equals F', equations: [EeqF], assumptions: ['a'] });
  assert.equal(out.decision.decision, 'BLOCK');
  assert.ok(out.decision.dimensionalInconsistencies.includes('E=F'));
});

test('H2 physically impossible claim with sophisticated language → BLOCK', () => {
  const out = te.analyze({ problemStatement: 'Zero-point vacuum energy harvesting', physicalConstraints: ['over-unity free energy generator'], assumptions: ['a'] });
  assert.equal(out.decision.decision, 'BLOCK');
  assert.ok(out.decision.physicalConstraintViolations.length >= 1);
});

test('H3 valid classical physics example → GO', () => {
  const out = te.analyze({ claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod'] });
  assert.equal(out.decision.decision, 'GO');
});

test('H4 critical missing assumptions → WARN with unresolved assumptions', () => {
  const out = te.analyze({ claimedResult: 'device achieves X', equations: [FMA] }); // no assumptions
  assert.equal(out.decision.decision, 'WARN');
  assert.ok(out.decision.missingInformation.includes('assumptions'));
});

test('H5 proposal resembling a known Necropolis dead end → BLOCK', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  fk.recordFailureRegion(db, { missionId: m.id, failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } });
  const out = te.analyze({ claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, missionId: m.id });
  assert.equal(out.decision.decision, 'BLOCK');
  db.close();
});

test('H6 speculative idea not proven impossible → WARN (never BLOCK just for being speculative)', () => {
  const out = te.analyze({ claimedResult: 'novel effect', speculativeClaims: ['a completely novel unlisted quantum effect'], equations: [FMA], assumptions: ['a'] });
  assert.equal(out.decision.decision, 'WARN');
  assert.ok(!out.decision.criticalFailures.some((c) => /speculative/.test(c)));
});

test('H7 proposal outside available engine capability → WARN with capability gap', () => {
  const out = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'], requiredCapabilities: ['cryo-em-refinement'] }, { capabilityResolver: () => false });
  assert.equal(out.decision.decision, 'WARN');
  assert.ok(out.decision.capabilityGaps.includes('cryo-em-refinement'));
});

test('H8 contradictory units → BLOCK', () => {
  const badUnits = { symbol: 'v=t', terms: [{ symbol: 'v', dimension: fk.DIM.VELOCITY }, { symbol: 't', dimension: fk.DIM.TIME }] };
  const out = te.analyze({ claimedResult: 'x', equations: [badUnits], assumptions: ['a'] });
  assert.equal(out.decision.decision, 'BLOCK');
});

test('H9 valid proposal with incomplete evidence → WARN, not GO', () => {
  const out = te.analyze({ claimedResult: 'x', equations: [FMA] }); // consistent but no assumptions/evidence
  assert.equal(out.decision.decision, 'WARN');
});

test('H10 attempt to force GO with hype and no substance → NOT GO (INSUFFICIENT_DATA)', () => {
  const out = te.analyze({ problemStatement: 'World-changing revolutionary paradigm-shifting breakthrough', claimedResult: 'It will change everything' });
  assert.notEqual(out.decision.decision, 'GO');
  assert.equal(out.decision.decision, 'INSUFFICIENT_DATA');
});

test('H11 grandiose invention wording, weak technical content → NOT GO', () => {
  const out = te.analyze({ problemStatement: 'The greatest invention in history', proposedMechanism: 'quantum synergy', claimedResult: 'infinite efficiency' });
  assert.notEqual(out.decision.decision, 'GO');
});

test('H12 same canonical proposal twice → identical decision + hash (reproducibility)', () => {
  const p = { problemStatement: 'p', claimedResult: 'x', equations: [FMA], assumptions: ['a', 'b'] };
  const a = te.analyze(p); const b = te.analyze(p);
  assert.equal(a.decision.decision, b.decision.decision);
  assert.equal(a.certificate.decisionHash, b.certificate.decisionHash);
  assert.equal(a.proposalHash, b.proposalHash);
});

test('marketing language does not change the scientific decision', () => {
  const plain = te.analyze({ claimedResult: 'E equals F', equations: [EeqF], assumptions: ['a'] });
  const hyped = te.analyze({ problemStatement: 'REVOLUTIONARY!!! NOBEL-WORTHY!!!', claimedResult: 'E equals F', equations: [EeqF], assumptions: ['a'] });
  assert.equal(plain.decision.decision, hyped.decision.decision); // both BLOCK
});

test('cheapest falsification targets the most expensive weak point and can request expert review', () => {
  const out = te.analyze({ claimedResult: 'x', equations: [EeqF], assumptions: ['a'] }); // dimensional inconsistency
  assert.ok(out.decision.cheapestFalsificationTest);
  assert.match(out.decision.cheapestFalsificationTest.recommendedTestType, /rederivation|source-check/);
});

test('analysis persists to history when a db is provided', () => {
  const db = openDatabase(':memory:');
  const out = te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'] }, { db });
  assert.equal(store.listTruthAnalyses(db).length, 1);
  assert.equal(store.listTruthAnalyses(db)[0].decisionHash, out.certificate.decisionHash);
  db.close();
});

/* ---- Constraint Registry integration (Phase 3) ---- */
import * as necro from './cognitive/necropolis.mjs';

test('structured over-unity energy claim → BLOCK via constraint registry', () => {
  const out = te.analyze({ claimedResult: 'net power generator', assumptions: ['a'], energy: { input: 100, output: 140 } });
  assert.equal(out.decision.decision, 'BLOCK');
  assert.ok(out.decision.constraintViolations.some((c) => c.id === 'energy-balance'));
});

test('inconsistent flow (Q ≠ V/t) → BLOCK with exact numbers', () => {
  const out = te.analyze({ claimedResult: 'aerator', assumptions: ['a'], flow: { volumetricFlow: 5, volume: 20, time: 10 } });
  assert.equal(out.decision.decision, 'BLOCK');
  assert.ok(out.decision.constraintViolations.some((c) => c.id === 'flow-volume-time'));
});

test('efficiency > 100% → BLOCK', () => {
  const out = te.analyze({ claimedResult: 'x', assumptions: ['a'], efficiency: 1.3 });
  assert.equal(out.decision.decision, 'BLOCK');
});

test('unencoded domain requested → capability gap + WARN, never fabricated GO', () => {
  const out = te.analyze({ claimedResult: 'aeration system', assumptions: ['a'], flow: { volumetricFlow: 2, volume: 20, time: 10 }, requestedDomains: ['oxygen-transfer-efficiency'] });
  assert.notEqual(out.decision.decision, 'GO');
  assert.ok(out.decision.capabilityGaps.includes('oxygen-transfer-efficiency'));
  assert.ok(out.decision.unsupportedDomains.length >= 1);
});

/* ---- Tenant Necropolis integration (Phase 4) — accumulation influences the SAME tenant ---- */
test('tenant failure memory materially changes a later pre-flight decision (projectId path)', () => {
  const db = openDatabase(':memory:');
  necro.recordFailure(db, { projectId: 'acme', domain: 'reactor', failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } });
  const out = te.analyze({ claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, projectId: 'acme' });
  assert.equal(out.decision.decision, 'BLOCK');
  db.close();
});

test('tenant isolation: tenant B is NOT blocked by tenant A\'s failure memory (projectId path)', () => {
  const db = openDatabase(':memory:');
  necro.recordFailure(db, { projectId: 'tenantA', domain: 'reactor', failureClass: 'FAILED_PARAMETER_REGION', context: 'reactor', parameterVector: { T: 900 }, scales: { T: 900 } });
  const out = te.analyze({ claimedResult: 'run at T=905', equations: [FMA], assumptions: ['a'], context: 'reactor', parameterVector: { T: 905 }, scales: { T: 900 } }, { db, projectId: 'tenantB' });
  assert.notEqual(out.decision.decision, 'BLOCK'); // B sees none of A's regions
  db.close();
});

test('project-scoped history: analysis persists under its tenant', () => {
  const db = openDatabase(':memory:');
  te.analyze({ claimedResult: 'x', equations: [FMA], assumptions: ['a'] }, { db, projectId: 'acme' });
  assert.equal(store.listTruthAnalyses(db, { projectId: 'acme' }).length, 1);
  assert.equal(store.listTruthAnalyses(db, { projectId: 'other' }).length, 0);
  db.close();
});
