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

import { getToken } from './session';

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

/* ---------------- Self-service billing dashboard (Stage 2) ---------------- */

export interface AccountApiKey { key: string; tier: string; usageCount: number; monthlyLimit: number; remaining: number; resetDate: number }
export interface AccountBilling {
  email: string;
  plan: { tier: string; status: string; renewalState: 'RENEWING' | 'CANCELED' | 'NONE' };
  apiKey: AccountApiKey | null;
  stripeConfigured: boolean;
  availableTiers: string[];
}
export function fetchAccountBilling(token: string): Promise<ApiResult<AccountBilling>> {
  return request<AccountBilling>('GET', '/account/billing', { token });
}
export async function regenerateApiKey(token: string): Promise<ApiResult<AccountApiKey>> {
  const r = await request<{ apiKey: AccountApiKey }>('POST', '/account/api-key/regenerate', { token });
  return r.ok ? { ok: true, data: r.data.apiKey } : r;
}
/** Opens Stripe Checkout for an upgrade; returns the hosted-payment URL to redirect to. */
export async function startCheckout(token: string, tier: 'starter' | 'pro'): Promise<ApiResult<{ url: string; sessionId: string; tier: string }>> {
  return request<{ url: string; sessionId: string; tier: string }>('POST', '/billing/checkout', { token, body: { tier } });
}

/* ---------------- Trwałość kampanii po stronie serwera (Genesis 2.1, Part 2) ---------------- */

export interface RemoteCampaignMeta { id: string; name: string; status: string; molecules: number; createdAt: number; updatedAt: number }
export interface RemoteCampaign { id: string; data: unknown; createdAt: number; updatedAt: number }

export async function fetchCampaignsRemote(token: string): Promise<ApiResult<RemoteCampaignMeta[]>> {
  const r = await request<{ campaigns: RemoteCampaignMeta[] }>('GET', '/campaigns', { token });
  return r.ok ? { ok: true, data: r.data.campaigns } : r;
}
export async function fetchCampaignRemote(token: string, id: string): Promise<ApiResult<RemoteCampaign>> {
  const r = await request<{ campaign: RemoteCampaign }>('GET', `/campaigns/${encodeURIComponent(id)}`, { token });
  return r.ok ? { ok: true, data: r.data.campaign } : r;
}
export async function saveCampaignRemote(token: string, id: string, data: unknown): Promise<ApiResult<RemoteCampaign>> {
  const r = await request<{ campaign: RemoteCampaign }>('PUT', `/campaigns/${encodeURIComponent(id)}`, { token, body: { campaign: data } });
  return r.ok ? { ok: true, data: r.data.campaign } : r;
}
export async function deleteCampaignRemote(token: string, id: string): Promise<ApiResult<{ ok: boolean }>> {
  return request<{ ok: boolean }>('DELETE', `/campaigns/${encodeURIComponent(id)}`, { token });
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

export interface ScienceCapabilities {
  version: string;
  engines: Record<string, { available: boolean; version?: string | null; reason?: string | null; canRunComplexMd?: boolean; openmm?: boolean; ligandForceField?: boolean }>;
  offTarget: { panel: { gene: string; protein: string; category: string }[]; toxicityEndpoints: string[]; epistemicStatus: string; source: string };
  knowledgeGraph: { nodeTypes: string[]; edgeTypes: string[]; provenanceRequired: boolean };
  biologicalSources: { service: string; kind: string; license: string; liveRetrieval: string }[];
  honesty: string;
}

/** Real runtime capability status for the Discovery Workspace (V3). Public; no fabricated data. */
export async function fetchScienceCapabilities(): Promise<ApiResult<ScienceCapabilities>> {
  const r = await request<{ capabilities: ScienceCapabilities }>('GET', '/science/capabilities');
  return r.ok ? { ok: true, data: r.data.capabilities } : r;
}

/* ---------------- V5 premium screens — real V4 module wiring ---------------- */

export interface ComputeResources {
  version: string;
  cpu: { cores: number; totalMemGB: number };
  gpu: { available: boolean; devices?: string[] | null; reason?: string };
  docker: { available: boolean; note?: string };
  kubernetes: { available: boolean; note?: string };
  hpcScheduler: { slurm: boolean; note?: string };
  jobQueue: { available: boolean; engine?: string; note?: string };
  distributedProcessing: { available: boolean; note?: string };
  honesty: string;
}
export async function fetchComputeResources(): Promise<ApiResult<ComputeResources>> {
  const r = await request<{ resources: ComputeResources }>('GET', '/science/compute-resources');
  return r.ok ? { ok: true, data: r.data.resources } : r;
}

export interface ScientificMemory {
  version: string;
  ownCampaigns: { status: string; campaignsLearnedFrom: number; samples: number; learnedPolicy: unknown };
  externalSources: { source: string; kind: string; license: string; status: string; reason?: string | null; licenceCompliance: string }[];
  externalLearningStatus: string;
  honesty: string;
}
export async function fetchScientificMemory(): Promise<ApiResult<ScientificMemory>> {
  const r = await request<{ memory: ScientificMemory }>('GET', '/science/memory');
  return r.ok ? { ok: true, data: r.data.memory } : r;
}

export async function fetchAgentRoles(): Promise<ApiResult<{ roles: string[]; version: string }>> {
  return request<{ roles: string[]; version: string }>('GET', '/science/agent-roles');
}

export interface AgentAssessment {
  role: string; assessment: string; recommendation: string; concerns: string[];
  reasoningStatus: string; reasoningNote?: string | null;
}
export interface AgentPanel {
  status: string; version: string; reasoningLayer: string;
  agents: AgentAssessment[];
  consensus: { proceed: boolean; verdict: string; openConcerns: string[]; nextAction: string };
  didGenesisDiscoverADrug: string; honesty: string; reason?: string;
}
export async function runMultiAgentPanel(dossier: unknown): Promise<ApiResult<AgentPanel>> {
  const r = await request<{ panel: AgentPanel }>('POST', '/science/multi-agent', { body: { dossier } });
  return r.ok ? { ok: true, data: r.data.panel } : r;
}

export interface LabReadiness {
  status: string; version: string;
  dossier?: {
    identity: { smiles: string; inchi: string | null; inchiKey: string | null };
    proposedStructure: { smiles: string; molecularFormula: string };
    mass: { averageMolWt: number; exactMolWt: number };
    properties: Record<string, number | boolean>;
    structuralAlerts: { name: string }[] | null;
    predictedTargets: { epistemicStatus?: string; offTargetProteins?: { protein: string; gene: string; probability: number; flag: string }[]; status?: string; reason?: string };
    risks: { overallOffTargetRisk?: string; selectivity?: number; toxicityFlags?: { liability: string; probability: number }[]; status?: string };
    rationale: string;
    proposedInVitroTests: string[]; proposedInVivoTests: string[];
    proposedClinicalPlan: { status: string; note: string; outline: string[] };
    readinessHash: string; didGenesisDiscoverADrug: string; honesty: string;
  };
  reason?: string;
}
export async function buildLabReadiness(smiles: string, admetPredictions?: Record<string, number>, scientificQuestion?: string): Promise<ApiResult<LabReadiness>> {
  // Stage 8, PART 2: compute endpoints require auth — send the session token.
  const r = await request<{ readiness: LabReadiness }>('POST', '/science/laboratory-readiness', { token: getToken(), body: { candidate: { smiles, admetPredictions }, scientificQuestion } });
  return r.ok ? { ok: true, data: r.data.readiness } : r;
}

export interface InvestorPackage {
  version: string;
  documents: { investorReport: string; pharmaReport: string; grantReport: string; pitchDeck: string; ipPackage: string; patentDraft: string };
  didGenesisDiscoverADrug: string; disclaimer: string;
}
export async function buildInvestorPackage(dossier: unknown, validation: unknown, meta?: Record<string, unknown>): Promise<ApiResult<InvestorPackage>> {
  const r = await request<{ package: InvestorPackage }>('POST', '/science/investor-package', { body: { dossier, validation, meta } });
  return r.ok ? { ok: true, data: r.data.package } : r;
}

export interface MoleculeAtom { element: string; x: number; y: number; z: number }
export interface MoleculeBond { a: number; b: number; order: number }
export interface MoleculeRender {
  smiles: string;
  depiction2d: { ok: boolean; svg?: string; width?: number; height?: number; canonicalSmiles?: string; molecularFormula?: string; error?: string; reason?: string };
  model3d: { ok: boolean; atoms?: MoleculeAtom[]; bonds?: MoleculeBond[]; forceField?: string; charge?: number; nAtoms?: number; canonicalSmiles?: string; error?: string; reason?: string } | null;
}
/** Real molecular rendering (Candidate Viewer): RDKit 2D SVG + 3D coords/bonds. */
export async function renderMolecule(smiles: string, mode: '2d' | 'both' = 'both'): Promise<ApiResult<MoleculeRender>> {
  // Stage 8, PART 2: compute endpoint requires auth — send the session token.
  return request<MoleculeRender>('POST', '/science/molecule/render', { token: getToken(), body: { smiles, mode } });
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

export async function runCampaignStage(
  token: string, projectId: string, campaignId: string,
  config: {
    docking?: { enabled: boolean; budget?: number };
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

/* ---------------- ZEFIR Truth Engine / R&D Kill-Switch ---------------- */

export type KillSwitchDecision = 'GO' | 'WARN' | 'BLOCK' | 'INSUFFICIENT_DATA';

/** Structured proposal submitted to the pre-flight kill-switch. All fields optional;
 *  the backend validates that at least some scientific content is present. */
export interface TruthProposal {
  problemStatement?: string;
  proposedMechanism?: string;
  claimedResult?: string;
  equations?: unknown[];
  variables?: unknown[];
  assumptions?: string[];
  physicalConstraints?: string[];
  speculativeClaims?: string[];
  requiredCapabilities?: string[];
  requestedDomains?: string[];
  energy?: { input?: number; output?: number; external?: number };
  efficiency?: number;
  efficiencyKind?: string;
  mass?: { in?: number; out?: number; generation?: number };
  operating?: { pressure?: { value?: number; min?: number; max?: number }; temperature?: { value?: number; min?: number; max?: number } };
  flow?: { volumetricFlow?: number; volume?: number; time?: number };
  power?: { power?: number; energy?: number; time?: number };
  geometry?: Record<string, number>;
  materials?: { name?: string; maxTemp?: number; maxPressure?: number }[];
  expectedPerformance?: string;
  estimatedCost?: string;
  evidence?: string[];
  context?: string;
  parameterVector?: Record<string, number>;
  scales?: Record<string, number>;
}

export interface TruthStage { stage: string; status: string; findings: unknown; missing: string[]; }

export interface TruthDecision {
  decision: KillSwitchDecision;
  decisionStrength: number;
  criticalFailures: string[];
  unresolvedAssumptions: string[];
  missingInformation: string[];
  dimensionalInconsistencies: string[];
  physicalConstraintViolations: string[];
  knownDeadEndSimilarities: string[];
  capabilityGaps: string[];
  speculativeClaims: unknown[];
  constraintViolations: { id: string; detail: string }[];
  unsupportedDomains: { domain: string; reason: string }[];
  cheapestFalsificationTest: {
    targetAssumption: string; recommendedTestType: string; requiredInput: string;
    relativeCostClass: string; priorityReason: string; expertReviewRequested?: boolean;
  } | null;
  reasonsToKill: string[];
  reasonsNotToKill: string[];
  boundedClaim: string;
}

export interface TruthCertificate {
  schema: string; decision: KillSwitchDecision; decisionHash: string; proposalHash: string;
  engineVersions: Record<string, string>;
  enginesExecuted: string[];
  enginesSkipped: { stage: string; reason: string }[];
}

export interface TruthAnalysis {
  id: string | null;
  proposalHash: string;
  decision: TruthDecision;
  stages: TruthStage[];
  certificate: TruthCertificate;
}

export interface TruthAnalysisSummary { id: string; proposalHash: string; decision: KillSwitchDecision; decisionHash: string; createdAt: number; }

export async function runTruthAnalysis(token: string, projectId: string, proposal: TruthProposal): Promise<ApiResult<TruthAnalysis>> {
  const r = await request<{ analysis: TruthAnalysis }>('POST', `/projects/${projectId}/truth-analyses`, { token, body: proposal });
  return r.ok ? { ok: true, data: r.data.analysis } : r;
}

export async function listTruthAnalyses(token: string, projectId: string): Promise<ApiResult<TruthAnalysisSummary[]>> {
  const r = await request<{ analyses: TruthAnalysisSummary[] }>('GET', `/projects/${projectId}/truth-analyses`, { token });
  return r.ok ? { ok: true, data: r.data.analyses } : r;
}

export async function getTruthAnalysis(token: string, projectId: string, id: string): Promise<ApiResult<TruthAnalysis & { decisionHash: string }>> {
  const r = await request<{ analysis: TruthAnalysis & { decisionHash: string } }>('GET', `/projects/${projectId}/truth-analyses/${id}`, { token });
  return r.ok ? { ok: true, data: r.data.analysis } : r;
}

export interface NecropolisStats { projectId: string; total: number; byDomain: Record<string, number>; byClass: Record<string, number>; }

export async function getNecropolisStats(token: string, projectId: string): Promise<ApiResult<NecropolisStats>> {
  const r = await request<{ necropolis: NecropolisStats }>('GET', `/projects/${projectId}/necropolis`, { token });
  return r.ok ? { ok: true, data: r.data.necropolis } : r;
}

export interface PilotReport {
  schema: string; projectId: string | null; analysisId: string | null; analysisDate: number | null;
  proposalHash: string | null; finalDecision: KillSwitchDecision; decisionStrength: number | null; decisionHash: string | null;
  criticalFailures: string[]; missingInformation: string[]; unresolvedAssumptions: string[];
  constraintFindings: { id: string; detail: string }[]; dimensionalFindings: string[];
  physicalConstraintViolations: string[]; capabilityGaps: string[]; unsupportedDomains: { domain: string; reason: string }[];
  necropolisInfluence: { influenced: boolean; findings: string[] };
  cheapestFalsification: { targetAssumption: string; recommendedTestType: string; requiredInput: string; relativeCostClass: string; priorityReason: string } | null;
  highestValueNextAction: unknown;
  reasonsToKill: string[]; reasonsNotToKill: string[];
  enginesExecuted: string[]; enginesSkipped: { stage: string; reason: string }[];
  certificate: { schema: string | null; engineVersions: Record<string, string> };
  limitationStatement: string;
}

export interface AnalysisComparison {
  earlier: { analysisId: string; decision: KillSwitchDecision; decisionHash: string; date: number };
  later: { analysisId: string; decision: KillSwitchDecision; decisionHash: string; date: number };
  decisionChanged: boolean; decisionHashChanged: boolean; from: KillSwitchDecision; to: KillSwitchDecision;
  findingsChanged: Record<string, { added: string[]; removed: string[] }>;
  necropolis: { earlierInfluenced: boolean; laterInfluenced: boolean; newlyInfluenced: boolean };
}

export async function getTruthReport(token: string, projectId: string, id: string): Promise<ApiResult<PilotReport>> {
  const r = await request<{ report: PilotReport }>('GET', `/projects/${projectId}/truth-analyses/${id}/report`, { token });
  return r.ok ? { ok: true, data: r.data.report } : r;
}

export async function compareTruthAnalyses(token: string, projectId: string, a: string, b: string): Promise<ApiResult<AnalysisComparison>> {
  const params = new URLSearchParams({ a, b });
  const r = await request<{ comparison: AnalysisComparison }>('GET', `/projects/${projectId}/truth-analyses/compare?${params.toString()}`, { token });
  return r.ok ? { ok: true, data: r.data.comparison } : r;
}

/* ---------------- Autonomous Discovery Forge ---------------- */

export interface DiscoverySeed { name: string; smiles: string; }
export interface DiscoveryChallenge { grandChallenge?: string; scope?: string; maxMolWt?: number; maxAlerts?: number; maxLogP?: number; }

export interface DiscoveryDossier {
  schema: string; campaignId: string; projectId: string; grandChallenge: string | null; campaignScope: string | null;
  finalStatus: string; stopReason: string | null; initialPlanHash: string | null;
  generationHistory: { generation: number; planHash: string; cohortSize: number; transformsUsed: string[] }[];
  planMutations: { generation: number; trigger: string; mutationType: string; previousPlanHash: string; newPlanHash: string; rationale: string[] }[];
  necropolisEntries: { generation: number; candidateId: string; reason: string }[];
  failureRegionsAvoided: { generation: number; reason: string }[];
  adversarialCriticisms: { generation: number; id: string; demoted: boolean; critiques: { concern: string; detail: string; severity: string }[] }[];
  falsificationTasks: { generation: number; task: { testType: string; costClass: string; targetAssumption: string } }[];
  enginesExecuted: string[]; enginesSkipped: { engine: string; decision: string; reason: string }[];
  noveltyAssessments: { id: string; novelty: { status: string; reason: string } }[];
  rankedComputationalCandidates: { id: string; canonical: string; rank: number; novelty: string }[];
  provenance: { events: number; replayable: boolean };
  limitationStatement: string; classification: string; dossierHash: string;
}

export interface DiscoveryRunResult {
  campaignId: string; status: string; stopReason: string | null;
  generations: { generation: number; planHash: string; cohortSize: number; survivors: number; rejected: number }[];
  dossier: DiscoveryDossier;
}
export interface DiscoveryCampaignSummary { id: string; projectId: string; status: string; planHash: string | null; createdAt: number; }

export async function runDiscoveryCampaign(token: string, projectId: string, body: { seeds: DiscoverySeed[]; challenge?: DiscoveryChallenge; maxGenerations?: number; maxCandidatesPerGen?: number }): Promise<ApiResult<DiscoveryRunResult>> {
  return request<DiscoveryRunResult>('POST', `/projects/${projectId}/discovery-campaigns`, { token, body });
}
export async function listDiscoveryCampaigns(token: string, projectId: string): Promise<ApiResult<DiscoveryCampaignSummary[]>> {
  const r = await request<{ campaigns: DiscoveryCampaignSummary[] }>('GET', `/projects/${projectId}/discovery-campaigns`, { token });
  return r.ok ? { ok: true, data: r.data.campaigns } : r;
}
export async function getDiscoveryDossier(token: string, projectId: string, campaignId: string): Promise<ApiResult<DiscoveryDossier>> {
  const r = await request<{ dossier: DiscoveryDossier }>('GET', `/projects/${projectId}/discovery-campaigns/${campaignId}/dossier`, { token });
  return r.ok ? { ok: true, data: r.data.dossier } : r;
}
