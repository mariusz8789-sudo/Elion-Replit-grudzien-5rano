/**
 * Phase 4 — Scientific Pre-Flight Gate (original invention) tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as fk from './cognitive/formalKernel.mjs';
import * as pf from './cognitive/preflightGate.mjs';

test('GO when all checks pass', () => {
  const c = pf.preflight({
    equationTerms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }],
    requiredCapabilities: ['molecular-descriptors'], capabilityResolver: () => true,
    assumptions: ['isothermal'],
  });
  assert.equal(c.verdict, 'GO');
  assert.ok(/^[0-9a-f]{64}$/.test(c.contentHash));
});

test('BLOCK on a dimensionally inconsistent configuration (before any compute)', () => {
  const c = pf.preflight({
    equationTerms: [{ symbol: 'E', dimension: fk.DIM.ENERGY }, { symbol: 'F', dimension: fk.DIM.FORCE }],
    assumptions: ['x'],
  });
  assert.equal(c.verdict, 'BLOCK');
  assert.ok(c.blockingReasons.includes('dimensional-consistency'));
});

test('BLOCK when a required capability is unavailable — never runs a doomed campaign', () => {
  const c = pf.preflight({ requiredCapabilities: ['molecular-docking'], capabilityResolver: () => false, assumptions: ['x'] });
  assert.equal(c.verdict, 'BLOCK');
  assert.ok(c.blockingReasons.includes('capability-availability'));
});

test('BLOCK on a known Necropolis dead end (compute avoided)', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  fk.recordFailureRegion(db, { missionId: m.id, failureClass: 'FAILED_PARAMETER_REGION', context: 'c', parameterVector: { Re: 2300 }, scales: { Re: 2300 } });
  const c = pf.preflight({ db, missionId: m.id, context: 'c', parameterVector: { Re: 2310 }, scales: { Re: 2300 }, assumptions: ['x'] });
  assert.equal(c.verdict, 'BLOCK');
  assert.ok(c.blockingReasons.includes('necropolis-dead-end'));
  db.close();
});

test('WARN when assumptions are unstated (hidden-assumption risk), not a hard block', () => {
  const c = pf.preflight({ requiredCapabilities: ['x'], capabilityResolver: () => true });
  assert.equal(c.verdict, 'WARN');
  assert.ok(c.warnings.includes('assumptions-stated'));
});

test('GO certificate is explicit that it is necessary, not sufficient (no correctness claim)', () => {
  const c = pf.preflight({ assumptions: ['x'] });
  assert.match(c.note, /NECESSARY, not sufficient/);
  assert.match(c.note, /asserts no physical\/biological correctness/);
});
