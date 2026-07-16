import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.mjs';
import { openDatabase, createApiKey, getApiKey } from './store.mjs';

/**
 * Public API v1 (/api/v1/*) with API-key auth. Proves the external RDKit surface
 * (analyze + render/2d + render/3d) AND the key middleware: missing key → 401,
 * bad key → 401, over-limit → 429, valid key → 200 with usage_count += 1. Plus the
 * admin key-mint endpoint gated by ADMIN_SECRET. Delegates through the real router.
 */
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
let db;
const call = (pathname, { body = {}, token, method = 'POST' } = {}) => handleApi(db, { method, pathname, body, token });

beforeEach(() => { db = openDatabase(); });

describe('API v1 — key middleware', () => {
  test('no Authorization header → 401 missing_api_key', () => {
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'missing_api_key');
  });
  test('unknown key → 401 invalid_api_key', () => {
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: 'gk_totally-made-up' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_api_key');
  });
  test('valid key → 200 and usage_count increments by exactly 1', () => {
    const k = createApiKey(db, { ownerEmail: 'dev@lab.io', tier: 'free' });
    assert.equal(getApiKey(db, k.key).usageCount, 0);
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: k.key });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.rate_limit.used, 1);
    assert.equal(r.body.rate_limit.remaining, k.monthlyLimit - 1);
    assert.equal(getApiKey(db, k.key).usageCount, 1);
    // A second successful call increments again.
    call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: k.key });
    assert.equal(getApiKey(db, k.key).usageCount, 2);
  });
  test('exceeding monthly_limit → 429 rate_limit_exceeded (no further increment)', () => {
    const k = createApiKey(db, { ownerEmail: 'dev@lab.io', tier: 'free', monthlyLimit: 1 });
    assert.equal(call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: k.key }).status, 200); // used → 1
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: k.key });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'rate_limit_exceeded');
    assert.equal(getApiKey(db, k.key).usageCount, 1); // blocked call did NOT increment
  });
  test('a failed (invalid SMILES) call does not consume quota', () => {
    const k = createApiKey(db, { ownerEmail: 'dev@lab.io', tier: 'free' });
    const r = call('/api/v1/analyze', { body: { smiles: 'nope!!!' }, token: k.key });
    assert.equal(r.status, 422);
    assert.equal(getApiKey(db, k.key).usageCount, 0);
  });
  test('quota resets once the reset_date has passed', () => {
    const past = Date.now() - 40 * 24 * 60 * 60 * 1000; // created 40 days ago
    const k = createApiKey(db, { ownerEmail: 'dev@lab.io', tier: 'free', monthlyLimit: 1, now: past });
    // Simulate prior usage at the cap.
    db.prepare('UPDATE api_keys SET usage_count = 1 WHERE key = ?').run(k.key);
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: k.key });
    assert.equal(r.status, 200); // reset window rolled → allowed again
    assert.equal(getApiKey(db, k.key).usageCount, 1);
  });
});

describe('API v1 — analyze / render (through a valid key)', () => {
  let key;
  beforeEach(() => { key = createApiKey(db, { ownerEmail: 'dev@lab.io', tier: 'pro' }).key; });

  test('analyze: aspirin → real properties + InChIKey', () => {
    const r = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: key });
    assert.equal(r.status, 200);
    const p = r.body.properties;
    assert.equal(p.molecular_formula, 'C9H8O4');
    assert.equal(p.inchikey, 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    assert.equal(p.lipinski_violations, 0);
    assert.equal(r.body.computed_by, 'RDKit');
  });
  test('analyze: missing smiles → 400', () => {
    assert.equal(call('/api/v1/analyze', { body: {}, token: key }).body.error, 'missing_smiles');
  });
  test('render/2d: valid → SVG', () => {
    const r = call('/api/v1/render/2d', { body: { smiles: ASPIRIN }, token: key });
    assert.equal(r.status, 200);
    assert.match(r.body.svg, /<svg/);
  });
  test('render/2d: invalid → 422', () => {
    assert.equal(call('/api/v1/render/2d', { body: { smiles: '###' }, token: key }).status, 422);
  });
  test('render/3d: valid → atoms + bonds (Å)', () => {
    const r = call('/api/v1/render/3d', { body: { smiles: ASPIRIN }, token: key });
    assert.equal(r.status, 200);
    assert.equal(r.body.units, 'angstrom');
    assert.ok(r.body.atoms.length > 0 && r.body.bonds.length > 0);
  });
  test('render/3d: missing smiles → 400', () => {
    assert.equal(call('/api/v1/render/3d', { body: {}, token: key }).status, 400);
  });
});

describe('API v1 — admin key management (ADMIN_SECRET)', () => {
  const SECRET = 'test-admin-secret-123';
  before(() => { process.env.ADMIN_SECRET = SECRET; });
  after(() => { delete process.env.ADMIN_SECRET; });

  test('correct secret mints a usable key', () => {
    const r = call('/api/v1/admin/keys', { body: { owner_email: 'new@dev.io', tier: 'starter' }, token: SECRET });
    assert.equal(r.status, 200);
    assert.ok(r.body.key.startsWith('gk_'));
    assert.equal(r.body.tier, 'starter');
    assert.equal(r.body.monthly_limit, 10_000);
    // The minted key actually works.
    const use = call('/api/v1/analyze', { body: { smiles: ASPIRIN }, token: r.body.key });
    assert.equal(use.status, 200);
  });
  test('wrong secret → 401 forbidden_admin', () => {
    const r = call('/api/v1/admin/keys', { body: { owner_email: 'x@y.io' }, token: 'wrong' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'forbidden_admin');
  });
  test('invalid owner email → 400', () => {
    assert.equal(call('/api/v1/admin/keys', { body: { owner_email: 'not-an-email' }, token: SECRET }).body.error, 'invalid_owner_email');
  });
  test('invalid tier → 400', () => {
    assert.equal(call('/api/v1/admin/keys', { body: { owner_email: 'a@b.io', tier: 'diamond' }, token: SECRET }).body.error, 'invalid_tier');
  });
});

describe('API v1 — admin disabled when ADMIN_SECRET unset', () => {
  test('→ 503 admin_disabled', () => {
    delete process.env.ADMIN_SECRET;
    const r = call('/api/v1/admin/keys', { body: { owner_email: 'a@b.io' }, token: 'anything' });
    assert.equal(r.status, 503);
    assert.equal(r.body.error, 'admin_disabled');
  });
});
