#!/usr/bin/env node
/**
 * Genesis 2.1 — restore bazy SQLite z kopii.
 *
 *   GENESIS_DB_PATH=... node scripts/restore-db.mjs <plik-kopii>
 *   # albo bez argumentu → najnowsza kopia z GENESIS_BACKUP_DIR
 *
 * WAŻNE: ZATRZYMAJ serwer przed restore. Kopiuje plik kopii na miejsce bazy i
 * usuwa stare pliki -wal/-shm (kopia z VACUUM INTO jest samodzielna). Robi też
 * kopię bezpieczeństwa istniejącej bazy przed nadpisaniem.
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../packages/backend/src/store.mjs';
import { listBackups } from '../packages/backend/src/backup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GENESIS_DB_PATH ?? path.join(__dirname, '../packages/backend/data/genesis.db');
const DIR = process.env.GENESIS_BACKUP_DIR ?? path.join(__dirname, '../packages/backend/data/backups');

let src = process.argv[2];
if (!src) { const b = listBackups(DIR)[0]; if (!b) { console.error('Brak kopii w ' + DIR); process.exit(1); } src = b.full; }
if (!existsSync(src)) { console.error('Nie znaleziono kopii: ' + src); process.exit(1); }

// Kopia bezpieczeństwa aktualnej bazy (jeśli istnieje) przed nadpisaniem.
if (existsSync(DB_PATH)) copyFileSync(DB_PATH, DB_PATH + '.pre-restore');
for (const ext of ['-wal', '-shm']) { const p = DB_PATH + ext; if (existsSync(p)) rmSync(p); }
copyFileSync(src, DB_PATH);

// Walidacja: baza otwiera się i migruje. Zwraca liczbę użytkowników jako sanity-check.
const db = openDatabase(DB_PATH);
const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
db.close();
console.log(JSON.stringify({ ok: true, restoredFrom: src, dbPath: DB_PATH, users }));
