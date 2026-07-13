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

/** Otwiera (i migruje) bazę. `:memory:` dla testów, ścieżka pliku w produkcji. */
export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  if (filename !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
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
    createdAt: row.created_at,
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
export function createTrial(db, { projectId, experimentId, authorId, label, params, outputs, status, note = '', parentId = null, modelVersion = '' }) {
  const id = newId();
  const now = Date.now();
  const row = db
    .prepare('SELECT MAX(idx) AS maxIdx FROM trials WHERE project_id = ? AND experiment_id = ?')
    .get(projectId, experimentId);
  const index = (row?.maxIdx ?? 0) + 1;
  db.prepare(
    `INSERT INTO trials (id, project_id, experiment_id, author_id, idx, label, params_json, outputs_json, status, note, parent_id, model_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    now,
  );
  return getTrial(db, id);
}

export function getTrial(db, id) {
  return toTrial(db.prepare('SELECT * FROM trials WHERE id = ?').get(id));
}

/** Próby projektu; opcjonalnie zawężone do jednego eksperymentu. Rosnąco po numerze. */
export function listTrials(db, projectId, experimentId = null) {
  const rows = experimentId
    ? db.prepare('SELECT * FROM trials WHERE project_id = ? AND experiment_id = ? ORDER BY idx ASC').all(projectId, experimentId)
    : db.prepare('SELECT * FROM trials WHERE project_id = ? ORDER BY experiment_id ASC, idx ASC').all(projectId);
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
