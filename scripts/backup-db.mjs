#!/usr/bin/env node
/**
 * Genesis 2.1 — ręczny/cron backup bazy SQLite.
 *
 *   GENESIS_DB_PATH=... GENESIS_BACKUP_DIR=... [GENESIS_BACKUP_KEEP=7] \
 *     node scripts/backup-db.mjs
 *
 * Tworzy spójną kopię (VACUUM INTO) w katalogu kopii i rotuje do ostatnich N.
 * Bezpieczny przy działającym serwerze (VACUUM INTO nie blokuje zapisu).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, backupDatabase } from '../packages/backend/src/store.mjs';
import { backupName, rotateBackups, ensureDir, listBackups } from '../packages/backend/src/backup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GENESIS_DB_PATH ?? path.join(__dirname, '../packages/backend/data/genesis.db');
const DIR = ensureDir(process.env.GENESIS_BACKUP_DIR ?? path.join(__dirname, '../packages/backend/data/backups'));
const KEEP = Number(process.env.GENESIS_BACKUP_KEEP ?? 7);

const db = openDatabase(DB_PATH);
const dest = path.join(DIR, backupName());
backupDatabase(db, dest);
const removed = rotateBackups(DIR, KEEP);
db.close();
console.log(JSON.stringify({ ok: true, backup: dest, kept: listBackups(DIR).length, rotatedOut: removed }));
