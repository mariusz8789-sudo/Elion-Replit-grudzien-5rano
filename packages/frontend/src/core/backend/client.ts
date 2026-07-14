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

export interface User {
  id: string;
  email: string;
  displayName: string;
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
  | { ok: false; status: number; error: string; message: string };

const API_BASE = '/api';

function fail(status: number, error: string, message: string): { ok: false; status: number; error: string; message: string } {
  return { ok: false, status, error, message };
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
    const d = (data ?? {}) as { error?: string; message?: string };
    return fail(res.status, d.error ?? 'error', d.message ?? `Błąd serwera (${res.status}).`);
  }
  return { ok: true, data: data as T };
}

/* ---------------- Uwierzytelnianie ---------------- */

export function register(email: string, password: string, displayName?: string): Promise<ApiResult<Session>> {
  return request<Session>('POST', '/auth/register', { body: { email, password, displayName } });
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
  status: 'AVAILABLE' | 'NOT_IMPLEMENTED' | 'EXTERNAL_ENGINE_REQUIRED' | 'MODEL_NOT_VALID_FOR_DOMAIN';
  modelId?: string;
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

export interface ComputeRun {
  runId: string; modelId: string; modelName?: string; modelVersion: string; domain: string;
  status: 'ok' | 'rejected' | 'error'; outputs?: Record<string, number>; units?: Record<string, string>;
  warnings?: string[]; provenance?: { source: string; formula: string; honesty: string }; message?: string;
}

/** Uruchamia model na backendzie (publiczne, efemeryczne). Do weryfikacji „na serwerze" w labach (P4). */
export async function runCompute(modelId: string, inputs: Record<string, number>): Promise<ApiResult<ComputeRun>> {
  const r = await request<{ run: ComputeRun; persisted: boolean }>('POST', '/compute/run', { body: { modelId, inputs } });
  return r.ok ? { ok: true, data: r.data.run } : r;
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
  body: { objective: string; startingSmiles: string[]; budget?: { maxGenerations?: number; maxGeneratedCandidates?: number } },
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

export async function listCampaignDecisions(token: string, projectId: string, campaignId: string): Promise<ApiResult<CampaignDecision[]>> {
  const r = await request<{ decisions: CampaignDecision[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/decisions`, { token });
  return r.ok ? { ok: true, data: r.data.decisions } : r;
}

export async function getDiscoveryGraph(token: string, projectId: string, campaignId: string): Promise<ApiResult<DiscoveryGraph>> {
  const r = await request<{ graph: DiscoveryGraph }>('GET', `/projects/${projectId}/campaigns/${campaignId}/graph`, { token });
  return r.ok ? { ok: true, data: r.data.graph } : r;
}

export interface ScienceRun {
  id: string; campaignId: string | null; candidateId: string | null;
  engine: string; engineVersion: string | null; capability: string; method: string | null;
  status: string; evidenceClass: string; inputs: Record<string, unknown>; outputs: Record<string, unknown>;
  units: Record<string, string>; warnings: string[]; provenance: Record<string, unknown>;
  inputHash: string | null; outputHash: string | null;
  artifacts: { kind: string; path: string; sha256_16?: string }[]; durationMs: number; createdAt: number;
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

export async function listCampaignScienceRuns(token: string, projectId: string, campaignId: string): Promise<ApiResult<ScienceRun[]>> {
  const r = await request<{ scienceRuns: ScienceRun[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/science-runs`, { token });
  return r.ok ? { ok: true, data: r.data.scienceRuns } : r;
}

export async function listCampaignConflicts(token: string, projectId: string, campaignId: string): Promise<ApiResult<ModelConflict[]>> {
  const r = await request<{ conflicts: ModelConflict[] }>('GET', `/projects/${projectId}/campaigns/${campaignId}/conflicts`, { token });
  return r.ok ? { ok: true, data: r.data.conflicts } : r;
}

export async function runCampaignStage(
  token: string, projectId: string, campaignId: string,
  config: { docking?: { enabled: boolean; budget?: number }; quantum?: { enabled: boolean; budget?: number } },
): Promise<ApiResult<{ jobId: string }>> {
  return request('POST', `/projects/${projectId}/campaigns/${campaignId}/stage`, { token, body: config });
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
