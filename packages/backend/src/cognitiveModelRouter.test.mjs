/**
 * Priority 7 (Model Abstraction & Router) tests. Deterministic; fake providers,
 * no network. Verifies role-based selection, traceable persisted decisions,
 * telemetry capture, and honest blocking (no fabricated completions).
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as mr from './cognitive/modelRouter.mjs';

beforeEach(() => mr.resetProviders());

function fakeProvider(id, roles, { available = true, priority = 100, text = 'ok', tokensIn = 10, tokensOut = 5 } = {}) {
  return { id, modelId: `${id}-v1`, roles, priority, available: () => available, complete: () => ({ text, usage: { tokensIn, tokensOut } }) };
}

test('v10 migration adds model_decisions and schema is at least v10', () => {
  const db = openDatabase(':memory:');
  assert.ok(db.prepare('PRAGMA user_version').get().user_version >= 10);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_decisions'").get());
  db.close();
});

test('routes a role to an available provider and records a traceable decision', () => {
  const db = openDatabase(':memory:');
  mr.registerProvider(fakeProvider('reasoner', [mr.MODEL_ROLE.REASONING], { priority: 10 }));
  const r = mr.route(db, { role: mr.MODEL_ROLE.REASONING, taskClass: 'planning', missionId: null });
  assert.equal(r.status, 'selected');
  assert.equal(r.providerId, 'reasoner');
  assert.equal(r.modelId, 'reasoner-v1');
  const decisions = store.listModelDecisions(db, { role: 'REASONING' });
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].providerId, 'reasoner');
  assert.equal(decisions[0].taskClass, 'planning');
  db.close();
});

test('deterministic policy: lowest priority wins among available providers', () => {
  const db = openDatabase(':memory:');
  mr.registerProvider(fakeProvider('cheap-slow', [mr.MODEL_ROLE.REASONING], { priority: 50 }));
  mr.registerProvider(fakeProvider('premium', [mr.MODEL_ROLE.REASONING], { priority: 10 }));
  const r = mr.route(db, { role: mr.MODEL_ROLE.REASONING });
  assert.equal(r.providerId, 'premium');
  db.close();
});

test('no available provider → BLOCKED_BY_RUNTIME (registered but unavailable), no completion', () => {
  const db = openDatabase(':memory:');
  mr.registerProvider(fakeProvider('offline', [mr.MODEL_ROLE.CRITIC], { available: false }));
  const r = mr.complete(db, { role: mr.MODEL_ROLE.CRITIC, input: 'x' });
  assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
  assert.equal(r.text, undefined, 'no fabricated completion');
  // the block is still recorded as a decision (traceable)
  assert.equal(store.listModelDecisions(db, { role: 'CRITIC' })[0].providerId, 'none');
  db.close();
});

test('no provider registered for a role → CAPABILITY_GAP', () => {
  const db = openDatabase(':memory:');
  const r = mr.route(db, { role: mr.MODEL_ROLE.VERIFIER });
  assert.equal(r.status, 'CAPABILITY_GAP');
  db.close();
});

test('complete() captures latency + token telemetry on the decision', () => {
  const db = openDatabase(':memory:');
  mr.registerProvider(fakeProvider('worker', [mr.MODEL_ROLE.FAST], { tokensIn: 100, tokensOut: 20 }));
  const r = mr.complete(db, { role: mr.MODEL_ROLE.FAST, input: 'hi' });
  assert.equal(r.status, 'selected');
  assert.equal(r.text, 'ok');
  const d = store.getModelDecision(db, r.decisionId);
  assert.equal(d.tokensIn, 100);
  assert.equal(d.tokensOut, 20);
  assert.ok(d.latencyMs >= 0);
  db.close();
});

test('Anthropic adapter is unavailable without a key and is never invoked', () => {
  const db = openDatabase(':memory:');
  const hadKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    mr.registerProvider(mr.anthropicProvider());
    const r = mr.complete(db, { role: mr.MODEL_ROLE.REASONING, input: 'plan this' });
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME'); // registered (anthropic) but no key → unavailable
    assert.equal(r.text, undefined);
  } finally {
    if (hadKey !== undefined) process.env.ANTHROPIC_API_KEY = hadKey;
  }
  db.close();
});

test('role validation rejects unknown roles', () => {
  assert.throws(() => mr.registerProvider({ id: 'x', roles: ['NONSENSE'] }), /subset of MODEL_ROLE/);
});
