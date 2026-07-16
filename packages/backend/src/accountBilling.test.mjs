import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, getApiKey } from './store.mjs';
import { hashPassword, generateToken } from './auth.mjs';
import { handleApi } from './api.mjs';
import { provisionFromEvent } from './billing/provisioning.mjs';

/**
 * Self-service billing dashboard API (Stage 2): GET /api/account/billing and
 * POST /api/account/api-key/regenerate. Reuses Stage-1 provisioning to seed a paid
 * user. No new business logic — just a read view + key regeneration over the DB.
 */
let db;
beforeEach(() => { db = openDatabase(); });
afterEach(() => { delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET; });

function seedUser(email = 'me@lab.io') {
  const user = createUser(db, { email, displayName: 'Me', passwordHash: hashPassword('pw123456') });
  const token = generateToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, user.id, Date.now(), Date.now() + 1e9);
  return { user, token };
}
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });
function makePaid(email, tier = 'pro') {
  return provisionFromEvent(db, { id: `evt_${email}_${tier}`, type: 'checkout.session.completed', data: { object: { customer_details: { email }, customer: 'cus', subscription: 'sub_1', metadata: { tier } } } }, {});
}

describe('GET /api/account/billing', () => {
  test('requires auth → 401 without token', () => {
    assert.equal(call('GET', '/api/account/billing').status, 401);
  });
  test('free user (no plan, no key) → free/inactive, no key, stripe not configured', () => {
    const { token } = seedUser();
    const r = call('GET', '/api/account/billing', { token });
    assert.equal(r.status, 200);
    assert.equal(r.body.plan.tier, 'free');
    assert.equal(r.body.plan.status, 'inactive');
    assert.equal(r.body.plan.renewalState, 'NONE');
    assert.equal(r.body.apiKey, null);
    assert.equal(r.body.stripeConfigured, false);
    assert.deepEqual(r.body.availableTiers.sort(), ['free', 'pro', 'starter']);
  });
  test('paid user → plan reflects tier/status + key usage/quota', () => {
    const { token } = seedUser('paid@lab.io');
    makePaid('paid@lab.io', 'pro');
    const r = call('GET', '/api/account/billing', { token });
    assert.equal(r.body.plan.tier, 'pro');
    assert.equal(r.body.plan.status, 'active');
    assert.equal(r.body.plan.renewalState, 'RENEWING');
    assert.equal(r.body.apiKey.tier, 'pro');
    assert.equal(r.body.apiKey.monthlyLimit, 100_000);
    assert.equal(r.body.apiKey.usageCount, 0);
    assert.equal(r.body.apiKey.remaining, 100_000);
    assert.ok(r.body.apiKey.key.startsWith('gk_'));
  });
  test('stripeConfigured reflects env', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec';
    const { token } = seedUser('cfg@lab.io');
    assert.equal(call('GET', '/api/account/billing', { token }).body.stripeConfigured, true);
  });
});

describe('POST /api/account/api-key/regenerate', () => {
  test('free user gets a fresh free key; a second regenerate replaces it (no duplicates)', () => {
    const { token } = seedUser('gen@lab.io');
    const r1 = call('POST', '/api/account/api-key/regenerate', { token });
    assert.equal(r1.status, 200);
    assert.equal(r1.body.apiKey.tier, 'free');
    assert.equal(r1.body.apiKey.monthlyLimit, 100);
    const firstKey = r1.body.apiKey.key;
    const r2 = call('POST', '/api/account/api-key/regenerate', { token });
    assert.notEqual(r2.body.apiKey.key, firstKey);
    assert.equal(getApiKey(db, firstKey), null); // old key revoked
    assert.equal(db.prepare('SELECT COUNT(*) c FROM api_keys WHERE owner_email = ?').get('gen@lab.io').c, 1);
  });
  test('paid user keeps their tier on regenerate; billing record points at the new key', () => {
    const { token } = seedUser('paidgen@lab.io');
    makePaid('paidgen@lab.io', 'starter');
    const r = call('POST', '/api/account/api-key/regenerate', { token });
    assert.equal(r.body.apiKey.tier, 'starter');
    assert.equal(r.body.apiKey.monthlyLimit, 10_000);
    const view = call('GET', '/api/account/billing', { token });
    assert.equal(view.body.apiKey.key, r.body.apiKey.key); // billing now points at the regenerated key
  });
  test('regenerate requires auth', () => {
    assert.equal(call('POST', '/api/account/api-key/regenerate').status, 401);
  });
});

describe('unknown account route', () => {
  test('→ 404', () => {
    const { token } = seedUser('u@lab.io');
    assert.equal(call('GET', '/api/account/nope', { token }).status, 404);
  });
});
