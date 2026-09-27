/**
 * backup (Genesis 2.1, Part 3) — naming, rotation, and a real VACUUM INTO round-trip.
 * Uses a real temp dir so the recovery path is exercised, not just declared.
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backupName, listBackups, rotateBackups, ensureDir } from './backup.mjs';
import { openDatabase, createUser, backupDatabase, getUserByEmail } from './store.mjs';
import { hashPassword } from './auth.mjs';

let dirs = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'gen-bk-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } dirs = []; });

describe('backup naming + rotation', () => {
  test('backupName is deterministic per timestamp and lexically sortable', () => {
    assert.match(backupName(0), /^genesis-\d{8}T\d{6}-0\.db$/);
    assert.ok(backupName(1000) < backupName(2000)); // later ms sorts after
  });
  test('rotateBackups keeps the newest N, deletes the rest', () => {
    const dir = ensureDir(tmp());
    for (let i = 1; i <= 5; i++) writeFileSync(path.join(dir, backupName(i * 1000)), 'x');
    assert.equal(listBackups(dir).length, 5);
    const removed = rotateBackups(dir, 2);
    assert.equal(removed, 3);
    assert.equal(listBackups(dir).length, 2);
  });
});

describe('backupDatabase: real backup → destroy → restore recovers data', () => {
  test('VACUUM INTO snapshot restores all rows', () => {
    const dir = tmp();
    const dbPath = path.join(dir, 'live.db');
    const snap = path.join(dir, 'snap.db');
    let db = openDatabase(dbPath);
    createUser(db, { email: 'a@lab.io', displayName: 'A', passwordHash: hashPassword('pw12345678') });
    createUser(db, { email: 'b@lab.io', displayName: 'B', passwordHash: hashPassword('pw12345678') });
    backupDatabase(db, snap);
    db.close();
    assert.ok(existsSync(snap));
    // destroy
    for (const e of ['', '-wal', '-shm']) { const p = dbPath + e; if (existsSync(p)) rmSync(p); }
    assert.equal(existsSync(dbPath), false);
    // restore = open the snapshot as the database
    db = openDatabase(snap);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 2);
    assert.ok(getUserByEmail(db, 'a@lab.io'));
    assert.ok(getUserByEmail(db, 'b@lab.io'));
    db.close();
  });
});
