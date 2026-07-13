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
