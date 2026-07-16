/**
 * backup (Genesis 2.1, Part 3) — pomocnicy nazewnictwa i rotacji kopii zapasowych.
 * Sama kopia powstaje przez store.backupDatabase (VACUUM INTO). Tutaj: deterministyczna
 * nazwa pliku i rotacja (trzymaj ostatnie N). Czyste/testowalne z realnym katalogiem tmp.
 */
import { readdirSync, statSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'genesis-';
const SUFFIX = '.db';

/** Nazwa pliku kopii dla danego momentu: genesis-YYYYMMDDTHHMMSS-<ms>.db (sortowalna leksykalnie). */
export function backupName(now = Date.now()) {
  const d = new Date(now);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  return `${PREFIX}${ts}-${now}${SUFFIX}`;
}

/** Lista istniejących kopii w katalogu (najnowsze pierwsze wg mtime). */
export function listBackups(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((f) => ({ file: f, full: path.join(dir, f), mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

/** Zostaw najnowsze `keep`, usuń resztę. Zwraca liczbę usuniętych. */
export function rotateBackups(dir, keep = 7) {
  const all = listBackups(dir);
  let removed = 0;
  for (const b of all.slice(Math.max(0, keep))) { try { unlinkSync(b.full); removed += 1; } catch { /* ignore */ } }
  return removed;
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
