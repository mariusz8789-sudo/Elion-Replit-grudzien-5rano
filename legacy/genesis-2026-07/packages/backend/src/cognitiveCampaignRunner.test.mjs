/**
 * Phase 3A (Autonomous Campaign Runner) tests. Deterministic; the runner derives
 * order from the DAG, not a script. Proves autonomy, budgets, no-duplicate-work on
 * resume, capability/failure handling, and human-approval gates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as dag from './cognitive/taskGraph.mjs';
import * as planner from './cognitive/missionPlanner.mjs';
import * as runner from './cognitive/campaignRunner.mjs';

// A linear A->B->C mission (no open questions) so completion is the honest outcome.
function chainMission(db) {
  const m = ev.createMission(db, { goal: 'chain' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' });
  const c = dag.addTask(db, { missionId: m.id, title: 'C', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  dag.addDependency(db, m.id, b.id, c.id);
  return { m, a, b, c };
}
function countingExecutor(counter, order) {
  return (db, task) => { counter[task.id] = (counter[task.id] ?? 0) + 1; if (order) order.push(task.title); return { status: 'COMPLETED', computeMs: 10 }; };
}

test('runs a DAG to completion autonomously, respecting dependency order', () => {
  const db = openDatabase(':memory:');
  const { m } = chainMission(db);
  const counter = {}; const order = [];
  const r = runner.runCampaign(db, m.id, { executor: countingExecutor(counter, order) });
  assert.equal(r.status, 'COMPLETED');
  assert.deepEqual(order, ['A', 'B', 'C'], 'order derived from the DAG, not a script');
  assert.ok(Object.values(counter).every((n) => n === 1));
  db.close();
});

test('resume after interruption does NOT duplicate completed work', () => {
  const db = openDatabase(':memory:');
  const { m } = chainMission(db);
  const counter = {}; const exec = countingExecutor(counter);
  const r1 = runner.runCampaign(db, m.id, { executor: exec, budgets: { maxIterations: 1 } });
  assert.equal(r1.status, 'MAX_ITERATIONS');
  assert.equal(store.listTaskNodes(db, m.id).filter((t) => t.state === 'COMPLETED').length, 1);
  const r2 = runner.runCampaign(db, m.id, { executor: exec });
  assert.equal(r2.status, 'COMPLETED');
  assert.ok(Object.values(counter).every((n) => n === 1), 'each task executed exactly once across both runs');
  db.close();
});

test('a planned drug-discovery mission runs its DAG; open questions → honest INSUFFICIENT_INFO', () => {
  const db = openDatabase(':memory:');
  const m = planner.planMission(db, { goal: 'MPO', domain: 'drug-discovery', resolveCapability: () => true }).mission;
  const counter = {};
  const r = runner.runCampaign(db, m.id, { executor: countingExecutor(counter) });
  assert.ok(store.listTaskNodes(db, m.id).every((t) => t.state === 'COMPLETED'));
  assert.equal(r.status, 'INSUFFICIENT_INFO', 'tasks done but questions unanswered = honest insufficiency, not fake completion');
  db.close();
});

test('wall-clock budget pauses the campaign (injected clock)', () => {
  const db = openDatabase(':memory:');
  const { m } = chainMission(db);
  let t = 0; const now = () => (t += 100);
  const r = runner.runCampaign(db, m.id, { executor: countingExecutor({}), budgets: { wallClockMs: 250 }, now });
  assert.equal(r.status, 'PAUSED_BUDGET');
  db.close();
});

test('per-engine budget exhaustion pauses honestly', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute', engine: 'quantum-chemistry', computeEstimate: { ms: 1000 } });
  const r = runner.runCampaign(db, m.id, { executor: () => ({ status: 'COMPLETED', computeMs: 1000 }), budgets: { perEngineMs: { 'quantum-chemistry': 500 } } });
  assert.equal(r.status, 'PAUSED_BUDGET');
  assert.equal(store.getTaskNode(db, a.id).state, 'BLOCKED');
  db.close();
});

test('executor failure triggers workflow adaptation, campaign continues', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'A', taskType: 'compute' });
  const b = dag.addTask(db, { missionId: m.id, title: 'B', taskType: 'compute' });
  dag.addDependency(db, m.id, a.id, b.id);
  let firstA = true;
  const exec = (db2, task) => (task.id === a.id && firstA ? (firstA = false, { status: 'FAILED', reason: 'engine error' }) : { status: 'COMPLETED', computeMs: 5 });
  runner.runCampaign(db, m.id, { executor: exec, budgets: { maxIterations: 20 } });
  assert.ok(store.listWorkflowMutations(db, m.id).length >= 1, 'a workflow mutation was recorded on failure');
  db.close();
});

test('human approval gate pauses; with an approver it proceeds and completes', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  dag.addTask(db, { missionId: m.id, title: 'escalate', taskType: 'compute', spec: { requiresApproval: true } });
  const r1 = runner.runCampaign(db, m.id, { executor: countingExecutor({}) });
  assert.equal(r1.status, 'PAUSED_APPROVAL');
  const r2 = runner.runCampaign(db, m.id, { executor: countingExecutor({}), approvalGate: () => true });
  assert.equal(r2.status, 'COMPLETED');
  db.close();
});

test('capability gap on a task is recorded and never faked', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const a = dag.addTask(db, { missionId: m.id, title: 'dock', taskType: 'compute', engine: 'molecular-docking' });
  const r = runner.runCampaign(db, m.id, { executor: countingExecutor({}), capabilityResolver: () => false });
  assert.equal(store.getTaskNode(db, a.id).state, 'BLOCKED');
  assert.equal(r.status, 'INSUFFICIENT_INFO');
  db.close();
});
