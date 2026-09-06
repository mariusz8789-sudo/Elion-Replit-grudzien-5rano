import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestLLMWorldProposal } from '../core/worldModel/generation/llmWorldProposalAdapter';
import { validateProposal, validateProposalShape, WORLD_MODEL_PROPOSAL_SCHEMA_VERSION } from '../core/worldModel/generation/worldModelProposal';

/**
 * Real LLM World Proposer adapter tests — mirrors narrator/askAI.test.ts's
 * mocked-fetch style, since this adapter follows that exact same client
 * pattern against a different backend endpoint (/api/world-proposal).
 */
function fakeResponse(status: number, body: unknown, jsonThrows = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => (jsonThrows ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestLLMWorldProposal: HTTP response handling', () => {
  it('returns a well-formed WorldModelProposal on a successful response, with the caller-supplied worldId/seed (never the model\'s own)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        proposal: { worldType: ['CITY', 'WATER_SYSTEM'], population: { count: 10_000 }, rationale: 'A coastal city with water infrastructure.' },
        model: 'claude-opus-4-8',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestLLMWorldProposal('Build a coastal city with water infrastructure for 10000 people.', { worldId: 'my-world', seed: 42 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.proposal.schemaVersion).toBe(WORLD_MODEL_PROPOSAL_SCHEMA_VERSION);
    expect(result.proposal.source).toBe('LLM');
    expect(result.proposal.specification.worldId).toBe('my-world');
    expect(result.proposal.specification.seed).toBe(42);
    expect(result.proposal.specification.worldType).toEqual(['CITY', 'WATER_SYSTEM']);
    expect(result.proposal.specification.population).toEqual({ count: 10_000 });
    expect(result.proposal.provenance.model).toBe('claude-opus-4-8');
    expect(result.proposal.provenance.requestText).toContain('coastal city');

    // The proposal passes the SAME validation gate any hand-authored specification does.
    expect(validateProposal(result.proposal).validation.ok).toBe(true);
    expect(validateProposalShape(result.proposal).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on 503, reports no-key without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(503, { error: 'ai_unavailable', message: 'Generator świata AI nie jest skonfigurowany.' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 3 });
    expect(result).toEqual({ ok: false, reason: 'no-key', message: 'Generator świata AI nie jest skonfigurowany.' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry for a deterministic rejection
  });

  it('on 429, reports rate-limited without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(429, {}));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('rate-limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('on a 502 from the backend (its own malformed-tool-response rejection), reports malformed without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(502, { error: 'malformed_proposal', message: 'Model did not return a propose_world tool call.' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('malformed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never trusts the backend a second time: rejects a proposal containing an invented template name, even with a 200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { worldType: ['CITY', 'MOON_BASE'], rationale: 'x' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('malformed');
  });

  it('rejects a 200 response with no worldType or empty rationale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { rationale: 'x' } })));
    const r1 = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1 });
    expect(r1.ok).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { worldType: ['CITY'], rationale: '' } })));
    const r2 = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1 });
    expect(r2.ok).toBe(false);
  });

  it('retries a transient network failure, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(fakeResponse(200, { proposal: { worldType: ['LABORATORY'], rationale: 'A lab.' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 1 });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on persistent network failure, reporting offline', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('offline');
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('treats a request abort/timeout as offline, not a crash', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    const result = await requestLLMWorldProposal('x', { worldId: 'w', seed: 1, retries: 0, timeoutMs: 5 });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('offline');
  });
});

describe('validateProposalShape: structural (runtime) validation', () => {
  it('accepts a well-formed proposal', () => {
    const proposal = {
      schemaVersion: '2.0.0',
      proposalId: 'p1',
      source: 'LLM' as const,
      specification: { worldId: 'w1', seed: 1, worldType: ['CITY'] as const },
      provenance: { createdAt: new Date().toISOString() },
    };
    expect(validateProposalShape(proposal).ok).toBe(true);
  });

  it('rejects a non-object, a missing schemaVersion, an invalid source, and a malformed specification', () => {
    expect(validateProposalShape(null).ok).toBe(false);
    expect(validateProposalShape({}).ok).toBe(false);
    expect(
      validateProposalShape({ proposalId: 'p1', source: 'NOT_A_SOURCE', specification: {}, provenance: { createdAt: 'x' } }).ok,
    ).toBe(false);
    expect(
      validateProposalShape({
        schemaVersion: '2.0.0',
        proposalId: 'p1',
        source: 'LLM',
        specification: { worldId: '', seed: 'not-a-number', worldType: [] },
        provenance: { createdAt: 'x' },
      }).ok,
    ).toBe(false);
  });
});
