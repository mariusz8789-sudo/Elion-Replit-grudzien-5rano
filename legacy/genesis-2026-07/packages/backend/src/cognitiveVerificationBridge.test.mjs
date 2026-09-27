/**
 * Priority 6 (Verification Bridge) tests. Deterministic via an injected verifier;
 * the real replay path lives in campaign/verify.mjs (engine-gated, tested there).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as vb from './cognitive/verificationBridge.mjs';

function mission(db) { return ev.createMission(db, { goal: 'g' }); }
function stub(verdict) { return { verifyScienceRun: () => ({ ok: true, verification: { verdict } }) }; }

test('verdict → epistemic mapping is exhaustive and honest', () => {
  assert.equal(vb.mapVerdict('MATCH'), 'VERIFIED');
  assert.equal(vb.mapVerdict('DRIFT'), 'CONTRADICTED');
  assert.equal(vb.mapVerdict('ENGINE_VERSION_CHANGED'), 'CONTRADICTED');
  assert.equal(vb.mapVerdict('BLOCKED_BY_RUNTIME'), 'BLOCKED_BY_RESOURCES');
  assert.equal(vb.mapVerdict('REPLAY_UNSUPPORTED'), 'UNVERIFIED');
  assert.equal(vb.mapVerdict('???'), 'UNVERIFIED'); // unknown → honest UNVERIFIED
});

test('MATCH replay marks the backing evidence VERIFIED', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const e = ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { affinity: -6.1 }, scienceRunId: 'run-1' });
  const res = vb.verifyEvidence(db, e.id, { verifier: stub('MATCH') });
  assert.equal(res.ok, true);
  assert.equal(res.verificationStatus, 'VERIFIED');
  assert.equal(vb.mapVerdict('MATCH'), 'VERIFIED');
  assert.equal(ev.getEvidence(db, e.id).verificationStatus, 'VERIFIED');
  db.close();
});

test('DRIFT replay marks the backing evidence CONTRADICTED', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const e = ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 }, scienceRunId: 'run-2' });
  const res = vb.verifyEvidence(db, e.id, { verifier: stub('DRIFT') });
  assert.equal(res.verificationStatus, 'CONTRADICTED');
  assert.equal(ev.getEvidence(db, e.id).verificationStatus, 'CONTRADICTED');
  db.close();
});

test('evidence with no backing Scientific Run → REPLAY_UNSUPPORTED, not applicable', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const e = ev.recordEvidence(db, { missionId: m.id, kind: 'finding', epistemicStatus: 'INFERRED', content: { note: 'agent critique' } });
  const res = vb.verifyEvidence(db, e.id, { verifier: stub('MATCH') });
  assert.equal(res.ok, true);
  assert.equal(res.verdict, 'REPLAY_UNSUPPORTED');
  // not marked VERIFIED by fiat — stays UNVERIFIED
  assert.equal(ev.getEvidence(db, e.id).verificationStatus, 'UNVERIFIED');
  db.close();
});

test('verifyMissionEvidence only touches Scientific-Run-backed evidence', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { a: 1 }, scienceRunId: 'r1' });
  ev.recordEvidence(db, { missionId: m.id, kind: 'finding', epistemicStatus: 'INFERRED', content: { b: 2 } }); // no run
  const results = vb.verifyMissionEvidence(db, m.id, { verifier: stub('MATCH') });
  assert.equal(results.length, 1);
  assert.equal(results[0].verificationStatus, 'VERIFIED');
  db.close();
});

test('missing evidence id → honest error', () => {
  const db = openDatabase(':memory:');
  const res = vb.verifyEvidence(db, 'nope', { verifier: stub('MATCH') });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'evidence_not_found');
  db.close();
});
