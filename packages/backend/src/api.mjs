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
  getUserById,
  loginLockState,
  recordLoginFailure,
  clearLoginAttempts,
  getCampaignRow,
  upsertCampaign,
  deleteCampaignRow,
  getCampaignRowById,
  addCampaignMember,
  getCampaignMember,
  listCampaignMembers,
  removeCampaignMember,
  resolveCampaignRole,
  createCampaignInvite,
  getCampaignInvite,
  getCampaignInviteByToken,
  listCampaignInvites,
  deleteCampaignInvite,
  claimInvitesForUser,
  getSnapshot,
  getLatestSnapshot,
  listCampaignSnapshots,
  insertCampaignComment,
  getCampaignComment,
  listCampaignComments,
  resolveCampaignComment,
  listAccessibleCampaigns,
  getCampaignRollupAggregates,
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
import {
  ensureReviewSchema, submitReview, reviewsForEdge, edgeStatus, edgeStatuses,
  reviewWorklist as edgeReviewWorklist, reviewerCredit, contributors,
  reviewCoverage, upsertReviewerProfile, getReviewerProfile, VERDICTS,
} from './edgeReview.mjs';
import {
  ensureReasoningSchema, seedGraphSnapshot, currentSnapshot, snapshotEdges,
  orphanReviews, recordEvidence, listEvidence, retireEvidence, shareEvidence,
  getArtifact, listArtifacts, replayHistory,
} from './reasoning/store.mjs';
import { resolveTenant } from './reasoning/tenancy.mjs';
import {
  seedClaimsFromSnapshot, liveClaims, claimState, claimHistory, reviseClaim,
  retireClaim, detectContradictions, resolveContradiction, confidenceTimeline,
} from './reasoning/livingGraph.mjs';
import { buryHypothesis, assessHypothesis, exhume, listGraves, lessons } from './reasoning/graveyard.mjs';
import { runAndRecord } from './reasoning/discoveryEngine.mjs';
import { GRAPH_NODES, GRAPH_EDGES } from '@genesis-os/reasoning/knowledgeGraph';
import { gradeEvidence, validateEvidence } from '@genesis-os/reasoning/evidence';
import { hashPassword, verifyPassword, generateToken, validateRegistration } from './auth.mjs';
import { listModels, getModel, modelMetadata, runModel } from './compute/engine.mjs';
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
import { saveEnvAudit, latestEnvAudit, listScienceRuns, getScienceRun } from './store.mjs';
import { verifyScienceRun, getVerificationHistory } from './campaign/verify.mjs';
import * as truthEngine from './cognitive/truthEngine.mjs';
import * as necropolis from './cognitive/necropolis.mjs';
import { OFF_TARGET_PANEL, TOX_PANEL } from './cognitive/offTarget.mjs';
import { NODE_TYPE, EDGE_TYPE } from './cognitive/knowledgeGraph.mjs';
import { detectMdCapability } from './cognitive/molecularDynamics.mjs';
import { BIOLOGICAL_SOURCES, BIO_SERVICES } from './corpus/biologicalSources.mjs';
import * as rdkitAdapter from './compute/rdkitAdapter.mjs';
import * as admetAdapter from './compute/admetAdapter.mjs';
import * as dockingAdapter from './compute/dockingAdapter.mjs';
import * as pilotReport from './cognitive/pilotReport.mjs';
import * as discovery from './cognitive/discoveryController.mjs';
import { getTruthAnalysis, listTruthAnalyses, listDiscoveryCampaigns, getDiscoveryCampaign } from './store.mjs';
// Stage 2 — self-service billing dashboard (reuses Stage 1 helpers; no duplicated logic).
import { getBillingCustomer, upsertBillingCustomer, listApiKeysByOwner, deleteApiKey, createApiKey, API_TIERS } from './store.mjs';
import { billingConfig, billingConfigured } from './billing/handler.mjs';
// V5 UI wiring — expose the existing V4 cognitive/validation modules over the API.
import { detectComputeResources } from './cognitive/computeResources.mjs';
import { accumulateMemory } from './cognitive/scientificMemory.mjs';
import { runAgentPanel, AGENT_ROLES, MULTI_AGENT_VERSION } from './cognitive/multiAgent.mjs';
import { buildLaboratoryReadiness } from './cognitive/laboratoryReadiness.mjs';
import { generateInvestorPackage } from './validation/investorEdition.mjs';
// Public, versioned external API (v1) — self-contained, reuses the RDKit adapter.
import { handleV1 } from './apiV1.mjs';
// Scientific Version Control (Genesis 2.1, Part 4) — content-addressed campaign snapshots.
import * as versioning from './campaignVersioning.mjs';
import { newId as newUuid } from './auth.mjs';

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

  // ---- Publiczne, wersjonowane API v1 (własne uwierzytelnianie kluczem API) ----
  if (seg[0] === 'v1') return handleV1(seg, method, body, { db, token: ctx.token });

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

  // ---- Podgląd zaproszenia po tokenie z linku (bez uwierzytelnienia) ----
  // Osoba zapraszana klika link ZANIM ma konto, więc ta trasa musi działać bez
  // tokenu sesji. Oddaje wyłącznie to, co potrzebne do decyzji „rejestruję się?":
  // kto zaprasza, do czego i w jakiej roli. Nigdy nie oddaje samej kampanii ani
  // adresu e-mail zapraszającego — token z linku nie daje dostępu do danych.
  if (seg[0] === 'invites' && seg.length === 2 && method === 'GET') {
    const invite = getCampaignInviteByToken(db, seg[1]);
    if (!invite) return err(404, 'not_found', 'Zaproszenie nie istnieje lub zostało odwołane.');
    if (invite.acceptedAt) return err(410, 'invite_used', 'To zaproszenie zostało już zrealizowane.');
    const campaign = getCampaignRowById(db, invite.campaignId);
    if (!campaign) return err(404, 'not_found', 'Kampania, do której zapraszano, już nie istnieje.');
    const inviter = getUserById(db, invite.invitedBy);
    return ok({
      invite: {
        email: invite.email,
        role: invite.role,
        campaignName: campaign.data?.name ?? null,
        invitedByName: inviter?.displayName ?? null,
        createdAt: invite.createdAt,
      },
    });
  }


  // ---- Edge review: PUBLIC read surface (no session required) ----
  // An expert arriving from a cold email must be able to READ an edge, its
  // reviews and the reviewers' names before deciding whether to participate.
  // Requiring an account to look is the friction that kills expert recruitment.
  if (seg[0] === 'review') {
    ensureReviewSchema(db);

    // /api/review/edge/:edgeKey — one edge, its status and every review on it.
    if (seg[1] === 'edge' && seg.length === 3 && method === 'GET') {
      return ok({ status: edgeStatus(db, decodeURIComponent(seg[2])), reviews: reviewsForEdge(db, decodeURIComponent(seg[2])) });
    }

    // /api/review/coverage — the asset number; safe to show publicly.
    if (seg[1] === 'coverage' && method === 'POST') {
      const keys = Array.isArray(body?.edgeKeys) ? body.edgeKeys.map(String) : [];
      return ok({ coverage: reviewCoverage(db, keys), statuses: edgeStatuses(db, keys) });
    }

    // /api/review/contributors — who has reviewed. Public by design: the
    // acknowledgement is part of what a reviewer is offered.
    if (seg[1] === 'contributors' && method === 'GET') {
      return ok({ contributors: contributors(db) });
    }

    // /api/review/verdicts — the vocabulary, so a client never invents one.
    if (seg[1] === 'verdicts' && method === 'GET') return ok({ verdicts: VERDICTS });

    // Everything below WRITES, and therefore needs an identified reviewer.
    const reviewer = getUserByToken(db, ctx.token);
    if (!reviewer) return err(401, 'unauthorized', 'Zaloguj się, aby zapisać recenzję. Podgląd krawędzi nie wymaga konta.');

    if (seg[1] === 'profile' && method === 'GET') return ok({ profile: getReviewerProfile(db, reviewer.id) });
    if (seg[1] === 'profile' && method === 'PUT') {
      const displayName = String(body?.displayName ?? '').trim();
      if (!displayName) return err(400, 'invalid_input', 'Nazwa recenzenta jest wymagana — recenzja bez atrybucji nie ma wartości.');
      return ok({ profile: upsertReviewerProfile(db, reviewer.id, {
        displayName, orcid: body?.orcid ?? null,
        affiliation: body?.affiliation ?? '', expertise: body?.expertise ?? '',
      }) });
    }

    if (seg[1] === 'submit' && method === 'POST') {
      // A review without attribution is an opinion; refuse before storing it.
      if (!getReviewerProfile(db, reviewer.id)) {
        return err(409, 'profile_required', 'Uzupełnij profil recenzenta (nazwa, afiliacja) przed pierwszą recenzją.');
      }
      const result = submitReview(db, {
        edgeKey: String(body?.edgeKey ?? ''), reviewerId: reviewer.id,
        verdict: String(body?.verdict ?? ''), confidence: body?.confidence ?? 'moderate',
        comment: String(body?.comment ?? ''), citation: String(body?.citation ?? ''),
        proposedEffect: body?.proposedEffect ?? null,
        proposedMechanism: body?.proposedMechanism ?? null,
        proposedHonesty: body?.proposedHonesty ?? null,
      });
      if (!result.ok) return err(400, 'invalid_review', result.errors.join(' '));
      return ok({ review: result.review, status: edgeStatus(db, String(body.edgeKey)) }, 201);
    }

    if (seg[1] === 'worklist' && method === 'POST') {
      const keys = Array.isArray(body?.edgeKeys) ? body.edgeKeys.map(String) : [];
      return ok({ worklist: edgeReviewWorklist(db, keys, { reviewerId: reviewer.id, limit: Number(body?.limit ?? 50) }) });
    }

    if (seg[1] === 'credit' && method === 'GET') return ok({ credit: reviewerCredit(db, reviewer.id) });

    return err(404, 'not_found');
  }

  // ---- Reasoning core (L3 pure) + its persistence (L2) ----
  //
  // The curated mechanism graph is public: it is the thing a visiting scientist
  // is being asked to argue with, and requiring an account to read it is the
  // friction that kills expert recruitment (same reasoning as /api/review).
  //
  // There is deliberately NO endpoint that accepts an artifact from a client.
  // Artifacts are what the platform concluded; letting a caller post one would
  // let anyone write conclusions into the record and then have them reviewed as
  // though Genesis had produced them. Artifacts are written by orchestrators
  // (L4) only, through recordArtifact and its gate.
  if (seg[0] === 'reasoning') {
    ensureReasoningSchema(db);
    ensureReviewSchema(db);
    // Idempotent: the snapshot id is the content hash, so this is a no-op once
    // seeded and does NOT orphan reviews on restart.
    seedGraphSnapshot(db, { nodes: GRAPH_NODES, edges: GRAPH_EDGES });

    if (seg[1] === 'graph' && seg.length === 2 && method === 'GET') {
      const snap = currentSnapshot(db);
      return ok({
        snapshot: { id: snap.id, createdAt: snap.created_at, source: snap.source, nodes: snap.node_count, edges: snap.edge_count },
        nodes: GRAPH_NODES,
        edges: snapshotEdges(db, snap.id),
      });
    }

    // Reviews pointing at an edge that no longer exists. Public because it is a
    // statement about the integrity of a public ledger.
    if (seg[1] === 'graph' && seg[2] === 'orphans' && method === 'GET') {
      return ok({ orphans: orphanReviews(db), snapshot: currentSnapshot(db)?.id ?? null });
    }

    // Everything below is tenant-scoped and therefore needs an identified user.
    const user = getUserByToken(db, ctx.token);
    const tenant = resolveTenant(db, user, body?.projectId ?? ctx.query?.projectId ?? null);
    if (!tenant.ok) return err(tenant.status, tenant.code, tenant.message);

    if (seg[1] === 'evidence' && seg.length === 2 && method === 'GET') {
      return ok({
        projectId: tenant.projectId,
        evidence: listEvidence(db, tenant.projectId, {
          edgeKey: typeof ctx.query?.edgeKey === 'string' ? ctx.query.edgeKey : null,
          includeRetired: ctx.query?.includeRetired === 'true',
        }),
      });
    }

    if (seg[1] === 'evidence' && seg.length === 2 && method === 'POST') {
      // Graded on the SERVER, using the same pure function the browser uses.
      // A client-supplied grade would be a number with no rule behind it, and
      // the whole two-axis discipline rests on the rule being knowable.
      const record = {
        id: 'pending', interventionId: String(body?.interventionId ?? ''), hallmarkId: String(body?.hallmarkId ?? ''),
        tier: body?.tier, outcome: body?.outcome, direction: body?.direction,
        citation: String(body?.citation ?? ''), system: String(body?.system ?? ''),
        replicated: Boolean(body?.replicated), randomised: Boolean(body?.randomised),
        blinded: Boolean(body?.blinded), preregistered: Boolean(body?.preregistered),
        sampleSize: Number(body?.sampleSize ?? 0), readoutKind: body?.readoutKind ?? 'proxy',
        effectSize: body?.effectSize ?? null, notes: String(body?.notes ?? ''),
      };
      const validation = validateEvidence(record);
      if (!validation.ok) return err(400, 'invalid_evidence', validation.errors.join(' '));

      const grade = gradeEvidence(record);
      const stored = recordEvidence(db, {
        projectId: tenant.projectId, edgeKey: body?.edgeKey ?? null,
        intervention: record.interventionId, hallmark: record.hallmarkId,
        citation: record.citation, tier: record.tier, outcome: record.outcome, direction: record.direction,
        species: record.system, sampleSize: record.sampleSize, effectSize: record.effectSize,
        notes: record.notes, strength: grade.strength, humanRelevance: grade.humanRelevance,
        createdBy: user.id,
      });
      return ok({ evidence: stored, grade }, 201);
    }

    // The explicit opt-in half of the tenancy policy. Personal is the default;
    // reaching a shared workspace is an act, never a side effect.
    if (seg[1] === 'evidence' && seg.length === 4 && seg[3] === 'share' && method === 'POST') {
      const target = resolveTenant(db, user, body?.toProjectId);
      if (!target.ok) return err(target.status, target.code, target.message);
      if (target.projectId === tenant.projectId) {
        return err(400, 'invalid_target', 'Name the project to share into. Omitting it targets your own workspace.');
      }
      const result = shareEvidence(db, {
        id: decodeURIComponent(seg[2]), fromProjectId: tenant.projectId,
        toProjectId: target.projectId, actorId: user.id,
      });
      if (!result.ok) return err(result.error === 'not_found' ? 404 : 409, result.error, result.message);
      return ok({ evidence: result.evidence, sharedInto: target.projectId }, 201);
    }

    if (seg[1] === 'evidence' && seg.length === 3 && method === 'DELETE') {
      // Retire, never delete — see recordEvidence's comment on retractions.
      const retired = retireEvidence(db, decodeURIComponent(seg[2]), tenant.projectId);
      if (!retired) return err(404, 'not_found', 'No live evidence record with that id in this tenant.');
      return ok({ retired: true });
    }

    /* ---------------------- living knowledge graph ---------------------- */

    // Seeding a tenant's beliefs from the curated graph is explicit, not a side
    // effect of reading: a workspace does not silently acquire opinions.
    if (seg[1] === 'claims' && seg[2] === 'seed' && method === 'POST') {
      return ok(seedClaimsFromSnapshot(db, { projectId: tenant.projectId, actorId: user.id }), 201);
    }

    if (seg[1] === 'claims' && seg.length === 2 && method === 'GET') {
      const subject = typeof ctx.query?.subject === 'string' ? ctx.query.subject : null;
      return ok({ claims: liveClaims(db, tenant.projectId, { subject }).map((c) => claimState(db, c.id)) });
    }

    if (seg[1] === 'claim' && seg.length === 3 && method === 'GET') {
      const state = claimState(db, decodeURIComponent(seg[2]));
      if (!state || state.project_id !== tenant.projectId) return err(404, 'not_found');
      return ok({ claim: state, history: claimHistory(db, state.id) });
    }

    if (seg[1] === 'claim' && seg.length === 4 && seg[3] === 'revise' && method === 'POST') {
      let result;
      try {
        result = reviseClaim(db, {
          claimId: decodeURIComponent(seg[2]), projectId: tenant.projectId,
          confidence: Number(body?.confidence), coverage: Number(body?.coverage),
          cause: body?.cause, causeRef: body?.causeRef ?? null, rule: body?.rule,
          note: String(body?.note ?? ''), actorId: user.id,
        });
      } catch (e) {
        return err(400, 'invalid_revision', String(e.message).replace(/^reviseClaim refused: /, ''));
      }
      if (!result.ok) return err(result.error === 'not_found' ? 404 : 409, result.error, result.message);
      return ok({ revision: result.revision, claim: claimState(db, decodeURIComponent(seg[2])) }, 201);
    }

    if (seg[1] === 'claim' && seg.length === 4 && seg[3] === 'retire' && method === 'POST') {
      const result = retireClaim(db, {
        claimId: decodeURIComponent(seg[2]), projectId: tenant.projectId,
        cause: body?.cause, causeRef: body?.causeRef ?? null,
        rule: body?.rule ?? 'retirement/1', note: String(body?.note ?? ''), actorId: user.id,
      });
      if (!result.ok) return err(result.error === 'not_found' ? 404 : 400, result.error, result.message);
      return ok({ claim: claimState(db, decodeURIComponent(seg[2])) });
    }

    // Derived on every read — a cached contradiction list would eventually
    // disagree with the claims it describes.
    if (seg[1] === 'contradictions' && seg.length === 2 && method === 'GET') {
      return ok({ contradictions: detectContradictions(db, tenant.projectId) });
    }

    if (seg[1] === 'contradictions' && seg[2] === 'resolve' && method === 'POST') {
      const result = resolveContradiction(db, {
        contradictionId: body?.contradictionId, projectId: tenant.projectId,
        kind: body?.kind, resolution: String(body?.resolution ?? ''), resolvedBy: user.id,
      });
      if (!result.ok) return err(400, result.error, result.message);
      return ok({ resolution: result.resolution }, 201);
    }

    if (seg[1] === 'timeline' && seg.length === 2 && method === 'GET') {
      const subject = typeof ctx.query?.subject === 'string' ? ctx.query.subject : null;
      return ok({ points: confidenceTimeline(db, tenant.projectId, { subject, limit: Number(ctx.query?.limit ?? 500) }) });
    }

    /* ------------------------- the Discovery Engine ---------------------- */

    // The flagship. Composes eight tested libraries into one artifact, stored
    // through the same gate as everything else — the engine gets no exemption
    // from the rules it exists to enforce.
    if (seg[1] === 'ask' && seg.length === 2 && method === 'POST') {
      const question = String(body?.question ?? '').trim();
      if (!question) return err(400, 'invalid_input', 'A question is required.');
      try {
        const artifact = runAndRecord(db, {
          projectId: tenant.projectId, question,
          focus: body?.focus ?? null, limit: Number(body?.limit ?? 8),
          createdBy: user.id,
        });
        return ok({ artifact }, 201);
      } catch (e) {
        return err(409, 'engine_refused', String(e.message));
      }
    }

    /* --------------------------- the graveyard -------------------------- */

    if (seg[1] === 'graveyard' && seg.length === 2 && method === 'GET') {
      return ok({
        graves: listGraves(db, tenant.projectId, { includeExhumed: ctx.query?.includeExhumed === 'true' }),
        lessons: lessons(db, tenant.projectId),
      });
    }

    if (seg[1] === 'graveyard' && seg[2] === 'bury' && method === 'POST') {
      try {
        const r = buryHypothesis(db, {
          projectId: tenant.projectId, statement: body?.statement,
          subject: body?.subject ?? null, predicate: body?.predicate ?? null, object: body?.object ?? null,
          cause: body?.cause, evidenceRef: body?.evidenceRef, lesson: String(body?.lesson ?? ''),
          resurrectable: body?.resurrectable !== false, actorId: user.id,
        });
        return ok({ grave: r.grave, created: r.created }, r.created ? 201 : 200);
      } catch (e) {
        return err(400, 'invalid_burial', String(e.message).replace(/^buryHypothesis refused: /, ''));
      }
    }

    // Never a bare boolean: the caller has to be able to show a scientist WHY a
    // proposal was held back, and the scientist has to be able to disagree.
    if (seg[1] === 'graveyard' && seg[2] === 'assess' && method === 'POST') {
      return ok(assessHypothesis(db, {
        projectId: tenant.projectId, subject: body?.subject ?? null,
        predicate: body?.predicate ?? null, object: body?.object ?? null, statement: body?.statement ?? null,
      }));
    }

    if (seg[1] === 'graveyard' && seg.length === 4 && seg[3] === 'exhume' && method === 'POST') {
      const r = exhume(db, {
        id: decodeURIComponent(seg[2]), projectId: tenant.projectId,
        why: String(body?.why ?? ''), actorId: user.id,
      });
      if (!r.ok) return err(r.error === 'not_found' ? 404 : 400, r.error, r.message);
      return ok({ grave: r.grave });
    }

    if (seg[1] === 'artifacts' && seg.length === 2 && method === 'GET') {
      return ok({ artifacts: listArtifacts(db, tenant.projectId, { kind: typeof ctx.query?.kind === 'string' ? ctx.query.kind : null, limit: Number(ctx.query?.limit ?? 50) }) });
    }

    if (seg[1] === 'artifact' && seg.length === 3 && method === 'GET') {
      const artifact = getArtifact(db, decodeURIComponent(seg[2]), tenant.projectId);
      if (!artifact) return err(404, 'not_found');
      return ok({ artifact, history: replayHistory(db, tenant.projectId, artifact.inputs_hash) });
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
    // compute/run wykonuje WYŁĄCZNIE ograniczone modele w procesie (fizyka: SEMF,
    // Lorentz, …) z walidacją wejścia — NIE spawn'uje podprocesów, więc nie jest
    // wektorem C1. Zapis w projekcie i tak wymaga uwierzytelnienia (patrz niżej).
    // Wektory subprocesowe (RDKit: laboratory-readiness, molecule/render) są bramkowane.
    if (seg[1] === 'run' && seg.length === 2 && method === 'POST') return runComputeHandler(db, ctx, body);
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
    // Realne predykcje ADMET/toksyczności (Compare/Campaigns) — MODEL_ESTIMATE, nigdy fakt.
    // Ciężki podproces (jak molecule/render, laboratory-readiness) → wymaga zalogowania.
    if (seg[1] === 'admet' && seg[2] === 'predict' && seg.length === 3 && method === 'POST') {
      if (!getUserByToken(db, ctx.token)) return err(401, 'unauthorized', 'Zaloguj się, aby uruchomić predykcję ADMET.');
      const list = Array.isArray(body?.smiles) ? body.smiles.filter((s) => typeof s === 'string' && s) : [];
      if (!list.length) return err(400, 'invalid_input', 'smiles[] wymagane (co najmniej jeden SMILES).');
      const r = admetAdapter.predict(list);
      if (r.ok) return ok({ predictions: r.predictions, version: r.version });
      return err(r.error === 'invalid_input' ? 400 : 503, r.error ?? 'BLOCKED_BY_RUNTIME', r.reason);
    }
    return err(404, 'not_found');
  }

  // ---- Discovery-science capabilities (V3) — real runtime status for the Discovery Workspace ----
  if (seg[0] === 'science') {
    if (seg[1] === 'capabilities' && seg.length === 2 && method === 'GET') return ok({ capabilities: scienceCapabilities() });

    // V5 — real UI wiring for the V4 cognitive/validation modules. Public reads/computes
    // (no persisted user data); each delegates to the existing, tested implementation.
    // Compute Cluster (HPC/GPU) — real environment probe (CPU/RAM/GPU/Docker/K8s/Slurm/queue).
    if (seg[1] === 'compute-resources' && seg.length === 2 && method === 'GET') return ok({ resources: detectComputeResources() });
    // Scientific Memory — own-campaign learning status + licence-tagged external-source registry.
    if (seg[1] === 'memory' && seg.length === 2 && method === 'GET') {
      const dossiers = Array.isArray(body?.completedDossiers) ? body.completedDossiers : [];
      return ok({ memory: accumulateMemory({ completedDossiers: dossiers }) });
    }
    // Multi-Agent panel — roster (GET) + live rule-based assessment of a supplied dossier (POST).
    if (seg[1] === 'agent-roles' && seg.length === 2 && method === 'GET') return ok({ roles: AGENT_ROLES, version: MULTI_AGENT_VERSION });
    if (seg[1] === 'multi-agent' && seg.length === 2 && method === 'POST') return ok({ panel: runAgentPanel(body?.dossier ?? null) });
    // Laboratory Readiness — real RDKit-backed dossier for one candidate (SMILES [+ ADMET]).
    if (seg[1] === 'laboratory-readiness' && seg.length === 2 && method === 'POST') {
      if (!getUserByToken(db, ctx.token)) return err(401, 'unauthorized', 'Zaloguj się, aby uruchomić analizę RDKit.');
      return ok({ readiness: buildLaboratoryReadiness(body?.candidate ?? {}, { scientificQuestion: body?.scientificQuestion ?? null }) });
    }
    // Investor Edition — deterministic investor/pharma/grant/IP package from real campaign+validation data.
    if (seg[1] === 'investor-package' && seg.length === 2 && method === 'POST') return ok({ package: generateInvestorPackage({ dossier: body?.dossier ?? null, validation: body?.validation ?? null, meta: body?.meta ?? {} }) });
    // Candidate Viewer — REAL molecular rendering from a SMILES: 2D depiction (RDKit SVG)
    // and/or 3D coordinates + bonds (ETKDG embed + MMFF/UFF). Never fabricated; RDKit-gated.
    if (seg[1] === 'molecule' && seg[2] === 'render' && seg.length === 3 && method === 'POST') {
      if (!getUserByToken(db, ctx.token)) return err(401, 'unauthorized', 'Zaloguj się, aby renderować cząsteczkę.');
      const smiles = String(body?.smiles ?? '');
      if (!smiles) return err(400, 'invalid_input', 'SMILES required');
      const want3d = body?.mode !== '2d';
      const two = rdkitAdapter.depict2d(smiles, { width: body?.width ?? 440, height: body?.height ?? 340 });
      const three = want3d ? rdkitAdapter.embed3d(smiles) : null;
      return ok({ smiles, depiction2d: two, model3d: three });
    }
    // SDF/MOL import (pilot readiness): real RDKit MOL-block parsing, never a text/regex hack.
    if (seg[1] === 'molecule' && seg[2] === 'parse-file' && seg.length === 3 && method === 'POST') {
      if (!getUserByToken(db, ctx.token)) return err(401, 'unauthorized', 'Zaloguj się, aby zaimportować plik.');
      const kind = String(body?.kind ?? '');
      if (kind === 'mol') {
        const molblock = String(body?.content ?? '');
        if (!molblock.trim()) return err(400, 'invalid_input', 'Plik MOL jest pusty.');
        const r = rdkitAdapter.parseMolfile(molblock);
        if (!r.ok) return err(r.error === 'invalid_molfile' || r.error === 'invalid_input' ? 400 : 503, r.error, r.reason);
        return ok({ molecules: [{ smiles: r.smiles, name: r.name }] });
      }
      if (kind === 'sdf') {
        const sdf = String(body?.content ?? '');
        if (!sdf.trim()) return err(400, 'invalid_input', 'Plik SDF jest pusty.');
        const r = rdkitAdapter.parseSdf(sdf);
        if (!r.ok) return err(r.error === 'invalid_input' ? 400 : 503, r.error, r.reason);
        return ok({ molecules: r.molecules, parsed: r.parsed, errors: r.errors, total: r.total });
      }
      return err(400, 'invalid_input', 'kind musi być "mol" lub "sdf".');
    }
    return err(404, 'not_found');
  }

  // ---- Od tego miejsca wymagany ważny token ----
  const user = getUserByToken(db, ctx.token);
  if (!user) return err(401, 'unauthorized', 'Zaloguj się, aby korzystać z trwałych projektów.');

  // ---- Self-service billing dashboard (Stage 2). Read plan/usage/key + regenerate. ----
  if (seg[0] === 'account') {
    if (seg[1] === 'billing' && seg.length === 2 && method === 'GET') return ok(accountBillingView(db, user));
    if (seg[1] === 'api-key' && seg[2] === 'regenerate' && seg.length === 3 && method === 'POST') return regenerateAccountKey(db, user);
    return err(404, 'not_found');
  }

  // ---- Portfolio rollup (Genesis V3, P0) — read-only aggregation for the dashboard.
  // One call returns every campaign the user can reach (owned + shared) with cheap
  // counts that already exist: molecule statuses, unresolved comments, snapshots,
  // last activity. Deliberately SCORING-FREE — the leading-candidate ranking lives in
  // exactly one place (frontend core/moleculeComparison.ts) and is never recomputed
  // here, so this endpoint can never drift from the real verdict. No new system.
  if (seg[0] === 'portfolio') {
    if (seg.length === 1 && method === 'GET') {
      const rows = listAccessibleCampaigns(db, user.id).map((c) => {
        const molecules = Array.isArray(c.data?.molecules) ? c.data.molecules : [];
        let analysed = 0; let pending = 0; let invalid = 0;
        for (const m of molecules) {
          if (m?.status === 'ANALYSED' && m?.props) analysed += 1;
          else if (m?.status === 'INVALID') invalid += 1;
          else pending += 1;
        }
        const agg = getCampaignRollupAggregates(db, c.id);
        const lastActivityAt = Math.max(c.updatedAt ?? 0, agg.latestSnapshotAt ?? 0, agg.latestCommentAt ?? 0)
          || c.updatedAt || c.createdAt || 0;
        return {
          id: c.id,
          name: c.data?.name ?? '',
          status: c.data?.status ?? 'ACTIVE',
          role: c.role,
          ownerId: c.ownerId,
          total: molecules.length,
          analysed,
          pending,
          invalid,
          unresolvedComments: agg.unresolvedComments,
          snapshotCount: agg.snapshotCount,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          lastActivityAt,
        };
      });
      rows.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
      return ok({ portfolio: rows });
    }
    return err(405, 'method_not_allowed');
  }

  // ---- Trwałość kampanii badawczych (Genesis 2.1, Part 2) — scoped per właściciel ----
  if (seg[0] === 'campaigns') {
    if (seg.length === 1 && method === 'GET') {
      // Lista: metadane (bez pełnych blobów) — do synchronizacji i widoku listy.
      // Kampanie WŁASNE i UDOSTĘPNIONE, każda z efektywną rolą. Wcześniej lista
      // pokazywała wyłącznie własne, więc zaproszony współpracownik po zalogowaniu
      // widział pustkę i musiał dostać bezpośredni identyfikator poza produktem.
      // `listAccessibleCampaigns` to ta sama agregacja, z której korzysta dashboard —
      // bez nowego zapytania i bez drugiej ścieżki autoryzacji.
      const rows = listAccessibleCampaigns(db, user.id).map((c) => ({
        id: c.id, name: c.data?.name ?? '', status: c.data?.status ?? 'ACTIVE',
        molecules: Array.isArray(c.data?.molecules) ? c.data.molecules.length : 0,
        createdAt: c.createdAt, updatedAt: c.updatedAt, role: c.role, ownerId: c.ownerId,
      }));
      return ok({ campaigns: rows });
    }

    const id = seg[1];
    const row = id ? getCampaignRowById(db, id) : null;
    const role = row ? (row.ownerId === user.id ? 'owner' : resolveCampaignRole(db, id, user.id)) : null;

    if (seg.length === 2) {
      if (method === 'GET') return row && role ? ok({ campaign: row, role }) : err(404, 'not_found');
      if (method === 'PUT') {
        const data = body && 'campaign' in body ? body.campaign : body; // {campaign:...} lub samo ciało
        if (!data || typeof data !== 'object' || Array.isArray(data)) return err(400, 'invalid_input', 'Brak danych kampanii.');
        // Brak istniejącego wiersza → tworzy go bieżący użytkownik jako właściciel (pierwszy push z klienta).
        if (!row) return ok({ campaign: upsertCampaign(db, user.id, id, data) });
        if (!versioning.hasRole(role, 'collaborator')) return err(403, 'forbidden', 'Rola widza nie pozwala na edycję kampanii.');
        return ok({ campaign: upsertCampaign(db, row.ownerId, id, data) });
      }
      if (method === 'DELETE') {
        if (row && role !== 'owner') return err(403, 'forbidden', 'Tylko właściciel może usunąć kampanię.');
        deleteCampaignRow(db, user.id, id);
        return ok({ ok: true });
      }
      return err(405, 'method_not_allowed');
    }

    // ---- Poniższe podtrasy wymagają istniejącej kampanii + co najmniej roli widza ----
    if (!row || !role) return err(404, 'not_found');

    // /api/campaigns/:id/members — udostępnianie (Scientific Version Control MVP: 1 współpracownik+)
    if (seg[2] === 'members') {
      if (seg.length === 3) {
        if (method === 'GET') {
          return ok({ members: listCampaignMembers(db, id), invites: listCampaignInvites(db, id), owner: { id: row.ownerId } });
        }
        if (method === 'POST') {
          if (role !== 'owner') return err(403, 'forbidden', 'Tylko właściciel może zapraszać współpracowników.');
          const email = String(body?.email ?? '').trim().toLowerCase();
          const memberRole = String(body?.role ?? 'collaborator');
          if (!email) return err(400, 'invalid_input', 'Adres e-mail jest wymagany.');
          if (!['viewer', 'collaborator'].includes(memberRole)) return err(400, 'invalid_input', 'Rola musi być "viewer" lub "collaborator".');
          const invitee = getUserByEmail(db, email);
          // Adres bez konta nie jest już błędem: zapisujemy zaproszenie oczekujące,
          // które zamieni się w członkostwo, gdy ta osoba się zarejestruje (v28).
          if (!invitee) {
            const invite = createCampaignInvite(db, { campaignId: id, email, role: memberRole, invitedBy: user.id, token: generateToken() });
            return ok({ invite }, 201);
          }
          if (invitee.id === row.ownerId) return err(400, 'invalid_input', 'Właściciel już ma pełny dostęp.');
          const member = addCampaignMember(db, { campaignId: id, userId: invitee.id, role: memberRole, addedBy: user.id });
          return ok({ member }, 201);
        }
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 4) {
        const memberId = seg[3];
        if (method === 'PUT') {
          if (role !== 'owner') return err(403, 'forbidden');
          const memberRole = String(body?.role ?? '');
          if (!['viewer', 'collaborator'].includes(memberRole)) return err(400, 'invalid_input', 'Rola musi być "viewer" lub "collaborator".');
          if (!getCampaignMember(db, id, memberId)) return err(404, 'not_found');
          return ok({ member: addCampaignMember(db, { campaignId: id, userId: memberId, role: memberRole, addedBy: user.id }) });
        }
        if (method === 'DELETE') {
          if (role !== 'owner' && memberId !== user.id) return err(403, 'forbidden', 'Tylko właściciel może usuwać innych współpracowników.');
          removeCampaignMember(db, id, memberId);
          return ok({ ok: true });
        }
      }
      return err(404, 'not_found');
    }

    // /api/campaigns/:id/invites/:inviteId — odwołanie oczekującego zaproszenia.
    if (seg[2] === 'invites' && seg.length === 4) {
      if (method === 'DELETE') {
        if (role !== 'owner') return err(403, 'forbidden', 'Tylko właściciel może odwoływać zaproszenia.');
        const invite = getCampaignInvite(db, seg[3]);
        if (!invite || invite.campaignId !== id) return err(404, 'not_found');
        deleteCampaignInvite(db, invite.id);
        return ok({ ok: true });
      }
      return err(405, 'method_not_allowed');
    }

    // /api/campaigns/:id/snapshots — niemutowalna historia wersji (Scientific Version Control)
    if (seg[2] === 'snapshots') {
      if (seg.length === 3) {
        if (method === 'GET') {
          // Lista bez pełnego blobu `data` — lekki widok osi czasu.
          const list = listCampaignSnapshots(db, id).map(({ data: _data, ...meta }) => meta);
          return ok({ snapshots: list });
        }
        if (method === 'POST') {
          if (!versioning.hasRole(role, 'collaborator')) return err(403, 'forbidden', 'Rola widza nie pozwala tworzyć wersji.');
          const data = body?.data;
          if (!data || typeof data !== 'object' || Array.isArray(data)) return err(400, 'invalid_input', 'Brak danych migawki (data).');
          const triggerKind = String(body?.triggerKind ?? 'manual');
          const versions = {
            rdkitVersion: rdkitAdapter.detect().version ?? null,
            admetVersion: admetAdapter.detect().version ?? null,
            groundingVersion: typeof body?.groundingVersion === 'string' ? body.groundingVersion : null,
            scoringVersion: typeof body?.scoringVersion === 'string' ? body.scoringVersion : null,
          };
          const expectedParentId = 'expectedParentId' in (body ?? {}) ? (body.expectedParentId ?? null) : undefined;
          const result = versioning.createSnapshot(db, { campaignId: id, data, triggerKind, authorId: user.id, expectedParentId, versions });
          if (result.conflict) return err(409, 'stale_write', 'Ktoś inny zapisał nowszą wersję. Odśwież i spróbuj ponownie.');
          return ok({ snapshot: result.snapshot }, 201);
        }
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 4 && method === 'GET') {
        const snap = getSnapshot(db, seg[3]);
        return snap && snap.campaignId === id ? ok({ snapshot: snap }) : err(404, 'not_found');
      }
      if (seg.length === 5 && seg[4] === 'restore' && method === 'POST') {
        if (!versioning.hasRole(role, 'collaborator')) return err(403, 'forbidden', 'Rola widza nie pozwala przywracać wersji.');
        const versions = {
          rdkitVersion: rdkitAdapter.detect().version ?? null,
          admetVersion: admetAdapter.detect().version ?? null,
          groundingVersion: typeof body?.groundingVersion === 'string' ? body.groundingVersion : null,
          scoringVersion: typeof body?.scoringVersion === 'string' ? body.scoringVersion : null,
        };
        const expectedParentId = 'expectedParentId' in (body ?? {}) ? (body.expectedParentId ?? null) : undefined;
        const result = versioning.restoreSnapshot(db, { campaignId: id, targetSnapshotId: seg[3], authorId: user.id, expectedParentId, versions });
        if (result.notFound) return err(404, 'not_found');
        if (result.conflict) return err(409, 'stale_write', 'Ktoś inny zapisał nowszą wersję. Odśwież i spróbuj ponownie.');
        return ok({ snapshot: result.snapshot }, 201);
      }
      return err(404, 'not_found');
    }

    // /api/campaigns/:id/diff?from=<snapshotId>&to=<snapshotId> — czytelny diff naukowy
    if (seg[2] === 'diff' && seg.length === 3 && method === 'GET') {
      const fromId = typeof ctx.query?.from === 'string' ? ctx.query.from : null;
      const toId = typeof ctx.query?.to === 'string' ? ctx.query.to : (getLatestSnapshot(db, id)?.id ?? null);
      if (!fromId || !toId) return err(400, 'invalid_input', 'Parametry from i to (identyfikatory migawek) są wymagane.');
      const fromSnap = getSnapshot(db, fromId);
      const toSnap = getSnapshot(db, toId);
      if (!fromSnap || fromSnap.campaignId !== id || !toSnap || toSnap.campaignId !== id) return err(404, 'not_found');
      return ok({ from: fromId, to: toId, diff: versioning.diffCampaigns(fromSnap, toSnap) });
    }

    // /api/campaigns/:id/comments — komentarze naukowe (przypięte do migawki/cząsteczki)
    if (seg[2] === 'comments') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ comments: listCampaignComments(db, id) });
        if (method === 'POST') {
          const text = String(body?.body ?? '').trim();
          if (!text) return err(400, 'invalid_input', 'Treść komentarza jest wymagana.');
          const comment = insertCampaignComment(db, {
            id: newUuid(), campaignId: id, authorId: user.id, body: text.slice(0, 4000),
            snapshotId: typeof body?.snapshotId === 'string' ? body.snapshotId : null,
            moleculeId: typeof body?.moleculeId === 'string' ? body.moleculeId : null,
          });
          return ok({ comment }, 201);
        }
        return err(405, 'method_not_allowed');
      }
      if (seg.length === 5 && seg[4] === 'resolve' && method === 'POST') {
        if (!versioning.hasRole(role, 'collaborator')) return err(403, 'forbidden');
        const existing = getCampaignComment(db, seg[3]);
        if (!existing || existing.campaignId !== id) return err(404, 'not_found');
        return ok({ comment: resolveCampaignComment(db, seg[3], body?.resolved !== false) });
      }
      return err(404, 'not_found');
    }

    return err(404, 'not_found');
  }

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

    // ---- ZEFIR Truth Engine / R&D Kill-Switch (project = tenant boundary) ----
    if (seg[2] === 'truth-analyses') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ analyses: listTruthAnalyses(db, { projectId }) });
        if (method === 'POST') return runTruthAnalysisHandler(db, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      // /api/projects/:id/truth-analyses/compare?a=ID&b=ID — compare two stored analyses (viewer+).
      if (seg.length === 4 && seg[3] === 'compare' && method === 'GET') {
        const ia = typeof ctx.query?.a === 'string' ? ctx.query.a : null;
        const ib = typeof ctx.query?.b === 'string' ? ctx.query.b : null;
        const a = ia ? getTruthAnalysis(db, ia) : null; const b = ib ? getTruthAnalysis(db, ib) : null;
        if (!a || a.projectId !== projectId || !b || b.projectId !== projectId) return err(404, 'not_found');
        return ok({ comparison: pilotReport.compareReports(a, b) });
      }
      if (seg.length === 4 || (seg.length === 5 && (seg[4] === 'certificate' || seg[4] === 'report'))) {
        const a = getTruthAnalysis(db, seg[3]);
        if (!a || a.projectId !== projectId) return err(404, 'not_found'); // tenant isolation
        if (method !== 'GET') return err(405, 'method_not_allowed');
        if (seg.length === 5 && seg[4] === 'certificate') return ok({ certificate: a.certificate });
        if (seg.length === 5 && seg[4] === 'report') return ok({ report: pilotReport.buildReport(a) });
        return ok({ analysis: a });
      }
      return err(404, 'not_found');
    }

    // ---- Autonomous Discovery Forge (campaigns, tenant-scoped) ----
    if (seg[2] === 'discovery-campaigns') {
      if (seg.length === 3) {
        if (method === 'GET') return ok({ campaigns: listDiscoveryCampaigns(db, projectId) });
        if (method === 'POST') return runDiscoveryHandler(db, role, projectId, body);
        return err(405, 'method_not_allowed');
      }
      const camp = getDiscoveryCampaign(db, seg[3]);
      if (!camp || camp.projectId !== projectId) return err(404, 'not_found'); // tenant isolation
      if (seg.length === 4 && method === 'GET') return ok({ campaign: camp });
      if (seg.length === 5 && seg[4] === 'dossier' && method === 'GET') return ok({ dossier: discovery.buildDossier(db, camp.id) });
      return err(404, 'not_found');
    }

    // ---- Necropolis (tenant-isolated accumulating failure memory) ----
    if (seg[2] === 'necropolis') {
      if (seg.length === 3 && method === 'GET') return ok({ necropolis: necropolis.stats(db, projectId) });
      if (seg.length === 4 && seg[3] === 'failures' && method === 'POST') return recordFailureHandler(db, role, projectId, body);
      if (seg.length === 4 && seg[3] === 'export' && method === 'GET') {
        if (!atLeast(role, 'admin')) return err(403, 'forbidden', 'Eksport pamięci porażek wymaga roli admin lub owner.');
        return ok({ artifact: necropolis.exportArtifact(db, projectId) });
      }
      if (seg.length === 4 && seg[3] === 'import' && method === 'POST') {
        if (!atLeast(role, 'admin')) return err(403, 'forbidden', 'Import pamięci porażek wymaga roli admin lub owner.');
        const r = necropolis.importArtifact(db, projectId, body?.artifact ?? body);
        return r.ok ? ok({ result: r }) : err(400, 'invalid_artifact', r.error);
      }
      return err(404, 'not_found');
    }

    return err(404, 'not_found');
  }

  return err(404, 'not_found');
}

/**
 * Real runtime capability status for the Discovery Workspace (V3). Every field reflects a genuine
 * runtime detect / static schema — never a fabricated availability. Off-target panel + KG schema +
 * biological-source registry are real definitions; engine availability comes from live detects.
 */
function scienceCapabilities() {
  const detect = (fn) => { try { const d = fn(); return { available: Boolean(d.available), version: d.version ?? d.vinaVersion ?? null, reason: d.available ? null : (d.reason ?? null) }; } catch (e) { return { available: false, reason: String(e?.message ?? e).slice(0, 120) }; } };
  let md;
  try { const c = detectMdCapability(); md = { openmm: c.openmm?.available ?? false, ligandForceField: c.ligandForceField?.available ?? false, canRunComplexMd: c.canRunComplexMd, reason: c.reason }; }
  catch (e) { md = { openmm: false, ligandForceField: false, canRunComplexMd: false, reason: String(e?.message ?? e).slice(0, 120) }; }
  return {
    version: 'genesis-science-capabilities/1',
    engines: {
      rdkit: detect(() => rdkitAdapter.detect()),
      admet: detect(() => admetAdapter.detect()),
      docking: detect(() => dockingAdapter.detect()),
      molecularDynamics: md,
      mmGbsa: { available: md.canRunComplexMd, reason: md.canRunComplexMd ? null : 'requires a completed MD trajectory (MD blocked)' },
    },
    offTarget: { panel: OFF_TARGET_PANEL.map((t) => ({ gene: t.gene, protein: t.protein, category: t.category })), toxicityEndpoints: TOX_PANEL.map((t) => t.label), epistemicStatus: 'MODEL_INFERRED', source: 'ADMET-AI (Tox21 / TDC)' },
    knowledgeGraph: { nodeTypes: Object.values(NODE_TYPE), edgeTypes: Object.values(EDGE_TYPE), provenanceRequired: true },
    biologicalSources: BIO_SERVICES.map((s) => ({ service: s, kind: BIOLOGICAL_SOURCES[s].kind, license: BIOLOGICAL_SOURCES[s].license, liveRetrieval: 'BLOCKED_BY_RUNTIME (egress policy — supply offline bundle or run on a networked host)' })),
    honesty: 'Availability reflects real runtime detects; unavailable engines/sources are honestly blocked, never simulated. Computational only — no drug discovered.',
  };
}

/* ---------------- Handlery ZEFIR Truth Engine / R&D Kill-Switch ---------------- */

// Realny resolver zdolności: capability jest „dostępna" tylko jeśli platforma
// faktycznie ma zweryfikowany silnik (status AVAILABLE). Nieznane → false → uczciwa
// luka zdolności (WARN), nigdy zmyślone GO.
function platformCapabilities() {
  const set = new Set();
  for (const c of listCapabilities()) if (c.status === 'AVAILABLE') set.add(c.id);
  for (const t of listToolchain()) if (t.status === 'AVAILABLE' && t.capabilityId) set.add(t.capabilityId);
  return set;
}

const TRUTH_MAX_ARRAY = 64;
const TRUTH_MAX_STR = 4000;

/** Waliduje i przycina propozycję z API do bezpiecznego, deterministycznego kształtu. */
function sanitizeProposal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Propozycja musi być obiektem JSON.' };
  const s = (v, n = TRUTH_MAX_STR) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  const arr = (v) => (Array.isArray(v) ? v.slice(0, TRUTH_MAX_ARRAY) : undefined);
  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
  const p = {
    problemStatement: s(body.problemStatement), proposedMechanism: s(body.proposedMechanism), claimedResult: s(body.claimedResult),
    equations: arr(body.equations), variables: arr(body.variables), comparisons: arr(body.comparisons),
    assumptions: arr(body.assumptions), physicalConstraints: arr(body.physicalConstraints), speculativeClaims: arr(body.speculativeClaims),
    requiredCapabilities: arr(body.requiredCapabilities), requestedDomains: arr(body.requestedDomains),
    energy: obj(body.energy), efficiency: numOrNull(body.efficiency), efficiencyKind: s(body.efficiencyKind, 40),
    mass: obj(body.mass), operating: obj(body.operating), flow: obj(body.flow), power: obj(body.power),
    geometry: obj(body.geometry), materials: arr(body.materials), accounting: obj(body.accounting),
    expectedPerformance: s(body.expectedPerformance), estimatedCost: s(body.estimatedCost, 200),
    parameterVector: obj(body.parameterVector), context: s(body.context, 200), scales: obj(body.scales),
    target: s(body.target), requirements: arr(body.requirements), challengesModel: obj(body.challengesModel), evidence: arr(body.evidence),
  };
  // Musi być jakakolwiek treść naukowa — pusta propozycja to 400, nie ciche GO.
  const hasContent = p.problemStatement || p.claimedResult || (p.equations && p.equations.length) || p.energy || p.flow || p.power || p.mass || Number.isFinite(p.efficiency) || p.operating || (p.materials && p.materials.length) || p.accounting;
  if (!hasContent) return { ok: false, error: 'Propozycja jest pusta — podaj co najmniej problem, roszczenie lub dane strukturalne.' };
  return { ok: true, value: p };
}

/** POST /api/projects/:id/truth-analyses — uruchamia REALNY Truth Engine. Editor+. */
function runTruthAnalysisHandler(db, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Uruchomienie analizy wymaga roli editor lub wyższej.');
  const v = sanitizeProposal(body);
  if (!v.ok) return err(400, 'invalid_proposal', v.error);
  const caps = platformCapabilities();
  const result = truthEngine.analyze(v.value, { db, projectId, capabilityResolver: (c) => caps.has(c) });
  const saved = listTruthAnalyses(db, { projectId }).find((a) => a.decisionHash === result.certificate.decisionHash);
  return ok({ analysis: { id: saved?.id ?? null, proposalHash: result.proposalHash, decision: result.decision, stages: result.stages, certificate: result.certificate } }, 201);
}

/* ---------------- Handler Autonomous Discovery Forge ---------------- */

const DISCOVERY_MAX_GENERATIONS = 4;
const DISCOVERY_MAX_CANDIDATES = 24;
const DISCOVERY_MAX_SEEDS = 6;

/** POST /api/projects/:id/discovery-campaigns — uruchamia REALNĄ kampanię (real RDKit). Editor+. */
function runDiscoveryHandler(db, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Uruchomienie kampanii wymaga roli editor lub wyższej.');
  const seedsRaw = Array.isArray(body?.seeds) ? body.seeds.slice(0, DISCOVERY_MAX_SEEDS) : [];
  const seeds = seedsRaw
    .filter((s) => s && typeof s.smiles === 'string' && s.smiles.length)
    .map((s) => ({ name: String(s.name ?? 'seed').slice(0, 60), smiles: String(s.smiles).slice(0, 300) }));
  if (seeds.length === 0) return err(400, 'invalid_seeds', 'Podaj co najmniej jeden scaffold startowy (SMILES).');
  const ch = body?.challenge && typeof body.challenge === 'object' ? body.challenge : {};
  const challenge = {
    grandChallenge: String(ch.grandChallenge ?? 'computational analogue campaign').slice(0, 400),
    scope: String(ch.scope ?? 'small-molecule, computational-only').slice(0, 400),
    maxMolWt: clampInt(ch.maxMolWt, 150, 900, 320),
    maxAlerts: clampInt(ch.maxAlerts, 0, 5, 0),
    maxLogP: Number.isFinite(ch.maxLogP) ? Math.max(-2, Math.min(8, Number(ch.maxLogP))) : 3.2,
  };
  const maxGenerations = clampInt(body?.maxGenerations, 1, DISCOVERY_MAX_GENERATIONS, 2);
  const maxCandidatesPerGen = clampInt(body?.maxCandidatesPerGen, 1, DISCOVERY_MAX_CANDIDATES, 12);
  try {
    const result = discovery.runCampaign(db, { projectId, challenge, seeds, maxGenerations, maxCandidatesPerGen, referenceSet: seeds.map((s) => s.smiles) });
    const dossier = discovery.buildDossier(db, result.campaignId);
    return ok({ campaignId: result.campaignId, status: result.status, stopReason: result.stopReason, generations: result.generations, dossier }, 201);
  } catch (e) {
    return err(500, 'campaign_failed', String(e?.message ?? e));
  }
}

/** POST /api/projects/:id/necropolis/failures — zapisuje region porażki tego najemcy. Editor+. */
function recordFailureHandler(db, role, projectId, body) {
  if (!atLeast(role, 'editor')) return err(403, 'forbidden', 'Zapis pamięci porażek wymaga roli editor lub wyższej.');
  const failureClass = String(body?.failureClass ?? '').trim().slice(0, 80);
  if (!failureClass) return err(400, 'invalid_failure', 'Podaj failureClass.');
  const pv = body?.parameterVector && typeof body.parameterVector === 'object' && !Array.isArray(body.parameterVector) ? sanitizeNumberMap(body.parameterVector) : {};
  if (Object.keys(pv).length === 0) return err(400, 'invalid_failure', 'parameterVector musi być niepustą mapą liczb.');
  const scales = body?.scales && typeof body.scales === 'object' ? sanitizeNumberMap(body.scales) : null;
  const r = necropolis.recordFailure(db, {
    projectId, failureClass, context: String(body?.context ?? '').slice(0, 200) || null,
    domain: String(body?.domain ?? '').slice(0, 80) || null, parameterVector: pv, scales,
    failureMode: String(body?.failureMode ?? '').slice(0, 200) || null,
    provenance: body?.provenance && typeof body.provenance === 'object' ? body.provenance : {},
  });
  return ok({ region: r.region, duplicate: r.duplicate }, r.duplicate ? 200 : 201);
}

/* ---------------- Handlery uwierzytelniania ---------------- */

function issueSession(db, user) {
  const token = generateToken();
  createSession(db, { userId: user.id, token, ttlMs: SESSION_TTL_MS });
  return ok({ token, user, expiresInMs: SESSION_TTL_MS }, 201);
}

/* ---------------- Self-service billing dashboard (Stage 2) ---------------- */

/** The user's primary API key (one key per owner; keys are hashed, so pick by owner). */
function primaryKeyFor(db, user) {
  const billing = getBillingCustomer(db, user.email);
  const keys = listApiKeysByOwner(db, user.email);
  return { key: keys[0] ?? null, billing };
}

/**
 * Masked key view (Stage 8). Keys are hashed at rest, so the dashboard shows only the
 * non-secret hint (e.g. `gk_AbCd…WxYz`). The full key is returned exactly once — at
 * creation / regeneration — via keyView(k, { reveal: true }).
 */
function keyView(k, { reveal = false } = {}) {
  if (!k) return null;
  return {
    key: reveal ? k.key : (k.keyHint ?? '••••'),
    masked: !reveal,
    tier: k.tier, usageCount: k.usageCount, monthlyLimit: k.monthlyLimit,
    remaining: Math.max(0, k.monthlyLimit - k.usageCount), resetDate: k.resetDate,
  };
}

/** GET /api/account/billing — plan, status, renewal, usage/quota, key, Stripe availability. */
function accountBillingView(db, user) {
  const { key, billing } = primaryKeyFor(db, user);
  const tier = billing?.tier ?? key?.tier ?? 'free';
  const status = billing?.status ?? (key ? 'active' : 'inactive');
  const renewalState = status === 'active' ? 'RENEWING' : status === 'canceled' ? 'CANCELED' : 'NONE';
  return {
    email: user.email,
    plan: { tier, status, renewalState },
    apiKey: keyView(key),
    stripeConfigured: billingConfigured(billingConfig()),
    availableTiers: Object.keys(API_TIERS),
  };
}

/**
 * POST /api/account/api-key/regenerate — revoke old key(s), mint a fresh one at the
 * current tier, and reveal it ONCE. Stage 8: wrapped in a transaction (PART 8) so a
 * crash can never leave the user with zero keys, and billing stores only the hint.
 */
function regenerateAccountKey(db, user) {
  const billing = getBillingCustomer(db, user.email);
  const tier = billing?.tier ?? 'free';
  db.prepare('BEGIN').run();
  let fresh;
  try {
    for (const k of listApiKeysByOwner(db, user.email)) deleteApiKey(db, k.key); // old keys stop working
    fresh = createApiKey(db, { ownerEmail: user.email, tier });
    if (billing) upsertBillingCustomer(db, { ownerEmail: user.email, apiKey: fresh.keyHint });
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
  return ok({ apiKey: keyView(fresh, { reveal: true }) }); // full key shown exactly once
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
  // Zaproszenia wysłane na ten adres, ZANIM konto powstało, stają się członkostwem
  // w chwili rejestracji — zaproszona osoba loguje się i od razu widzi wspólną pracę.
  const claimed = claimInvitesForUser(db, { email: user.email, userId: user.id });
  const session = issueSession(db, user);
  return claimed.length ? { ...session, body: { ...session.body, claimedInvites: claimed } } : session;
}

function login(db, body) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  // Genesis 2.0 (M2): brute-force lockout per konto. Sprawdzamy PRZED weryfikacją hasła.
  const lock = loginLockState(db, email);
  if (lock.locked) {
    return err(429, 'account_locked', `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${Math.ceil(lock.retryAfterMs / 60_000)} min.`);
  }
  const user = getUserByEmail(db, email);
  // Ten sam komunikat dla „brak konta" i „złe hasło" — brak wycieku, kto ma konto.
  if (!user || !verifyPassword(password, getPasswordHash(db, user.id))) {
    recordLoginFailure(db, email);
    return err(401, 'invalid_credentials', 'Nieprawidłowy e-mail lub hasło.');
  }
  clearLoginAttempts(db, email); // udane logowanie zeruje licznik
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
