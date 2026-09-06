import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveWorldProposal } from '../core/worldModel/generation/resolveWorldProposal';
import { validateProposal } from '../core/worldModel/generation/worldModelProposal';

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * LLM -> DETERMINISTIC FALLBACK (Priority 1.2) — proves the ONE composed
 * entry point handles every one of the LLM adapter's already-tested
 * failure modes by falling back to the deterministic script path, and
 * NEVER misreports which path actually produced the result.
 */
describe('resolveWorldProposal: composes the real LLM path with the deterministic fallback', () => {
  it('returns the real LLM proposal, resolvedVia LLM, when the LLM succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { worldType: ['CITY'], rationale: 'A city.' }, model: 'claude-opus-4-8' })),
    );
    const result = await resolveWorldProposal('Build a city.', { worldId: 'w1', seed: 1, fallback: { worldId: 'w1', seed: 1, wantsCity: true } });
    expect(result.resolvedVia).toBe('LLM');
    expect(result.llmFailure).toBeUndefined();
    expect(result.proposal.source).toBe('LLM');
    expect(validateProposal(result.proposal).validation.ok).toBe(true);
  });

  it.each([
    ['offline (network failure)', () => vi.fn().mockRejectedValue(new Error('down')), 'offline'],
    ['no-key (503)', () => vi.fn().mockResolvedValue(fakeResponse(503, { message: 'no key' })), 'no-key'],
    ['rate-limited (429)', () => vi.fn().mockResolvedValue(fakeResponse(429, {})), 'rate-limited'],
    ['malformed (backend 502)', () => vi.fn().mockResolvedValue(fakeResponse(502, { message: 'bad tool response' })), 'malformed'],
    ['malformed (invented template, 200)', () => vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { worldType: ['MOON_BASE'], rationale: 'x' } })), 'malformed'],
  ])('falls back to the deterministic script path on %s, honestly reporting the LLM failure', async (_label, makeFetch, expectedReason) => {
    vi.stubGlobal('fetch', makeFetch());
    const result = await resolveWorldProposal('Build a lab.', {
      worldId: 'w2',
      seed: 2,
      retries: 0,
      fallback: { worldId: 'w2', seed: 2, wantsLaboratory: true },
    });
    expect(result.resolvedVia).toBe('SCRIPT');
    expect(result.llmFailure?.reason).toBe(expectedReason);
    expect(result.proposal.source).toBe('SCRIPT');
    expect(result.proposal.specification.worldType).toEqual(['LABORATORY']);
    // The fallback proposal is just as real and just as validated as the LLM one would have been.
    expect(validateProposal(result.proposal).validation.ok).toBe(true);
  });

  it('the fallback proposal never claims to be LLM-sourced, even though the caller originally asked the LLM', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const result = await resolveWorldProposal('x', { worldId: 'w3', seed: 3, retries: 0, fallback: { worldId: 'w3', seed: 3, wantsCity: true } });
    expect(result.proposal.provenance.model).toBeUndefined();
    expect(result.proposal.source).not.toBe('LLM');
  });
});
