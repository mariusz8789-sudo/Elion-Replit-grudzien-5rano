import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, generateToken, newId, validateRegistration } from './auth.mjs';

describe('hashPassword / verifyPassword', () => {
  test('round-trips the correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    assert.equal(verifyPassword('correct horse battery staple', stored), true);
  });

  test('rejects the wrong password', () => {
    const stored = hashPassword('secret-one');
    assert.equal(verifyPassword('secret-two', stored), false);
  });

  test('produces a self-describing scrypt format', () => {
    const stored = hashPassword('abc12345', 'fixedsalt');
    assert.match(stored, /^scrypt\$fixedsalt\$[0-9a-f]{128}$/);
  });

  test('same password + same salt is deterministic', () => {
    assert.equal(hashPassword('abc12345', 's'), hashPassword('abc12345', 's'));
  });

  test('different salts give different hashes for the same password', () => {
    assert.notEqual(hashPassword('abc12345'), hashPassword('abc12345'));
  });

  test('rejects malformed stored values without throwing', () => {
    assert.equal(verifyPassword('x', ''), false);
    assert.equal(verifyPassword('x', 'not-a-hash'), false);
    assert.equal(verifyPassword('x', 'bcrypt$a$b'), false);
    assert.equal(verifyPassword('x', null), false);
  });
});

describe('generateToken / newId', () => {
  test('token is 64 hex chars (256 bits) and unique', () => {
    const a = generateToken();
    const b = generateToken();
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b);
  });

  test('newId is a UUID', () => {
    assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('validateRegistration', () => {
  test('accepts a valid registration and normalizes email', () => {
    const r = validateRegistration({ email: '  Alice@Example.COM ', password: 'longenough1', displayName: ' Ala ' });
    assert.equal(r.ok, true);
    assert.equal(r.value.email, 'alice@example.com');
    assert.equal(r.value.displayName, 'Ala');
  });

  test('defaults display name to the local part of the email', () => {
    const r = validateRegistration({ email: 'bob@lab.org', password: 'longenough1' });
    assert.equal(r.value.displayName, 'bob');
  });

  test('rejects a bad email', () => {
    assert.equal(validateRegistration({ email: 'nope', password: 'longenough1' }).ok, false);
  });

  test('rejects a short password', () => {
    assert.equal(validateRegistration({ email: 'a@b.co', password: 'short' }).ok, false);
  });
});
