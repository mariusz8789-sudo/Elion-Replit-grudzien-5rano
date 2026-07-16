/**
 * hardening (Stage 8) — security invariants for credential hashing (PART 3) and
 * proxy-aware client IP (PART 4). These assert the ACTUAL stored bytes, not just the
 * happy path — the whole point is that a DB/backup leak must not yield usable secrets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashSecret, keyHint, looksHashed } from './secrets.mjs';
import { clientIp } from './lib.mjs';
import { openDatabase, createUser, createSession, getUserByToken, deleteSession, createApiKey, getApiKey } from './store.mjs';
import { hashPassword, generateToken } from './auth.mjs';

describe('secrets helpers', () => {
  test('hashSecret is deterministic SHA-256 hex; empty → null', () => {
    assert.equal(hashSecret('abc'), hashSecret('abc'));
    assert.match(hashSecret('abc'), /^[0-9a-f]{64}$/);
    assert.equal(hashSecret(''), null);
    assert.equal(hashSecret(null), null);
  });
  test('keyHint masks the middle, keeps prefix + last 4', () => {
    assert.equal(keyHint('gk_ABCDEFGHIJKLMNOP'), 'gk_ABCD…MNOP');
    assert.equal(keyHint('short'), '••••');
  });
  test('looksHashed only true for 64-hex', () => {
    assert.equal(looksHashed('a'.repeat(64)), true);
    assert.equal(looksHashed('gk_raw'), false);
  });
});

describe('sessions: hashed at rest, raw token still authenticates', () => {
  test('DB stores only the hash; getUserByToken(raw) works; deleteSession(raw) works', () => {
    const db = openDatabase(':memory:');
    const user = createUser(db, { email: 'a@b.io', displayName: 'A', passwordHash: hashPassword('pw123456') });
    const token = generateToken();
    createSession(db, { userId: user.id, token, ttlMs: 1e9 });
    // stored value is NOT the raw token
    const row = db.prepare('SELECT token FROM sessions').get();
    assert.notEqual(row.token, token);
    assert.equal(row.token, hashSecret(token));
    // raw token still authenticates
    assert.equal(getUserByToken(db, token)?.id, user.id);
    deleteSession(db, token);
    assert.equal(getUserByToken(db, token), null);
  });
});

describe('API keys: hashed at rest, raw key authenticates, hint for display', () => {
  test('created key returns raw once; DB holds the hash + hint; getApiKey(raw) resolves', () => {
    const db = openDatabase(':memory:');
    const created = createApiKey(db, { ownerEmail: 'owner@lab.io', tier: 'starter' });
    assert.match(created.key, /^gk_/);          // raw, shown once
    assert.equal(created.keyHint, keyHint(created.key));
    const row = db.prepare('SELECT key, key_hint FROM api_keys').get();
    assert.notEqual(row.key, created.key);        // NOT stored raw
    assert.equal(row.key, hashSecret(created.key));
    assert.equal(row.key_hint, created.keyHint);
    // raw key authenticates; the resolved record exposes the hash as .key (never the raw)
    const resolved = getApiKey(db, created.key);
    assert.equal(resolved.tier, 'starter');
    assert.equal(resolved.key, hashSecret(created.key));
    assert.equal(getApiKey(db, 'gk_wrongkey'), null);
  });
});

describe('clientIp (PART 4): X-Forwarded-For only when proxy is trusted', () => {
  test('trustProxy=false ignores XFF (spoof-proof), uses socket addr', () => {
    assert.equal(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.1', false), '10.0.0.1');
  });
  test('trustProxy=true takes the first (client) XFF hop', () => {
    assert.equal(clientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.9' }, '10.0.0.1', true), '1.2.3.4');
  });
  test('trustProxy=true but no XFF → socket addr', () => {
    assert.equal(clientIp({}, '10.0.0.1', true), '10.0.0.1');
  });
});
