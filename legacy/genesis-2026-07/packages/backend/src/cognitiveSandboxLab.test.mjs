/**
 * Priority 12 (Sandbox Lab) tests. Deterministic; isolation + promotion integrity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as sb from './cognitive/sandboxLab.mjs';

function setup(db) {
  const main = ev.createMission(db, { goal: 'main mission' });
  const sandbox = sb.createSandbox(db, { parentMissionId: main.id, goal: 'sandbox run' });
  return { main, sandbox };
}

test('sandbox is isolated: its candidate evidence never appears in the main mission', () => {
  const db = openDatabase(':memory:');
  const { main, sandbox } = setup(db);
  assert.ok(sb.isSandbox(sandbox));
  ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 } });
  assert.equal(store.listEvidence(db, main.id).length, 0, 'main mission is uncontaminated');
  assert.equal(store.listEvidence(db, sandbox.id).length, 1);
  db.close();
});

test('VERIFIED sandbox evidence promotes with preserved provenance + parent link', () => {
  const db = openDatabase(':memory:');
  const { main, sandbox } = setup(db);
  const e = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { affinity: -7.1 }, scienceRunId: 'r1' });
  ev.setEvidenceVerification(db, e.id, 'VERIFIED');
  const res = sb.promoteEvidence(db, e.id, { targetMissionId: main.id });
  assert.equal(res.decision, 'PROMOTED');
  const promoted = store.getEvidence(db, res.targetEvidenceId);
  assert.equal(promoted.missionId, main.id);
  assert.equal(promoted.parentEvidenceId, e.id, 'provenance link back to sandbox origin');
  assert.equal(promoted.contentHash, e.contentHash, 'content hash preserved (provenance)');
  assert.equal(promoted.origin, 'promoted-from-sandbox');
  db.close();
});

test('UNVERIFIED sandbox evidence is HELD — never silently promoted', () => {
  const db = openDatabase(':memory:');
  const { main, sandbox } = setup(db);
  const e = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 } });
  const res = sb.promoteEvidence(db, e.id, { targetMissionId: main.id });
  assert.equal(res.decision, 'HELD');
  assert.equal(store.listEvidence(db, main.id).length, 0);
  db.close();
});

test('CONTRADICTED sandbox evidence is REJECTED', () => {
  const db = openDatabase(':memory:');
  const { main, sandbox } = setup(db);
  const e = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { x: 1 } });
  ev.setEvidenceVerification(db, e.id, 'CONTRADICTED');
  const res = sb.promoteEvidence(db, e.id, { targetMissionId: main.id });
  assert.equal(res.decision, 'REJECTED');
  assert.equal(store.listEvidence(db, main.id).length, 0);
  db.close();
});

test('promoteMission summarizes and audits every decision', () => {
  const db = openDatabase(':memory:');
  const { main, sandbox } = setup(db);
  const a = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { a: 1 } });
  ev.setEvidenceVerification(db, a.id, 'VERIFIED');
  const b = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { b: 2 } }); // UNVERIFIED → held
  const c = ev.recordEvidence(db, { missionId: sandbox.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { c: 3 } });
  ev.setEvidenceVerification(db, c.id, 'CONTRADICTED');
  const { summary } = sb.promoteMission(db, sandbox.id, main.id);
  assert.deepEqual(summary, { promoted: 1, rejected: 1, held: 1 });
  const audit = sb.listPromotions(db, sandbox.id);
  assert.equal(audit.length, 3, 'every promotion attempt is audited');
  assert.equal(store.listEvidence(db, main.id).length, 1, 'only the VERIFIED item entered the main store');
  assert.ok(b); // referenced
  db.close();
});
