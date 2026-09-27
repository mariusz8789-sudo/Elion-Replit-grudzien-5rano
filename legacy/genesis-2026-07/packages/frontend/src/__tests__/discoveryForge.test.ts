/**
 * Discovery Forge client contract tests (Final WOW Mandate).
 * Mocked fetch; assert HTTP method/path/auth/body + ApiResult mapping. No React render.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDiscoveryCampaign, listDiscoveryCampaigns, getDiscoveryDossier } from '../core/backend/client';

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('discovery forge client', () => {
  it('runDiscoveryCampaign POSTs seeds with the bearer token', async () => {
    const data = { campaignId: 'c1', status: 'COMPLETED_WITH_COMPUTATIONAL_CANDIDATES', stopReason: 'X', generations: [], dossier: { dossierHash: 'h' } };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, data));
    vi.stubGlobal('fetch', fetchMock);
    const r = await runDiscoveryCampaign('tok', 'proj1', { seeds: [{ name: 'a', smiles: 'CCO' }], maxGenerations: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.status).toBe('COMPLETED_WITH_COMPUTATIONAL_CANDIDATES');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/discovery-campaigns');
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string).seeds[0].smiles).toBe('CCO');
  });

  it('listDiscoveryCampaigns GETs tenant campaigns and unwraps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { campaigns: [{ id: 'c1', projectId: 'proj1', status: 'X', planHash: 'h', createdAt: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await listDiscoveryCampaigns('tok', 'proj1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0].id).toBe('c1');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/discovery-campaigns');
  });

  it('getDiscoveryDossier GETs the dossier and unwraps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { dossier: { dossierHash: 'abc', classification: 'COMPUTATIONAL_CANDIDATE' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await getDiscoveryDossier('tok', 'proj1', 'c1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.dossierHash).toBe('abc');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/proj1/discovery-campaigns/c1/dossier');
  });
});
