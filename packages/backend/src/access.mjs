/**
 * Genesis product/access layer.
 * Access levels are product policy; scientific computation remains in compute/engine.
 */
import { newId } from './auth.mjs';

const LEVELS = new Set(['PUBLIC', 'RESEARCH', 'RESTRICTED']);

export function ensureAccessSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_access (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK (level IN ('PUBLIC','RESEARCH','RESTRICTED')),
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS access_audit (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      access_level TEXT NOT NULL,
      workflow TEXT NOT NULL,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      run_id TEXT,
      result_status TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_audit_project ON access_audit(project_id, created_at DESC);
  `);
}

function normalizeLevel(level) {
  return LEVELS.has(level) ? level : null;
}

export function accessLevelForProject(db, projectId, projectVisibility = 'private') {
  const row = db.prepare('SELECT level FROM project_access WHERE project_id = ?').get(projectId);
  return normalizeLevel(row?.level) ?? (projectVisibility === 'public' ? 'PUBLIC' : 'RESEARCH');
}

export function setProjectAccess(db, { projectId, level, userId }) {
  const normalized = normalizeLevel(level);
  if (!normalized) return { ok: false, error: 'invalid_access_level' };
  const now = Date.now();
  db.prepare(`INSERT INTO project_access (project_id, level, updated_by, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET level=excluded.level, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
    .run(projectId, normalized, userId ?? null, now);
  return { ok: true, level: normalized, updatedAt: now };
}

export function canUseAccessLevel(level, role, operation) {
  if (level === 'PUBLIC') return operation === 'read' || operation === 'run';
  if (level === 'RESEARCH') return Boolean(role);
  return role === 'owner' || role === 'admin' || (operation === 'read' && role === 'editor');
}

export function appendAccessAudit(db, { projectId = null, userId = null, action, accessLevel, workflow, sourceIds = [], runId = null, resultStatus = null, details = {} }) {
  const id = newId();
  db.prepare(`INSERT INTO access_audit (id, project_id, user_id, action, access_level, workflow, source_ids_json, run_id, result_status, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, userId, String(action).slice(0, 120), accessLevel, String(workflow).slice(0, 120), JSON.stringify(sourceIds.slice(0, 32)), runId, resultStatus, JSON.stringify(details), Date.now());
  return id;
}

export function listAccessAudit(db, projectId, limit = 100) {
  return db.prepare(`SELECT * FROM access_audit WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`).all(projectId, Math.min(Math.max(Number(limit) || 100, 1), 200)).map((row) => ({
    id: row.id, projectId: row.project_id, userId: row.user_id, action: row.action, accessLevel: row.access_level,
    workflow: row.workflow, sourceIds: JSON.parse(row.source_ids_json), runId: row.run_id, resultStatus: row.result_status,
    details: JSON.parse(row.details_json), createdAt: row.created_at,
  }));
}

export { LEVELS };
