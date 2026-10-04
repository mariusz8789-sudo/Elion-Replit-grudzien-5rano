/**
 * Klient trwałego backendu Genesis OS (Milestone 1: Backend Persistence).
 *
 * Typowane opakowanie na REST API z packages/backend (auth, projekty, RBAC,
 * trwałe Serie Prób). Każde wywołanie zwraca dyskryminowaną unię
 * `{ ok: true; data } | { ok: false; ... }` — brak wyjątków w ścieżce
 * happy/expected, więc UI zawsze dostaje jawny wynik do pokazania.
 *
 * Świadome zasady:
 *  - moduł jest BEZSTANOWY (token przekazywany argumentem) → łatwo testowalny
 *    ze zamockowanym fetch; stan sesji trzyma osobno session.ts;
 *  - local-first zostaje domyślną ścieżką aplikacji — ten klient to WARSTWA
 *    współdzielenia w chmurze, nie zamiennik trybu offline;
 *  - żadne pole wrażliwe (hash hasła) nie istnieje po stronie klienta — backend
 *    go nie zwraca.
 */

import type { GenesisSpatialDataset } from '../experimentFabric/spatialImport';
import type { AccountProfile } from '../accountProfiles';

export interface User {
  id: string;
  email: string;
  displayName: string;
  /** Profil konta wybrany przy rejestracji (backend: users.account_profile). Starsze zapisane sesje mogą go nie mieć do pierwszego /auth/me. */
  accountProfile?: AccountProfile;
  createdAt: number;
}

export type ProjectRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  visibility: 'private' | 'public';
  createdAt: number;
  role?: ProjectRole;
}

export interface Member {
  userId: string;
  role: ProjectRole;
  email: string;
  displayName: string;
  createdAt: number;
}

export type CloudTrialStatus = 'baseline' | 'draft' | 'promising' | 'failed';

export interface CloudTrial {
  id: string;
  projectId: string;
  experimentId: string;
  authorId: string;
  index: number;
  label: string;
  params: Record<string, number>;
  outputs: Record<string, number>;
  status: CloudTrialStatus;
  note: string;
  parentId: string | null;
  modelVersion: string;
  branchId: string | null;
  createdAt: number;
}

export interface Session {
  token: string;
  user: User;
  expiresInMs: number;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  /**
   * `responseBody` niesie SUROWĄ odpowiedź nieudanego żądania. Bez tego
   * odmowa, którą backend opisuje szczegółowo w ciele (np. „RDKit niedostępny
   * — skonfiguruj GENESIS_RDKIT_PYTHON" w polu `run.message` przy HTTP 400),
   * spłaszczała się do „Błąd serwera (400)". Powód odmowy jest wynikiem
   * naukowym, a nie szumem transportowym, więc nie wolno go tracić.
   */
  | { ok: false; status: number; error: string; message: string; responseBody?: unknown };

const API_BASE = '/api';

function fail(status: number, error: string, message: string, responseBody?: unknown): { ok: false; status: number; error: string; message: string; responseBody?: unknown } {
  return { ok: false, status, error, message, ...(responseBody === undefined ? {} : { responseBody }) };
}

/** Jedno miejsce na fetch + parsowanie + mapowanie błędów sieci/serwera na wynik. */
async function request<T>(
  method: string,
  path: string,
  { token, body }: { token?: string | null; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return fail(0, 'offline', 'Brak połączenia z backendem. Tryb lokalny (local-first) działa bez zmian.');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* pusta lub niepoprawna odpowiedź — zostaje null, obsłużone niżej */
  }

  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; run?: { error?: string; message?: string } };
    // Ciało dołączamy tylko wtedy, gdy niesie WIĘCEJ niż {error, message} —
    // czyli gdy spłaszczenie faktycznie coś gubi. Odpowiedź zawierająca
    // wyłącznie te dwa pola jest już w całości odwzorowana w wyniku.
    const extraDetail = data !== null && typeof data === 'object'
      && Object.keys(data as Record<string, unknown>).some((key) => key !== 'error' && key !== 'message');
    // Odmowa opisana wewnątrz `run` jest bardziej konkretna niż status HTTP.
    return fail(
      res.status,
      d.error ?? d.run?.error ?? 'error',
      d.message ?? d.run?.message ?? `Błąd serwera (${res.status}).`,
      extraDetail ? data : undefined,
    );
  }
  return { ok: true, data: data as T };
}

/* ---------------- Uwierzytelnianie ---------------- */

export function register(email: string, password: string, displayName?: string, accountProfile?: AccountProfile): Promise<ApiResult<Session>> {
  return request<Session>('POST', '/auth/register', { body: { email, password, displayName, accountProfile } });
}

export function login(email: string, password: string): Promise<ApiResult<Session>> {
  return request<Session>('POST', '/auth/login', { body: { email, password } });
}

export function logout(token: string): Promise<ApiResult<{ ok: true }>> {
  return request('POST', '/auth/logout', { token });
}

export async function me(token: string): Promise<ApiResult<User>> {
  const r = await request<{ user: User }>('GET', '/auth/me', { token });
  return r.ok ? { ok: true, data: r.data.user } : r;
}

/* ---------------- Projekty i członkostwa (RBAC) ---------------- */

export async function listProjects(token: string): Promise<ApiResult<Project[]>> {
  const r = await request<{ projects: Project[] }>('GET', '/projects', { token });
  return r.ok ? { ok: true, data: r.data.projects } : r;
}

export async function createProject(
  token: string,
  name: string,
  description = '',
): Promise<ApiResult<Project>> {
  const r = await request<{ project: Project }>('POST', '/projects', { token, body: { name, description } });
  return r.ok ? { ok: true, data: r.data.project } : r;
}

export async function listMembers(token: string, projectId: string): Promise<ApiResult<Member[]>> {
  const r = await request<{ members: Member[] }>('GET', `/projects/${projectId}/members`, { token });
  return r.ok ? { ok: true, data: r.data.members } : r;
}

export async function addMember(
  token: string,
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<ApiResult<Member[]>> {
  const r = await request<{ members: Member[] }>('POST', `/projects/${projectId}/members`, {
    token,
    body: { email, role },
  });
  return r.ok ? { ok: true, data: r.data.members } : r;
}

/* ---------------- Trwałe Serie Prób ---------------- */

export interface NewCloudTrial {
  experimentId: string;
  label?: string;
  params: Record<string, number>;
  outputs: Record<string, number>;
  status?: CloudTrialStatus;
  note?: string;
  parentId?: string | null;
  modelVersion?: string;
  branchId?: string;
}

export async function listCloudTrials(
  token: string,
  projectId: string,
  experimentId?: string,
  branchId?: string,
): Promise<ApiResult<CloudTrial[]>> {
  const params = new URLSearchParams();
  if (experimentId) params.set('experimentId', experimentId);
  if (branchId) params.set('branchId', branchId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ trials: CloudTrial[] }>('GET', `/projects/${projectId}/trials${q}`, { token });
  return r.ok ? { ok: true, data: r.data.trials } : r;
}

export async function createCloudTrial(
  token: string,
  projectId: string,
  trial: NewCloudTrial,
): Promise<ApiResult<CloudTrial>> {
  const r = await request<{ trial: CloudTrial }>('POST', `/projects/${projectId}/trials`, { token, body: trial });
  return r.ok ? { ok: true, data: r.data.trial } : r;
}

export async function updateCloudTrial(
  token: string,
  projectId: string,
  trialId: string,
  patch: { label?: string; status?: CloudTrialStatus; note?: string },
): Promise<ApiResult<CloudTrial>> {
  const r = await request<{ trial: CloudTrial }>('PATCH', `/projects/${projectId}/trials/${trialId}`, {
    token,
    body: patch,
  });
  return r.ok ? { ok: true, data: r.data.trial } : r;
}

export function deleteCloudTrial(token: string, projectId: string, trialId: string): Promise<ApiResult<{ ok: true }>> {
  return request('DELETE', `/projects/${projectId}/trials/${trialId}`, { token });
}

/* ---------------- Knowledge Ingestion ---------------- */

export type KnowledgeExtractionStatus = 'EXTRACTED' | 'NO_EXTRACTABLE_TEXT' | 'EXTRACTION_UNAVAILABLE' | 'EXTRACTION_FAILED';
export type KnowledgeEpistemicStatus = 'USER_PROVIDED_UNREVIEWED';

export interface KnowledgeMaterial {
  id: string;
  projectId: string;
  title: string;
  materialKey: string;
  currentVersion: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  versionId: string | null;
  version: number | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  contentSha256: string | null;
  topics: string[];
  sourceUrl: string | null;
  extractionStatus: KnowledgeExtractionStatus | null;
  epistemicStatus: KnowledgeEpistemicStatus | null;
  provenance: { kind?: string; solverEffect?: string; extraction?: { status?: string; extractor?: string } };
  extractedText?: string;
  excerpt?: string;
  originalBase64?: string;
}

export interface KnowledgeUpload {
  fileName: string;
  mimeType: 'text/plain' | 'text/markdown' | 'application/pdf' | 'application/json';
  title?: string;
  topics?: string[];
  sourceUrl?: string;
  contentBase64: string;
}

export async function listKnowledgeMaterials(token: string, projectId: string): Promise<ApiResult<KnowledgeMaterial[]>> {
  const r = await request<{ materials: KnowledgeMaterial[] }>('GET', `/projects/${projectId}/knowledge-materials`, { token });
  return r.ok ? { ok: true, data: r.data.materials } : r;
}

export async function uploadKnowledgeMaterial(token: string, projectId: string, upload: KnowledgeUpload): Promise<ApiResult<KnowledgeMaterial>> {
  const r = await request<{ material: KnowledgeMaterial }>('POST', `/projects/${projectId}/knowledge-materials`, { token, body: upload });
  return r.ok ? { ok: true, data: r.data.material } : r;
}

export async function searchKnowledgeMaterials(token: string, projectId: string, query: string): Promise<ApiResult<KnowledgeMaterial[]>> {
  const q = new URLSearchParams({ q: query.slice(0, 500) }).toString();
  const r = await request<{ materials: KnowledgeMaterial[] }>('GET', `/projects/${projectId}/knowledge-materials/search?${q}`, { token });
  return r.ok ? { ok: true, data: r.data.materials } : r;
}

/* ---------------- Project-scoped GIS artifacts ---------------- */

export interface ProjectSpatialDataset {
  id: string;
  projectId: string;
  datasetId: string;
  label: string;
  dataset: GenesisSpatialDataset;
  originalSha256: string;
  createdBy: string;
  createdAt: number;
  originalBase64?: string;
}

export interface ProjectSpatialDatasetUpload {
  label: string;
  dataset: GenesisSpatialDataset;
  originalBase64: string;
}

export async function listProjectSpatialDatasets(token: string, projectId: string): Promise<ApiResult<ProjectSpatialDataset[]>> {
  const r = await request<{ datasets: ProjectSpatialDataset[] }>('GET', `/projects/${projectId}/spatial-datasets`, { token });
  return r.ok ? { ok: true, data: r.data.datasets } : r;
}

export async function uploadProjectSpatialDataset(token: string, projectId: string, upload: ProjectSpatialDatasetUpload): Promise<ApiResult<ProjectSpatialDataset>> {
  const r = await request<{ dataset: ProjectSpatialDataset }>('POST', `/projects/${projectId}/spatial-datasets`, { token, body: upload });
  return r.ok ? { ok: true, data: r.data.dataset } : r;
}

export async function getProjectSpatialDataset(token: string, projectId: string, datasetId: string): Promise<ApiResult<ProjectSpatialDataset>> {
  const r = await request<{ dataset: ProjectSpatialDataset }>('GET', `/projects/${projectId}/spatial-datasets/${datasetId}`, { token });
  return r.ok ? { ok: true, data: r.data.dataset } : r;
}

/* ---------------- Scientific Git: gałęzie, scalanie, kontrybucje ---------------- */

export interface Branch {
  id: string;
  projectId: string;
  name: string;
  baseBranchId: string | null;
  createdBy: string;
  createdAt: number;
}

export type MergeStatus = 'open' | 'approved' | 'rejected' | 'merged';

export interface MergeRequest {
  id: string;
  projectId: string;
  sourceBranchId: string;
  targetBranchId: string;
  title: string;
  description: string;
  status: MergeStatus;
  createdBy: string;
  createdAt: number;
  decidedBy: string | null;
  decidedAt: number | null;
  reviewNote: string;
  mergedCount: number;
}

export interface Contributor {
  userId: string;
  displayName: string;
  email: string;
  trials: number;
  firstAt: number;
  lastAt: number;
}

export interface ContributionGraph {
  contributors: Contributor[];
  perDay: Record<string, number>;
  totalTrials: number;
}

export async function listBranches(token: string, projectId: string): Promise<ApiResult<Branch[]>> {
  const r = await request<{ branches: Branch[] }>('GET', `/projects/${projectId}/branches`, { token });
  return r.ok ? { ok: true, data: r.data.branches } : r;
}

export async function createBranch(
  token: string,
  projectId: string,
  name: string,
  opts: { baseBranchId?: string; fork?: boolean } = {},
): Promise<ApiResult<Branch>> {
  const r = await request<{ branch: Branch }>('POST', `/projects/${projectId}/branches`, {
    token,
    body: { name, baseBranchId: opts.baseBranchId, fork: opts.fork ?? false },
  });
  return r.ok ? { ok: true, data: r.data.branch } : r;
}

export async function listMergeRequests(token: string, projectId: string): Promise<ApiResult<MergeRequest[]>> {
  const r = await request<{ mergeRequests: MergeRequest[] }>('GET', `/projects/${projectId}/merge-requests`, { token });
  return r.ok ? { ok: true, data: r.data.mergeRequests } : r;
}

export async function createMergeRequest(
  token: string,
  projectId: string,
  sourceBranchId: string,
  targetBranchId: string,
  title: string,
  description = '',
): Promise<ApiResult<MergeRequest>> {
  const r = await request<{ mergeRequest: MergeRequest }>('POST', `/projects/${projectId}/merge-requests`, {
    token,
    body: { sourceBranchId, targetBranchId, title, description },
  });
  return r.ok ? { ok: true, data: r.data.mergeRequest } : r;
}

export async function decideMergeRequest(
  token: string,
  projectId: string,
  mrId: string,
  approve: boolean,
  reviewNote = '',
): Promise<ApiResult<MergeRequest>> {
  const r = await request<{ mergeRequest: MergeRequest }>('POST', `/projects/${projectId}/merge-requests/${mrId}/decide`, {
    token,
    body: { approve, reviewNote },
  });
  return r.ok ? { ok: true, data: r.data.mergeRequest } : r;
}

export async function getContributions(token: string, projectId: string): Promise<ApiResult<ContributionGraph>> {
  const r = await request<{ contributions: ContributionGraph }>('GET', `/projects/${projectId}/contributions`, { token });
  return r.ok ? { ok: true, data: r.data.contributions } : r;
}

/* ---------------- Compute engine + Drug Discovery ---------------- */

export interface Capability {
  id: string;
  label: string;
  category: string;
  status: 'AVAILABLE' | 'NOT_IMPLEMENTED' | 'EXTERNAL_ENGINE_REQUIRED' | 'MODEL_NOT_VALID_FOR_DOMAIN' | 'BLOCKED_BY_RUNTIME';
  modelId?: string;
  engine?: string | null;
  version?: string | null;
  fingerprint?: string;
  executionStatus?: string;
  requires?: string;
  adapter?: string;
  note?: string;
}

export interface Target {
  id: string; projectId: string; name: string; targetType: string; geneProtein: string;
  organism: string; indication: string; mechanism: string; constraints: string;
  evidenceStatus: string; provenance: string; createdAt: number;
}

export interface Candidate {
  id: string; projectId: string; targetId: string | null; label: string; formula: string;
  smiles: string; composition: Record<string, number>; molecularWeight: number | null;
  charge: number; parentId: string | null; generationMethod: string; createdAt: number;
}

export interface ScoreComponent { id: string; label: string; kind: 'calculated' | 'heuristic'; value: number; unit?: string; note?: string; }
export interface CapabilityGap { id: string; label: string; status: string; requires?: string | null; note?: string | null; }

export interface CandidatePassport {
  candidateId: string; targetId: string | null; label: string;
  representation: { formula: string | null; smiles: string | null; charge: number };
  calculatedProperties: Record<string, number>;
  modelsExecuted: { modelId: string; version: string | null; status: string }[];
  scoreComponents: ScoreComponent[];
  uncertainty: string; modelDomainStatus: string;
  conflicts: unknown[]; capabilityGaps: CapabilityGap[]; warnings: string[];
  requiredLaboratoryValidation: string[];
  measurementRecommendations: { capability: string; label: string; status: string; requires?: string }[];
  runIds: string[]; verdict: string;
}

export interface RankedCandidate {
  rank: number; candidateId: string; label: string;
  rankBasis: { lipinskiMwPass: number; chemistryComputed: number; molarMassGmol: number | null };
  capabilityGapCount: number; note: string;
}

export type ResearchIntakeStatus =
  | 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'BLOCKED_IDENTITY' | 'BLOCKED_TARGET'
  | 'BLOCKED_SOURCE' | 'BLOCKED_MODALITY' | 'CONFLICTING_IDENTITY' | 'UNSUPPORTED';

export interface ResearchIntakeCandidate {
  candidateId: string | null;
  label: string | null;
  origin: 'SOURCE_BACKED_KNOWN_COMPOUND' | 'USER_SUPPLIED_COMPOUND' | 'GENERATED_HYPOTHESIS' | 'UNRESOLVED';
  missingInformation: string[];
  supportingEvidenceIds: string[];
  synthesisReadiness: { classification: string; reasons: string[] } | null;
  researchGateStatus: { verdict: string; reasons?: string[] } | null;
}

export interface ResearchIntakeResult {
  contractVersion: string;
  normalizedResearchQuestion: string;
  status: ResearchIntakeStatus;
  inputKind: string;
  candidateMatrix: ResearchIntakeCandidate[];
  blockedCapabilities: string[];
  evidenceReferences: string[];
  selectionExplanation: string;
  selectedResearchPriorityCandidate: string | null;
  nextExperiment: { requiredNextData: string[]; requiredSpecialistCapability: string | null; researchPlanPlaceholder: string };
  limitations: string[];
  deterministicFingerprint: string;
}

export interface ResearchIntakeResponse {
  result: ResearchIntakeResult;
  campaignDraft: { prepared: boolean; campaignId?: string; seededCandidateIds?: string[]; reason?: string } | null;
}

/** Governed question/name/formula/SMILES intake; the backend remains the sole identity and campaign authority. */
export function runResearchIntake(
  token: string,
  projectId: string,
  input: { originalQuery: string; declaredInputKind?: string; maxCandidateBudget?: number; prepareCampaignDraft?: boolean },
): Promise<ApiResult<ResearchIntakeResponse>> {
  return request<ResearchIntakeResponse>('POST', `/projects/${projectId}/research-intake`, { token, body: input });
}

/* ---------------- ResearchRun (R1-a..R1-c): question → plan → experiment → verdict → Evidence → Replay → next ---------------- */

/** Scoped to one frozen hypothesis under its protocol; never a statement of scientific truth. */
export type ResearchRunVerdict = 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE';
export type ResearchRunReplayVerdict = 'MATCH' | 'DRIFT' | 'ENGINE_VERSION_CHANGED' | 'BLOCKED_BY_RUNTIME' | 'REPLAY_UNSUPPORTED' | 'NOT_APPLICABLE';
export type ResearchRunNextStep =
  | 'FORMALIZE_PROBLEM' | 'PROPOSE_PLAN' | 'EXECUTE_EXPERIMENT' | 'PROPOSE_EVIDENCE' | 'PROPOSE_NEXT_EXPERIMENT'
  | 'AWAITING_EXECUTION' | 'AWAITING_HUMAN_REVIEW' | 'STATE_INTEGRITY_FAILURE' | 'NONE';

export interface ResearchRunReplay {
  verificationId?: string;
  verdict: ResearchRunReplayVerdict;
  originalOutputHash?: string | null;
  replayOutputHash?: string | null;
  replayEngineVersion?: string | null;
  verifiedAt?: number;
  reason?: string;
}

export interface ResearchRunExperiment {
  experimentId: string;
  frozen: { hypothesisId: string; claim: string; engineId: string; input: Record<string, unknown>; inputHash: string; protocolId: string; predictionFingerprint: string; preregistrationFingerprint: string; criteria: Array<Record<string, unknown>> } | null;
  execution: { status: string; engine: { engineId: string; engineLabel: string | null; version: string | null }; output: Record<string, unknown>; inputHash: string; outputHash: string; scienceRunId: string | null; startedAt: string; finishedAt: string } | null;
  falsification: { verdict: ResearchRunVerdict; scope: string; criteria: Array<Record<string, unknown>> } | null;
  evidence: { evidenceProposalId: string; status: 'PROPOSED'; publication: 'REQUIRES_HUMAN_APPROVAL' } | null;
  next: { replay: ResearchRunReplay | null; proposal: { action: 'EXECUTE_NEXT_HYPOTHESIS' | 'HUMAN_REVIEW'; hypothesisId?: string; engineId?: string; reason: string }; decidedBy: string } | null;
}

export interface ResearchRunView {
  researchRunId: string;
  /** The canonical AgentRun behind the research run; its `status` is what pause, resume and cancel change. */
  run?: AgentRunSummary;
  question: string;
  plan: { hypotheses: Array<{ hypothesisId: string; claim: string; experimentProposal?: { kind: string; engineId?: string; decision?: string } }> } | null;
  experiments: ResearchRunExperiment[];
  nextStep: ResearchRunNextStep;
  researchState: { chain: { ok: boolean }; events: Array<{ seq: number; type: string }> };
}

/** One question → one research run (deduplicated by the server). */
export function startResearchRun(token: string, projectId: string, question: string): Promise<ApiResult<{ deduped: boolean; researchRun: ResearchRunView }>> {
  return request('POST', `/projects/${projectId}/research-runs`, { token, body: { question } });
}

export function getResearchRun(token: string, projectId: string, researchRunId: string): Promise<ApiResult<{ researchRun: ResearchRunView }>> {
  return request('GET', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}`, { token });
}

/** One row of `GET /research-runs`: the server's own summary, nothing derived on the client. */
export interface ResearchRunSummary {
  researchRunId: string;
  question: string;
  status: string;
  nextStep: ResearchRunNextStep;
  events: number;
  createdAt: number;
}

export function listResearchRuns(token: string, projectId: string): Promise<ApiResult<{ researchRuns: ResearchRunSummary[] }>> {
  return request('GET', `/projects/${projectId}/research-runs`, { token });
}

/**
 * A ResearchRun experiment job in the durable lease queue (backend compute/workerInfrastructureContract.mjs).
 * The queue clears `workerId`, `leaseId` and `leaseExpiresAt` when a job ends, so a finished job no longer names its worker.
 */
export type ResearchRunJobState = 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'DEAD_LETTER';

export interface ResearchRunQueueJob {
  jobId: string;
  researchRunId: string;
  experimentId: string;
  capabilityId: string;
  state: string;
  workerId: string | null;
  leaseId: string | null;
  leaseExpiresAt: number | null;
  attempts: number;
  maxAttempts: number;
  timeoutMs: number;
  payload: { projectId?: string; hypothesisId?: string | null; userId?: string | null };
  result: unknown;
  /** Set when the job ended badly, e.g. `{ code: 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS' }` or the worker's `{ code, status, retryable }`. */
  failure: { code?: string; [key: string]: unknown } | null;
  cancelReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ResearchRunControlAction = 'pause' | 'resume' | 'cancel';

/**
 * What a pause, resume or cancel did, as the server reports it. During a pause `queue.inFlight` lists the
 * jobs a worker had already claimed: they are NOT interrupted and run to their end.
 */
export interface ResearchRunControlResult {
  ok: true;
  status: string;
  researchRun: ResearchRunView;
  queue: { withdrawn: string[]; inFlight: string[]; requeued: string[]; refused: string[] };
}

export function controlResearchRun(
  token: string, projectId: string, researchRunId: string, action: ResearchRunControlAction, reason?: string,
): Promise<ApiResult<ResearchRunControlResult>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/${action}`, { token, body: reason ? { reason } : {} });
}

export function getResearchRunJob(token: string, projectId: string, researchRunId: string, jobId: string): Promise<ApiResult<{ job: ResearchRunQueueJob }>> {
  return request('GET', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/experiment-jobs/${encodeURIComponent(jobId)}`, { token });
}

export function cancelResearchRunJob(token: string, projectId: string, researchRunId: string, jobId: string): Promise<ApiResult<{ job: ResearchRunQueueJob }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/experiment-jobs/${encodeURIComponent(jobId)}/cancel`, { token });
}

/* ---------------- Genesis Verify: one submitted record → integrity, ledger anchor, replay → one report ---------------- */

export type GenesisVerifyVerdict = 'MATCH' | 'DRIFT' | 'TAMPERED' | 'BLOCKED';
export type GenesisVerifyCheckStatus = 'PASS' | 'FAIL' | 'NOT_RUN';
export type GenesisVerifyCheckId = 'readable' | 'file-hash' | 'provenance' | 'content-hash' | 'ledger-anchor' | 'replay';

/** The report exactly as packages/backend/src/genesisVerify.mjs builds it; nothing here is derived on the client. */
export interface GenesisVerifyReport {
  kind: string;
  version: string;
  verdict: GenesisVerifyVerdict;
  meaning: string;
  reasons: string[];
  input: {
    shape: 'EXECUTION_BUNDLE' | 'EXECUTION_RECORD' | 'UNKNOWN' | null;
    submittedSha256: string | null;
    declaredSha256: string | null;
    researchRunId: string | null;
    experimentId: string | null;
    engine: { engineId: string | null; engineLabel: string | null } | null;
    engineStatus: string | null;
  };
  hashes: Record<string, string | null>;
  replay: { capability: string; replayEngineVersion: string | null; hashMatch: boolean; maxRelativeDiff: number | null; tolerance: number } | null;
  checks: Array<{ id: GenesisVerifyCheckId | string; label: string; status: GenesisVerifyCheckStatus | string; detail: string }>;
  notChecked: string[];
  signature: string;
  boundary: string;
  reportFingerprint: string;
  generatedAt: string;
}

/** POST /genesis-verify. `record` is the file text as the customer has it (the bytes are hashed server-side). */
export function runGenesisVerify(
  token: string, projectId: string, input: { record: string; declaredSha256?: string | null; format?: 'html' },
): Promise<ApiResult<{ report: GenesisVerifyReport; html?: string }>> {
  const body: Record<string, unknown> = { record: input.record };
  if (input.declaredSha256) body.declaredSha256 = input.declaredSha256;
  if (input.format) body.format = input.format;
  return request('POST', `/projects/${projectId}/genesis-verify`, { token, body });
}

/** The exported record of one executed experiment: the exact bytes Genesis issued, and their sha256. */
export interface GenesisRecordExport {
  researchRunId: string;
  experimentId: string;
  fileName: string;
  mimeType: string;
  record: string;
  sha256: string;
  size: number;
  custody: { status: string; artifactRef: { sha256: string; size: number; key?: string } | null };
}

export function exportResearchRunRecord(token: string, projectId: string, researchRunId: string, experimentId: string): Promise<ApiResult<GenesisRecordExport>> {
  return request('GET', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/experiments/${encodeURIComponent(experimentId)}/record`, { token });
}

/** The model PROPOSES hypotheses and experiments; nothing it says becomes evidence. */
export function proposeResearchPlan(token: string, projectId: string, researchRunId: string): Promise<ApiResult<{ deduped: boolean; researchRun: ResearchRunView }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/proposals`, { token });
}

/**
 * Freezes the prediction, runs the real engine, falsifies, proposes evidence, replays and proposes the
 * next experiment. An engine that is not available answers 503 BLOCKED, with nothing substituted.
 */
export function executeResearchExperiment(
  token: string, projectId: string, researchRunId: string, hypothesisId?: string,
): Promise<ApiResult<{ status: 'EXECUTED' | 'ALREADY_EXECUTED'; deduped: boolean; experimentId: string; experiment?: ResearchRunExperiment; researchRun: ResearchRunView }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/experiments`, { token, body: hypothesisId ? { hypothesisId } : {} });
}

/** Re-runs one executed experiment through the existing Scientific Run verifier; append-only. */
export function replayResearchExperiment(
  token: string, projectId: string, researchRunId: string, experimentId: string,
): Promise<ApiResult<{ experimentId: string; verification: ResearchRunReplay; replays: ResearchRunReplay[] }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/experiments/${encodeURIComponent(experimentId)}/replays`, { token });
}

/* ---------------- Candidate → laboratory loop on a ResearchRun (backend researchRunLab.mjs) ---------------- */

/** Codes the server sends; every one of them is the server's, the client only says them in words. */
export type LabReviewVerdict = 'ACCEPTED_AS_OBSERVATION' | 'NEEDS_CLARIFICATION' | 'REJECTED_INTEGRITY';
export type LabQualityStatus = 'QC_PASSED' | 'QC_FAILED' | 'QC_UNKNOWN';
export type LabProviderType = 'CRO' | 'ACADEMIC_LAB' | 'INTERNAL_LAB' | 'OTHER_EXTERNAL';

export interface LabTolerance { absolute: number | null; relative: number | null }

export interface LabEndpointInput {
  endpointId: string;
  assay: string;
  outputKey: string;
  expectedUnit: string;
  tolerance: { absolute?: number; relative?: number };
}

export interface LabRequest {
  requestId: string;
  requestFingerprint: string;
  researchRunId: string;
  experimentId: string;
  candidateRef: string;
  candidateInput: Record<string, unknown> | null;
  objective: string;
  endpoint: { endpointId: string; assay: string; expectedUnit: string; tolerance: LabTolerance; comparisonOutputKey: string };
  modelBinding: { outputKey: string; modelValue: number; unit: string; outputHash: string; inputHash: string; scienceRunId: string | null; predictionFingerprint: string; preregistrationFingerprint: string };
  computationalEvidence: { evidenceProposalId: string; evidenceStatus: string; replayVerdict: string; protocolVerdict: string };
  externalProvider: { providerId: string | null; providerType: LabProviderType } | null;
  requestedBy: string | null;
  status: string;
  requiresHumanApproval: boolean;
  executionAuthority: string;
  labels: { modelValue: string; labResult: string };
  claimBoundary: string;
}

export interface LabReview {
  observationId: string;
  requestId: string;
  verdict: LabReviewVerdict;
  reviewerId: string;
  note: string | null;
  reviewFingerprint: string;
}

export interface LabObservation {
  observationId: string;
  observationFingerprint: string;
  requestId: string;
  endpointId: string;
  value: number | string | boolean;
  unit: string;
  observedAt: string;
  methodReference: string;
  rawArtifactSha256: string;
  rawArtifactIntegrity: { level: 'VERIFIED_BY_GENESIS' | 'DECLARED_BY_CLIENT'; byteLength: number | null; limitation: string };
  source: { labId: string; providerType: LabProviderType; externalObservationId: string; sourceUri: string };
  quality: { status: LabQualityStatus; confidence: number; notes: string | null };
  ingestedBy: string;
  status: string;
  evidenceClass: string;
  clinicalEfficacy: string;
  /** The latest review, attached by GET /lab; absent on the POST answer. */
  review?: LabReview | null;
}

export interface LabComparison {
  comparisonId: string;
  requestId: string;
  observationId: string;
  experimentId: string;
  endpointId: string;
  outputKey: string;
  model: { label: string; value: number; outputHash: string };
  measurement: { label: string; value: number; observationId: string };
  unit: string;
  delta: number;
  deltaAbs: number;
  deltaRel: number;
  toleranceChecks: Array<{ kind: 'absolute' | 'relative'; threshold: number; actual: number; pass: boolean }>;
  verdict: 'AGREES_WITHIN_TOLERANCE' | 'DISAGREES_OUTSIDE_TOLERANCE';
  clinicalEfficacy: string;
  claimBoundary: string;
}

export interface LabEvidenceLink {
  observationId: string;
  requestId: string;
  proposalId: string;
  evidenceContentHash: string | null;
  mode: string;
  status: string;
  evidenceClass: string;
}

export interface LabLoopState {
  researchRunId: string;
  requests: LabRequest[];
  observations: LabObservation[];
  comparisons: LabComparison[];
  evidenceLinks: LabEvidenceLink[];
  nextResearchAction: { action: string; reason?: string };
  clinicalEfficacy: string;
  claimBoundary: string;
  labFingerprint: string;
}

/** The package for an external laboratory, exactly as the server builds it. UNSIGNED by construction. */
export interface LabPackage {
  kind: string;
  packageVersion: string;
  requestId: string;
  requestFingerprint: string;
  forLaboratory: {
    candidate: { identity: string | null; reference: string };
    objective: string;
    endpoint: { endpointId: string; assay: string; expectedUnit: string };
    pleaseReturn: string[];
    status: string;
    labels: { genesisSide: string; yourResult: string };
  };
  integrity: { signature: { status: string; statement: string }; method: string };
  humanApproval: { required: boolean; state: string; note: string };
  claimBoundary: string;
  technicalDetails: Record<string, unknown>;
  packageHash: string;
}

export interface LabPackageVerification { ok: boolean; status: 'VALID_INTEGRITY_ONLY' | 'REJECTED'; signature: string; failures: string[] }

export interface LabObservationInput {
  endpointId: string;
  value: number;
  unit: string;
  observedAt: string;
  methodReference: string;
  source: { labId: string; providerType: LabProviderType; externalObservationId: string; sourceUri: string };
  quality: { status: LabQualityStatus; notes?: string };
  /** The raw file's bytes; Genesis computes their sha256 itself. */
  rawArtifactBase64: string;
}

const labPath = (projectId: string, researchRunId: string) => `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/lab`;

export function getLabLoop(token: string, projectId: string, researchRunId: string): Promise<ApiResult<{ lab: LabLoopState }>> {
  return request('GET', labPath(projectId, researchRunId), { token });
}

export function prepareLabRequest(
  token: string, projectId: string, researchRunId: string,
  input: { experimentId: string; endpoint: LabEndpointInput; objective?: string; externalProvider?: { providerId: string; providerType: LabProviderType } },
): Promise<ApiResult<{ deduped: boolean; request: LabRequest }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/requests`, { token, body: input });
}

export function getLabPackage(token: string, projectId: string, researchRunId: string, requestId: string): Promise<ApiResult<{ package: LabPackage }>> {
  return request('GET', `${labPath(projectId, researchRunId)}/requests/${encodeURIComponent(requestId)}/package`, { token });
}

export function verifyLabPackage(token: string, projectId: string, researchRunId: string, pkg: unknown): Promise<ApiResult<{ verification: LabPackageVerification }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/package`, { token, body: { package: pkg } });
}

export function ingestLabObservation(
  token: string, projectId: string, researchRunId: string, requestId: string, observation: LabObservationInput,
): Promise<ApiResult<{ deduped: boolean; observation: LabObservation }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/observations`, { token, body: { requestId, observation } });
}

/** The reviewer is the signed-in person; the server never takes a reviewer name from the body. */
export function reviewLabObservation(
  token: string, projectId: string, researchRunId: string, observationId: string, verdict: LabReviewVerdict, note?: string,
): Promise<ApiResult<{ deduped: boolean; review: LabReview }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/observations/${encodeURIComponent(observationId)}`, { token, body: note ? { verdict, note } : { verdict } });
}

export function compareLabObservation(token: string, projectId: string, researchRunId: string, observationId: string): Promise<ApiResult<{ deduped: boolean; comparison: LabComparison }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/observations/${encodeURIComponent(observationId)}/compare`, { token });
}

export function proposeLabEvidence(token: string, projectId: string, researchRunId: string, observationId: string): Promise<ApiResult<{ deduped: boolean; link: LabEvidenceLink }>> {
  return request('POST', `${labPath(projectId, researchRunId)}/observations/${encodeURIComponent(observationId)}/evidence`, { token });
}

/* ---------------- Deliverables of a ResearchRun: Evidence Pack and customer delivery ---------------- */

/** The canonical Evidence Pack (backend researchRunEvidencePack.mjs); opaque apart from what the screen names. */
export interface ResearchRunEvidencePack {
  researchRunId: string;
  experiments: unknown[];
  [key: string]: unknown;
}

export function getResearchRunEvidencePack(token: string, projectId: string, researchRunId: string): Promise<ApiResult<{ pack: ResearchRunEvidencePack }>> {
  return request('GET', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/evidence-pack`, { token });
}

export interface CustomerDeliveryResult {
  delivery: { status: string; exportAllowed: boolean; scientificBlockers: unknown[]; deliveryFingerprint: string; delivered: boolean; approvalBoundary: string; [key: string]: unknown };
  exportArtifact?: { ok: boolean; status: string; artifact?: { fileName: string; mediaType: string; byteLength: number; sha256: string; content: string } };
}

/** A read-only projection of the run through the commercial release gate; it never delivers, signs or bills. */
export function getCustomerDelivery(token: string, projectId: string, researchRunId: string): Promise<ApiResult<CustomerDeliveryResult>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/customer-delivery`, { token, body: { includeExportArtifact: true } });
}

export interface GeneratedScientificAnalysis {
  analysisId: string;
  proposal: {
    analysisId: string; objective: string; methodSummary: string; expectedOutputKeys: string[];
    sourceHash: string; environmentFingerprint: string; status: 'PROPOSED'; epistemicStatus: 'NOT_EVIDENCE';
  } | null;
  execution: {
    analysisId: string; status: string; failureCode?: string | null; output?: Record<string, unknown>;
    outputHash?: string | null; sourceHash: string; environmentFingerprint: string;
    stdoutHash?: string | null; stderrHash?: string | null; epistemicStatus: 'NOT_EVIDENCE';
    evidenceEligibility?: 'REQUIRES_SEPARATE_REVIEW';
  } | null;
  replays: Array<{
    analysisId: string; verdict: 'MATCH' | 'DRIFT'; outputHash: string | null;
    sourceHash: string; environmentFingerprint: string; epistemicStatus: 'NOT_EVIDENCE';
  }>;
}

export function listGeneratedScientificAnalyses(
  token: string, projectId: string, researchRunId: string,
): Promise<ApiResult<{ generatedAnalyses: GeneratedScientificAnalysis[] }>> {
  return request('GET', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/generated-analyses`, { token });
}

export function generateScientificAnalysis(
  token: string, projectId: string, researchRunId: string, objective: string,
): Promise<ApiResult<{ deduped: boolean; execution: NonNullable<GeneratedScientificAnalysis['execution']>; researchRun: ResearchRunView }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/generated-analyses`, { token, body: { objective } });
}

export function replayGeneratedScientificAnalysis(
  token: string, projectId: string, researchRunId: string, analysisId: string,
): Promise<ApiResult<{ status: 'REPLAYED'; verdict: 'MATCH' | 'DRIFT'; replay: GeneratedScientificAnalysis['replays'][number]; researchRun: ResearchRunView }>> {
  return request('POST', `/projects/${projectId}/research-runs/${encodeURIComponent(researchRunId)}/generated-analyses/${encodeURIComponent(analysisId)}/replay`, { token });
}

export type ComputeValue = string | number | boolean;

export interface ComputeRun {
  runId: string; modelId: string; modelName?: string; modelVersion: string; domain: string; engine?: string;
  status: 'ok' | 'rejected' | 'error'; inputs?: Record<string, ComputeValue>; outputs?: Record<string, ComputeValue>; units?: Record<string, string>;
  warnings?: string[]; validity?: string; assumptions?: string[]; deterministic?: boolean;
  provenance?: {
    source: string; formula: string; honesty: string; engine?: string; requiredEnvironmentVariable?: string;
    classification?: string; referencePdb?: string; mobilePdb?: string;
    referenceSha256?: string; mobileSha256?: string; requiredEnvironmentVariables?: string[];
  };
  message?: string;
}

/** Uruchamia model na backendzie (publiczne, efemeryczne). Do weryfikacji „na serwerze" w labach (P4). */
export async function runCompute(modelId: string, inputs: Record<string, ComputeValue>): Promise<ApiResult<ComputeRun>> {
  const r = await request<{ run: ComputeRun; persisted: boolean }>('POST', '/compute/run', { body: { modelId, inputs } });
  return r.ok ? { ok: true, data: r.data.run } : r;
}

export interface FabricComputeContract {
  contractVersion: string;
  request: { required: string[]; optional: string[]; inputRule: string };
  response: { statuses: string[]; provenance: string; capabilityRule: string };
  models: { id: string; version: string; domain: string; inputs: { id: string; type: string; unit?: string; min?: number; max?: number }[]; outputs: { id: string; unit?: string }[]; deterministic: boolean }[];
}

export interface FabricComputeResponse {
  contractVersion: string;
  request: { sourceText: string | null; domainId: string | null; modelId: string; requestedVisualization: string | null };
  run: ComputeRun;
  persisted: boolean;
}

/** Public, typed access to the model-first Fabric contract; external capability seams never execute through this endpoint. */
export interface ProjectAccess {
  projectId: string;
  accessLevel: 'PUBLIC' | 'RESEARCH' | 'RESTRICTED';
  role: ProjectRole;
  canRun: boolean;
}

export interface AccessAuditEntry {
  id: string; projectId: string; userId: string | null; action: string; accessLevel: ProjectAccess['accessLevel'];
  workflow: string; sourceIds: string[]; runId: string | null; resultStatus: string | null; details: Record<string, unknown>; createdAt: number;
}

export interface ResearchAccessStatus {
  projectId: string;
  sources: { id: string; label: string; access: ProjectAccess['accessLevel']; status: 'AVAILABLE' | 'REQUIRES_AUTH'; credentialEnv: string | null }[];
  policy: string;
}

export async function getProjectAccess(token: string, projectId: string): Promise<ApiResult<ProjectAccess>> {
  const r = await request<ProjectAccess>('GET', `/projects/${projectId}/access`, { token });
  return r;
}

export async function getResearchAccessStatus(token: string, projectId: string): Promise<ApiResult<ResearchAccessStatus>> {
  return request<ResearchAccessStatus>('GET', `/projects/${projectId}/research-access`, { token });
}

export async function listProjectAccessAudit(token: string, projectId: string, limit = 40): Promise<ApiResult<AccessAuditEntry[]>> {
  const r = await request<{ entries: AccessAuditEntry[] }>('GET', `/projects/${projectId}/audit?limit=${encodeURIComponent(String(limit))}`, { token });
  return r.ok ? { ok: true, data: r.data.entries } : r;
}

export async function getFabricComputeContract(): Promise<ApiResult<FabricComputeContract>> {
  const r = await request<{ contract: FabricComputeContract }>('GET', '/compute/fabric/contract');
  return r.ok ? { ok: true, data: r.data.contract } : r;
}

export async function runFabricCompute(input: {
  modelId: string;
  inputs: Record<string, ComputeValue>;
  sourceText?: string;
  domainId?: string;
  requestedVisualization?: string;
  seed?: number;
  projectId?: string;
}): Promise<ApiResult<FabricComputeResponse>> {
  return request<FabricComputeResponse>('POST', '/compute/fabric/run', {
    body: { contractVersion: '1.0.0', ...input },
  });
}

export async function runAdmetPrediction(smiles: readonly string[]): Promise<ApiResult<{ predictions: Record<string, Record<string, number>>; version: string; runId: string; engine: string; resultOrigin: string }>> {
  return request<{ predictions: Record<string, Record<string, number>>; version: string; runId: string; engine: string; resultOrigin: string }>('POST', '/compute/admet/predict', { body: { smiles } });
}

export interface QuantumAtom { element: string; x: number; y: number; z: number }
export async function runQuantumSinglePoint(input: { atoms: readonly QuantumAtom[]; charge?: number; spin?: number; basis?: string; method?: string }): Promise<ApiResult<{ data: Record<string, string | number | boolean>; meta: Record<string, string | number> | null; runId: string; resultOrigin: string }>> {
  return request<{ data: Record<string, string | number | boolean>; meta: Record<string, string | number> | null; runId: string; resultOrigin: string }>('POST', '/compute/qm/singlepoint', { body: input });
}

export async function listCapabilities(): Promise<ApiResult<Capability[]>> {
  const r = await request<{ capabilities: Capability[] }>('GET', '/compute/capabilities');
  return r.ok ? { ok: true, data: r.data.capabilities } : r;
}

export async function listTargets(token: string, projectId: string): Promise<ApiResult<Target[]>> {
  const r = await request<{ targets: Target[] }>('GET', `/projects/${projectId}/targets`, { token });
  return r.ok ? { ok: true, data: r.data.targets } : r;
}
export async function createTarget(token: string, projectId: string, target: Partial<Target> & { name: string }): Promise<ApiResult<Target>> {
  const r = await request<{ target: Target }>('POST', `/projects/${projectId}/targets`, { token, body: target });
  return r.ok ? { ok: true, data: r.data.target } : r;
}
export async function listCandidates(token: string, projectId: string, targetId?: string): Promise<ApiResult<Candidate[]>> {
  const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : '';
  const r = await request<{ candidates: Candidate[] }>('GET', `/projects/${projectId}/candidates${q}`, { token });
  return r.ok ? { ok: true, data: r.data.candidates } : r;
}
export async function createCandidate(token: string, projectId: string, candidate: { label: string; formula: string; targetId?: string; smiles?: string; generationMethod?: string }): Promise<ApiResult<Candidate>> {
  const r = await request<{ candidate: Candidate }>('POST', `/projects/${projectId}/candidates`, { token, body: candidate });
  return r.ok ? { ok: true, data: r.data.candidate } : r;
}
export async function getCandidatePassport(token: string, projectId: string, candidateId: string): Promise<ApiResult<CandidatePassport>> {
  const r = await request<{ passport: CandidatePassport }>('GET', `/projects/${projectId}/candidates/${candidateId}/passport`, { token });
  return r.ok ? { ok: true, data: r.data.passport } : r;
}
export async function getCandidateRanking(token: string, projectId: string, targetId?: string): Promise<ApiResult<RankedCandidate[]>> {
  const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : '';
  const r = await request<{ ranking: RankedCandidate[] }>('GET', `/projects/${projectId}/candidates/ranking${q}`, { token });
  return r.ok ? { ok: true, data: r.data.ranking } : r;
}

/* ---------------- Scientific Acceleration Engine: kampanie naukowe ---------------- */

export type ToolStatus =
  | 'AVAILABLE' | 'UNVALIDATED' | 'CAPABILITY_GAP' | 'BLOCKED_BY_RUNTIME'
  | 'BLOCKED_BY_LICENSE' | 'BLOCKED_BY_RESOURCES' | 'VALIDATION_FAILED';

export interface ToolchainEntry {
  toolId: string; engineName: string; domain: string; license: string;
  status: ToolStatus; version: string | null; engine: string | null;
  modelDomain: string; assumptions: string;
  validation: { id: string; pass: boolean; expected?: number; actual?: number; expectProduct?: string; products?: string[] | null }[] | null;
  reason?: string | null;
}

export interface CampaignStats {
  candidatesGenerated: number; valid: number; invalid: number; duplicates: number;
  rejected: number; retained: number; paretoFront: number; decisions: number;
  diversity: number | null; hypervolume: number | null;
}

export interface Campaign {
  id: string; projectId: string; objective: string; domain: string;
  status: 'created' | 'running' | 'completed' | 'cancelled';
  currentGeneration: number; stopReason: string | null;
  budget: { maxGenerations?: number; maxGeneratedCandidates?: number };
  strategy: { startingSmiles?: string[]; transformationWeights?: Record<string, number>; parentSelection?: string };
  final?: { paretoFront?: { smiles: string; objectiveVector: Record<string, number> }[]; hypervolumeStart?: number; hypervolumeEnd?: number } | null;
  stats?: CampaignStats;
  lastDecision?: { generation: number; decision: string; purpose: string } | null;
  createdAt: number; updatedAt: number;
}

export interface CampaignCandidate {
  id: string; generation: number; parentSmiles: string | null; transformation: string | null;
  canonicalSmiles: string; valid: boolean; descriptors: Record<string, number>;
  objectiveVector: Record<string, number>; constraintViolations: unknown[];
  pareto: boolean; status: string; rejectedReason: string | null; runIds: string[];
}

export interface CampaignDecision {
  id: string; generation: number; decision: string; purpose: string;
  algorithm: string; metrics: Record<string, unknown>; params: Record<string, unknown>;
}

export interface DiscoveryGraph {
  campaignId: string;
  stats: { nodes: number; edges: number; candidates: number; decisions: number };
  nodes: { id: string; type: string; label: string; generation?: number; status?: string; pareto?: boolean }[];
  edges: { from: string; to: string; type: string; label?: string }[];
}

export interface WhyAnswer { ok: boolean; answer?: string; reason?: string; evidence?: unknown; }

/* ---------------- D-149: live scientific ingestion with a sha256 per fetch ---------------- */

export type ScientificIngestionSource = 'pdb' | 'chembl' | 'uniprot' | 'clinicaltrials';
/** LIVE = HTTP 200 from the allowlisted URL; NO_ACCESS = network refused / non-200; PINNED_FALLBACK = repo copy for that exact id. */
export type ScientificIngestionStatus = 'LIVE' | 'NO_ACCESS' | 'PINNED_FALLBACK';

export interface ScientificIngestionPinned {
  path: string;
  sha256: string;
  bytes: number;
  recordedSha256: string;
  recordedIn: string;
  matchesRecord: boolean;
  nature: string;
}

export interface ScientificIngestionResult {
  source: ScientificIngestionSource;
  id: string;
  url: string;
  status: ScientificIngestionStatus;
  httpStatus: number | null;
  sha256: string | null;
  bytes: number;
  fetchedAt: string;
  error?: string;
  finalUrl?: string;
  pinned?: ScientificIngestionPinned;
  note?: string;
}

export interface ScientificIngestionSourceStatus {
  source: ScientificIngestionSource;
  label: string;
  idPattern: string;
  allowlist: string;
  defaultId: string;
  pinnedIds: string[];
  lastResult: ScientificIngestionResult | null;
}

export interface ScientificIngestionStatusReport {
  sources: ScientificIngestionSourceStatus[];
  statuses: ScientificIngestionStatus[];
  caveat: string;
}

export async function ingestScientificSource(source: ScientificIngestionSource, id: string): Promise<ApiResult<ScientificIngestionResult>> {
  const params = new URLSearchParams({ source, id });
  const r = await request<{ result: ScientificIngestionResult }>('GET', `/ingestion/source?${params.toString()}`);
  return r.ok ? { ok: true, data: r.data.result } : r;
}

export function getScientificIngestionStatus(): Promise<ApiResult<ScientificIngestionStatusReport>> {
  return request<ScientificIngestionStatusReport>('GET', '/ingestion/status');
}

export async function listToolchain(): Promise<ApiResult<ToolchainEntry[]>> {
  const r = await request<{ toolchain: ToolchainEntry[] }>('GET', '/compute/toolchain');
  return r.ok ? { ok: true, data: r.data.toolchain } : r;
}

export async function listCampaigns(token: string, projectId: string): Promise<ApiResult<Campaign[]>> {
  const r = await request<{ campaigns: Campaign[] }>('GET', `/projects/${projectId}/campaigns`, { token });
  return r.ok ? { ok: true, data: r.data.campaigns } : r;
}

export async function createCampaign(
  token: string, projectId: string,
  body: {
    objective: string; startingSmiles: string[]; budget?: { maxGenerations?: number; maxGeneratedCandidates?: number };
    /** Real objective/constraint override (see `core/discovery/discoveryGoalIntent.ts`) — omitted means the
     * backend's own `DEFAULT_OBJECTIVES`/`DEFAULT_CONSTRAINTS` apply, identical to today's behavior. */
    objectives?: { id: string; targetProperty: string; target: number; scale?: number }[];
    constraints?: { id: string; property: string; op: 'lte' | 'gte'; value: number }[];
  },
): Promise<ApiResult<Campaign>> {
  const r = await request<{ campaign: Campaign }>('POST', `/projects/${projectId}/campaigns`, { token, body });
  return r.ok ? { ok: true, data: r.data.campaign } : r;
}

export async function getCampaign(token: string, projectId: string, campaignId: string): Promise<ApiResult<Campaign>> {
  const r = await request<{ campaign: Campaign }>('GET', `/projects/${projectId}/campaigns/${campaignId}`, { token });
  return r.ok ? { ok: true, data: r.data.campaign } : r;
}

export async function startCampaign(token: string, projectId: string, campaignId: string): Promise<ApiResult<{ campaign: Campaign; jobId: string }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/start`, { token });
}

export async function cancelCampaign(token: string, projectId: string, campaignId: string): Promise<ApiResult<{ campaign: Campaign }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/cancel`, { token });
}

export async function listCampaignCandidates(token: string, projectId: string, campaignId: string): Promise<ApiResult<CampaignCandidate[]>> {
  const r = await request<{ candidates: CampaignCandidate[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/candidates`, { token });
  return r.ok ? { ok: true, data: r.data.candidates } : r;
}

export interface ProjectJob { id: string; type: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; progress: number; error: string | null }
export async function getProjectJob(token: string, projectId: string, jobId: string): Promise<ApiResult<ProjectJob>> {
  const r = await request<{ job: ProjectJob }>('GET', `/projects/${projectId}/jobs/${jobId}`, { token });
  return r.ok ? { ok: true, data: r.data.job } : r;
}

/** Append-only campaign events after `afterSeq` (0 = all), in insertion order — the live run's source of truth. */
export async function listCampaignEvents(token: string, projectId: string, campaignId: string, afterSeq = 0): Promise<ApiResult<import('../liveExperiment/drugRunState').CampaignEventRecord[]>> {
  const r = await request<{ events: import('../liveExperiment/drugRunState').CampaignEventRecord[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/events?after=${Math.max(0, Math.floor(afterSeq))}`, { token });
  return r.ok ? { ok: true, data: r.data.events } : r;
}

export async function listCampaignDecisions(token: string, projectId: string, campaignId: string): Promise<ApiResult<CampaignDecision[]>> {
  const r = await request<{ decisions: CampaignDecision[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/decisions`, { token });
  return r.ok ? { ok: true, data: r.data.decisions } : r;
}

export async function getDiscoveryGraph(token: string, projectId: string, campaignId: string): Promise<ApiResult<DiscoveryGraph>> {
  const r = await request<{ graph: DiscoveryGraph }>('GET', `/projects/${projectId}/campaigns/${campaignId}/graph`, { token });
  return r.ok ? { ok: true, data: r.data.graph } : r;
}

export interface ScientificComputeReport {
  reportId: string; campaignId: string; status: string; compoundCount: number; candidateIds: string[];
  stages: { capability: string; status: string; runIds: string[]; evidenceClasses: string[] }[];
  runs: ScienceRun[]; replay: { runId: string; status: string; verificationCount: number }[];
  evidence: string; limitations: string[]; provenance: { source: string; reportVersion: string };
}

export async function getScientificComputeReport(token: string, projectId: string, campaignId: string): Promise<ApiResult<ScientificComputeReport>> {
  const r = await request<{ report: ScientificComputeReport }>('GET', `/projects/${projectId}/campaigns/${campaignId}/report`, { token });
  return r.ok ? { ok: true, data: r.data.report } : r;
}

export interface ScienceRun {
  id: string; campaignId: string | null; candidateId: string | null;
  engine: string; engineVersion: string | null; capability: string; method: string | null;
  status: string; evidenceClass: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>;
  units: Record<string, string>; warnings: string[]; provenance: Record<string, unknown>;
  inputHash: string | null; outputHash: string | null;
  artifacts: { kind: string; path: string; sha256_16?: string }[]; durationMs: number; createdAt: number;
  environmentHash: string | null;
}

/** Priority B (Scientific Reproducibility): a replay-verification attempt for one Scientific Run. */
export interface ScienceRunVerification {
  id: string; scienceRunId: string;
  verdict: 'MATCH' | 'DRIFT' | 'ENGINE_VERSION_CHANGED' | 'BLOCKED_BY_RUNTIME' | 'REPLAY_UNSUPPORTED';
  originalOutputHash: string | null; replayOutputHash: string | null;
  originalEngineVersion: string | null; replayEngineVersion: string | null;
  detail: Record<string, unknown>; createdAt: number;
}

export interface ModelConflict {
  candidateId: string; smiles: string; classification: string;
  resultA: { engine: string; value: number; verdict: string };
  resultB: { engine: string; value: number; unit?: string; verdict: string };
  applicability: string; recommendation: string;
}

export interface ScienceEnvironment {
  runtime: { os: string; arch: string; python: string; cpuCount: number; memoryGb: number | null; diskFreeGb: number | null; gpu: boolean; cuda?: boolean };
  engines: Record<string, { kind: string; status: string; version: string | null; reason?: string }>;
}

export async function getScienceEnvironment(): Promise<ApiResult<{ environment: ScienceEnvironment; auditId: string; auditedAt: number }>> {
  return request('GET', '/compute/environment');
}

/* ---------------- Bezpieczeństwo: audyt podatności zależności (npm audit) ---------------- */

export type DependencyFindingStatus = 'SUSPECTED' | 'INVESTIGATING' | 'VALIDATED' | 'REJECTED' | 'FIXED' | 'VERIFIED';

export interface DependencyAuditFinding {
  id: string;
  status: DependencyFindingStatus;
  severity: string;
  affectedComponent: string;
  range: string | null;
  isDirect: boolean;
  evidence: { advisoryTitles: string[]; advisoryUrls: string[]; via: unknown[] };
  hypothesis: string;
  remediation: string;
  regressionStatus: string;
}

export interface DependencyAuditResult {
  findings: DependencyAuditFinding[];
  summary: { total: number; bySeverity: Record<string, number> };
  auditedAt: number;
}

/**
 * Realny `npm audit` na wdrożonym repo (security/dependencyAudit.mjs — "the
 * one honest slice of Genesis Cyber"), zmapowany na SUSPECTED-only findings.
 * Wymaga zalogowania — patrz komentarz przy trasie w api.mjs.
 */
export async function getDependencyAudit(token: string): Promise<ApiResult<DependencyAuditResult>> {
  return request('GET', '/security/dependency-audit', { token });
}

export async function listCampaignScienceRuns(token: string, projectId: string, campaignId: string): Promise<ApiResult<ScienceRun[]>> {
  const r = await request<{ scienceRuns: ScienceRun[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/science-runs`, { token });
  return r.ok ? { ok: true, data: r.data.scienceRuns } : r;
}

export async function listCampaignConflicts(token: string, projectId: string, campaignId: string): Promise<ApiResult<ModelConflict[]>> {
  const r = await request<{ conflicts: ModelConflict[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/conflicts`, { token });
  return r.ok ? { ok: true, data: r.data.conflicts } : r;
}

/**
 * Priority B (Scientific Reproducibility): re-executes the real engine for a
 * Scientific Run and compares against the stored result. Editor+ (costs real
 * compute — e.g. reloading the ADMET-AI model). Appends to an audit history,
 * never overwrites a prior verification.
 */
/** One persisted Science Run (docking runs carry the top Vina pose and the pocket that lines it). */
export async function getScienceRun(token: string, projectId: string, campaignId: string, runId: string): Promise<ApiResult<ScienceRun>> {
  const r = await request<{ scienceRun: ScienceRun }>('GET', `/projects/${projectId}/campaigns/${campaignId}/science-runs/${runId}`, { token });
  return r.ok ? { ok: true, data: r.data.scienceRun } : r;
}

export async function verifyScienceRun(
  token: string, projectId: string, campaignId: string, runId: string,
): Promise<ApiResult<ScienceRunVerification>> {
  const r = await request<{ verification: ScienceRunVerification }>('POST', `/projects/${projectId}/campaigns/${campaignId}/science-runs/${runId}/verify`, { token });
  return r.ok ? { ok: true, data: r.data.verification } : r;
}

export async function listScienceRunVerifications(
  token: string, projectId: string, campaignId: string, runId: string,
): Promise<ApiResult<ScienceRunVerification[]>> {
  const r = await request<{ verifications: ScienceRunVerification[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/science-runs/${runId}/verifications`, { token });
  return r.ok ? { ok: true, data: r.data.verifications } : r;
}

/**
 * SCIENTIFIC MEMORY (server side). `preregisterExperiment` must be called BEFORE the campaign starts
 * — the server refuses a preregistration for a campaign whose engines already ran. `sealExperimentSession`
 * writes the finished run; the server checks it against the preregistration and returns its own
 * derivation of the verdict in the record, so what comes back is a verified record, not an echo.
 */
export interface ExperimentRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly kind: 'PREREGISTRATION' | 'SESSION';
  readonly seq: number;
  readonly fingerprint: string;
  readonly contentHash: string;
  readonly prevChainHash: string | null;
  readonly chainHash: string;
  readonly preregistrationId: string | null;
  readonly preregCheck: string | null;
  readonly body: Record<string, unknown>;
  readonly createdAt: number;
}

export interface ExperimentMemory {
  readonly preregistration: ExperimentRecord | null;
  readonly sessions: readonly ExperimentRecord[];
  readonly chain: { readonly ok: boolean; readonly length: number; readonly brokenAt: number | null; readonly reason: string | null };
}

export async function preregisterExperiment(
  token: string, projectId: string, campaignId: string, hypothesis: unknown,
): Promise<ApiResult<{ preregistration: ExperimentRecord; status: string }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/experiment-memory/preregistration`, { token, body: { hypothesis } });
}

export async function sealExperimentSession(
  token: string, projectId: string, campaignId: string, session: unknown,
): Promise<ApiResult<{ session: ExperimentRecord; status: string; deduped: boolean }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/experiment-memory/sessions`, { token, body: { session } });
}

export async function getExperimentMemory(token: string, projectId: string, campaignId: string): Promise<ApiResult<ExperimentMemory>> {
  const r = await request<{ memory: ExperimentMemory }>('GET', `/projects/${projectId}/campaigns/${campaignId}/experiment-memory`, { token });
  return r.ok ? { ok: true, data: r.data.memory } : r;
}

/* ---------------- Genesis Mind research state (ENTITY-0) ---------------- */

export interface AgentRunSummary {
  readonly id: string;
  readonly projectId: string;
  readonly goal: string;
  readonly domain: string;
  readonly status: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PersistedResearchState {
  readonly events: readonly unknown[];
  readonly chain: { readonly ok: boolean; readonly length: number; readonly head: string | null; readonly brokenAt: number | null; readonly reason: string | null };
}

export async function createAgentRun(token: string, projectId: string, goal: string, domain: string): Promise<ApiResult<{ run: AgentRunSummary }>> {
  return request('POST', `/projects/${projectId}/agent-runs`, { token, body: { goal, domain } });
}

export async function getPersistedResearchState(token: string, projectId: string, runId: string): Promise<ApiResult<PersistedResearchState>> {
  const r = await request<{ researchState: PersistedResearchState }>('GET', `/projects/${projectId}/agent-runs/${runId}/research-state`, { token });
  return r.ok ? { ok: true, data: r.data.researchState } : r;
}

export async function appendPersistedResearchStateEvent(
  token: string, projectId: string, runId: string, event: unknown,
): Promise<ApiResult<{ event: unknown; head: string; deduped: boolean }>> {
  return request('POST', `/projects/${projectId}/agent-runs/${runId}/research-state`, { token, body: { event } });
}

/**
 * THE FINAL PROTOCOL — the artefact the experiment ends with, assembled by the backend from persisted
 * state only. The shape is deliberately loose here: the frontend shows what the record contains and
 * never fills a gap in it, so a field the backend did not write simply does not appear on screen.
 */
export interface CandidateProtocol {
  readonly kind: string;
  readonly question?: string | null;
  readonly status?: string | null;
  readonly hypothesis?: { statement?: string | null; fingerprint?: string | null; registeredBeforeExecution?: boolean; criteria?: readonly { id: string; label?: string; critical?: boolean }[] } | null;
  readonly verdict?: { server?: string | null; rule?: string | null; check?: string | null; criteria?: readonly { id: string; status: string; observed?: string }[] } | null;
  readonly target?: Record<string, unknown> | null;
  readonly engines?: readonly { engine?: string; version?: string | null; capability?: string; evidence?: string }[];
  readonly funnel?: Record<string, unknown> | null;
  readonly finalists?: readonly Record<string, unknown>[];
  readonly synthesis?: Record<string, unknown> | null;
  readonly proposedValidationProtocol?: Record<string, unknown> | null;
  readonly nextStep?: string | null;
  readonly boundary?: string | null;
  readonly protocolFingerprint?: string | null;
  readonly [key: string]: unknown;
}

export async function getCandidateProtocol(token: string, projectId: string, campaignId: string): Promise<ApiResult<CandidateProtocol>> {
  const r = await request<{ protocol: CandidateProtocol }>('GET', `/projects/${projectId}/campaigns/${campaignId}/protocol`, { token });
  return r.ok ? { ok: true, data: r.data.protocol } : r;
}

export async function runCampaignStage(
  token: string, projectId: string, campaignId: string,
  config: {
    docking?: { enabled: boolean; budget?: number; targetId?: string; receptor?: { exhaustiveness?: number; nPoses?: number } };
    quantum?: { enabled: boolean; budget?: number };
    admet?: { enabled: boolean; thresholds?: Record<string, { max?: number; min?: number }> };
  },
): Promise<ApiResult<{ jobId: string }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/stage`, { token, body: config });
}

export async function getAdmetEndpoints(): Promise<ApiResult<{ id: string; name: string; category: string; taskType: string; units: string; publishedMetric: string | null; publishedMetricValue: number | null; source: string }[]>> {
  const r = await request<{ endpoints: { id: string; name: string; category: string; taskType: string; units: string; publishedMetric: string | null; publishedMetricValue: number | null; source: string }[] }>('GET', '/compute/admet/endpoints');
  return r.ok ? { ok: true, data: r.data.endpoints } : r;
}

export async function askCampaignWhy(
  token: string, projectId: string, campaignId: string,
  query: { kind: string; candidate?: string; generation?: number },
): Promise<ApiResult<WhyAnswer>> {
  const params = new URLSearchParams({ kind: query.kind });
  if (query.candidate) params.set('candidate', query.candidate);
  if (query.generation != null) params.set('generation', String(query.generation));
  const r = await request<{ why: WhyAnswer }>('GET', `/projects/${projectId}/campaigns/${campaignId}/why?${params.toString()}`, { token });
  return r.ok ? { ok: true, data: r.data.why } : r;
}

// === GENESIS LABORATORY CLOSED LOOP — governed external-lab validation (packages/backend/src/campaign/labClosedLoop.mjs) ===

export interface LabValidationRequest {
  requestId: string;
  requestFingerprint: string;
  protocolLink: {
    mode: 'PRECLINICAL_PROTOCOL' | 'GOVERNED_MANUAL_REQUEST';
    protocolFingerprint?: string;
    requiredWetLabId?: string;
    reason?: string;
    authorizedBy?: string;
  };
  campaignId: string;
  candidateId: string;
  objective: string;
  endpointPlan: {
    endpointId: string;
    expectedUnit: string | null;
    comparisonOutputKey: string | null;
    tolerance: { absolute?: number; relative?: number } | null;
    rationale: string | null;
  }[];
  researchGate: { verdict: string; reason: string };
  status: 'READY_FOR_EXTERNAL_LAB_REVIEW' | 'DRAFT_BLOCKED_BY_RESEARCH_GATE';
  claimBoundary: string;
}

export interface LabObservationPayload {
  observationId: string;
  observationFingerprint: string;
  requestId: string;
  campaignId: string;
  candidateId: string;
  endpointId: string;
  value: number | string | boolean;
  unit: string;
  observedAt: string;
  methodReference: string;
  rawArtifactSha256: string;
  source: {
    labId: string;
    providerType: 'CRO' | 'ACADEMIC_LAB' | 'INTERNAL_LAB' | 'OTHER_EXTERNAL';
    externalObservationId: string;
    sourceUri: string;
  };
  quality: { status: 'QC_PASSED' | 'QC_FAILED' | 'QC_UNKNOWN'; confidence: number; notes?: string | null };
  status: 'INGESTED_UNREVIEWED';
  evidenceClass: 'EXTERNAL_OBSERVATION';
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export interface LabObservationReview {
  observationId: string;
  candidateId: string;
  requestId: string;
  verdict: 'ACCEPTED_AS_OBSERVATION' | 'NEEDS_CLARIFICATION' | 'REJECTED_INTEGRITY';
  reviewerId: string;
  note: string | null;
  status: string;
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export interface LabModelObservationComparison {
  comparisonId: string;
  campaignId: string;
  candidateId: string;
  scienceRunId: string;
  observationId: string;
  endpointId: string;
  outputKey: string;
  modelValue: number;
  observedValue: number;
  unit: string | null;
  delta: number;
  deltaAbs: number;
  deltaRel: number;
  verdict: 'AGREES_WITHIN_TOLERANCE' | 'DISAGREES_OUTSIDE_TOLERANCE';
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

interface LabCampaignEvent<T = Record<string, unknown>> {
  id: string;
  campaignId: string;
  generation: number;
  type: string;
  payload: T;
  createdAt: number;
}

export interface LabValidationDossier {
  contractVersion: string;
  campaignId: string;
  candidateId: string;
  candidate: CampaignCandidate;
  researchGate: { verdict: string; reason: string; message?: string };
  scienceRuns: ScienceRun[];
  requests: LabCampaignEvent<LabValidationRequest>[];
  observations: {
    event: LabCampaignEvent<LabObservationPayload>;
    latestReview: LabCampaignEvent<LabObservationReview> | null;
  }[];
  evidenceLinks: LabCampaignEvent<{
    observationId: string;
    proposalId: string;
    evidenceContentHash: string | null;
    mode: 'PROPOSE_ONLY';
    status: 'PENDING_HUMAN_PUBLICATION';
  }>[];
  comparisons: LabCampaignEvent<LabModelObservationComparison>[];
  nextResearchAction: { action: string; reason: string; comparisonId?: string; claimBoundary?: string };
  dossierFingerprint: string;
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export async function getCampaignLabValidationDossier(
  token: string,
  projectId: string,
  campaignId: string,
  candidateId: string,
): Promise<ApiResult<LabValidationDossier>> {
  const params = new URLSearchParams({ candidate: candidateId });
  const result = await request<{ dossier: LabValidationDossier }>(
    'GET',
    `/projects/${projectId}/campaigns/${campaignId}/lab-validation?${params.toString()}`,
    { token },
  );
  return result.ok ? { ok: true, data: result.data.dossier } : result;
}

export async function createCampaignLabValidationRequest(
  token: string,
  projectId: string,
  campaignId: string,
  body: {
    candidateId: string;
    objective: string;
    endpointPlan: {
      endpointId: string;
      expectedUnit?: string;
      comparisonOutputKey?: string;
      tolerance?: { absolute?: number; relative?: number };
      rationale?: string;
    }[];
    externalProvider?: { providerId?: string; providerType?: string };
    preregistrationRef?: string;
    preclinicalProtocol?: unknown;
    requiredWetLabId?: string;
    governedManualRequest?: { reason: string };
  },
): Promise<ApiResult<LabValidationRequest>> {
  const result = await request<{ request: LabValidationRequest }>(
    'POST',
    `/projects/${projectId}/campaigns/${campaignId}/lab-validation`,
    { token, body },
  );
  return result.ok ? { ok: true, data: result.data.request } : result;
}

export async function ingestCampaignLabObservation(
  token: string,
  projectId: string,
  campaignId: string,
  body: {
    candidateId: string;
    requestId: string;
    observation: {
      endpointId: string;
      value: number | string | boolean;
      unit: string;
      observedAt: string;
      methodReference: string;
      rawArtifactSha256: string;
      source: {
        labId: string;
        providerType: 'CRO' | 'ACADEMIC_LAB' | 'INTERNAL_LAB' | 'OTHER_EXTERNAL';
        externalObservationId: string;
        sourceUri: string;
      };
      quality: { status: 'QC_PASSED' | 'QC_FAILED' | 'QC_UNKNOWN'; confidence: number; notes?: string };
    };
  },
): Promise<ApiResult<LabObservationPayload>> {
  const result = await request<{ observation: LabObservationPayload }>(
    'POST',
    `/projects/${projectId}/campaigns/${campaignId}/lab-validation/observations`,
    { token, body },
  );
  return result.ok ? { ok: true, data: result.data.observation } : result;
}

export async function reviewCampaignLabObservation(
  token: string,
  projectId: string,
  campaignId: string,
  observationId: string,
  body: {
    candidateId: string;
    verdict: 'ACCEPTED_AS_OBSERVATION' | 'NEEDS_CLARIFICATION' | 'REJECTED_INTEGRITY';
    note?: string;
  },
): Promise<ApiResult<{ review: LabObservationReview; evidenceProposalId: string | null }>> {
  const result = await request<{ review: LabObservationReview; evidenceProposal: { proposalId?: string } | null }>(
    'POST',
    `/projects/${projectId}/campaigns/${campaignId}/lab-validation/observations/${observationId}/review`,
    { token, body },
  );
  return result.ok
    ? { ok: true, data: { review: result.data.review, evidenceProposalId: result.data.evidenceProposal?.proposalId ?? null } }
    : result;
}

export async function compareCampaignLabObservation(
  token: string,
  projectId: string,
  campaignId: string,
  body: {
    candidateId: string;
    scienceRunId: string;
    observationId: string;
  },
): Promise<ApiResult<LabModelObservationComparison>> {
  const result = await request<{ comparison: LabModelObservationComparison }>(
    'POST',
    `/projects/${projectId}/campaigns/${campaignId}/lab-validation/comparisons`,
    { token, body },
  );
  return result.ok ? { ok: true, data: result.data.comparison } : result;
}

export type VirtualLabCapability =
  | 'molecular-descriptors'
  | 'quantum-chemistry'
  | 'molecular-dynamics'
  | 'molecular-docking'
  | 'protein-structure-ingestion'
  | 'maxwell-fdtd'
  | 'admet-estimation'
  | 'toxicity-risk-estimation';

export interface VirtualExperimentPlan {
  executionId: string;
  inputFingerprint: string;
  campaignId: string;
  candidateId: string;
  candidateSmiles: string;
  hypothesis: string;
  requestedCapability: VirtualLabCapability;
  status: 'PLANNED';
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export interface VirtualExperimentResult {
  executionId: string;
  campaignId: string;
  candidateId: string;
  hypothesis: string;
  requestedCapability: VirtualLabCapability;
  status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT' | 'BLOCKED_UNBOUND_ENGINE' | 'BLOCKED_RUNTIME_UNAVAILABLE' | 'BLOCKED_INVALID_INPUT' | 'FAILED_ENGINE';
  scienceRunId: string | null;
  selectedEngine: { toolId: string | null; engineName: string; engineVersion: string | null } | null;
  derivedOutput: Record<string, unknown> | null;
  epistemicClassification: 'COMPUTATIONAL_HYPOTHESIS' | 'IN_SILICO_SUPPORT' | 'IN_SILICO_CONFLICT' | 'UNKNOWN';
  limitations: string[];
  provenanceRefs: string[];
  outputFingerprint: string | null;
  replayStatus: string;
  reason: string | null;
  durationMs: number;
  executedAt: string;
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export interface ScientificExecutionEvent {
  id: string;
  type: 'EXPERIMENT_PLANNED' | 'INPUT_VALIDATED' | 'ENGINE_SELECTED' | 'ENGINE_OUTPUT_AVAILABLE' | 'RESULT_CREATED' | 'EVIDENCE_PROPOSED' | 'REPLAY_MATCH' | 'REPLAY_DRIFT' | 'REPLAY_BLOCKED' | 'EXECUTION_BLOCKED' | 'EXECUTION_FAILED' | 'EXECUTION_COMPLETED';
  status: 'RECORDED' | 'BLOCKED' | 'FAILED';
  occurredAt: number;
  executionId: string | null;
  sourceEventId: string;
  sourceEventType: string;
  detail: string;
}

export interface VirtualExperimentReplay {
  executionId: string;
  scienceRunId: string;
  verificationId: string;
  underlyingVerdict: string;
  replayStatus: 'REPLAY_MATCH' | 'REPLAY_DRIFT' | 'REPLAY_ENGINE_VERSION_CHANGED' | 'REPLAY_BLOCKED_BY_RUNTIME' | 'REPLAY_UNSUPPORTED';
  detail: string | Record<string, unknown>;
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export interface VirtualLabDossier {
  contractVersion: string;
  campaignId: string;
  candidateId: string;
  candidate: CampaignCandidate;
  plans: LabCampaignEvent<VirtualExperimentPlan>[];
  results: LabCampaignEvent<VirtualExperimentResult>[];
  replays: LabCampaignEvent<VirtualExperimentReplay>[];
  evidenceLinks: LabCampaignEvent<{ executionId: string; proposalId: string; mode: 'PROPOSE_ONLY'; status: 'PENDING_HUMAN_PUBLICATION' }>[];
  executionTimeline: ScientificExecutionEvent[];
  nextAction: { action: string; reason: string; claimBoundary?: string };
  dossierFingerprint: string;
  clinicalEfficacy: 'UNKNOWN';
  claimBoundary: string;
}

export async function getVirtualLabDossier(token: string, projectId: string, campaignId: string, candidateId: string): Promise<ApiResult<VirtualLabDossier>> {
  const query = new URLSearchParams({ candidate: candidateId });
  const result = await request<{ dossier: VirtualLabDossier }>('GET', `/projects/${projectId}/campaigns/${campaignId}/virtual-lab?${query.toString()}`, { token });
  return result.ok ? { ok: true, data: result.data.dossier } : result;
}

export async function planVirtualLabExperiment(token: string, projectId: string, campaignId: string, body: {
  candidateId: string;
  hypothesis: string;
  requestedCapability: VirtualLabCapability;
  params?: Record<string, unknown>;
  expectation?: { outputKey: string; comparator: 'LTE' | 'GTE' | 'EQ_WITHIN'; threshold: number; tolerance?: number } | null;
}): Promise<ApiResult<VirtualExperimentPlan>> {
  const result = await request<{ plan: VirtualExperimentPlan }>('POST', `/projects/${projectId}/campaigns/${campaignId}/virtual-lab`, { token, body });
  return result.ok ? { ok: true, data: result.data.plan } : result;
}

export async function executeVirtualLabExperiment(token: string, projectId: string, campaignId: string, candidateId: string, executionId: string): Promise<ApiResult<{ result: VirtualExperimentResult; evidenceProposalId: string | null }>> {
  const response = await request<{ result: VirtualExperimentResult; evidenceProposal: { proposalId?: string } | null }>('POST', `/projects/${projectId}/campaigns/${campaignId}/virtual-lab/execute`, { token, body: { candidateId, executionId } });
  return response.ok
    ? { ok: true, data: { result: response.data.result, evidenceProposalId: response.data.evidenceProposal?.proposalId ?? null } }
    : response;
}

export async function replayVirtualLabExperiment(token: string, projectId: string, campaignId: string, candidateId: string, executionId: string): Promise<ApiResult<VirtualExperimentReplay>> {
  const result = await request<{ replay: VirtualExperimentReplay }>('POST', `/projects/${projectId}/campaigns/${campaignId}/virtual-lab/${executionId}/replay`, { token, body: { candidateId } });
  return result.ok ? { ok: true, data: result.data.replay } : result;
}

export type LocalVideoCapability = 'TEXT_TO_VIDEO' | 'IMAGE_TO_VIDEO' | 'VIDEO_TO_VIDEO' | 'FRAME_ENHANCEMENT' | 'TEMPORAL_UPSCALE';
export type LocalVideoPlanStatus = 'READY' | 'BLOCKED_MODEL_UNAVAILABLE' | 'BLOCKED_GPU_UNAVAILABLE' | 'BLOCKED_RUNTIME' | 'BLOCKED_UNSUPPORTED_CAPABILITY';

export interface LocalVideoRuntimeStatus {
  capabilities: LocalVideoCapability[];
  runtime: {
    os: unknown;
    cpu: unknown;
    ram: { totalBytes?: number | null; freeBytes?: number | null };
    storage: { available: boolean; freeBytes: number | null; totalBytes: number | null };
    gpu: { available: boolean; devices?: Array<{ name?: string; vramMb?: number | null }>; source?: string | null };
    python: { available: boolean; version: string | null };
    pytorch: { available: boolean; version: string | null };
    diffusers: { available: boolean; version: string | null };
    transformers: { available: boolean; version: string | null };
    onnxruntimeDirectml: { available: boolean; version: string | null };
    ffmpeg: { available: boolean; version: string | null; source: string | null };
    localModels: { configured: boolean; checkpointCount: number };
  };
  mediaClass: 'GENERATED_MEDIA';
  mediaScope: 'VISUALIZATION_ONLY';
  evidenceEligible: false;
  scientificStateMutation: false;
}

export interface LocalVideoPlan {
  ready: boolean;
  status: LocalVideoPlanStatus;
  reason: string | null;
  controlPackageFingerprint: string | null;
  sourceScientificStateFingerprint: string | null;
  mediaClass: 'GENERATED_MEDIA';
  mediaScope: 'VISUALIZATION_ONLY';
  evidenceEligible: false;
  scientificStateMutation: false;
}

export function getLocalVideoRuntime(): Promise<ApiResult<LocalVideoRuntimeStatus>> {
  return request('GET', '/compute/local-video/runtime');
}

export async function planLocalVideoGeneration(input: {
  capability: LocalVideoCapability;
  worldId: string;
  scenarioId?: string | null;
  sourceScientificStateFingerprint: string;
  promptOrShotDescription?: string | null;
  cameraTrajectory?: unknown;
  cameraMetadata?: unknown;
  durationSeconds?: number | null;
  sourceRenderHash?: string | null;
}): Promise<ApiResult<LocalVideoPlan>> {
  const result = await request<{ plan: LocalVideoPlan }>('POST', '/compute/local-video/plan', { body: input });
  return result.ok ? { ok: true, data: result.data.plan } : result;
}

/* ---------------- Knowledge ingestion (Science Chat `/ingest <url>`): propose-only, human publishes ---------------- */

export interface KnowledgeProposal {
  proposalId: string;
  status: 'pending' | 'published' | 'rejected';
  approverId: string | null;
  claim: string;
  recordStatus: string;
  sourceKind: string;
  sourceUrl: string;
  contentHash: string;
}

export interface KnowledgeProposalsListing {
  proposals: KnowledgeProposal[];
  activeRecords: number;
  ledgerVersion: number;
  ledgerOk: boolean;
}

/** No auth required — reading pending/published/rejected proposals is public, same as the backend route. */
export async function listKnowledgeProposals(): Promise<ApiResult<KnowledgeProposalsListing>> {
  return request<KnowledgeProposalsListing>('GET', '/knowledge/proposals');
}

export interface PublishedKnowledgeRecord {
  id: string;
  claim: string;
  status: string;
  contentHash: string;
}

/** Requires a signed-in approver — the backend returns 401 without a token. */
export async function publishKnowledgeProposal(
  token: string, proposalId: string,
): Promise<ApiResult<{ published: PublishedKnowledgeRecord; activeRecords: number; ledgerOk: boolean }>> {
  return request('POST', `/knowledge/proposals/${encodeURIComponent(proposalId)}/publish`, { token });
}

/** Requires a signed-in approver — the backend returns 401 without a token. */
export async function rejectKnowledgeProposal(token: string, proposalId: string): Promise<ApiResult<Record<string, never>>> {
  return request('POST', `/knowledge/proposals/${encodeURIComponent(proposalId)}/reject`, { token });
}

/* ---------------- ENTITY-1: Genesis's view of itself (GET /api/genesis/self) ---------------- */

/** One engine: the adapter exists (`capabilityExists`) and, separately, whether its runtime works now. */
export interface SelfModelEngine {
  toolId: string;
  engineName: string;
  capabilityId: string | null;
  capabilityExists: true;
  runtimeAvailableNow: boolean;
  status: 'AVAILABLE' | 'BLOCKED';
  blockedBy: string | null;
  reason: string | null;
  proof: { kind: 'LOCAL_REFERENCE_CASE' | 'REMOTE_REAL_EXECUTION'; [key: string]: unknown } | null;
  statement: string;
}

export interface GenesisSelfModel {
  schemaVersion: number;
  generatedAt: string;
  identity: { entityId: string; mission: string; constitutionVersion: string; identitySchemaVersion: number };
  references: Record<string, string>;
  environment: Record<string, unknown>;
  engines: SelfModelEngine[];
  availableEngines: string[];
  blockedEngines: { toolId: string; blockedBy: string | null }[];
  knownModels: { kind: string; status?: string; providerId?: string | null; model?: string | null; target?: string; ruleId?: string | null; ruleFingerprint?: string | null }[];
  failedGates: { source: string; evaluationId: string | null; arm: string | null; reasons: string[]; computedAt: string | null }[];
  missingCapabilities: { id: string; label: string; status: string; requires: string | null }[];
  dataAccessBlockers: { source: string; status: string; pinnedFallbackIds: string[] }[];
  awaitingMeasurements: { known: boolean; candidates: number; campaigns: number };
}

/** Unauthenticated, like /api/health: it carries no project data. */
export async function getGenesisSelfModel(): Promise<ApiResult<GenesisSelfModel>> {
  return request<GenesisSelfModel>('GET', '/genesis/self');
}

/* ---------------- ENTITY-2: cognitive state (a view) and the knowledge registry (persisted) ---------------- */

/** A section whose source failed verification is reported, never filled in. */
export interface UnknownSection { status: 'UNKNOWN'; reason: string; brokenAt?: number | null }

export interface RegistryGap {
  gapId: string;
  question: string;
  source: { kind: string; ref: string | null };
  relatedHypotheses: string[];
  missingEvidence: string[];
  requiredCapability: string | null;
  createdEvidenceRefs: string[];
  status: 'OPEN' | 'RESOLVED';
  openedAt: string;
  resolvedAt: string | null;
  resolvedEvidenceRefs: string[];
}

export interface RegistryContradiction {
  contradictionId: string;
  type: string;
  claimA: { recordId: string | null; source: string | null; statement: string | null };
  claimB: { recordId: string | null; source: string | null; statement: string | null };
  evidenceRefs: string[];
  reason: string | null;
  status: 'UNRESOLVED' | 'RESOLVED';
  epistemicState: 'CONFLICTING_EVIDENCE' | 'RESOLVED_BY_NEW_EVIDENCE';
  resolution: { statement: string; evidenceRefs: string[]; resolvedBy: string | null; at: string } | null;
}

/* ---- Science Flight Control (backend campaign/scienceFlightControl.mjs), carried inside BYT ---- */

export type ScienceFlightStatus = 'READY_TO_EXECUTE' | 'AWAITING_EVIDENCE' | 'AWAITING_REPLAY' | 'VERIFIED' | 'BLOCKED' | 'BLOCKED_RETRYABLE' | 'FAILED';
export type ScienceFlightFailureLayer = 'PREFLIGHT' | 'RESEARCH_GATE' | 'CAPABILITY_BINDING' | 'RUNTIME' | 'WORKER_TRANSPORT' | 'ENGINE' | 'REPLAY';
export interface ScienceFlightSourceRef { eventId: string; eventType: string; occurredAt: number | string }

/** One flight: a frozen Virtual Lab plan and what the canonical campaign events say happened to it. */
export interface ScienceFlight {
  campaignId: string;
  candidateId: string;
  contractVersion: string;
  executionId: string | null;
  status: string;
  preflight: {
    decision: string;
    inputFingerprint: string | null;
    requestedCapability: string | null;
    budget: { maxComputeSeconds?: number; [key: string]: unknown } | null;
    expectation: unknown;
    checks: { check: string; status: string; detail: unknown }[];
    source: ScienceFlightSourceRef | null;
  };
  executionDelta: {
    observed: boolean;
    inputIntegrity: string;
    plannedCapability: string | null;
    selectedEngine: string | null;
    scienceRunId?: string | null;
    outputFingerprint?: string | null;
    computeBudgetSeconds: number | null;
    actualDurationMs: number | null;
    budgetVerdict: string;
    plannedExpectation: unknown;
    observedClassification: string | null;
    source?: ScienceFlightSourceRef | null;
  };
  failureAttribution: { layer: string; code: string; reason?: string | null; retryable: boolean; source: ScienceFlightSourceRef | null } | null;
  evidenceUpdate: { status: string; proposalId: string | null; source: ScienceFlightSourceRef | null };
  replay: { status: string; verificationId: string | null; source: ScienceFlightSourceRef | null };
  bytUpdate: {
    mode: 'DERIVED_READ_MODEL_ONLY'; persistence: 'NONE'; status: string; epistemicState: string; classification: string | null;
    scienceRunRef: string | null; evidenceRef: string | null; replayRef: string | null; failureLayer: string | null; limitation: string;
  };
  flightFingerprint: string;
}

/** NOT_COMPUTED means the server did not rebuild Flight Control for this view; it never means "zero flights". */
export type ScienceFlightControl =
  | { status: 'AVAILABLE'; flights: ScienceFlight[]; verified: number; blocked: number; rejectedUntraceableRecords: number; limitation: string }
  | { status: 'NOT_COMPUTED'; flights: ScienceFlight[]; verified: null; blocked: null; rejectedUntraceableRecords: null; limitation: string };

/** BYT — the derived read model of Genesis' scientific self (backend bytProjection.mjs). Sections the UI does not read stay loose. */
export interface BytProjection {
  schemaVersion: number;
  view: 'DERIVED_FROM_CANONICAL_STATE';
  identity: unknown;
  epistemicVocabulary: string[];
  continuity: { researchRuns: number; verifiedRuns: number; brokenRuns: number };
  knowledgeState: { openGaps: number; unresolvedContradictions: number; proposedClaims: number } | UnknownSection;
  capabilities: { availableNow: unknown[]; blocked: unknown[]; missing: unknown[] } | UnknownSection;
  predictionLedger: Array<Record<string, unknown>>;
  calibration: Record<string, unknown>;
  necropolis: Array<Record<string, unknown>>;
  decisionTraces: Array<Record<string, unknown>>;
  surprise: Record<string, unknown>;
  scienceFlightControl: ScienceFlightControl;
  integrity: { researchRuns: Array<{ researchRunId: string; ok: boolean; [key: string]: unknown }>; knowledgeRegistry: unknown };
}

/** A ResearchRun job of the lease queue as the cognitive state lists it: QUEUED in pending, CLAIMED (with worker and lease) in running. */
export interface CognitiveResearchRunJob {
  kind: 'RESEARCH_RUN_JOB';
  id: string;
  researchRunId: string;
  hypothesisId: string | null;
  workerId?: string | null;
  leaseExpiresAt?: number | null;
  attempts?: number;
}

export interface GenesisCognitiveState {
  schemaVersion: number;
  projectId: string;
  generatedAt: string;
  view: 'MATERIALIZED_VIEW';
  byt: BytProjection;
  currentGoals: { kind: string; id: string; goal: string; domain: string; status: string }[];
  activeQuestions: { kind: string; [key: string]: unknown }[];
  activeHypotheses: { source: string; status: string; [key: string]: unknown }[];
  knowledgeGaps: RegistryGap[] | UnknownSection;
  contradictions: RegistryContradiction[] | UnknownSection;
  proposedClaims: ScientificClaimProposal[] | UnknownSection;
  blockedCapabilities: { kind: string; id: string; blockedBy: string | null }[] | UnknownSection;
  pendingExperiments: { kind: string; id: string; [key: string]: unknown }[];
  runningExperiments: { kind: string; id: string; [key: string]: unknown }[];
  awaitingExternalMeasurements: { campaignId: string; candidateId: string | null; requestEventId: string; objective: string | null }[];
  recentEvidenceRefs: string[];
  proposedNextActions: { status: 'PROPOSED'; kind: string; [key: string]: unknown }[];
  integrity: { researchRuns: { runId: string; ok: boolean; [key: string]: unknown }[]; knowledgeRegistry: { ok: boolean; brokenAt: number | null; reason: string | null } };
}

/* ---- Remote ResearchRun workers (backend remoteWorkerApi.mjs listRemoteWorkers) ---- */

export type RemoteWorkerState = 'BUSY' | 'IDLE' | 'LEASE_EXPIRED' | 'SILENT';
export interface RemoteWorkerLease {
  jobId: string;
  researchRunId: string;
  kind: 'EXPERIMENT' | 'ADVANCE';
  /** Set when the job is a fan-out child: the parent run that spawned it. */
  fanOutParentRunId: string | null;
  attempt: number;
  maxAttempts: number;
  lastHeartbeatAt: string;
  leaseExpiresAt: string;
  leaseState: 'ACTIVE' | 'EXPIRED';
}
export interface RemoteWorker {
  workerId: string;
  state: RemoteWorkerState;
  lastSeenAt: string | null;
  leases: RemoteWorkerLease[];
  /** Engine names stay here, under Technical details on screen. null: the server has not seen this worker report them. */
  technicalDetails: { engines: string[] | null };
}
export interface RemoteWorkersView { workers: RemoteWorker[]; queuedRemoteJobs: number; scope: string }

export async function getRemoteWorkers(token: string, projectId: string): Promise<ApiResult<RemoteWorkersView>> {
  return request('GET', `/projects/${projectId}/remote-workers`, { token });
}

export async function getCognitiveState(token: string, projectId: string): Promise<ApiResult<GenesisCognitiveState>> {
  const r = await request<{ cognitiveState: GenesisCognitiveState }>('GET', `/projects/${projectId}/cognitive-state`, { token });
  return r.ok ? { ok: true, data: r.data.cognitiveState } : r;
}

export async function openKnowledgeGap(token: string, projectId: string, gap: unknown): Promise<ApiResult<{ gap: RegistryGap; deduped: boolean }>> {
  return request('POST', `/projects/${projectId}/knowledge-registry/gaps`, { token, body: gap });
}

export async function resolveKnowledgeGap(token: string, projectId: string, gapId: string, evidenceRefs: readonly string[]): Promise<ApiResult<{ gap: RegistryGap }>> {
  return request('POST', `/projects/${projectId}/knowledge-registry/gaps/${encodeURIComponent(gapId)}/resolve`, { token, body: { evidenceRefs } });
}

export async function recordKnowledgeContradiction(token: string, projectId: string, contradiction: unknown): Promise<ApiResult<{ contradiction: RegistryContradiction; deduped: boolean }>> {
  return request('POST', `/projects/${projectId}/knowledge-registry/contradictions`, { token, body: contradiction });
}

/* ---------------- ENTITY-3: an external model proposes, the backend validates, the registry keeps it PROPOSED ---------------- */

export interface ExperimentProposalDecision {
  kind: string;
  engineId: string | null;
  description: string | null;
  parameters: Record<string, unknown>;
  parameterChanges: { target: string | null; to: unknown }[];
  executedByModel: false;
  decision: 'REJECTED_MALFORMED' | 'REJECTED_FROZEN_THRESHOLD' | 'HUMAN_APPROVAL_REQUIRED' | 'BLOCKED_BY_SELF_MODEL' | 'BLOCKED_BY_RUNTIME' | 'PROPOSED';
  reason: string | null;
}

export interface ScientificClaimProposal {
  proposalId: string;
  contractVersion: number;
  question: string | null;
  claim: string;
  claimType: 'HYPOTHESIS' | 'PREDICTION' | 'MECHANISM_PROPOSAL' | 'OPEN_QUESTION';
  hypothesisId: string | null;
  assumptions: string[];
  supportingEvidenceRefs: string[];
  contradictingEvidenceRefs: string[];
  missingEvidence: string[];
  uncertainty: { level: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'; statement: string | null };
  falsificationProposal: string;
  experimentProposal: ExperimentProposalDecision | null;
  unresolvedEvidenceRefs: { field: string; ref: string; reason: string }[];
  degradations: { field: string; from: unknown; to: unknown; reason: string }[];
  generatedBy: { kind: 'EXTERNAL_REASONING_MODEL'; providerId: string; model: string | null; version: string };
  epistemicStatus: 'NOT_EVIDENCE';
  status: 'PROPOSED';
  proposedAt: string;
}

/** Asks the backend's configured reasoning model. Failure statuses: BLOCKED_BY_PROVIDER_CONFIGURATION, PROVIDER_TIMEOUT, REJECTED_MALFORMED_RESPONSE, ... */
export async function proposeScientificClaim(
  token: string, projectId: string, input: { question: string; hypothesisId?: string | null },
): Promise<ApiResult<{ ok: true; status: 'PROPOSED'; deduped: boolean; proposal: ScientificClaimProposal }>> {
  return request('POST', `/projects/${projectId}/claim-proposals`, { token, body: input });
}

export async function listClaimProposals(token: string, projectId: string): Promise<ApiResult<{ proposals: ScientificClaimProposal[] }>> {
  return request('GET', `/projects/${projectId}/claim-proposals`, { token });
}
