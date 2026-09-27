/**
 * Priority 9 (Long-Horizon Checkpoint & Recovery) tests. Real file-DB restart +
 * interruption; deterministic recovery; no duplicated completed work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as planner from './cognitive/missionPlanner.mjs';
import * as rec from './cognitive/recovery.mjs';

function withFileDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-rec-'));
  const file = path.join(dir, 'm.db');
  try { return fn(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('interrupted RUNNING task is reconciled to a re-runnable state after restart', () => {
  withFileDb((file) => {
    let missionId; let t1id; let t2id;
    const db1 = openDatabase(file);
    const m = planner.planMission(db1, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
    missionId = m.id;
    const seed = dag.executionFrontier(db1, m.id)[0];
    t1id = seed.id;
    dag.transition(db1, seed.id, 'RUNNING'); // interrupted here (process "dies")
    const desc = store.listTaskNodes(db1, m.id).find((t) => /descriptors/i.test(t.title));
    t2id = desc.id;
    db1.close();

    const db2 = openDatabase(file);
    const r = rec.recoverMission(db2, missionId);
    assert.ok(r.ok);
    assert.deepEqual(r.reconciledTasks, [t1id], 'the interrupted RUNNING task was reconciled');
    // it is runnable again and is the next safe action
    assert.equal(store.getTaskNode(db2, t1id).state, 'READY');
    assert.equal(r.nextSafeAction.action, 'EXECUTE_TASK');
    assert.equal(r.nextSafeAction.taskId, t1id);
    // downstream task remains blocked (no duplicated/parallel execution)
    assert.equal(store.getTaskNode(db2, t2id).state, 'BLOCKED');
    db2.close();
  });
});

test('completed work is never re-run; recovery resumes at the correct frontier', () => {
  withFileDb((file) => {
    let missionId; let descId;
    const db1 = openDatabase(file);
    const m = planner.planMission(db1, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
    missionId = m.id;
    const seed = dag.executionFrontier(db1, m.id)[0];
    dag.transition(db1, seed.id, 'RUNNING');
    dag.transition(db1, seed.id, 'COMPLETED');
    descId = store.listTaskNodes(db1, m.id).find((t) => /descriptors/i.test(t.title)).id;
    db1.close();

    const db2 = openDatabase(file);
    const r = rec.recoverMission(db2, missionId);
    assert.equal(store.getTaskNode(db2, seed.id).state, 'COMPLETED', 'completed task not reset');
    assert.equal(r.nextSafeAction.taskId, descId, 'resumes at the newly-unblocked descriptors task');
    db2.close();
  });
});

test('pending verification is surfaced as the next safe action', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  ev.recordEvidence(db, { missionId: m.id, kind: 'computation', epistemicStatus: 'COMPUTED', content: { a: 1 }, scienceRunId: 'run-1' });
  const r = rec.recoverMission(db, m.id);
  assert.equal(r.pendingVerification.length, 1);
  assert.equal(r.nextSafeAction.action, 'VERIFY_EVIDENCE');
  db.close();
});

test('recovery is deterministic: repeated calls yield the same next safe action', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const a = rec.recoverMission(db, m.id).nextSafeAction;
  const b = rec.recoverMission(db, m.id).nextSafeAction;
  assert.deepEqual(a, b);
  db.close();
});

test('missing mission → MISSION_NOT_FOUND, not a crash', () => {
  const db = openDatabase(':memory:');
  const r = rec.recoverMission(db, 'nope');
  assert.equal(r.ok, false);
  assert.equal(r.nextSafeAction.action, 'MISSION_NOT_FOUND');
  db.close();
});
