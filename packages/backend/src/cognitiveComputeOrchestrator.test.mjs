/**
 * Priority 11 (Compute Orchestrator) tests. Deterministic; honest hardware.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as co from './cognitive/computeOrchestrator.mjs';

beforeEach(() => co.resetBackends());

test('default backends: only LOCAL_CPU available; GPU/HPC/quantum honestly unavailable', () => {
  co.registerDefaultBackends({ resolveCapability: () => true });
  const backends = Object.fromEntries(co.listBackends().map((b) => [b.id, b.available]));
  assert.equal(backends.LOCAL_CPU, true);
  assert.equal(backends.LOCAL_GPU, false);
  assert.equal(backends.REMOTE_GPU, false);
  assert.equal(backends.HPC, false);
  assert.equal(backends.QUANTUM_BACKEND, false);
});

test('cpu-only task is placed on LOCAL_CPU with a traceable, budgeted decision', () => {
  const db = openDatabase(':memory:');
  co.registerDefaultBackends({ resolveCapability: () => true });
  const p = co.placeTask(db, { taskId: 't1', requirements: { needs: ['cpu'], engine: 'molecular-docking', estimatedMs: 5000 } });
  assert.equal(p.status, 'placed');
  assert.equal(p.backendId, 'LOCAL_CPU');
  assert.equal(p.estimatedMs, 5000);
  assert.equal(store.listComputePlacements(db, { taskId: 't1' }).length, 1);
  db.close();
});

test('a GPU-required task is BLOCKED_BY_RESOURCES (no GPU) — never faked onto CPU', () => {
  const db = openDatabase(':memory:');
  co.registerDefaultBackends({ resolveCapability: () => true });
  const p = co.placeTask(db, { taskId: 't2', requirements: { needs: ['gpu'] } });
  assert.equal(p.status, 'blocked');
  assert.equal(p.failureClass, 'BLOCKED_BY_RESOURCES');
  assert.equal(p.backendId, null);
  db.close();
});

test('required engine absent on the available backend → CAPABILITY_GAP', () => {
  const db = openDatabase(':memory:');
  // toolchain says docking is NOT available → LOCAL_CPU lacks that engine capability
  co.registerDefaultBackends({ resolveCapability: (c) => c !== 'molecular-docking' });
  const p = co.placeTask(db, { taskId: 't3', requirements: { needs: ['cpu'], engine: 'molecular-docking' } });
  assert.equal(p.status, 'blocked');
  assert.equal(p.failureClass, 'CAPABILITY_GAP');
  db.close();
});

test('actual accounting + failure classification', () => {
  const db = openDatabase(':memory:');
  co.registerDefaultBackends({ resolveCapability: () => true });
  const p = co.placeTask(db, { taskId: 't4', requirements: { needs: ['cpu'], estimatedMs: 1000 } });
  const done = co.accountActual(db, p.id, { actualMs: 1234, failureClass: 'SUCCESS' });
  assert.equal(done.status, 'completed');
  assert.equal(done.actualMs, 1234);
  const failed = co.accountActual(db, p.id, { actualMs: 60000, failureClass: 'TIMEOUT', reason: 'exceeded wall clock' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failureClass, 'TIMEOUT');
  db.close();
});

test('retry policy: TIMEOUT retryable with backoff; ENGINE_ERROR not; bounded by attempts', () => {
  const timeout = { failureClass: 'TIMEOUT', attempt: 1, estimatedMs: 1000 };
  const r1 = co.retryPolicy(timeout);
  assert.equal(r1.retry, true);
  assert.equal(r1.nextBudgetMs, 2000);
  assert.equal(co.retryPolicy({ failureClass: 'ENGINE_ERROR', attempt: 1 }).retry, false);
  assert.equal(co.retryPolicy({ failureClass: 'TIMEOUT', attempt: 3 }).retry, false); // max attempts
  assert.equal(co.retryPolicy({ failureClass: 'BLOCKED_BY_RESOURCES', attempt: 1 }).retry, false);
});

test('replay semantics: a retry placement references the original', () => {
  const db = openDatabase(':memory:');
  co.registerDefaultBackends({ resolveCapability: () => true });
  const p1 = co.placeTask(db, { taskId: 't5', requirements: { needs: ['cpu'], estimatedMs: 1000 } });
  co.accountActual(db, p1.id, { actualMs: 999, failureClass: 'TIMEOUT' });
  const p2 = co.placeTask(db, { taskId: 't5', requirements: { needs: ['cpu'], estimatedMs: 2000 }, retryOf: p1.id, attempt: 2 });
  assert.equal(p2.retryOf, p1.id);
  assert.equal(p2.attempt, 2);
  db.close();
});
