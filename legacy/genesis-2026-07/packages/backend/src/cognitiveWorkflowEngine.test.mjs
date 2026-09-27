/**
 * Priority 3 (Dynamic Workflow Engine) tests. Deterministic, no external engines.
 * Verifies the OBSERVE→EVALUATE→PROPOSE→APPLY→VERIFY→ROLLBACK loop and that every
 * structural change is a recorded, reversible WorkflowMutation (never silent).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as we from './cognitive/workflowEngine.mjs';

function mission(db) { return ev.createMission(db, { goal: 'g' }); }

test('PROGRESSING → no mutation proposed (honest no-op)', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' }); // READY
  const evaln = we.evaluateStrategy(db, m.id);
  assert.equal(evaln.verdict, 'PROGRESSING');
  assert.equal(we.proposeMutation(db, m.id, evaln), null);
  db.close();
});

test('FAILING → route-around mutation adds an alternative and rewires dependents', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const a = dag.addTask(db, { missionId: m.id, title: 'compute', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'downstream', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id); // b depends on a
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'FAILED', 'engine error');
  // b is blocked by a's failure.
  assert.equal(store.getTaskNode(db, b.id).state, 'BLOCKED');

  const evaln = we.evaluateStrategy(db, m.id);
  assert.equal(evaln.verdict, 'FAILING');
  assert.equal(evaln.metrics.failedBlocking, 1);

  const applied = we.applyMutation(db, m.id, we.proposeMutation(db, m.id, evaln), { triggeringEvidence: ['obs-1'] });
  assert.ok(applied.mutation.id);
  assert.notEqual(applied.mutation.previousWorkflowHash, applied.newWorkflowHash, 'workflow hash changed');
  // The failed task no longer blocks anything; an alternative task is on the frontier.
  const after = we.evaluateStrategy(db, m.id);
  assert.equal(after.metrics.failedBlocking, 0);
  const frontierTitles = dag.executionFrontier(db, m.id).map((t) => t.title);
  assert.ok(frontierTitles.some((t) => /Alternative to/.test(t)));
  // b still depends on the alternative (not yet complete) so it remains blocked, but on a live path.
  assert.equal(store.getTaskNode(db, b.id).state, 'BLOCKED');

  // Completing the alternative unblocks b.
  const alt = dag.executionFrontier(db, m.id).find((t) => /Alternative to/.test(t.title));
  dag.transition(db, alt.id, 'RUNNING');
  dag.transition(db, alt.id, 'COMPLETED');
  assert.equal(store.getTaskNode(db, b.id).state, 'READY');
  db.close();
});

test('mutation is recorded with all mandated fields and verifies against expected benefit', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const a = dag.addTask(db, { missionId: m.id, title: 'compute', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'downstream', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'FAILED');
  const { mutation } = we.adapt(db, m.id, { triggeringEvidence: ['ev-x'] });
  assert.ok(mutation.reason);
  assert.deepEqual(mutation.triggeringEvidence, ['ev-x']);
  assert.ok(mutation.previousWorkflowHash);
  assert.ok(mutation.proposed.kind === 'ROUTE_AROUND_FAILURE');
  assert.ok(mutation.expectedBenefit.targetFailedBlockingAfter === 0);
  assert.ok(mutation.rollback.addedTaskIds.length >= 1);
  assert.equal(mutation.verificationStatus, 'UNVERIFIED');

  const verified = we.verifyMutation(db, mutation.id);
  assert.equal(verified.verificationStatus, 'VERIFIED');
  assert.ok(verified.actualResult.checks.some((c) => c.metric === 'failedBlocking' && c.ok));
  db.close();
});

test('STALLED → adds a runnable follow-up path', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'open question' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute', questionId: q.id });
  const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' });
  dag.addDependency(db, m.id, b.id, a.id); // a depends on b
  dag.supersedeTask(db, b.id, 'abandoned'); // b terminal, a can never complete → dead frontier
  assert.equal(store.getTaskNode(db, a.id).state, 'BLOCKED');
  const evaln = we.evaluateStrategy(db, m.id);
  assert.equal(evaln.verdict, 'STALLED');
  const applied = we.applyMutation(db, m.id, we.proposeMutation(db, m.id, evaln));
  assert.equal(applied.mutation.proposed.kind, 'UNSTALL_ADD_PATH');
  assert.ok(dag.executionFrontier(db, m.id).length >= 1, 'a runnable path now exists');
  db.close();
});

test('INSUFFICIENT_INFO → proposes gathering more evidence for an open question', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const q = ev.addQuestion(db, { missionId: m.id, text: 'unresolved' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute', questionId: q.id });
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'COMPLETED');
  const evaln = we.evaluateStrategy(db, m.id);
  assert.equal(evaln.verdict, 'INSUFFICIENT_INFO');
  const applied = we.applyMutation(db, m.id, we.proposeMutation(db, m.id, evaln));
  assert.equal(applied.mutation.proposed.kind, 'GATHER_MORE_EVIDENCE');
  db.close();
});

test('rollback reverses a mutation: added tasks superseded, edges restored', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const a = dag.addTask(db, { missionId: m.id, title: 'compute', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'downstream', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'FAILED');
  const beforeHash = dag.workflowHash(db, m.id);
  const { mutation, applied } = we.adapt(db, m.id);
  assert.notEqual(dag.workflowHash(db, m.id), beforeHash);

  const rolled = we.rollbackMutation(db, mutation.id);
  assert.equal(rolled.verificationStatus, 'ROLLED_BACK');
  // Added alternative task is superseded; original a->b dependency restored (b blocked by failed a again).
  for (const id of applied.addedTaskIds) assert.equal(store.getTaskNode(db, id).state, 'SUPERSEDED');
  assert.ok(store.findTaskEdge(db, m.id, a.id, b.id), 'original dependency edge restored');
  const after = we.evaluateStrategy(db, m.id);
  assert.equal(after.metrics.failedBlocking, 1, 'back to the original failing topology');
  db.close();
});

test('workflow mutations are append-only and queryable per mission', () => {
  const db = openDatabase(':memory:');
  const m = mission(db);
  const a = dag.addTask(db, { missionId: m.id, title: 'compute', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'downstream', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  dag.transition(db, a.id, 'RUNNING');
  dag.transition(db, a.id, 'FAILED');
  we.adapt(db, m.id);
  const muts = store.listWorkflowMutations(db, m.id);
  assert.equal(muts.length, 1);
  assert.ok(muts[0].createdAt > 0);
  db.close();
});
