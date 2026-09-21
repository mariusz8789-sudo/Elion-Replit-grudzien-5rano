/**
 * Genesis OS — trwałość magazynu danych (P0.2).
 *
 * ZNALEZIONY DEFEKT, NIE KOSMETYKA. Domyślna ścieżka bazy to
 * `packages/backend/data/genesis.db` — WEWNĄTRZ drzewa aplikacji — a
 * `Dockerfile` nie deklarował ani `VOLUME`, ani `GENESIS_DB_PATH`. Na wdrożeniu
 * kontenerowym warstwa zapisywalna jest wymieniana przy KAŻDYM redeployu, więc
 * wszystkie konta, projekty i Serie Prób ginęły — cicho, bez błędu, przy w pełni
 * poprawnie działającej aplikacji. Dla systemu, którego jedynym produktem jest
 * PROWENIENCJA wyników, milcząca utrata całej historii jest defektem klasy P0.
 *
 * Ten moduł to wyłącznie czyste funkcje plus dwie operacje plikowe. Nie
 * powstaje żaden nowy silnik: `store.mjs` pozostaje jedynym miejscem, które
 * rozmawia z SQL-em aplikacji, a tutaj mieszka pytanie „czy te dane przeżyją
 * redeploy" i mechanika snapshotu.
 *
 * DLACZEGO `VACUUM INTO`, A NIE `cp genesis.db`. Baza chodzi w trybie WAL
 * (`store.mjs::openDatabase`), więc świeżo zapisane wiersze siedzą w pliku
 * `-wal`, a nie w głównym pliku. Skopiowanie samego `genesis.db` daje backup
 * BEZ ostatnich transakcji — czyli backup, który wygląda na poprawny i milcząco
 * gubi dane. `VACUUM INTO` tworzy atomowy, spójny snapshot całej bazy jednym
 * plikiem. Zmierzone i zabezpieczone testem `RESTORE DRILL`, który celowo
 * NIE zamyka bazy przed backupem.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Ile snapshotów trzymamy domyślnie. Świadoma wartość, nie magia: patrz DECISIONS D-007. */
export const DEFAULT_BACKUP_KEEP = 14;

/**
 * Czy dane pod `dbPath` przeżyją redeploy.
 *
 * Porównanie po SEGMENTACH ścieżki, nie po prefiksie napisu — `/app/backend-data`
 * nie jest wewnątrz `/app/backend`, choć zaczyna się tym samym tekstem.
 */
export function classifyDbPath({ dbPath, appDir, cwd = process.cwd() }) {
  if (dbPath === ':memory:') {
    return {
      durability: 'IN_MEMORY',
      persistent: false,
      resolved: ':memory:',
      why: 'Baza działa w pamięci procesu — dane znikają przy każdym restarcie, nie tylko przy redeployu. Poprawne dla testów i wdrożeń świadomie efemerycznych, nigdy dla produkcji z kontami.',
    };
  }
  const resolved = path.resolve(cwd, dbPath);
  const app = path.resolve(appDir);
  const relative = path.relative(app, resolved);
  const insideAppTree = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (insideAppTree) {
    return {
      durability: 'EPHEMERAL_IN_APP_TREE',
      persistent: false,
      resolved,
      why: `Plik bazy (${resolved}) leży WEWNĄTRZ drzewa aplikacji (${app}). Na wdrożeniu kontenerowym to warstwa zapisywalna obrazu, wymieniana przy każdym redeployu — konta, projekty i Serie Prób zostaną utracone bez żadnego błędu. Ustaw GENESIS_DB_PATH na trwały wolumen poza drzewem aplikacji.`,
    };
  }
  return {
    durability: 'PERSISTENT',
    persistent: true,
    resolved,
    why: `Plik bazy (${resolved}) leży poza drzewem aplikacji (${app}), więc redeploy kodu go nie dotyka. Trwałość zależy teraz od tego, czy ta ścieżka jest zamontowanym woluminem — to warunek po stronie hostingu.`,
  };
}

/** Nazwa snapshotu: sortowanie leksykograficzne = sortowanie chronologiczne (warunek działania retencji). */
export function backupFileName(base, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${base}.${stamp}.bak`;
}

const BACKUP_SUFFIX = /\.\d{8}T\d{6}Z\.bak$/;

/**
 * Które snapshoty usunąć, zostawiając `keep` najnowszych.
 *
 * Bierze pod uwagę WYŁĄCZNIE pliki zgodne ze wzorcem `<base>.<stamp>.bak` —
 * plik bazy, README czy cokolwiek innego w katalogu nigdy nie trafia na listę
 * do usunięcia. `keep < 1` jest odrzucane, a nie interpretowane jako „usuń
 * wszystko": skrypt retencji, który przy złej konfiguracji kasuje ostatnią
 * kopię, jest gorszy niż brak retencji.
 */
export function selectBackupsToPrune(files, { base, keep = DEFAULT_BACKUP_KEEP }) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`selectBackupsToPrune: keep musi być liczbą całkowitą >= 1 (otrzymano ${keep}). Retencja nie usuwa ostatniej kopii.`);
  }
  const mine = files
    .filter((name) => name.startsWith(`${base}.`) && BACKUP_SUFFIX.test(name))
    .sort();
  return mine.slice(0, Math.max(0, mine.length - keep));
}

/**
 * Atomowy, spójny snapshot bazy (`VACUUM INTO`) + retencja. Zwraca plik i to,
 * co usunięto, żeby wywołujący mógł to zalogować zamiast zakładać.
 */
export function snapshotDatabase({ dbPath, dir, keep = DEFAULT_BACKUP_KEEP, now = new Date() }) {
  if (dbPath === ':memory:') throw new Error('snapshotDatabase: baza :memory: nie ma czego backupować.');
  if (!existsSync(dbPath)) throw new Error(`snapshotDatabase: brak pliku bazy ${dbPath}.`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const base = path.basename(dbPath);
  const file = path.join(dir, backupFileName(base, now));
  if (existsSync(file)) throw new Error(`snapshotDatabase: ${file} już istnieje — nie nadpisuję snapshotu.`);

  const db = new DatabaseSync(dbPath);
  try {
    // Ścieżka wchodzi do SQL-a, więc apostrofy są escapowane; parametryzacja
    // nie jest dostępna dla VACUUM INTO.
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  const pruned = selectBackupsToPrune(readdirSync(dir), { base, keep });
  for (const name of pruned) unlinkSync(path.join(dir, name));
  return { file, bytes: statSync(file).size, pruned, keep };
}

/**
 * Odtworzenie bazy ze snapshotu. ODMAWIA nadpisania istniejącego pliku bez
 * jawnego `overwrite: true` — restore uruchamiany pod presją nie może być
 * jednym błędem literowym od zniszczenia żywych danych.
 */
export function restoreDatabase({ backupFile, dbPath, overwrite = false }) {
  if (!existsSync(backupFile)) throw new Error(`restoreDatabase: brak pliku backupu ${backupFile}.`);
  if (existsSync(dbPath) && !overwrite) {
    throw new Error(`restoreDatabase: ${dbPath} już istnieje. Użyj overwrite: true, jeśli NAPRAWDĘ chcesz nadpisać żywą bazę.`);
  }
  const dir = path.dirname(path.resolve(dbPath));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Pliki -wal/-shm starej bazy muszą zniknąć, inaczej SQLite pogodzi nowy
  // plik główny ze STARYM dziennikiem i baza po restore będzie niespójna.
  for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) if (existsSync(sidecar)) unlinkSync(sidecar);
  copyFileSync(backupFile, dbPath);
  return { dbPath, from: backupFile, bytes: statSync(dbPath).size };
}
