/**
 * Truth Engine client contract tests (Commercial Hardening — Phase 1).
 * Mirrors backendClient.test.ts: mock fetch, assert HTTP method/path/auth header/body
 * and the ApiResult mapping. No React rendering (node test environment).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTruthAnalysis, listTruthAnalyses, getNecropolisStats, getTruthReport, compareTruthAnalyses } from '../core/backend/client';

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('truth engine client', () => {
  it('runTruthAnalysis POSTs the proposal with the bearer token and unwraps the analysis', async () => {
    const analysis = { id: 'a1', proposalHash: 'ph', decision: { decision: 'GO' }, stages: [], certificate: { decisionHash: 'dh' } };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { analysis }));
    vi.stubGlobal('fetch', fetchMock);

    const r = await runTruthAnalysis('tok', 'proj1', { claimedResult: 'x', assumptions: ['a'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.decision.decision).toBe('GO');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/truth-analyses');
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ claimedResult: 'x', assumptions: ['a'] });
  });

  it('runTruthAnalysis maps a 400 (empty proposal) to a typed failure — never a fake GO', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(400, { error: 'invalid_proposal', message: 'Propozycja jest pusta' })));
    const r = await runTruthAnalysis('tok', 'proj1', {});
    expect(r).toEqual({ ok: false, status: 400, error: 'invalid_proposal', message: 'Propozycja jest pusta' });
  });

  it('listTruthAnalyses GETs project-scoped history and unwraps the array', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { analyses: [{ id: 'a1', proposalHash: 'p', decision: 'BLOCK', decisionHash: 'h', createdAt: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await listTruthAnalyses('tok', 'proj1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].decision).toBe('BLOCK');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/truth-analyses');
  });

  it('getNecropolisStats GETs tenant necropolis and unwraps it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { necropolis: { projectId: 'proj1', total: 3, byDomain: {}, byClass: {} } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await getNecropolisStats('tok', 'proj1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.total).toBe(3);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/necropolis');
  });
});

describe('truth engine report + compare client', () => {
  it('getTruthReport GETs the stored-output report', async () => {
    const report = { schema: 'zefir-pilot-report/1', finalDecision: 'BLOCK', limitationStatement: 'x' };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { report }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await getTruthReport('tok', 'proj1', 'a1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.finalDecision).toBe('BLOCK');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/truth-analyses/a1/report');
  });

  it('compareTruthAnalyses GETs compare with a/b query params', async () => {
    const comparison = { decisionChanged: true, from: 'GO', to: 'BLOCK', necropolis: { newlyInfluenced: true } };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { comparison }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await compareTruthAnalyses('tok', 'proj1', 'idA', 'idB');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.to).toBe('BLOCK');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/truth-analyses/compare?a=idA&b=idB');
  });
});
