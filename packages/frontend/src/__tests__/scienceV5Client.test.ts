import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchComputeResources, fetchScientificMemory, fetchAgentRoles,
  runMultiAgentPanel, buildLabReadiness, buildInvestorPackage,
} from '../core/backend/client';

/**
 * V5 discovery-console client — mocked-fetch HTTP contract tests for the six new
 * /api/science endpoints powering the premium screens. Verify method/path/body and
 * the unwrap of the real module payloads.
 */
function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('V5 console client', () => {
  it('fetchComputeResources → GET /science/compute-resources, unwraps resources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { resources: { version: 'v', cpu: { cores: 4, totalMemGB: 15.7 }, gpu: { available: false }, docker: { available: true }, kubernetes: { available: false }, hpcScheduler: { slurm: false }, jobQueue: { available: true }, distributedProcessing: { available: false }, honesty: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchComputeResources();
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.cpu.cores).toBe(4); expect(r.data.gpu.available).toBe(false); }
    expect(fetchMock.mock.calls[0][0]).toBe('/api/science/compute-resources');
  });

  it('fetchScientificMemory → GET /science/memory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { memory: { version: 'v', ownCampaigns: { status: 'INSUFFICIENT_DATA', campaignsLearnedFrom: 0, samples: 0, learnedPolicy: null }, externalSources: [], externalLearningStatus: 'BLOCKED_BY_RUNTIME', honesty: 'x' } })));
    const r = await fetchScientificMemory();
    expect(r.ok && r.data.externalLearningStatus).toBe('BLOCKED_BY_RUNTIME');
  });

  it('fetchAgentRoles → GET /science/agent-roles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { roles: ['Toxicologist'], version: 'v' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchAgentRoles();
    expect(r.ok && r.data.roles).toContain('Toxicologist');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/science/agent-roles');
  });

  it('runMultiAgentPanel → POST /science/multi-agent with dossier body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { panel: { status: 'COMPLETED', version: 'v', reasoningLayer: 'CAPABILITY_BLOCKED', agents: [], consensus: { proceed: true, verdict: 'X', openConcerns: [], nextAction: 'n' }, didGenesisDiscoverADrug: 'NO', honesty: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await runMultiAgentPanel({ benchmark: {} });
    expect(r.ok && r.data.reasoningLayer).toBe('CAPABILITY_BLOCKED');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/science/multi-agent');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).dossier).toEqual({ benchmark: {} });
  });

  it('buildLabReadiness → POST /science/laboratory-readiness with candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { readiness: { status: 'COMPLETED', version: 'v' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await buildLabReadiness('CCO');
    expect(r.ok && r.data.status).toBe('COMPLETED');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).candidate.smiles).toBe('CCO');
  });

  it('buildInvestorPackage → POST /science/investor-package', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { package: { version: 'v', documents: { investorReport: 'r', pharmaReport: '', grantReport: '', pitchDeck: '', ipPackage: '', patentDraft: '' }, didGenesisDiscoverADrug: 'NO', disclaimer: 'd' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await buildInvestorPackage({}, {});
    expect(r.ok && r.data.didGenesisDiscoverADrug).toBe('NO');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/science/investor-package');
  });

  it('maps a backend failure to a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(404, { error: 'not_found' })));
    const r = await fetchComputeResources();
    expect(r.ok).toBe(false);
  });
});
