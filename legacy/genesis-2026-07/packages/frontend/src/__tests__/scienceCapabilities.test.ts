import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchScienceCapabilities } from '../core/backend/client';

/**
 * Discovery Workspace client (V3 Phase 6) — GET /api/science/capabilities with mocked fetch. Verifies
 * the public HTTP contract + unwrap of real capability data (engines, off-target panel, KG, bio sources).
 */
function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('fetchScienceCapabilities', () => {
  const caps = {
    version: 'genesis-science-capabilities/1',
    engines: { rdkit: { available: true, version: '2026.03.3' }, admet: { available: true }, docking: { available: true }, molecularDynamics: { available: false, canRunComplexMd: false, reason: 'no ligand FF' }, mmGbsa: { available: false } },
    offTarget: { panel: [{ gene: 'KCNH2', protein: 'hERG', category: 'ion_channel' }], toxicityEndpoints: ['cardiotoxicity (hERG)'], epistemicStatus: 'MODEL_INFERRED', source: 'ADMET-AI' },
    knowledgeGraph: { nodeTypes: ['Protein', 'Ligand'], edgeTypes: ['OFF_TARGET'], provenanceRequired: true },
    biologicalSources: [{ service: 'OPEN_TARGETS', kind: 'disease-target-association', license: 'CC0', liveRetrieval: 'BLOCKED_BY_RUNTIME (egress policy)' }],
    honesty: 'computational only',
  };

  it('GETs the public endpoint and unwraps capabilities', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { capabilities: caps }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchScienceCapabilities();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.offTarget.panel[0].gene).toBe('KCNH2');
      expect(r.data.engines.molecularDynamics.canRunComplexMd).toBe(false);
      expect(r.data.biologicalSources[0].liveRetrieval).toMatch(/BLOCKED_BY_RUNTIME/);
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/science/capabilities');
    expect(init.method).toBe('GET');
  });

  it('maps a failure to a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(404, { error: 'not_found' })));
    const r = await fetchScienceCapabilities();
    expect(r.ok).toBe(false);
  });
});
