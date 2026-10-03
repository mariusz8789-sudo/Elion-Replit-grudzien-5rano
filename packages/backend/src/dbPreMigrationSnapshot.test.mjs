import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CURRENT_SCHEMA_VERSION, openDatabase } from './store.mjs';

test('opening an older-schema database snapshots it before migrating, so a rollback has a database the older release can open', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-premigration-'));
  const dbPath = path.join(dir, 'genesis.db');
  const backupDir = path.join(dir, 'backups');
  try {
    let db = openDatabase(dbPath, { backupDir });
    assert.deepEqual(readdirSync(dir).includes('backups') ? readdirSync(backupDir) : [], [], 'a fresh database is not snapshotted');
    db.exec("CREATE TABLE marker (v TEXT); INSERT INTO marker VALUES ('kept');");
    db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION - 1}`);
    db.close();

    db = openDatabase(dbPath, { backupDir });
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION);
    db.close();
    const snapshots = readdirSync(backupDir);
    assert.equal(snapshots.length, 1);
    const snapshot = new DatabaseSync(path.join(backupDir, snapshots[0]));
    try {
      assert.equal(snapshot.prepare('PRAGMA user_version').get().user_version, CURRENT_SCHEMA_VERSION - 1);
      assert.equal(snapshot.prepare('SELECT v FROM marker').get().v, 'kept');
    } finally {
      snapshot.close();
    }

    openDatabase(dbPath, { backupDir }).close();
    assert.equal(readdirSync(backupDir).length, 1, 'a database already at the current schema is not snapshotted again');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
