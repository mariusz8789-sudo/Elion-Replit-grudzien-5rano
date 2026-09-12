import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildInfo, checkDatabaseState } from './buildInfo.mjs';
import { DatabaseSync } from 'node:sqlite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * P0.3 — /api/health musi odpowiadać na pytanie „CO dokładnie tu działa".
 *
 * Przed zmianą zwracał wersję z `npm_package_version` (czyli '1.0.0' — stałą,
 * która nie zmieniła się nigdy) i `persistence: 'ready'|'unavailable'` na
 * podstawie tego, czy OBIEKT bazy istnieje. Żadnego identyfikatora wydania.
 * Operator patrzący na zdrowy endpoint nie mógł powiedzieć, KTÓRY kod jest na
 * produkcji ani czy baza faktycznie odpowiada na zapytania.
 */

test('P0.3 resolveBuildInfo bierze commit ze środowiska i NIE wymyśla go, gdy go nie ma', () => {
  const fromEnv = resolveBuildInfo({ env: { GENESIS_COMMIT: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' }, readGitHead: () => null });
  assert.equal(fromEnv.commit, 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0');
  assert.equal(fromEnv.commitShort, 'a1b2c3d');
  assert.equal(fromEnv.commitSource, 'env');

  const fromGit = resolveBuildInfo({ env: {}, readGitHead: () => 'f' .repeat(40) });
  assert.equal(fromGit.commitSource, 'git');

  // Brak obu źródeł → jawne 'unknown', nigdy zmyślony hash ani puste pole.
  const unknown = resolveBuildInfo({ env: {}, readGitHead: () => null });
  assert.equal(unknown.commit, 'unknown');
  assert.equal(unknown.commitShort, 'unknown');
  assert.equal(unknown.commitSource, 'unavailable');

  // Śmieciowa wartość ze środowiska NIE jest przepuszczana jako commit.
  const junk = resolveBuildInfo({ env: { GENESIS_COMMIT: 'nie-jest-hashem' }, readGitHead: () => null });
  assert.equal(junk.commitSource, 'unavailable');
});

test('P0.3 resolveBuildInfo czyta realny HEAD tego repo', () => {
  const info = resolveBuildInfo({ env: {}, repoDir: REPO });
  assert.equal(info.commitSource, 'git', 'w repo z .git commit musi się dać odczytać');
  assert.match(info.commit, /^[0-9a-f]{40}$/);
});

test('P0.3 checkDatabaseState NAPRAWDĘ pyta bazę, a nie sprawdza istnienia obiektu', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(x);');
  const ok = checkDatabaseState(db);
  assert.equal(ok.ok, true);
  assert.equal(ok.state, 'ready');

  // Zamknięta baza to dokładnie ten przypadek, którego `db ? 'ready' : ...`
  // NIE potrafił zobaczyć: obiekt istnieje, a zapytania nie przechodzą.
  db.close();
  const dead = checkDatabaseState(db);
  assert.equal(dead.ok, false);
  assert.equal(dead.state, 'error');
  assert.ok(dead.why.length > 0, 'musi powiedzieć, co poszło nie tak');

  const none = checkDatabaseState(null);
  assert.equal(none.state, 'unavailable');
});

test('P0.3 Dockerfile przyjmuje commit jako build-arg i wstrzykuje go do runtime', () => {
  const dockerfile = readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /ARG GENESIS_COMMIT/, 'obraz musi dać się zbudować z identyfikatorem wydania');
  assert.match(dockerfile, /ENV GENESIS_COMMIT=\$\{?GENESIS_COMMIT\}?/, 'build-arg musi trafić do środowiska runtime');
});
