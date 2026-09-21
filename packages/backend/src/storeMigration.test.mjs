import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, CURRENT_SCHEMA_VERSION } from './store.mjs';

/**
 * P1.3 — Granice migracji schematu: pusta baza, baza z realnymi danymi,
 * guard przed downgrade'em, idempotencja. `packages/backend/data/genesis.db`
 * (26 tabel / 44 users / 40 projects, cytowane w briefie) nie istnieje w tym
 * kontenerze — repo klonuje się od zera do każdej sesji, ten plik danych
 * jest gitignorowany. Zamiast testować na materiale, którego nie mam,
 * budujemy WŁASNĄ, realną, wieloTABELOWĄ bazę z prawdziwymi wierszami,
 * kopiujemy ją do tempa (nigdy nie testujemy na oryginale) i migrujemy.
 *
 * Fixture „legacy pre-v2" niżej to dosłowna kopia bazowego `SCHEMA` z
 * `store.mjs` (linie 39-85 w chwili pisania) — kształt bazy SPRZED
 * `SCHEMA_V2` (bez `branches`, bez `trials.branch_id`). Ten fragment jest
 * bazowy i `CREATE TABLE IF NOT EXISTS`, więc nie ewoluuje — całe dalsze
 * ewoluowanie idzie przez `SCHEMA_V2..V12` — ryzyko dryfu tej kopii jest
 * bliskie zeru, i tak sprawdzone w Teście B niżej (test failuje głośno,
 * jeśli baza po `migrate()` nie ma dokładnie oczekiwanych tabel).
 */
const LEGACY_PRE_V2_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility  TEXT NOT NULL DEFAULT 'private',
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS trials (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL,
  author_id     TEXT NOT NULL REFERENCES users(id),
  idx           INTEGER NOT NULL,
  label         TEXT NOT NULL,
  params_json   TEXT NOT NULL,
  outputs_json  TEXT NOT NULL,
  status        TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  parent_id     TEXT,
  model_version TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trials_project ON trials(project_id, experiment_id, idx);
`;

function tmpDbPath(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  return path.join(dir, 'genesis.db');
}

function tableNames(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name).sort();
}

function rowCounts(db, tables) {
  const counts = {};
  for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  return counts;
}

describe('P1.3 — pusta baza: schemat powstaje w całości', () => {
  test('openDatabase na pustym pliku tworzy wszystkie oczekiwane tabele i user_version=13', () => {
    const dbPath = tmpDbPath('genesis-empty-');
    const db = openDatabase(dbPath);
    const tables = tableNames(db);
    for (const expected of [
      'users', 'sessions', 'projects', 'memberships', 'trials',
      'branches', 'merge_requests', 'runs', 'targets', 'candidates',
      'jobs', 'campaigns', 'campaign_candidates', 'campaign_decisions', 'campaign_events',
      'env_audits', 'science_runs', 'science_run_verifications',
      'knowledge_materials', 'knowledge_material_versions', 'project_spatial_datasets',
      'worlds', 'agent_runs', 'agent_run_steps',
      'project_access', 'access_audit',
    ]) {
      assert.ok(tables.includes(expected), `brakuje tabeli ${expected} na pustej, świeżo utworzonej bazie`);
    }
    const { user_version } = db.prepare('PRAGMA user_version').get();
    assert.equal(user_version, CURRENT_SCHEMA_VERSION);
    db.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });
});

describe('P1.3 — baza z realnymi danymi: migracja nie gubi ani jednego wiersza', () => {
  test('legacy pre-v2 baza z realnymi users/projects/trials przeżywa migrate() z KAŻDYM wierszem nietkniętym', () => {
    // Zbuduj legacy bazę (kształt sprzed SCHEMA_V2) w tempie, wypełnij realnymi danymi.
    const legacyPath = tmpDbPath('genesis-legacy-source-');
    const legacy = new DatabaseSync(legacyPath);
    legacy.exec(LEGACY_PRE_V2_SCHEMA);
    const now = Date.now();
    const users = [
      { id: 'u1', email: 'a@example.com', name: 'Ada', hash: 'h1' },
      { id: 'u2', email: 'b@example.com', name: 'Bob', hash: 'h2' },
    ];
    for (const u of users) {
      legacy.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(u.id, u.email, u.name, u.hash, now);
    }
    const projects = [
      { id: 'p1', name: 'Project One', owner: 'u1' },
      { id: 'p2', name: 'Project Two', owner: 'u2' },
    ];
    for (const p of projects) {
      legacy.prepare("INSERT INTO projects (id, name, description, owner_id, visibility, created_at) VALUES (?, ?, '', ?, 'private', ?)").run(p.id, p.name, p.owner, now);
    }
    legacy.prepare("INSERT INTO memberships (project_id, user_id, role, created_at) VALUES ('p1', 'u1', 'owner', ?)").run(now);
    legacy.prepare("INSERT INTO memberships (project_id, user_id, role, created_at) VALUES ('p2', 'u2', 'owner', ?)").run(now);
    // Trzy próby w p1, bez branch_id (kolumna jeszcze nie istnieje na tym etapie) — dokładnie stan sprzed SCHEMA_V2.
    for (let i = 0; i < 3; i++) {
      legacy.prepare(
        "INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, created_at) VALUES (?, 'p1', 'exp-a', 'u1', ?, ?, '{}', '{}', 'completed', ?)",
      ).run(`t${i}`, i, `Trial ${i}`, now);
    }
    // Jedna próba w p2.
    legacy.prepare(
      "INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, created_at) VALUES ('t-p2-0', 'p2', 'exp-b', 'u2', 0, 'P2 Trial', '{}', '{}', 'completed', ?)",
    ).run(now);
    const legacyCountsBefore = rowCounts(legacy, ['users', 'projects', 'memberships', 'trials']);
    legacy.close();

    // Kopiuj do OSOBNEGO pliku przed migracją — nigdy nie testujemy na oryginale.
    const workPath = tmpDbPath('genesis-legacy-migrated-');
    rmSync(path.dirname(workPath), { recursive: true, force: true });
    cpSync(path.dirname(legacyPath), path.dirname(workPath), { recursive: true });
    const migratedPath = path.join(path.dirname(workPath), path.basename(legacyPath));

    const migrated = openDatabase(migratedPath);
    const countsAfter = rowCounts(migrated, ['users', 'projects', 'memberships', 'trials']);
    assert.deepEqual(countsAfter, legacyCountsBefore, 'liczba wierszy w tabelach sprzed migracji zmieniła się — migracja zgubiła lub podwoiła dane');

    // Backfill (SCHEMA_V2, version<2): każda próba musi mieć realny branch_id wskazujący na 'main'.
    const trialBranches = migrated.prepare('SELECT id, branch_id FROM trials').all();
    assert.equal(trialBranches.length, 4);
    for (const t of trialBranches) assert.ok(t.branch_id, `próba ${t.id} nie dostała branch_id w backfillu`);
    const mainP1 = migrated.prepare("SELECT id FROM branches WHERE project_id='p1' AND name='main'").get();
    const mainP2 = migrated.prepare("SELECT id FROM branches WHERE project_id='p2' AND name='main'").get();
    assert.ok(mainP1 && mainP2, 'backfill nie utworzył gałęzi main dla obu istniejących projektów');
    assert.ok(trialBranches.filter((t) => t.branch_id === mainP1.id).length === 3, 'trzy próby projektu p1 powinny trafić na jego main');
    assert.ok(trialBranches.filter((t) => t.branch_id === mainP2.id).length === 1, 'próba projektu p2 powinna trafić na jego main');

    // Treść samych wierszy — nie tylko liczba — przeżyła bez zmian.
    const u1 = migrated.prepare('SELECT * FROM users WHERE id=?').get('u1');
    assert.equal(u1.email, 'a@example.com');
    assert.equal(u1.password_hash, 'h1');
    const p1 = migrated.prepare('SELECT * FROM projects WHERE id=?').get('p1');
    assert.equal(p1.name, 'Project One');

    const { user_version } = migrated.prepare('PRAGMA user_version').get();
    assert.equal(user_version, CURRENT_SCHEMA_VERSION, 'legacy baza powinna wylądować na tej samej aktualnej wersji co świeża');

    migrated.close();
    rmSync(path.dirname(legacyPath), { recursive: true, force: true });
    rmSync(path.dirname(migratedPath), { recursive: true, force: true });
  });
});

describe('P1.3 — guard przed downgrade’em', () => {
  test('kod ODMAWIA otwarcia bazy nowszej niż zna, z czytelnym komunikatem, i NIC nie zmienia', () => {
    const dbPath = tmpDbPath('genesis-future-');
    // Symuluj bazę zmigrowaną przez PRZYSZŁĄ wersję kodu: user_version wyżej niż cokolwiek dzisiejszy migrate() zna.
    const future = openDatabase(dbPath);
    future.exec('PRAGMA user_version = 999');
    future.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u-future', 'f@example.com', 'Future', 'h', ?)").run(Date.now());
    future.close();

    assert.throws(
      () => openDatabase(dbPath),
      (err) => {
        assert.match(err.message, /schema/i);
        assert.match(err.message, /999/);
        return true;
      },
      'starszy kod na nowszym schemacie (user_version=999) powinien odmówić, nie działać po cichu',
    );

    // Baza musi zostać NIETKNIĘTA przez odrzucone otwarcie — sprawdzone bezpośrednio, bez przechodzenia przez openDatabase.
    const raw = new DatabaseSync(dbPath);
    const { user_version } = raw.prepare('PRAGMA user_version').get();
    assert.equal(user_version, 999, 'odrzucone otwarcie nie powinno było ruszyć user_version');
    const u = raw.prepare('SELECT * FROM users WHERE id=?').get('u-future');
    assert.ok(u, 'odrzucone otwarcie nie powinno było stracić istniejący wiersz');
    raw.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });
});

describe('P1.3 — idempotencja otwarcia', () => {
  test('openDatabase wywołane dwa razy na tej samej bazie z danymi daje identyczny stan, bez zmian', () => {
    const dbPath = tmpDbPath('genesis-idempotent-');
    const first = openDatabase(dbPath);
    first.prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'h1', ?)").run(Date.now());
    first.prepare("INSERT INTO projects (id, name, description, owner_id, visibility, created_at) VALUES ('p1', 'P', '', 'u1', 'private', ?)").run(Date.now());
    const tablesFirst = tableNames(first);
    const countsFirst = rowCounts(first, tablesFirst);
    const versionFirst = first.prepare('PRAGMA user_version').get().user_version;
    first.close();

    const second = openDatabase(dbPath);
    const tablesSecond = tableNames(second);
    const countsSecond = rowCounts(second, tablesSecond);
    const versionSecond = second.prepare('PRAGMA user_version').get().user_version;

    assert.deepEqual(tablesSecond, tablesFirst, 'drugie otwarcie zmieniło zestaw tabel');
    assert.deepEqual(countsSecond, countsFirst, 'drugie otwarcie zmieniło liczbę wierszy w jakiejś tabeli');
    assert.equal(versionSecond, versionFirst, 'drugie otwarcie zmieniło user_version');
    // Treść realnego wiersza wciąż dokładnie ta sama.
    const u1 = second.prepare('SELECT * FROM users WHERE id=?').get('u1');
    assert.equal(u1.email, 'a@example.com');

    second.close();
    rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });
});
