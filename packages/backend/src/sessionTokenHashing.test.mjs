import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, createUser, createSession, getUserByToken, deleteSession } from './store.mjs';
import { hashSecret, looksHashed } from './secrets.mjs';

/**
 * R-001 (docs/RISKS.md) — session tokens must be stored hashed, never plaintext,
 * so a database backup (packages/backend/scripts/db-backup.mjs, made easy by P0.2)
 * never carries a live, directly usable credential. Cherry-picked `secrets.mjs`
 * from `3bce0c2` (see that commit's own module doc) rather than reimplementing —
 * this file proves the WIRING (createSession/getUserByToken/deleteSession +
 * migration), not the hash function itself, which is already a pure, tested unit.
 */

function tmpDbPath(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return path.join(dir, 'genesis.db');
}

describe('R-001 — sessions.token is stored hashed, never plaintext', () => {
  test('createSession never writes the raw token into the sessions table', () => {
    const dbPath = tmpDbPath('genesis-token-hash-');
    const db = openDatabase(dbPath);
    const u = createUser(db, { email: 'a@example.com', displayName: 'Ada', passwordHash: 'h' });
    const rawToken = 'super-secret-raw-token-value-0123456789';
    createSession(db, { userId: u.id, token: rawToken, ttlMs: 60_000 });

    const row = db.prepare('SELECT token FROM sessions').get();
    assert.notEqual(row.token, rawToken, 'raw token must never be written to the sessions table');
    assert.ok(looksHashed(row.token), 'stored token must be a SHA-256 hex hash');
    assert.equal(row.token, hashSecret(rawToken), 'stored hash must be the SHA-256 of the presented raw token');

    db.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  test('getUserByToken still authenticates with the RAW token the client was given', () => {
    const dbPath = tmpDbPath('genesis-token-hash-');
    const db = openDatabase(dbPath);
    const u = createUser(db, { email: 'a@example.com', displayName: 'Ada', passwordHash: 'h' });
    const rawToken = 'another-raw-token-value-abcdefghij';
    createSession(db, { userId: u.id, token: rawToken, ttlMs: 60_000 });

    const found = getUserByToken(db, rawToken);
    assert.ok(found);
    assert.equal(found.id, u.id);
    // Presenting the STORED HASH itself as if it were a bearer token must NOT authenticate —
    // otherwise a stolen backup's hash would be as good as the real credential.
    const storedHash = db.prepare('SELECT token FROM sessions').get().token;
    assert.equal(getUserByToken(db, storedHash), null, 'the hash itself must not be an accepted credential');

    db.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  test('deleteSession removes the session by its RAW token (hashed for lookup)', () => {
    const dbPath = tmpDbPath('genesis-token-hash-');
    const db = openDatabase(dbPath);
    const u = createUser(db, { email: 'a@example.com', displayName: 'Ada', passwordHash: 'h' });
    const rawToken = 'yet-another-raw-token-klmnopqrst';
    createSession(db, { userId: u.id, token: rawToken, ttlMs: 60_000 });
    deleteSession(db, rawToken);
    assert.equal(getUserByToken(db, rawToken), null);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);

    db.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });
});

describe('R-001 — idempotent migration of pre-existing PLAINTEXT tokens', () => {
  test('a legacy session row with a plaintext token gets hashed in place, without losing the session', () => {
    const dbPath = tmpDbPath('genesis-legacy-plaintext-');
    // Build a database already at the schema version BEFORE this migration, with a
    // real plaintext token in it — exactly what a pre-R-001 production database looks like.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    `);
    const now = Date.now();
    legacy.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'h', ?)").run(now);
    const plaintextToken = 'legacy-plaintext-token-value-uvwxyz012345';
    legacy.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(plaintextToken, 'u1', now, now + 60_000);
    legacy.close();

    const migrated = openDatabase(dbPath);
    const row = migrated.prepare('SELECT * FROM sessions').get();
    assert.ok(row, 'the session row must survive the migration');
    assert.notEqual(row.token, plaintextToken, 'plaintext token must have been hashed in place');
    assert.equal(row.token, hashSecret(plaintextToken));
    assert.equal(db_sessionCount(migrated), 1, 'exactly one session — no duplication, no loss');
    // The session is still usable with the ORIGINAL raw token the client already holds.
    assert.ok(getUserByToken(migrated, plaintextToken));
    migrated.close();

    // Re-open (idempotency): migration must be a no-op on an already-hashed token.
    const reopened = openDatabase(dbPath);
    const row2 = reopened.prepare('SELECT * FROM sessions').get();
    assert.equal(row2.token, row.token, 'second open must not re-hash an already-hashed token');
    assert.equal(db_sessionCount(reopened), 1);
    reopened.close();

    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  function db_sessionCount(db) {
    return db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  }
});
