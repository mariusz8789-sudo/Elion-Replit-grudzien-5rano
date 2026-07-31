import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  register,
  login,
  me,
  listProjects,
  createProject,
  createCloudTrial,
  listCloudTrials,
  addMember,
  listBranches,
  createBranch,
  createMergeRequest,
  decideMergeRequest,
  getContributions,
} from '../core/backend/client';

/**
 * Klient backendu testowany ze zamockowanym fetch — sprawdzamy kontrakt HTTP
 * (metoda, ścieżka, nagłówek Authorization, kształt ciała) oraz mapowanie
 * odpowiedzi/błędów na dyskryminowaną unię. Zero prawdziwej sieci.
 */

function fakeResponse(status: number, body: unknown, jsonThrows = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => (jsonThrows ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('auth client', () => {
  it('register posts credentials and unwraps the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(201, { token: 'abc', user: { id: 'u1', email: 'a@b.co', displayName: 'a', createdAt: 1 }, expiresInMs: 1000 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const r = await register('a@b.co', 'password123', 'Ala');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.token).toBe('abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.co', password: 'password123', displayName: 'Ala' });
  });

  it('login maps a 401 to a typed failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(401, { error: 'invalid_credentials', message: 'Zły login' })));
    const r = await login('a@b.co', 'wrong');
    expect(r).toEqual({ ok: false, status: 401, error: 'invalid_credentials', message: 'Zły login' });
  });

  it('me sends the bearer token and unwraps user', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { user: { id: 'u1', email: 'a@b.co', displayName: 'a', createdAt: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await me('tok123');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.email).toBe('a@b.co');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer tok123');
  });

  it('maps a network rejection to an offline failure (local-first stays usable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const r = await me('tok');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.error).toBe('offline');
    }
  });
});

describe('projects and trials client', () => {
  it('listProjects unwraps the array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { projects: [{ id: 'p1', name: 'P', description: '', ownerId: 'u', visibility: 'private', createdAt: 1, role: 'owner' }] })));
    const r = await listProjects('tok');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].role).toBe('owner');
    }
  });

  it('createProject posts the name and unwraps the project', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { project: { id: 'p1', name: 'Nowy', description: '', ownerId: 'u', visibility: 'private', createdAt: 1, role: 'owner' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await createProject('tok', 'Nowy');
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Nowy', description: '' });
  });

  it('createCloudTrial posts the frozen provenance payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { trial: { id: 't1', projectId: 'p1', experimentId: 'e', authorId: 'u', index: 1, label: 'L', params: { x: 1 }, outputs: { y: 2 }, status: 'baseline', note: '', parentId: null, modelVersion: 'v1', createdAt: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await createCloudTrial('tok', 'p1', { experimentId: 'e', params: { x: 1 }, outputs: { y: 2 }, status: 'baseline', modelVersion: 'v1' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.index).toBe(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/trials');
  });

  it('listCloudTrials appends the experimentId query when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { trials: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listCloudTrials('tok', 'p1', 'nuclear-semf');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p1/trials?experimentId=nuclear-semf');
  });

  it('addMember maps a 403 to a typed failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(403, { error: 'forbidden', message: 'Za mało uprawnień' })));
    const r = await addMember('tok', 'p1', 'x@y.co', 'viewer');
    expect(r).toEqual({ ok: false, status: 403, error: 'forbidden', message: 'Za mało uprawnień' });
  });

  it('listCloudTrials includes both experimentId and branchId query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { trials: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await listCloudTrials('tok', 'p1', 'e', 'branch-1');
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain('experimentId=e');
    expect(url).toContain('branchId=branch-1');
  });
});

describe('Scientific Git client', () => {
  it('listBranches unwraps the array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { branches: [{ id: 'b1', projectId: 'p', name: 'main', baseBranchId: null, createdBy: 'u', createdAt: 1 }] })));
    const r = await listBranches('tok', 'p');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].name).toBe('main');
  });

  it('createBranch posts name + fork flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { branch: { id: 'b2', projectId: 'p', name: 'hipo', baseBranchId: 'b1', createdBy: 'u', createdAt: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await createBranch('tok', 'p', 'hipo', { baseBranchId: 'b1', fork: true });
    expect(r.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: 'hipo', baseBranchId: 'b1', fork: true });
  });

  it('createMergeRequest posts source/target/title', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { mergeRequest: { id: 'mr1', projectId: 'p', sourceBranchId: 's', targetBranchId: 't', title: 'X', description: '', status: 'open', createdBy: 'u', createdAt: 1, decidedBy: null, decidedAt: null, reviewNote: '', mergedCount: 0 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await createMergeRequest('tok', 'p', 's', 't', 'X');
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p/merge-requests');
  });

  it('decideMergeRequest posts approve + note to the decide endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { mergeRequest: { id: 'mr1', projectId: 'p', sourceBranchId: 's', targetBranchId: 't', title: 'X', description: '', status: 'merged', createdBy: 'u', createdAt: 1, decidedBy: 'u', decidedAt: 2, reviewNote: 'ok', mergedCount: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await decideMergeRequest('tok', 'p', 'mr1', true, 'ok');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('merged');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/p/merge-requests/mr1/decide');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ approve: true, reviewNote: 'ok' });
  });

  it('getContributions unwraps the graph', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { contributions: { contributors: [], perDay: {}, totalTrials: 0 } })));
    const r = await getContributions('tok', 'p');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.totalTrials).toBe(0);
  });
});
