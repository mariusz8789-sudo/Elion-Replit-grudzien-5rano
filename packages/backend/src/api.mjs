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
  listBranches,
  getBranch,
  createBranch,
  forkBranch,
  getMainBranch,
  createMergeRequest,
  getMergeRequest,
  listMergeRequests,
  decideMergeRequest,
  contributionGraph,
  saveRun,
  listRuns,
  createTarget,
  getTarget,
  listTargets,
  createCandidate,
  getCandidate,
  listCandidates,
} from './store.mjs';
import { hashPassword, verifyPassword, generateToken, validateRegistration } from './auth.mjs';
import { listModels, getModel, modelMetadata, runModel } from './compute/engine.mjs';
import { buildFabricContract, fabricRunEnvelope, validateFabricRunRequest } from './compute/experimentFabricContract.mjs';
import { listCapabilities } from './compute/capabilities.mjs';
import { buildCandidatePassport, rankCandidates } from './compute/drugDiscovery.mjs';
import { parseFormula, molecularWeight } from './compute/core.bundle.mjs';
import { runJob, requestCancel, enqueueJob } from './compute/jobs.mjs';
import { createJob, getJob, listJobs, updateJob } from './store.mjs';
import * as campaignStore from './campaign/persistence.mjs';
import { buildDiscoveryGraph } from './campaign/discoveryGraph.mjs';
import { listToolchain, getTool } from './campaign/toolchain.mjs';
import { listEndpoints } from './compute/admetAdapter.mjs';
import * as whyEngine from './campaign/why.mjs';
import { availableTransformations } from './campaign/drugAdapter.mjs';
import { probeEnvironment } from './compute/scienceEnv.mjs';
import { saveEnvAudit, latestEnvAudit, listScienceRuns,   getScienceRun,
  ingestKnowledgeMaterial,
  listKnowledgeMaterials,
  getKnowledgeMaterial,
  searchKnowledgeMaterials,
} from './store.mjs';
import { verifyScienceRun, getVerificationHistory } from './campaign/verify.mjs';
import { prepareKnowledgeUpload, tokenizeKnowledgeQuery } from './knowledgeIngestion.mjs';

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

  // ---- Backend Compute Engine (modele publiczne; run opcjonalnie utrwalany) ----
  if (seg[0] === 'compute') {
    if (seg[1] === 'capabilities' && seg.length === 2 && method === 'GET') return ok({ capabilities: listCapabilities() });
    if (seg[1] === 'models' && seg.length === 2 && method === 'GET') return ok({ models: listModels() });
    if (seg[1] === 'models' && seg.length === 3 && method === 'GET') {
      const m = getModel(seg[2]);
      return m ? ok({ model: modelMetadata(m) }) : err(404, 'not_found');
    }
    if (seg[1] === 'run' && seg.length === 2 && method === 'POST') return runComputeHandler(db, ctx, body);
    if (seg[1] === 'fabric' && seg[2] === 'contract' && seg.length === 3 && method === 'GET') return ok({ contract: buildFabricContract(listModels()) });
    if (seg[1] === 'fabric' && seg[2] === 'run' && seg.length === 3 && method === 'POST') return runFabricHandler(db, ctx, body);
    // Rejestr Toolchain (P6): status silników ustalony w runtime realną walidacją.
    if (seg[1] === 'toolchain' && seg.length === 2 && method === 'GET') return ok({ toolchain: listToolchain() });
    if (seg[1] === 'toolchain' && seg.length === 3 && method === 'GET') {
      const t = getTool(seg[2]);
      return t ? ok({ tool: t }) : err(404, 'not_found');
    }
    // Runtime scientific-environment audit (Priority 1): realna sonda + persystencja.
    if (seg[1] === 'environment' && seg.length === 2 && method === 'GET') return environmentHandler(db);
    // Katalog 52 endpointów ADMET-AI (kategoria, typ zadania, opublikowana metryka TDC).
    if (seg[1] === 'admet' && seg[2] === 'endpoints' && seg.length === 3 && method === 'GET') {
      const r = listEndpoints();
      return r.ok ? ok({ endpoints: r.endpoints }) : err(503, r.error ?? 'BLOCKED_BY_RUNTIME', r.reason);
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

    // /api/projects/:id/branches
    if (seg[2] === 'branches' && seg.length === 3) {
      if (method === 'GET') return ok({ branches: listBranches(db, projectId) });
      if (method === 'POST') return createBranchHandler(db, user, role, projectId, body);
      return err(405, 'method_not_allowed');
    }

    // /api/projects/:id/contributions
    if (seg[2] === 'contributions' && seg.length === 3 && method === 'GET') {
      return ok({ contributions: contributionGraph(db, projectId) });
    }

    // /api/projects/:id/runs — audytowalne przebiegi obliczeń projektu (viewer+)
    if (seg[2] === 'runs' && seg.length === 3 && method === 'GET') {
      return ok({ runs: listRuns(db, projectId) });
    }

    // ---- Knowledge Ingestion: artefakty użytkownika (viewer+ read, editor+ write) ----
    if (seg[2] === 'knowledge-materials') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ materials: listKnowledgeMaterials(db, projectId) });
        if (method === 'POST') return createKnowledgeMaterialHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 4 && seg[3] === 'search' && method === 'GET') {
        const query = String(ctx.query?.q ?? '').slice(0, 500);
        return ok({ materials: searchKnowledgeMaterials(db, projectId, tokenizeKnowledgeQuery(query)).map(knowledgeSearchResult) });
      }
      const material = getKnowledgeMaterial(db, projectId, seg[3], { includeText: false });
      if (!material) return err(404, 'not_found');
      if (seg.length === 4 && method === 'GET') return ok({ material });
      if (seg.length === 5 && seg[4] === 'content' && method === 'GET') {
        const original = getKnowledgeMaterial(db, projectId, seg[3], { includeOriginal: true });
        return ok({ material: original });
      }
      return err(405, 'method_not_allowed');
    }

    // ---- Drug Discovery (P6): cele, kandydaci, paszporty, ranking ----
    if (seg[2] === 'targets' && seg.length === 3) {
      if (method === 'GET') return ok({ targets: listTargets(db, projectId) });
      if (method === 'POST') return createTargetHandler(db, user, role, projectId, body);
      return err(405, 'method_not_allowed');
    }
    if (seg[2] === 'candidates') {
      if (seg.length === 3) {
        if (method === 'GET') {
          const targetId = typeof ctx.query?.targetId === 'string' ? ctx.query.targetId : null;
          return ok({ candidates: listCandidates(db, projectId, targetId) });
        }
        if (method === 'POST') return createCandidateHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      // /api/projects/:id/candidates/ranking
      if (seg.length === 4 && seg[3] === 'ranking' && method === 'GET') {
        const targetId = typeof ctx.query?.targetId === 'string' ? ctx.query.targetId : null;
        const passports = listCandidates(db, projectId, targetId).map((c) => buildCandidatePassport(c));
        return ok({ ranking: rankCandidates(passports) });
      }
      // /api/projects/:id/candidates/:cid/passport
      if (seg.length === 5 && seg[4] === 'passport' && method === 'GET') {
        const cand = getCandidate(db, seg[3]);
        if (!cand || cand.projectId !== projectId) return err(404, 'not_found');
        const target = cand.targetId ? getTarget(db, cand.targetId) : null;
        return ok({ passport: buildCandidatePassport(cand, target) });
      }
      return err(404, 'not_found');
    }

    // ---- Compute Jobs (P5): asynchroniczne zadania, np. wsadowa ocena kandydatów ----
    if (seg[2] === 'jobs') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ jobs: listJobs(db, projectId) });
        if (method === 'POST') return createJobHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 4) {
        const job = getJob(db, seg[3]);
        if (!job || job.projectId !== projectId) return err(404, 'not_found');
        if (method === 'GET') return ok({ job });
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 5 && seg[4] === 'cancel' && method === 'POST') {
        const job = getJob(db, seg[3]);
        if (!job || job.projectId !== projectId) return err(404, 'not_found');
        if (!atLeast(role, 'editor')) return err(403, 'forbidden');
        if (['completed', 'failed', 'cancelled'].includes(job.status)) return err(409, 'already_finished');
        requestCancel(job.id);
        return ok({ job: updateJob(db, job.id, { status: 'cancelled' }) });
      }
      return err(404, 'not_found');
    }

    // /api/projects/:id/merge-requests
    if (seg[2] === 'merge-requests') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ mergeRequests: listMergeRequests(db, projectId) });
        if (method === 'POST') return createMergeRequestHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      // /api/projects/:id/merge-requests/:mrid/decide
      if (seg.length === 4 && method === 'GET') {
        const mr = getMergeRequest(db, seg[3]);
        if (!mr || mr.projectId !== projectId) return err(404, 'not_found');
        return ok({ mergeRequest: mr });
      }
      if (seg.length === 5 && seg[4] === 'decide' && method === 'POST') {
        return decideMergeRequestHandler(db, user, role, projectId, seg[3], body);
      }
      return err(404, 'not_found');
    }

    // /api/projects/:id/trials
    if (seg[2] === 'trials') {
      if (seg.length === 3) {
        if (method === 'GET') {
          const experimentId = typeof ctx.query?.experimentId === 'string' ? ctx.query.experimentId : null;
          const branchId = typeof ctx.query?.branchId === 'string' ? ctx.query.branchId : null;
          return ok({ trials: listTrials(db, projectId, experimentId, branchId) });
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

    // ---- Scientific Acceleration Engine: kampanie naukowe (P1-P3, P10-P13) ----
    if (seg[2] === 'campaigns') {
      // /api/projects/:id/campaigns
      if (seg.length === 3) {
        if (method === 'GET') return ok({ campaigns: campaignStore.listCampaigns(db, projectId) });
        if (method === 'POST') return createCampaignHandler(db, user, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      const campaign = campaignStore.getCampaign(db, seg[3]);
      if (!campaign || campaign.projectId !== projectId) return err(404, 'not_found');
      const campaignId = campaign.id;

      // /api/projects/:id/campaigns/:cid — inspekcja (viewer+)
      if (seg.length === 4 && method === 'GET') return ok({ campaign: inspectCampaign(db, campaignId) });

      if (seg.length === 5) {
        // /api/projects/:id/campaigns/:cid/start (editor+) — uruchamia realny orchestrator w tle
        if (seg[4] === 'start' && method === 'POST') {
          if (!atLeast(role, 'editor')) return err(403, 'forbidden');
          if (!['created', 'cancelled'].includes(campaign.status)) return err(409, 'already_started', `Kampania jest w stanie ${campaign.status}.`);
          const job = createJob(db, { projectId, type: 'campaign-run', params: { campaignId }, createdBy: user.id });
          void enqueueJob(db, job.id);
          return ok({ campaign: campaignStore.getCampaign(db, campaignId), jobId: job.id }, 202);
        }
        // /api/projects/:id/campaigns/:cid/cancel (editor+)
        if (seg[4] === 'cancel' && method === 'POST') {
          if (!atLeast(role, 'editor')) return err(403, 'forbidden');
          campaignStore.updateCampaign(db, campaignId, { status: 'cancelled', stopReason: 'CANCELLED_BY_USER' });
          return ok({ campaign: campaignStore.getCampaign(db, campaignId) });
        }
        // /api/projects/:id/campaigns/:cid/stage (editor+) — uruchamia etap ciężki (docking/QM)
        if (seg[4] === 'stage' && method === 'POST') {
          if (!atLeast(role, 'editor')) return err(403, 'forbidden');
          if (campaign.status !== 'completed') return err(409, 'campaign_not_completed', 'Etapy multi-fidelity wymagają zakończonej kampanii bazowej.');
          const job = createJob(db, { projectId, type: 'campaign-stage', params: { campaignId, config: sanitizeStageConfig(body) }, createdBy: user.id });
          void enqueueJob(db, job.id);
          return ok({ jobId: job.id }, 202);
        }
        if (method !== 'GET') return err(405, 'method_not_allowed');
        // Odczyty (viewer+): kandydaci, decyzje, zdarzenia, graf, dlaczego, ciężkie przebiegi, konflikty
        if (seg[4] === 'candidates') {
          const gen = ctx.query?.generation != null ? Number(ctx.query.generation) : null;
          return ok({ candidates: campaignStore.listCandidates(db, campaignId, Number.isFinite(gen) ? gen : null) });
        }
        if (seg[4] === 'decisions') return ok({ decisions: campaignStore.listDecisions(db, campaignId) });
        if (seg[4] === 'events') return ok({ events: campaignStore.listEvents(db, campaignId) });
        if (seg[4] === 'graph') return ok({ graph: buildDiscoveryGraph(db, campaignId) });
        if (seg[4] === 'why') return whyHandler(db, campaignId, ctx.query ?? {});
        if (seg[4] === 'science-runs') return ok({ scienceRuns: listScienceRuns(db, campaignId) });
        if (seg[4] === 'conflicts') {
          const conflicts = campaignStore.listEvents(db, campaignId).filter((e) => e.type === 'MODEL_CONFLICT').map((e) => e.payload);
          return ok({ conflicts });
        }
        return err(404, 'not_found');
      }
      // /api/projects/:id/campaigns/:cid/science-runs/:runId[/verify|/verifications]
      if (seg.length >= 6 && seg[4] === 'science-runs') {
        const run = getScienceRun(db, seg[5]);
        if (!run || run.campaignId !== campaignId) return err(404, 'not_found');
        if (seg.length === 6 && method === 'GET') return ok({ scienceRun: run });
        if (seg.length === 7 && seg[6] === 'verify' && method === 'POST') {
          // Editor+: replays the real engine (costs real compute — e.g. an ADMET-AI model reload).
          if (!atLeast(role, 'editor')) return err(403, 'forbidden');
          const v = verifyScienceRun(db, run.id);
          if (!v.ok) return err(404, 'not_found', v.error);
          return ok({ verification: v.verification }, 201);
        }
        if (seg.length === 7 && seg[6] === 'verifications' && method === 'GET') {
          return ok({ verifications: getVerificationHistory(db, run.id) });
        }
        return err(404, 'not_found');
      }
      return err(404, 'not_found');
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

/* ---------------- Handlery Knowledge Ingestion ---------------- */

function knowledgeSearchResult(material) {
  const text = String(material.extractedText ?? '');
  return {
    ...material,
    extractedText: undefined,
    excerpt: text.length > 900 ? `${text.slice(0, 900)}\n…(przycięte)` : text,
  };
}

function createKnowledgeMaterialHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Dodawanie materiałów wymaga roli editor lub wyższej.');
  const prepared = prepareKnowledgeUpload(body);
  if (!prepared.ok) return err(400, prepared.error, prepared.message);
  const material = ingestKnowledgeMaterial(db, { projectId, uploadedBy: user.id, material: prepared.value });
  return ok({ material }, 201);
}

/* ---------------- Handlery prób ---------------- */

function createTrialHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Zapis prób wymaga roli editor lub wyższej.');
  const experimentId = String(body.experimentId ?? '').trim().slice(0, 80);
  if (!experimentId) return err(400, 'invalid_trial', 'Brak experimentId.');
  const count = listTrials(db, projectId, experimentId).length;
  if (count >= MAX_TRIALS_PER_EXPERIMENT) return err(409, 'trial_limit', 'Osiągnięto limit prób dla tego eksperymentu.');
  const status = TRIAL_STATUSES.has(body.status) ? body.status : 'draft';
  // Gałąź docelowa: podana i należąca do projektu, inaczej 'main'.
  let branchId = null;
  if (typeof body.branchId === 'string') {
    const b = getBranch(db, body.branchId);
    if (!b || b.projectId !== projectId) return err(400, 'invalid_branch', 'Gałąź nie należy do tego projektu.');
    branchId = b.id;
  }
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
    branchId,
  });
  return ok({ trial }, 201);
}

/* ---------------- Handlery Scientific Git ---------------- */

function createBranchHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Tworzenie gałęzi wymaga roli editor lub wyższej.');
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name || name === 'main') return err(400, 'invalid_branch', 'Podaj nazwę gałęzi (inną niż „main").');
  // Baza odgałęzienia: podana i z tego projektu, inaczej 'main'.
  let base = getMainBranch(db, projectId);
  if (typeof body.baseBranchId === 'string') {
    const b = getBranch(db, body.baseBranchId);
    if (!b || b.projectId !== projectId) return err(400, 'invalid_branch', 'Gałąź bazowa nie należy do tego projektu.');
    base = b;
  }
  try {
    // fork=true kopiuje próby gałęzi bazowej (z rodowodem); inaczej pusta gałąź.
    const branch = body.fork
      ? forkBranch(db, { projectId, name, baseBranchId: base.id, createdBy: user.id })
      : createBranch(db, { projectId, name, baseBranchId: base.id, createdBy: user.id });
    return ok({ branch }, 201);
  } catch (e) {
    if (String(e?.message).includes('branch_exists')) return err(409, 'branch_exists', 'Gałąź o tej nazwie już istnieje.');
    throw e;
  }
}

function createMergeRequestHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Zgłoszenie scalenia wymaga roli editor lub wyższej.');
  const source = getBranch(db, String(body.sourceBranchId ?? ''));
  const target = getBranch(db, String(body.targetBranchId ?? ''));
  if (!source || source.projectId !== projectId || !target || target.projectId !== projectId) {
    return err(400, 'invalid_branch', 'Obie gałęzie muszą należeć do tego projektu.');
  }
  if (source.id === target.id) return err(400, 'invalid_branch', 'Gałąź źródłowa i docelowa muszą się różnić.');
  const title = String(body.title ?? '').trim().slice(0, 160) || `Scal ${source.name} → ${target.name}`;
  const mr = createMergeRequest(db, {
    projectId, sourceBranchId: source.id, targetBranchId: target.id,
    title, description: String(body.description ?? '').slice(0, 4000), createdBy: user.id,
  });
  return ok({ mergeRequest: mr }, 201);
}

function decideMergeRequestHandler(db, user, role, projectId, mrId, body) {
  // Recenzja i scalanie to decyzja o wpuszczeniu wyników do wspólnej linii —
  // wymaga admin+ (nie sam autor może zatwierdzić swoje zmiany do main).
  if (!atLeast(role, 'admin')) return err(403, 'forbidden', 'Zatwierdzanie/odrzucanie scaleń wymaga roli admin lub owner.');
  const mr = getMergeRequest(db, mrId);
  if (!mr || mr.projectId !== projectId) return err(404, 'not_found');
  if (mr.status !== 'open') return err(409, 'already_decided', 'To zgłoszenie zostało już rozpatrzone.');
  const decided = decideMergeRequest(db, mrId, {
    approve: Boolean(body.approve),
    deciderId: user.id,
    reviewNote: String(body.reviewNote ?? '').slice(0, 2000),
  });
  return ok({ mergeRequest: decided });
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

/* ---------------- Handlery Kampanii Naukowej (Scientific Acceleration Engine) ---------------- */

const CAMPAIGN_MAX_GENERATIONS = 8; // twardy limit zasobów API (P14): brak nieskończonych pętli
const CAMPAIGN_MAX_CANDIDATES = 400;

/** POST /api/projects/:id/campaigns — tworzy (utrwala) kampanię. Editor+. */
function createCampaignHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Tworzenie kampanii wymaga roli editor lub wyższej.');
  const objective = String(body.objective ?? '').trim();
  if (!objective) return err(400, 'invalid_objective', 'Podaj cel kampanii.');
  const domain = String(body.domain ?? 'DRUG_DISCOVERY');
  if (domain !== 'DRUG_DISCOVERY') return err(400, 'unsupported_domain', 'Jedyny zweryfikowany adapter to DRUG_DISCOVERY; inne domeny to jawne luki zdolności.');
  const starting = Array.isArray(body.startingSmiles) ? body.startingSmiles.filter((s) => typeof s === 'string' && s.length).slice(0, 32) : [];
  if (starting.length === 0) return err(400, 'invalid_starting', 'Podaj co najmniej jedną molekułę startową (SMILES).');

  // Twarde limity zasobów — kampania nie może zażądać nieograniczonych obliczeń.
  const maxGenerations = clampInt(body.budget?.maxGenerations, 1, CAMPAIGN_MAX_GENERATIONS, 4);
  const maxGeneratedCandidates = clampInt(body.budget?.maxGeneratedCandidates, 1, CAMPAIGN_MAX_CANDIDATES, 120);
  const tx = availableTransformations();
  const weights = tx.map((t) => [t, 1]);

  const campaign = campaignStore.createCampaign(db, {
    projectId, objective, domain,
    budget: { maxGenerations, maxGeneratedCandidates },
    stopping: { patience: 2, minImprovement: 1e-3, diversityFloor: 0.12 },
    strategy: { startingSmiles: starting, transformationWeights: Object.fromEntries(weights), parentSelection: 'pareto' },
    createdBy: user.id,
  });
  return ok({ campaign }, 201);
}

function clampInt(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/** Waliduje konfigurację etapu multi-fidelity z API (twarde limity zasobów, P14/P16). */
function sanitizeStageConfig(body) {
  const cfg = {};
  if (body?.docking?.enabled) {
    const r = body.docking.receptor ?? {};
    cfg.docking = {
      enabled: true,
      budget: clampInt(body.docking.budget, 1, 8, 2),
      mode: ['pareto', 'diverse', 'explicit'].includes(body.docking.mode) ? body.docking.mode : 'pareto',
      receptor: {
        // Tylko SMILES zastępnika lub gotowy PDBQT — brak wstrzykiwania dowolnych ścieżek.
        receptorSmiles: typeof r.receptorSmiles === 'string' ? r.receptorSmiles.slice(0, 200) : 'c1ccc2[nH]ccc2c1',
        center: Array.isArray(r.center) ? r.center.slice(0, 3).map(Number) : [0, 0, 0],
        exhaustiveness: clampInt(r.exhaustiveness, 1, 16, 8),
        nPoses: clampInt(r.nPoses, 1, 10, 5),
      },
    };
  }
  if (body?.quantum?.enabled) {
    cfg.quantum = {
      enabled: true,
      budget: clampInt(body.quantum.budget, 1, 4, 1),
      mode: ['pareto', 'diverse'].includes(body.quantum.mode) ? body.quantum.mode : 'pareto',
      method: ['RHF', 'RKS'].includes(body.quantum.method) ? body.quantum.method : 'RHF',
      basis: typeof body.quantum.basis === 'string' ? body.quantum.basis.slice(0, 20) : 'sto-3g',
    };
  }
  if (body?.admet?.enabled) {
    cfg.admet = { enabled: true, thresholds: sanitizeAdmetThresholds(body.admet.thresholds) };
  }
  return cfg;
}

/** Waliduje progi ADMET/toksyczności: tylko realne endpointy z rejestru, liczby skończone. */
function sanitizeAdmetThresholds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const r = listEndpoints();
  if (!r.ok) return null;
  const validIds = new Set(r.endpoints.map((e) => e.id));
  const out = {};
  for (const [endpointId, rule] of Object.entries(raw)) {
    if (!validIds.has(endpointId) || !rule || typeof rule !== 'object') continue;
    const clean = {};
    if (Number.isFinite(rule.max)) clean.max = Number(rule.max);
    if (Number.isFinite(rule.min)) clean.min = Number(rule.min);
    if (Object.keys(clean).length > 0) out[endpointId] = clean;
    if (Object.keys(out).length >= 20) break; // twardy limit liczby progów na żądanie
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Inspekcja kampanii: stan + policzalne z utrwalonych danych metryki. */
function inspectCampaign(db, campaignId) {
  const campaign = campaignStore.getCampaign(db, campaignId);
  const cands = campaignStore.listCandidates(db, campaignId);
  const decisions = campaignStore.listDecisions(db, campaignId);
  const events = campaignStore.listEvents(db, campaignId);
  const retained = cands.filter((c) => c.status === 'retained');
  const rejected = cands.filter((c) => c.status === 'rejected');
  const duplicates = cands.filter((c) => c.rejectedReason === 'duplicate');
  const pareto = retained.filter((c) => c.pareto);
  const lastGenEvent = [...events].reverse().find((e) => e.type === 'GENERATION_COMPLETED');
  const lastDecision = decisions[decisions.length - 1] ?? null;
  return {
    ...campaign,
    stats: {
      candidatesGenerated: cands.length,
      valid: cands.filter((c) => c.valid).length,
      invalid: cands.filter((c) => !c.valid).length,
      duplicates: duplicates.length,
      rejected: rejected.length,
      retained: retained.length,
      paretoFront: pareto.length,
      decisions: decisions.length,
      diversity: lastGenEvent?.payload?.diversity ?? null,
      hypervolume: lastGenEvent?.payload?.hypervolume ?? null,
    },
    lastDecision: lastDecision ? { generation: lastDecision.generation, decision: lastDecision.decision, purpose: lastDecision.purpose } : null,
  };
}

/** GET /api/projects/:id/campaigns/:cid/why?kind=..&candidate=..&generation=.. */
function whyHandler(db, campaignId, query) {
  const kind = String(query.kind ?? '');
  const candidateId = typeof query.candidate === 'string' ? query.candidate : null;
  const generation = query.generation != null ? Number(query.generation) : null;
  switch (kind) {
    case 'candidate': return ok({ why: whyEngine.whyCandidate(db, candidateId) });
    case 'status': return ok({ why: whyEngine.whyStatus(db, candidateId) });
    case 'pareto': return ok({ why: whyEngine.whyPareto(db, candidateId) });
    case 'engine': return ok({ why: whyEngine.whichEngine(db, candidateId) });
    case 'strategy': return ok({ why: whyEngine.whyStrategyChange(db, campaignId, generation) });
    case 'next-experiment': return ok({ why: whyEngine.whyNextExperiment(db, campaignId, generation) });
    case 'stop': return ok({ why: whyEngine.whyStop(db, campaignId) });
    case 'stage-selection': return ok({ why: whyEngine.whyStageSelection(db, campaignId, candidateId) });
    case 'conflict': return ok({ why: whyEngine.whyConflict(db, campaignId, candidateId) });
    default: return err(400, 'invalid_kind', 'kind ∈ {candidate,status,pareto,engine,strategy,next-experiment,stop,stage-selection,conflict}');
  }
}

/**
 * GET /api/compute/environment — realna sonda runtime (Priority 1). Persystuje
 * audyt, jeśli brak lub starszy niż 1h (append-only). Zwraca środowisko + engines.
 */
function environmentHandler(db) {
  const probe = probeEnvironment();
  if (!probe.ok) return err(503, 'probe_failed', probe.error);
  const last = latestEnvAudit(db);
  const stale = !last || Date.now() - last.createdAt > 3_600_000;
  const audit = stale ? saveEnvAudit(db, { runtime: probe.runtime, engines: probe.engines }) : last;
  return ok({ environment: { runtime: probe.runtime, engines: probe.engines }, auditId: audit.id, auditedAt: audit.createdAt });
}

/* ---------------- Handler backendowego silnika obliczeniowego ---------------- */

const RUN_STATUS_TO_HTTP = { ok: 200, rejected: 400, error: 500 };

/**
 * POST /api/compute/run — wykonuje model na serwerze z pełną prowieniencją.
 * Body: { modelId, inputs, seed?, projectId? }. Jeśli podano projectId ORAZ
 * użytkownik jest zalogowany z rolą editor+ w tym projekcie, przebieg zostaje
 * TRWALE zapisany (audytowalny, odtwarzalny). Bez kontekstu projektu run jest
 * efemeryczny (persisted:false) — sam wynik i tak wraca.
 */
function runFabricHandler(db, ctx, body) {
  const validation = validateFabricRunRequest(body);
  if (!validation.ok) return err(400, 'invalid_fabric_request', validation.errors.join(' '));
  const delegated = runComputeHandler(db, ctx, body);
  // Preserve authentication / RBAC errors from the established compute route.
  if (!delegated.body?.run) return delegated;
  return {
    status: delegated.status,
    body: fabricRunEnvelope(body, delegated.body.run, delegated.body.persisted),
  };
}

function runComputeHandler(db, ctx, body) {
  const modelId = String(body.modelId ?? '');
  const seed = typeof body.seed === 'number' && Number.isFinite(body.seed) ? body.seed : null;
  const run = runModel(modelId, body.inputs, { seed });

  let persisted = false;
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  if (run.status === 'ok' && projectId) {
    const user = getUserByToken(db, ctx.token);
    if (!user) return err(401, 'unauthorized', 'Zaloguj się, aby zapisać przebieg w projekcie.');
    const project = getProject(db, projectId);
    const role = project ? getRole(db, projectId, user.id) : null;
    if (!project || !role) return err(404, 'not_found');
    if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Zapis przebiegu wymaga roli editor lub wyższej.');
    saveRun(db, run, { userId: user.id, projectId });
    persisted = true;
  }

  return { status: RUN_STATUS_TO_HTTP[run.status] ?? 200, body: { run, persisted } };
}

/* ---------------- Handler zadań obliczeniowych (P5) ---------------- */

const JOB_TYPES = new Set(['batch-candidate-eval']);

function createJobHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Uruchomienie zadania wymaga roli editor lub wyższej.');
  const type = String(body.type ?? '');
  if (!JOB_TYPES.has(type)) return err(400, 'invalid_job_type', `Nieznany typ zadania „${type}".`);
  const params = typeof body.params === 'object' && body.params ? body.params : {};
  const job = createJob(db, { projectId, type, params, createdBy: user.id });
  // Wykonanie asynchroniczne — odpowiedź wraca natychmiast z zadaniem 'queued'.
  setImmediate(() => { void runJob(db, job.id); });
  return ok({ job }, 201);
}

/* ---------------- Handlery Drug Discovery ---------------- */

function createTargetHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Definiowanie celu wymaga roli editor lub wyższej.');
  const name = String(body.name ?? '').trim().slice(0, 160);
  if (!name) return err(400, 'invalid_target', 'Podaj nazwę celu biologicznego.');
  const s = (v, n = 400) => String(v ?? '').slice(0, n);
  const target = createTarget(db, {
    projectId, name,
    targetType: s(body.targetType, 80), geneProtein: s(body.geneProtein, 120), organism: s(body.organism, 120),
    indication: s(body.indication, 200), mechanism: s(body.mechanism, 400), constraints: s(body.constraints, 1000),
    evidenceStatus: ['unverified', 'literature', 'experimental'].includes(body.evidenceStatus) ? body.evidenceStatus : 'unverified',
    provenance: s(body.provenance, 400), createdBy: user.id,
  });
  return ok({ target }, 201);
}

function createCandidateHandler(db, user, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Dodanie kandydata wymaga roli editor lub wyższej.');
  const label = String(body.label ?? '').trim().slice(0, 160) || 'Kandydat';
  const formula = String(body.formula ?? '').trim().slice(0, 120);
  // Realna cheminformatyka przy zapisie: skład + masa molowa (jeśli wzór poprawny).
  let composition = {};
  let mw = null;
  if (formula) {
    const parsed = parseFormula(formula);
    if (!parsed.ok) return err(400, 'invalid_formula', parsed.error);
    composition = parsed.counts;
    mw = molecularWeight(composition);
  }
  const targetId = typeof body.targetId === 'string' ? body.targetId : null;
  if (targetId) {
    const t = getTarget(db, targetId);
    if (!t || t.projectId !== projectId) return err(400, 'invalid_target', 'Cel nie należy do tego projektu.');
  }
  const candidate = createCandidate(db, {
    projectId, targetId, label, formula, smiles: String(body.smiles ?? '').slice(0, 500),
    composition, molecularWeight: mw,
    charge: typeof body.charge === 'number' && Number.isFinite(body.charge) ? Math.trunc(body.charge) : 0,
    parentId: typeof body.parentId === 'string' ? body.parentId.slice(0, 80) : null,
    generationMethod: String(body.generationMethod ?? 'manual').slice(0, 80),
    provenance: String(body.provenance ?? '').slice(0, 400), createdBy: user.id,
  });
  return ok({ candidate }, 201);
}
