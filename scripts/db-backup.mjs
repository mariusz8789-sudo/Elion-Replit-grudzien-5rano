/**
 * Genesis OS — backup bazy z retencją (P0.2).
 *
 * Snapshot przez `VACUUM INTO`, nie `cp`: baza chodzi w WAL, więc kopia samego
 * pliku `.db` gubi ostatnie transakcje i wygląda przy tym na poprawną. Cała
 * mechanika i uzasadnienie: `packages/backend/src/dbDurability.mjs`.
 *
 * Użycie:
 *   node scripts/db-backup.mjs                       # domyślna ścieżka i katalog backupów
 *   node scripts/db-backup.mjs --keep 30
 *   GENESIS_DB_PATH=/data/genesis.db GENESIS_BACKUP_DIR=/data/backups node scripts/db-backup.mjs
 *
 * Kod wyjścia 0 = snapshot powstał; 1 = nie powstał (z powodem na stderr).
 * Nadaje się bezpośrednio do crona/scheduled job hostingu.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BACKUP_KEEP, classifyDbPath, snapshotDatabase } from '../packages/backend/src/dbDurability.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(REPO, 'packages/backend');
const DB_PATH = process.env.GENESIS_DB_PATH ?? path.join(APP_DIR, 'data/genesis.db');
const BACKUP_DIR = process.env.GENESIS_BACKUP_DIR ?? path.join(path.dirname(DB_PATH), 'backups');

const keepArg = process.argv.indexOf('--keep');
const keep = keepArg === -1 ? DEFAULT_BACKUP_KEEP : Number(process.argv[keepArg + 1]);

try {
  const durability = classifyDbPath({ dbPath: DB_PATH, appDir: APP_DIR });
  const result = snapshotDatabase({ dbPath: DB_PATH, dir: BACKUP_DIR, keep });
  console.log(JSON.stringify({
    t: new Date().toISOString(), level: 'info', msg: 'db_backup_ok',
    db: durability.resolved, durability: durability.durability,
    file: result.file, bytes: result.bytes, keep: result.keep, pruned: result.pruned,
  }));
  // Backup ścieżki efemerycznej jest wart mniej, niż wygląda — mówimy to wprost.
  if (!durability.persistent) {
    console.error(`UWAGA: ${durability.why}`);
  }
} catch (err) {
  console.error(`GENESIS DB BACKUP FAILED\n${err?.message ?? err}`);
  process.exit(1);
}
