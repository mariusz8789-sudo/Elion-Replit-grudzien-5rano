/**
 * Genesis OS — odtworzenie bazy ze snapshotu (P0.2). Druga połowa backupu:
 * kopia, której nigdy nie odtworzono, nie jest kopią zapasową.
 *
 * Użycie:
 *   node scripts/db-restore.mjs --from <plik.bak> [--to <ścieżka.db>] [--overwrite]
 *
 * Bez `--overwrite` ODMAWIA nadpisania istniejącej bazy: restore uruchamiany
 * pod presją nie może być jednym błędem literowym od zniszczenia żywych danych.
 * Usuwa też osierocone pliki -wal/-shm, inaczej SQLite pogodziłby nowy plik ze
 * STARYM dziennikiem i baza po restore byłaby niespójna.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreDatabase } from '../packages/backend/src/dbDurability.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? undefined : process.argv[i + 1]; };

const from = arg('--from');
const to = arg('--to') ?? process.env.GENESIS_DB_PATH ?? path.join(REPO, 'packages/backend/data/genesis.db');
if (!from) {
  console.error('Użycie: node scripts/db-restore.mjs --from <plik.bak> [--to <ścieżka.db>] [--overwrite]');
  process.exit(2);
}
try {
  const result = restoreDatabase({ backupFile: from, dbPath: to, overwrite: process.argv.includes('--overwrite') });
  console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', msg: 'db_restore_ok', ...result }));
} catch (err) {
  console.error(`GENESIS DB RESTORE FAILED\n${err?.message ?? err}`);
  process.exit(1);
}
