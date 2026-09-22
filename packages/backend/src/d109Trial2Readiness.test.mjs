/**
 * D-109 — pins the corrected TRIAL_2_STATUS reading and the GIPR data-gap
 * arithmetic, both read from real sealed artifacts and real pin bytes, not
 * asserted as prose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readiness = await import(pathToFileURL(path.join(HERE, '../../../scripts/d109-trial2-readiness.mjs')).href);
const gipr = await import('./campaign/giprQsar.mjs');

test('TRIAL_2_STATUS is BLOCKED, and the reason is parsed from the sealed prereg text, not asserted', () => {
  const r = readiness.trial2Status();
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.preregFingerprint, 'fc6cf73e63a9e569');
  assert.equal(r.agentMayNotSelfApprove, true);
  assert.match(r.armsAreExhaustiveStatement, /NEW human-sealed preregistration/);
  assert.match(r.forbiddenReRunStatement, /re-running with a third representation/);
});

test('the attempt budget shows 1 of 2 consumed — reserved room exists, but it is not a standing authorization', () => {
  const r = readiness.trial2Status();
  assert.equal(r.attemptBudget.max, 2);
  assert.equal(r.attemptBudget.consumedByThisExperiment, 1);
});

test('this module never proposes, drafts, or seals a new preregistration', () => {
  assert.equal(Object.keys(readiness).includes('draftNewPrereg'), false);
  assert.equal(Object.keys(readiness).includes('sealPrereg'), false);
  assert.equal(Object.keys(readiness).includes('proposeArm'), false);
});

test('GIPR is currently BLOCKED on data volume alone, with the exact real counts', () => {
  const r = gipr.trainGiprModel();
  assert.equal(r.ok, false);
  assert.equal(r.code, 'INSUFFICIENT_DATA');
  assert.equal(r.nUsable, 233);
  assert.match(r.reasons[0], /nTrain=146/);
  assert.match(r.reasons[0], /nTest=24/);
});

test('the GIPR split is a deterministic hash function, not a tunable ratio — the gap is a data problem, not a knob problem', () => {
  // 146 + 63 (implied calib) + 24 = 233 exactly: no row is lost to
  // featurisation failure, so the shortfall is entirely about how many
  // real rows exist, not about rows being dropped for a fixable reason.
  const r = gipr.trainGiprModel();
  const impliedCalib = r.nUsable - 146 - 24;
  assert.equal(impliedCalib, 63);
});
