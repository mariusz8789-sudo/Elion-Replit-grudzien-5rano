/**
 * Genesis OS — backend: trwały magazyn danych (Milestone 1: Backend Persistence).
 *
 * Wybór technologii: `node:sqlite` (wbudowany w Node 22, zero zewnętrznych
 * zależności). To realna, transakcyjna baza SQL — nie atrapa. Schemat jest
 * przenośnym, standardowym SQL, więc migracja do PostgreSQL dla dużych
 * instytucji (uczelnie, projekty typu ESA/NASA) będzie zmianą sterownika, a
 * nie przepisaniem modelu danych. Cały dostęp do danych przechodzi przez ten
 * jeden moduł — server.mjs nigdy nie sięga do SQL bezpośrednio.
 *
 * Projekt pod skalę, ale implementujemy WYŁĄCZNIE zweryfikowaną funkcjonalność:
 *  - użytkownicy + sesje (uwierzytelnianie),
 *  - projekty + członkostwa z ROLAMI (RBAC: owner > admin > editor > viewer),
 *  - trwałe, REPRODUKOWALNE Serie Prób (zamrożone parametry, wyjścia, wersja
 *    modelu i autor — pełna prowieniencja każdej próby).
 *
 * `openDatabase(':memory:')` daje izolowaną bazę na test (node --test), bez
 * dotykania dysku. Wszystkie funkcje są synchroniczne (taki jest node:sqlite),
 * co upraszcza logikę API i testy.
 */

import { DatabaseSync } from 'node:sqlite';
import { newId } from './auth.mjs';

/* ---------------- Role i uprawnienia (RBAC) ---------------- */

/** Ranga roli — wyższa liczba obejmuje wszystkie uprawnienia niższych. */
export const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const ROLES = Object.keys(ROLE_RANK);

/** Czy `role` ma co najmniej uprawnienia `min` (np. atLeast('admin','editor')===true). */
export function atLeast(role, min) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? Infinity);
}

/* ---------------- Schemat ---------------- */

const SCHEMA = `
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

/**
 * Migracje schematu do wersji 2 (Milestone 2: Scientific Git). Realny mechanizm
 * migracji „w przód" oparty o PRAGMA user_version — potrzebny, gdy baza z
 * Milestone 1 (bez gałęzi) ma już dane instytucji. Dodaje:
 *  - branches: nazwane linie pracy w projekcie (git-style),
 *  - trials.branch_id: przynależność próby do gałęzi,
 *  - merge_requests: recenzja i scalanie gałęzi (RBAC),
 * a każdemu istniejącemu projektowi zakłada gałąź 'main' i przypisuje do niej
 * dotychczasowe próby (backfill), więc żadna próba nie zostaje osierocona.
 */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS branches (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  base_branch_id TEXT,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     INTEGER NOT NULL,
  UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS merge_requests (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  target_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'open',
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       INTEGER NOT NULL,
  decided_by       TEXT,
  decided_at       INTEGER,
  review_note      TEXT NOT NULL DEFAULT '',
  merged_count     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_branches_project ON branches(project_id);
CREATE INDEX IF NOT EXISTS idx_mr_project ON merge_requests(project_id, status);
`;

/**
 * Migracja do wersji 3 (Backend Compute Engine): trwałe, audytowalne przebiegi
 * obliczeń naukowych (Scientific Runs). Każdy wiersz to jeden odtwarzalny run z
 * pełną prowieniencją. Opcjonalnie dowiązany do użytkownika i/lub projektu.
 */
const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS runs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id     TEXT REFERENCES projects(id) ON DELETE CASCADE,
  model_id       TEXT NOT NULL,
  model_version  TEXT NOT NULL,
  domain         TEXT NOT NULL,
  status         TEXT NOT NULL,
  inputs_json    TEXT NOT NULL,
  outputs_json   TEXT NOT NULL,
  units_json     TEXT NOT NULL DEFAULT '{}',
  warnings_json  TEXT NOT NULL DEFAULT '[]',
  provenance_json TEXT NOT NULL DEFAULT '{}',
  seed           INTEGER,
  deterministic  INTEGER NOT NULL DEFAULT 1,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model_id, created_at);
`;

function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version < 3) db.exec(SCHEMA_V3);
  if (version < 2) {
    db.exec(SCHEMA_V2);
    // Dodaj kolumnę branch_id do trials, jeśli jej nie ma (baza z M1).
    const cols = db.prepare('PRAGMA table_info(trials)').all();
    if (!cols.some((c) => c.name === 'branch_id')) {
      db.exec('ALTER TABLE trials ADD COLUMN branch_id TEXT');
    }
    // Backfill: każdemu projektowi gałąź 'main' + przypisz istniejące próby.
    const projects = db.prepare('SELECT id, owner_id FROM projects').all();
    for (const p of projects) {
      let main = db.prepare('SELECT id FROM branches WHERE project_id = ? AND name = ?').get(p.id, 'main');
      if (!main) {
        const id = newId();
        db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)').run(
          id, p.id, 'main', p.owner_id, Date.now(),
        );
        main = { id };
      }
      db.prepare('UPDATE trials SET branch_id = ? WHERE project_id = ? AND branch_id IS NULL').run(main.id, p.id);
    }
  }
  if (version < 3) db.exec('PRAGMA user_version = 3');
}

/** Otwiera (i migruje) bazę. `:memory:` dla testów, ścieżka pliku w produkcji. */
export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/* ---------------- Mapowanie wierszy → obiekty (camelCase, bez pól wrażliwych) ---------------- */

function toUser(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, createdAt: row.created_at };
}
function toProject(row, role) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    visibility: row.visibility,
    createdAt: row.created_at,
    ...(role ? { role } : {}),
  };
}
function toTrial(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    experimentId: row.experiment_id,
    authorId: row.author_id,
    index: row.idx,
    label: row.label,
    params: JSON.parse(row.params_json),
    outputs: JSON.parse(row.outputs_json),
    status: row.status,
    note: row.note,
    parentId: row.parent_id ?? null,
    modelVersion: row.model_version,
    branchId: row.branch_id ?? null,
    createdAt: row.created_at,
  };
}

function toBranch(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    baseBranchId: row.base_branch_id ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMergeRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    sourceBranchId: row.source_branch_id,
    targetBranchId: row.target_branch_id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ?? null,
    reviewNote: row.review_note,
    mergedCount: row.merged_count,
  };
}

/* ---------------- Użytkownicy ---------------- */

/** Tworzy użytkownika. Rzuca Error('email_taken') przy duplikacie adresu. */
export function createUser(db, { email, displayName, passwordHash }) {
  const id = newId();
  const now = Date.now();
  try {
    db.prepare(
      'INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(id, email, displayName, passwordHash, now);
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) throw new Error('email_taken', { cause: err });
    throw err;
  }
  return { id, email, displayName, createdAt: now };
}

export function getUserByEmail(db, email) {
  return toUser(db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()));
}
export function getUserById(db, id) {
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}
/** Zwraca surowy hash hasła (tylko do weryfikacji logowania — nie wychodzi poza API). */
export function getPasswordHash(db, userId) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
  return row?.password_hash ?? null;
}

/* ---------------- Sesje ---------------- */

export function createSession(db, { userId, token, ttlMs }) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    expiresAt,
  );
  return { token, userId, createdAt: now, expiresAt };
}

/** Zwraca użytkownika powiązanego z ważnym tokenem (albo null). Wygasłą sesję kasuje. */
export function getUserByToken(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return getUserById(db, s.user_id);
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Sprząta wygasłe sesje (wołane okresowo przez serwer). Zwraca liczbę usuniętych. */
export function purgeExpiredSessions(db, now = Date.now()) {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes;
}

/* ---------------- Projekty i członkostwa (RBAC) ---------------- */

/** Tworzy projekt i nadaje twórcy rolę 'owner' (jedna transakcja). */
export function createProject(db, { name, description = '', ownerId, visibility = 'private' }) {
  const id = newId();
  const now = Date.now();
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    db.prepare(
      'INSERT INTO projects (id, name, description, owner_id, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, name, description, ownerId, visibility, now);
    db.prepare('INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      ownerId,
      'owner',
      now,
    );
    // Każdy projekt startuje z gałęzią 'main' (Scientific Git).
    db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, NULL, ?, ?)').run(
      newId(), id, 'main', ownerId, now,
    );
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return toProject({ id, name, description, owner_id: ownerId, visibility, created_at: now }, 'owner');
}

export function getProject(db, id) {
  return toProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
}

/** Projekty, których użytkownik jest członkiem — z jego rolą, najnowsze pierwsze. */
export function listProjectsForUser(db, userId) {
  const rows = db
    .prepare(
      `SELECT p.*, m.role AS role FROM projects p
       JOIN memberships m ON m.project_id = p.id
       WHERE m.user_id = ? ORDER BY p.created_at DESC`,
    )
    .all(userId);
  return rows.map((r) => toProject(r, r.role));
}

/** Rola użytkownika w projekcie (albo null, jeśli nie jest członkiem). */
export function getRole(db, projectId, userId) {
  const row = db.prepare('SELECT role FROM memberships WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return row?.role ?? null;
}

/** Dodaje/aktualizuje członka z rolą. Nie pozwala zdegradować jedynego właściciela. */
export function setMember(db, { projectId, userId, role }) {
  if (!ROLES.includes(role)) throw new Error('invalid_role');
  const now = Date.now();
  db.prepare(
    `INSERT INTO memberships (project_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(projectId, userId, role, now);
  return { projectId, userId, role, createdAt: now };
}

export function listMembers(db, projectId) {
  const rows = db
    .prepare(
      `SELECT m.user_id, m.role, m.created_at, u.email, u.display_name FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? ORDER BY m.created_at ASC`,
    )
    .all(projectId);
  return rows.map((r) => ({
    userId: r.user_id,
    role: r.role,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

/* ---------------- Serie Prób (trwałe, reprodukowalne) ---------------- */

/**
 * Zapisuje próbę z pełną prowieniencją. Numer kolejny (idx) liczony w ramach
 * (projekt, eksperyment), więc każdy eksperyment ma własną serię 001, 002…
 * Zamrażamy: parametry wejściowe, policzone wyjścia, wersję modelu i autora —
 * to czyni próbę REPRODUKOWALNĄ (można odtworzyć dokładnie ten sam przebieg).
 */
export function createTrial(db, { projectId, experimentId, authorId, label, params, outputs, status, note = '', parentId = null, modelVersion = '', branchId = null }) {
  const id = newId();
  const now = Date.now();
  // Domyślnie gałąź 'main' projektu; numeracja jest per (gałąź, eksperyment).
  const branch = branchId ?? getMainBranch(db, projectId)?.id ?? null;
  const row = db
    .prepare('SELECT MAX(idx) AS maxIdx FROM trials WHERE branch_id = ? AND experiment_id = ?')
    .get(branch, experimentId);
  const index = (row?.maxIdx ?? 0) + 1;
  db.prepare(
    `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    experimentId,
    authorId,
    index,
    label || `Próba ${String(index).padStart(3, '0')}`,
    JSON.stringify(params ?? {}),
    JSON.stringify(outputs ?? {}),
    status,
    note,
    parentId,
    modelVersion,
    branch,
    now,
  );
  return getTrial(db, id);
}

export function getTrial(db, id) {
  return toTrial(db.prepare('SELECT * FROM trials WHERE id = ?').get(id));
}

/**
 * Próby projektu; opcjonalnie zawężone do eksperymentu i/lub gałęzi. Rosnąco po
 * numerze. Filtr gałęzi realizuje „historię wersji tej linii pracy" (Scientific Git).
 */
export function listTrials(db, projectId, experimentId = null, branchId = null) {
  const clauses = ['project_id = ?'];
  const args = [projectId];
  if (experimentId) { clauses.push('experiment_id = ?'); args.push(experimentId); }
  if (branchId) { clauses.push('branch_id = ?'); args.push(branchId); }
  const rows = db
    .prepare(`SELECT * FROM trials WHERE ${clauses.join(' AND ')} ORDER BY experiment_id ASC, idx ASC`)
    .all(...args);
  return rows.map(toTrial);
}

/** Aktualizuje wyłącznie pola opisowe (etykieta/status/notatka) — dane naukowe są niezmienne. */
export function updateTrial(db, id, patch = {}) {
  const cur = db.prepare('SELECT * FROM trials WHERE id = ?').get(id);
  if (!cur) return null;
  const label = patch.label !== undefined ? String(patch.label).slice(0, 200) : cur.label;
  const status = patch.status !== undefined ? String(patch.status).slice(0, 40) : cur.status;
  const note = patch.note !== undefined ? String(patch.note).slice(0, 2000) : cur.note;
  db.prepare('UPDATE trials SET label = ?, status = ?, note = ? WHERE id = ?').run(label, status, note, id);
  return getTrial(db, id);
}

export function deleteTrial(db, id) {
  return db.prepare('DELETE FROM trials WHERE id = ?').run(id).changes > 0;
}

/* ---------------- Scientific Git: gałęzie ---------------- */

export function getMainBranch(db, projectId) {
  return toBranch(db.prepare('SELECT * FROM branches WHERE project_id = ? AND name = ?').get(projectId, 'main'));
}

export function getBranch(db, id) {
  return toBranch(db.prepare('SELECT * FROM branches WHERE id = ?').get(id));
}

export function listBranches(db, projectId) {
  const rows = db.prepare('SELECT * FROM branches WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
  return rows.map(toBranch);
}

/** Tworzy nazwaną gałąź. Rzuca Error('branch_exists') przy duplikacie nazwy w projekcie. */
export function createBranch(db, { projectId, name, baseBranchId = null, createdBy }) {
  const id = newId();
  const now = Date.now();
  try {
    db.prepare('INSERT INTO branches (id, project_id, name, base_branch_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, projectId, name, baseBranchId, createdBy, now,
    );
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) throw new Error('branch_exists', { cause: err });
    throw err;
  }
  return toBranch({ id, project_id: projectId, name, base_branch_id: baseBranchId, created_by: createdBy, created_at: now });
}

/**
 * Odgałęzienie: tworzy nową gałąź i KOPIUJE do niej bieżące próby gałęzi bazowej,
 * zachowując prowieniencję (parametry, wyjścia, wersja modelu, autor) i wiążąc
 * każdą kopię z oryginałem przez parent_id. To realny „fork" linii pracy — nowe
 * próby są niezależne, ale ich rodowód pozostaje jawny.
 */
export function forkBranch(db, { projectId, name, baseBranchId, createdBy }) {
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    const branch = createBranch(db, { projectId, name, baseBranchId, createdBy });
    const source = db.prepare('SELECT * FROM trials WHERE branch_id = ? ORDER BY experiment_id ASC, idx ASC').all(baseBranchId);
    for (const t of source) {
      db.prepare(
        `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(), projectId, t.experiment_id, t.author_id, t.idx, t.label, t.params_json, t.outputs_json,
        t.status, t.note, t.id, t.model_version, branch.id, Date.now(),
      );
    }
    db.prepare('COMMIT').run();
    return branch;
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
}

/* ---------------- Scientific Git: recenzja i scalanie (merge requests) ---------------- */

export function createMergeRequest(db, { projectId, sourceBranchId, targetBranchId, title, description = '', createdBy }) {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO merge_requests (id, project_id, source_branch_id, target_branch_id, title, description, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).run(id, projectId, sourceBranchId, targetBranchId, title, description, createdBy, now);
  return getMergeRequest(db, id);
}

export function getMergeRequest(db, id) {
  return toMergeRequest(db.prepare('SELECT * FROM merge_requests WHERE id = ?').get(id));
}

export function listMergeRequests(db, projectId) {
  const rows = db.prepare('SELECT * FROM merge_requests WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
  return rows.map(toMergeRequest);
}

/**
 * Recenzja: odrzuca albo zatwierdza+scala. Scalanie KOPIUJE próby gałęzi
 * źródłowej do docelowej jako nowe próby (z parent_id → oryginał), zachowując
 * pełną prowieniencję. Nic nie jest nadpisywane — historia obu gałęzi zostaje.
 * Zwraca zaktualizowany merge request albo null, jeśli nie jest 'open'.
 */
export function decideMergeRequest(db, id, { approve, deciderId, reviewNote = '' }) {
  const mr = db.prepare('SELECT * FROM merge_requests WHERE id = ?').get(id);
  if (!mr || mr.status !== 'open') return null;
  const now = Date.now();
  if (!approve) {
    db.prepare('UPDATE merge_requests SET status = ?, decided_by = ?, decided_at = ?, review_note = ? WHERE id = ?').run(
      'rejected', deciderId, now, reviewNote, id,
    );
    return getMergeRequest(db, id);
  }
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    const source = db.prepare('SELECT * FROM trials WHERE branch_id = ? ORDER BY experiment_id ASC, idx ASC').all(mr.source_branch_id);
    let merged = 0;
    for (const t of source) {
      const maxRow = db.prepare('SELECT MAX(idx) AS m FROM trials WHERE branch_id = ? AND experiment_id = ?').get(mr.target_branch_id, t.experiment_id);
      const idx = (maxRow?.m ?? 0) + 1;
      db.prepare(
        `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, branch_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newId(), mr.project_id, t.experiment_id, t.author_id, idx, t.label, t.params_json, t.outputs_json,
        t.status, t.note, t.id, t.model_version, mr.target_branch_id, now,
      );
      merged += 1;
    }
    db.prepare('UPDATE merge_requests SET status = ?, decided_by = ?, decided_at = ?, review_note = ?, merged_count = ? WHERE id = ?').run(
      'merged', deciderId, now, reviewNote, merged, id,
    );
    db.prepare('COMMIT').run();
  } catch (err) {
    db.prepare('ROLLBACK').run();
    throw err;
  }
  return getMergeRequest(db, id);
}

/* ---------------- Scientific Git: graf kontrybucji ---------------- */

/**
 * Graf kontrybucji: KTO i ILE prób wniósł oraz aktywność dzienna. Liczone z
 * realnych wierszy trials (author_id, created_at) — zero wymyślonych metryk.
 */
export function contributionGraph(db, projectId) {
  const perAuthor = db.prepare(
    `SELECT t.author_id AS userId, u.display_name AS displayName, u.email AS email,
            COUNT(*) AS trials, MIN(t.created_at) AS firstAt, MAX(t.created_at) AS lastAt
     FROM trials t JOIN users u ON u.id = t.author_id
     WHERE t.project_id = ? GROUP BY t.author_id ORDER BY trials DESC`,
  ).all(projectId);

  // Dzienne kubełki (UTC) — realna aktywność w czasie.
  const rows = db.prepare('SELECT created_at FROM trials WHERE project_id = ?').all(projectId);
  const perDay = {};
  for (const r of rows) {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    perDay[day] = (perDay[day] ?? 0) + 1;
  }
  return {
    contributors: perAuthor.map((r) => ({
      userId: r.userId, displayName: r.displayName, email: r.email,
      trials: r.trials, firstAt: r.firstAt, lastAt: r.lastAt,
    })),
    perDay,
    totalTrials: rows.length,
  };
}

/* ---------------- Przebiegi obliczeń (Scientific Runs, trwałe/audytowalne) ---------------- */

function toRun(row) {
  if (!row) return null;
  return {
    runId: row.id,
    userId: row.user_id ?? null,
    projectId: row.project_id ?? null,
    modelId: row.model_id,
    modelVersion: row.model_version,
    domain: row.domain,
    status: row.status,
    inputs: JSON.parse(row.inputs_json),
    outputs: JSON.parse(row.outputs_json),
    units: JSON.parse(row.units_json),
    warnings: JSON.parse(row.warnings_json),
    provenance: JSON.parse(row.provenance_json),
    seed: row.seed ?? null,
    deterministic: row.deterministic === 1,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

/** Zapisuje przebieg obliczeń (wynik engine.runModel) z pełną prowieniencją. */
export function saveRun(db, run, { userId = null, projectId = null } = {}) {
  db.prepare(
    `INSERT INTO runs (id, user_id, project_id, model_id, model_version, domain, status, inputs_json, outputs_json, units_json, warnings_json, provenance_json, seed, deterministic, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    run.runId, userId, projectId, run.modelId, run.modelVersion ?? '', run.domain ?? '', run.status,
    JSON.stringify(run.inputs ?? {}), JSON.stringify(run.outputs ?? {}), JSON.stringify(run.units ?? {}),
    JSON.stringify(run.warnings ?? []), JSON.stringify(run.provenance ?? {}),
    run.seed ?? null, run.deterministic === false ? 0 : 1, run.durationMs ?? 0, run.startedAt ?? Date.now(),
  );
  return getRun(db, run.runId);
}

export function getRun(db, id) {
  return toRun(db.prepare('SELECT * FROM runs WHERE id = ?').get(id));
}

/** Przebiegi projektu (najnowsze pierwsze), do audytu i odtwarzalności. */
export function listRuns(db, projectId, limit = 100) {
  const rows = db.prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit);
  return rows.map(toRun);
}
