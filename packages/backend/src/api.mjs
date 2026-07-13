/**
 * Genesis OS — backend: router API trwałości (Milestone 1: Backend Persistence).
 *
 * Czysta funkcja `handleApi(db, ctx)` → `{ status, body }`. Zero gniazd, zero
 * strumieni — server.mjs odczytuje ciało żądania i nagłówek autoryzacji, po
 * czym woła ten router. Dzięki temu CAŁA logika API (routing, uwierzytelnianie,
 * uprawnienia RBAC, walidacja) jest testowalna przez `node --test` bez
 * podnoszenia serwera HTTP.
 *
 * Kontrakt uprawnień (egzekwowany, nie pozorny):
 *  - odczyt prób/projektu: viewer+
 *  - zapis/edycja/usunięcie prób: editor+
 *  - zarządzanie członkami: admin+
 * Endpoint zwraca 401 bez ważnego tokenu, 403 przy zbyt niskiej roli, 404 gdy
 * użytkownik nie jest członkiem projektu (nie wyciekamy jego istnienia).
 *
 * Transport tokenu: nagłówek `Authorization: Bearer <token>` (standard, działa
 * dla dowolnego klienta API — przeglądarka, skrypt uczelniany, pipeline CI).
 */

import {
  atLeast,
  ROLES,
  createUser,
  getUserByEmail,
  getPasswordHash,
  createSession,
  getUserByToken,
  deleteSession,
  createProject,
  getProject,
  listProjectsForUser,
  getRole,
  setMember,
  listMembers,
  createTrial,
  listTrials,
  getTrial,
  updateTrial,
  deleteTrial,
} from './store.mjs';
import { hashPassword, verifyPassword, generateToken, validateRegistration } from './auth.mjs';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni
const MAX_TRIALS_PER_EXPERIMENT = 500; // ochrona przed nadużyciem pojedynczego projektu
const TRIAL_STATUSES = new Set(['baseline', 'draft', 'promising', 'failed']);

const ok = (body, status = 200) => ({ status, body });
const err = (status, error, message) => ({ status, body: { error, ...(message ? { message } : {}) } });

/** Płaski słownik liczb skończonych — parametry/wyjścia próby nigdy nie są zagnieżdżone. */
function sanitizeNumberMap(obj, maxKeys = 64) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, maxKeys)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[String(k).slice(0, 80)] = v;
  }
  return out;
}

/**
 * @param db  otwarta baza (store.mjs)
 * @param ctx { method, pathname, token, body }  body już sparsowane (obiekt) lub null
 */
export function handleApi(db, ctx) {
  const { method, pathname } = ctx;
  const body = ctx.body ?? {};
  const seg = pathname.replace(/^\/api\//, '').replace(/\/+$/, '').split('/'); // np. ['projects','ID','trials']

  // ---- Uwierzytelnianie (bez tokenu) ----
  if (seg[0] === 'auth') {
    if (seg[1] === 'register' && method === 'POST') return register(db, body);
    if (seg[1] === 'login' && method === 'POST') return login(db, body);
    if (seg[1] === 'logout' && method === 'POST') {
      if (ctx.token) deleteSession(db, ctx.token);
      return ok({ ok: true });
    }
    if (seg[1] === 'me' && method === 'GET') {
      const user = getUserByToken(db, ctx.token);
      return user ? ok({ user }) : err(401, 'unauthorized');
    }
    return err(404, 'not_found');
  }

  // ---- Od tego miejsca wymagany ważny token ----
  const user = getUserByToken(db, ctx.token);
  if (!user) return err(401, 'unauthorized', 'Zaloguj się, aby korzystać z trwałych projektów.');

  if (seg[0] === 'projects') {
    // /api/projects
    if (seg.length === 1) {
      if (method === 'GET') return ok({ projects: listProjectsForUser(db, user.id) });
      if (method === 'POST') return createProjectHandler(db, user, body);
      return err(405, 'method_not_allowed');
    }
    const projectId = seg[1];
    const project = getProject(db, projectId);
    const role = project ? getRole(db, projectId, user.id) : null;
    // Brak członkostwa → 404 (nie ujawniamy istnienia cudzego projektu).
    if (!project || !role) return err(404, 'not_found');

    // /api/projects/:id
    if (seg.length === 2 && method === 'GET') return ok({ project: { ...project, role } });

    // /api/projects/:id/members
    if (seg[2] === 'members' && seg.length === 3) {
      if (method === 'GET') return ok({ members: listMembers(db, projectId) });
      if (method === 'POST') return addMemberHandler(db, role, projectId, body);
      return err(405, 'method_not_allowed');
    }

    // /api/projects/:id/trials
    if (seg[2] === 'trials') {
      if (seg.length === 3) {
        if (method === 'GET') {
          const experimentId = typeof ctx.query?.experimentId === 'string' ? ctx.query.experimentId : null;
          return ok({ trials: listTrials(db, projectId, experimentId) });
        }
        if (method === 'POST') return createTrialHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      // /api/projects/:id/trials/:tid
      if (seg.length === 4) {
        const trialId = seg[3];
        const trial = getTrial(db, trialId);
        if (!trial || trial.projectId !== projectId) return err(404, 'not_found');
        if (method === 'PATCH') return updateTrialHandler(db, role, trialId, body);
        if (method === 'DELETE') return deleteTrialHandler(db, role, trialId);
        return err(405, 'method_not_allowed');
      }
    }
    return err(404, 'not_found');
  }

  return err(404, 'not_found');
}

/* ---------------- Handlery uwierzytelniania ---------------- */

function issueSession(db, user) {
  const token = generateToken();
  createSession(db, { userId: user.id, token, ttlMs: SESSION_TTL_MS });
  return ok({ token, user, expiresInMs: SESSION_TTL_MS }, 201);
}

function register(db, body) {
  const v = validateRegistration(body);
  if (!v.ok) return err(400, 'invalid_registration', v.error);
  if (getUserByEmail(db, v.value.email)) return err(409, 'email_taken', 'Konto z tym adresem już istnieje.');
  const user = createUser(db, {
    email: v.value.email,
    displayName: v.value.displayName,
    passwordHash: hashPassword(v.value.password),
  });
  return issueSession(db, user);
}

function login(db, body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const user = getUserByEmail(db, email);
  // Ten sam komunikat dla „brak konta" i „złe hasło" — brak wycieku, kto ma konto.
  if (!user || !verifyPassword(password, getPasswordHash(db, user.id))) {
    return err(401, 'invalid_credentials', 'Nieprawidłowy e-mail lub hasło.');
  }
  return issueSession(db, user);
}

/* ---------------- Handlery projektów / RBAC ---------------- */

function createProjectHandler(db, user, body) {
  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return err(400, 'invalid_project', 'Podaj nazwę projektu.');
  const description = String(body.description ?? '').slice(0, 2000);
  const visibility = body.visibility === 'public' ? 'public' : 'private';
  const project = createProject(db, { name, description, ownerId: user.id, visibility });
  return ok({ project }, 201);
}

function addMemberHandler(db, role, projectId, body) {
  if (!atLeast(role, 'admin')) return err(403, 'forbidden', 'Zarządzanie członkami wymaga roli admin lub owner.');
  const targetRole = String(body.role ?? '');
  if (!ROLES.includes(targetRole)) return err(400, 'invalid_role');
  const email = String(body.email ?? '').trim().toLowerCase();
  const target = getUserByEmail(db, email);
  if (!target) return err(404, 'user_not_found', 'Nie ma użytkownika o tym adresie.');
  // Tylko owner może nadać/odebrać rolę owner (ochrona przed przejęciem projektu).
  if (targetRole === 'owner' && role !== 'owner') return err(403, 'forbidden', 'Tylko właściciel może nadać rolę owner.');
  setMember(db, { projectId, userId: target.id, role: targetRole });
  return ok({ members: listMembers(db, projectId) });
}

/* ---------------- Handlery prób ---------------- */

function createTrialHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Zapis prób wymaga roli editor lub wyższej.');
  const experimentId = String(body.experimentId ?? '').trim().slice(0, 80);
  if (!experimentId) return err(400, 'invalid_trial', 'Brak experimentId.');
  const count = listTrials(db, projectId, experimentId).length;
  if (count >= MAX_TRIALS_PER_EXPERIMENT) return err(409, 'trial_limit', 'Osiągnięto limit prób dla tego eksperymentu.');
  const status = TRIAL_STATUSES.has(body.status) ? body.status : 'draft';
  const trial = createTrial(db, {
    projectId,
    experimentId,
    authorId: user.id,
    label: String(body.label ?? '').slice(0, 200),
    params: sanitizeNumberMap(body.params),
    outputs: sanitizeNumberMap(body.outputs),
    status,
    note: String(body.note ?? '').slice(0, 2000),
    parentId: typeof body.parentId === 'string' ? body.parentId.slice(0, 80) : null,
    modelVersion: String(body.modelVersion ?? '').slice(0, 80),
  });
  return ok({ trial }, 201);
}

function updateTrialHandler(db, role, trialId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Edycja prób wymaga roli editor lub wyższej.');
  const patch = {};
  if (body.label !== undefined) patch.label = String(body.label);
  if (body.status !== undefined) {
    if (!TRIAL_STATUSES.has(body.status)) return err(400, 'invalid_status');
    patch.status = body.status;
  }
  if (body.note !== undefined) patch.note = String(body.note);
  return ok({ trial: updateTrial(db, trialId, patch) });
}

function deleteTrialHandler(db, role, trialId) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Usunięcie próby wymaga roli editor lub wyższej.');
  deleteTrial(db, trialId);
  return ok({ ok: true });
}
