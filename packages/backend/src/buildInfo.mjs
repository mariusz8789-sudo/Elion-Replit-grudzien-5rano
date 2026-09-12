/**
 * Genesis OS — tożsamość wydania i realny stan bazy dla /api/health (P0.3).
 *
 * CO BYŁO ZEPSUTE. `/api/health` zwracał `version` z `npm_package_version` —
 * czyli stałą '1.0.0', która nie zmieniła się nigdy — i `persistence:
 * 'ready' | 'unavailable'` wyłącznie na podstawie tego, czy OBIEKT bazy nie
 * jest nullem. Operator patrzący na zdrowy endpoint nie mógł odpowiedzieć na
 * dwa pytania, które przy incydencie zadaje się pierwsze: KTÓRY kod tu stoi i
 * czy baza NAPRAWDĘ odpowiada. Dla wniosku grantowego to samo: „działa" bez
 * identyfikatora wydania jest twierdzeniem bez dowodu.
 *
 * DLACZEGO COMMIT NIE JEST CZYTANY Z GITA NA PRODUKCJI. `Dockerfile` nie
 * kopiuje `.git` (i nie powinien). Identyfikator wydania musi więc być
 * WSTRZYKNIĘTY przy budowie (`--build-arg GENESIS_COMMIT=$(git rev-parse HEAD)`),
 * a odczyt z `.git` jest tylko wygodą dla uruchomień lokalnych. Gdy nie ma ani
 * jednego, ani drugiego, pole mówi `unknown` — nigdy nie zmyśla hasha i nigdy
 * nie udaje, że wie.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const FULL_SHA = /^[0-9a-f]{40}$/;

/**
 * Rozwiązuje `.git` do prawdziwego katalogu gita. `.git` NIE zawsze jest
 * katalogiem: w `git worktree` (dokładnie ten tryb izolacji, w którym część
 * tej misji jest uruchamiana — `isolation: "worktree"`) jest PLIKIEM
 * tekstowym `gitdir: <ścieżka>`, wskazującym na prawdziwy katalog gita gdzie
 * indziej (`<repo>/.git/worktrees/<nazwa>`).
 *
 * Bez tego `path.join(gitDir, 'HEAD')` na pliku wybuchał (ENOTDIR), łapany
 * przez `try/catch` w `readGitHeadFrom` i cicho zwracający `null` — więc
 * `commitSource` lądował jako `'unavailable'` w środowisku, w którym HEAD
 * było jak najbardziej czytelne. Nie crash, ale realna utrata dokładnie tej
 * informacji, po którą P0.3 istnieje. Znalezione przez C3 przy P2.1.
 */
function resolveGitDir(repoDir) {
  const gitPath = path.join(repoDir, '.git');
  if (!existsSync(gitPath)) return null;
  if (statSync(gitPath).isDirectory()) return gitPath;
  const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(gitPath, 'utf8'));
  if (!pointer) return null;
  const resolved = path.isAbsolute(pointer[1].trim()) ? pointer[1].trim() : path.resolve(repoDir, pointer[1].trim());
  return existsSync(resolved) ? resolved : null;
}

/**
 * Katalog, w którym żyją `refs/` i `packed-refs`. W zwykłym repo to `gitDir`
 * samo w sobie; w worktree gałęzie NIE są prywatne per-worktree — `refs/heads`
 * i `packed-refs` żyją we WSPÓLNYM katalogu, na który wskazuje plik
 * `<gitDir>/commondir` (zwykle `../..`). Tylko `HEAD` jest per-worktree.
 */
function resolveCommonDir(gitDir) {
  const commondirFile = path.join(gitDir, 'commondir');
  if (!existsSync(commondirFile)) return gitDir;
  const relative = readFileSync(commondirFile, 'utf8').trim();
  const resolved = path.isAbsolute(relative) ? relative : path.resolve(gitDir, relative);
  return existsSync(resolved) ? resolved : gitDir;
}

/** Odczyt HEAD z katalogu `.git` (albo z worktree, przez `resolveGitDir`) — bez odpalania gita jako procesu. */
function readGitHeadFrom(repoDir) {
  try {
    const gitDir = resolveGitDir(repoDir);
    if (gitDir === null) return null;
    const commonDir = resolveCommonDir(gitDir);
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    const ref = /^ref:\s*(.+)$/.exec(head);
    if (!ref) return FULL_SHA.test(head) ? head : null;
    const refPath = path.join(commonDir, ref[1]);
    if (existsSync(refPath)) {
      const sha = readFileSync(refPath, 'utf8').trim();
      return FULL_SHA.test(sha) ? sha : null;
    }
    // Referencja spakowana (`git gc`) — szukamy w packed-refs (współdzielone).
    const packed = path.join(commonDir, 'packed-refs');
    if (!existsSync(packed)) return null;
    for (const line of readFileSync(packed, 'utf8').split('\n')) {
      const [sha, name] = line.trim().split(/\s+/);
      if (name === ref[1] && FULL_SHA.test(sha ?? '')) return sha;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tożsamość tego wydania. `env` i `readGitHead` są wstrzykiwalne, żeby test
 * mógł sprawdzić wszystkie cztery ścieżki bez mutowania procesu.
 */
export function resolveBuildInfo({ env = process.env, repoDir, readGitHead } = {}) {
  const reader = readGitHead ?? (() => (repoDir ? readGitHeadFrom(repoDir) : null));
  const fromEnv = String(env.GENESIS_COMMIT ?? '').trim();
  let commit = null;
  let commitSource = 'unavailable';
  if (FULL_SHA.test(fromEnv)) {
    commit = fromEnv;
    commitSource = 'env';
  } else {
    const fromGit = reader();
    if (FULL_SHA.test(String(fromGit ?? ''))) {
      commit = String(fromGit);
      commitSource = 'git';
    }
  }
  return {
    version: env.npm_package_version ?? '1.0.0',
    commit: commit ?? 'unknown',
    commitShort: commit ? commit.slice(0, 7) : 'unknown',
    commitSource,
    // Czas budowy jest deklarowany przy budowie obrazu; brak = brak, nie „teraz".
    builtAt: String(env.GENESIS_BUILT_AT ?? '').trim() || null,
  };
}

/**
 * Realny stan bazy: WYKONANE zapytanie, nie sprawdzenie, czy obiekt istnieje.
 *
 * `SELECT 1`, a nie `PRAGMA integrity_check`: health endpoint jest odpytywany
 * co 30 s przez HEALTHCHECK obrazu, a pełny integrity_check czyta całą bazę —
 * to byłby monitoring, który sam generuje obciążenie, jakie ma wykrywać.
 * Sprawdzenie spójności jest operacją serwisową (patrz OPS_RUNBOOK), nie
 * elementem pętli monitorującej.
 */
export function checkDatabaseState(db) {
  if (!db) return { ok: false, state: 'unavailable', why: 'Magazyn trwały nie został otwarty — backend działa bez persystencji.' };
  try {
    const row = db.prepare('SELECT 1 AS ping').get();
    if (row?.ping !== 1) return { ok: false, state: 'error', why: 'Baza odpowiedziała nieoczekiwanym wynikiem na SELECT 1.' };
    return { ok: true, state: 'ready', why: 'Baza odpowiedziała na zapytanie kontrolne.' };
  } catch (err) {
    return { ok: false, state: 'error', why: `Zapytanie kontrolne do bazy nie przeszło: ${err?.message ?? err}` };
  }
}
