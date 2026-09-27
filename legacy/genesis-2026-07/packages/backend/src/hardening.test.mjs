/**
 * hardening (Stage 8) — security invariants for credential hashing (PART 3) and
 * proxy-aware client IP (PART 4). These assert the ACTUAL stored bytes, not just the
 * happy path — the whole point is that a DB/backup leak must not yield usable secrets.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashSecret, keyHint, looksHashed } from './secrets.mjs';
import { clientIp, corsHeaders, createMetrics, systemMetrics } from './lib.mjs';
import { openDatabase, createUser, createSession, getUserByToken, deleteSession, createApiKey, getApiKey, loginLockState, recordLoginFailure, clearLoginAttempts, LOGIN_MAX_FAILS } from './store.mjs';
import { handleApi } from './api.mjs';
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

describe('login brute-force lockout (Genesis 2.0, M2)', () => {
  test('store: N failures locks the account; success clears it; window resets', () => {
    const db = openDatabase(':memory:');
    for (let i = 0; i < LOGIN_MAX_FAILS - 1; i++) recordLoginFailure(db, 'x@y.io');
    assert.equal(loginLockState(db, 'x@y.io').locked, false);   // not yet
    recordLoginFailure(db, 'x@y.io');                           // the Nth failure locks
    assert.equal(loginLockState(db, 'x@y.io').locked, true);
    assert.ok(loginLockState(db, 'x@y.io').retryAfterMs > 0);
    clearLoginAttempts(db, 'x@y.io');
    assert.equal(loginLockState(db, 'x@y.io').locked, false);
  });
  test('handler: repeated wrong passwords → 429 account_locked, even with the right one after', () => {
    const db = openDatabase(':memory:');
    createUser(db, { email: 'lock@lab.io', displayName: 'L', passwordHash: hashPassword('correct-horse') });
    const login = (pw) => handleApi(db, { method: 'POST', pathname: '/api/auth/login', body: { email: 'lock@lab.io', password: pw } });
    let last;
    for (let i = 0; i < LOGIN_MAX_FAILS; i++) last = login('wrong');
    assert.equal(last.status, 401);                    // the Nth wrong attempt still 401 (now locked)
    const after = login('correct-horse');              // correct password, but account is locked
    assert.equal(after.status, 429);
    assert.equal(after.body.error, 'account_locked');
  });
  test('handler: a correct login before the limit resets the counter', () => {
    const db = openDatabase(':memory:');
    createUser(db, { email: 'ok@lab.io', displayName: 'O', passwordHash: hashPassword('correct-horse') });
    const login = (pw) => handleApi(db, { method: 'POST', pathname: '/api/auth/login', body: { email: 'ok@lab.io', password: pw } });
    login('wrong'); login('wrong');
    assert.equal(login('correct-horse').status, 201);  // success (session created) resets the counter
    for (let i = 0; i < LOGIN_MAX_FAILS - 1; i++) login('wrong');
    assert.equal(loginLockState(db, 'ok@lab.io').locked, false); // counter was reset, still under limit
  });
});

describe('CORS for public API (Genesis 2.0, M4)', () => {
  test('empty allowlist → no CORS headers (same-origin only, default)', () => {
    assert.deepEqual(corsHeaders('https://x.io', []), {});
  });
  test('wildcard allowlist → Access-Control-Allow-Origin: *', () => {
    assert.equal(corsHeaders('https://x.io', ['*'])['access-control-allow-origin'], '*');
  });
  test('origin echoed only when explicitly allowed (never reflects arbitrary origins)', () => {
    assert.equal(corsHeaders('https://good.io', ['https://good.io'])['access-control-allow-origin'], 'https://good.io');
    assert.deepEqual(corsHeaders('https://evil.io', ['https://good.io']), {});
  });
});

describe('monitoring metrics (Genesis 2.1, Part 4)', () => {
  test('createMetrics counts requests, errors (5xx), status buckets, avg response time', () => {
    const m = createMetrics();
    m.record(200, 10); m.record(200, 30); m.record(500, 5); m.record(404, 20);
    const s = m.snapshot();
    assert.equal(s.requests, 4);
    assert.equal(s.errors, 1);            // only the 500
    assert.equal(s.byStatus[200], 2);
    assert.equal(s.totalMs, 65);
    assert.equal(s.timed, 4);
  });
  test('systemMetrics exposes CPU/RAM + app counters with a computed avg', () => {
    const m = createMetrics();
    m.record(200, 100); m.record(200, 200);
    const sm = systemMetrics(m.snapshot(), { now: 5000, startedAt: 0 });
    assert.equal(sm.uptimeSec, 5);
    assert.ok(sm.cpu.cores >= 1);
    assert.ok(sm.memory.rssMB > 0);
    assert.equal(sm.requests.total, 2);
    assert.equal(sm.requests.avgResponseMs, 150);
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
