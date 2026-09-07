import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { requestLLMWorldProposal } from '../core/worldModel/generation/llmWorldProposalAdapter';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * TRINITY END TO END, STARTING FROM THE REAL LLM PATH (Genesis Scientific
 * World Model 3.0, sections 1/4/5) — the one chain that had never been
 * exercised together: `requestLLMWorldProposal` (mocked HTTP boundary only
 * — everything past that boundary is real) -> `createScientificWorld` ->
 * a live, tickable world -> `WorldFrame` -> the C2 graphics adapter. Every
 * unit along this chain already has its own tests; this proves they
 * actually COMPOSE.
 */
describe('Trinity end to end: LLM proposal -> validated world -> evolution -> WorldFrame', () => {
  it('a real (mocked-HTTP) LLM proposal reaches a live, tickable, renderable world through the same gate any other proposal source goes through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        proposal: {
          worldType: ['CITY', 'WATER_SYSTEM'],
          population: { count: 5000 },
          scientificDomains: [{ domain: 'hydraulics', required: true }],
          rationale: 'A small coastal city with a water system, for a flooding scenario.',
        },
        model: 'claude-opus-4-8',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const llmResult = await requestLLMWorldProposal('Build a small coastal city with a water system.', {
      worldId: 'trinity-e2e-llm-city',
      seed: 7,
    });
    expect(llmResult.ok).toBe(true);
    if (!llmResult.ok) throw new Error('expected ok');

    // The LLM adapter NEVER created a WorldGraph or ran a solver — createScientificWorld is the
    // ONLY path from here to a real world, and it re-validates the proposal itself.
    const created = createScientificWorld({ kind: 'proposal', proposal: llmResult.proposal });
    expect(created.worldId).toBe('trinity-e2e-llm-city');
    expect(created.validation.ok).toBe(true);
    expect(created.proposalValidation?.validation.ok).toBe(true);
    expect(created.provenance.proposalProvenance?.model).toBe('claude-opus-4-8');
    expect(created.availableDomains).toContain('hydraulics-engineering');

    // EVOLUTION: the live engine really ticks.
    for (let i = 0; i < 3; i++) created.engine.advance(1, () => undefined);
    expect(created.engine.tick).toBe(3);

    // C2: the head WorldFrame adapts cleanly, with every entity's honesty tier preserved.
    const graphicsFrame = toGraphicsWorldFrame(created.worldFrame);
    expect(graphicsFrame.entities.length).toBe(created.specified.graph.listEntities().length);
    for (const e of graphicsFrame.entities) expect(['MODELED', 'DERIVED', 'NOT_MODELED']).toContain(e.grounding);
  });

  it('a malformed LLM response never reaches createScientificWorld at all — the caller gets a clear rejection, not a fabricated world', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { proposal: { worldType: ['NOT_A_REAL_TEMPLATE'], rationale: 'x' } })));
    const llmResult = await requestLLMWorldProposal('x', { worldId: 'trinity-e2e-bad', seed: 1 });
    expect(llmResult.ok).toBe(false);
    // There is no proposal object to even attempt createScientificWorld with — the rejection
    // happened at the adapter boundary, exactly as section 1 requires ("NIGDY silent repair").
  });

  it('an offline LLM (mocked network failure) never reaches createScientificWorld either — the deterministic script path remains the honest fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const llmResult = await requestLLMWorldProposal('x', { worldId: 'trinity-e2e-offline', seed: 1, retries: 0 });
    expect(llmResult.ok).toBe(false);
    if (llmResult.ok) throw new Error('expected not ok');
    expect(llmResult.reason).toBe('offline');
  });
});

/**
 * DETERMINISM (Genesis Scientific World Model 3.0, section 19): the SAME
 * seed + specification, through the SAME Trinity entry point, twice
 * independently, must produce canonically identical generated worlds and
 * initial WorldFrames — proven at the level callers actually use
 * (`createScientificWorld`), not just at the lower-level compiler this was
 * already proven at.
 */
describe('Determinism: createScientificWorld is reproducible end to end', () => {
  const spec = {
    worldId: 'determinism-trinity-1',
    seed: 99,
    worldType: ['CITY', 'LABORATORY'] as const,
    scientificDomains: [{ domain: 'chemistry' as const, required: true }],
  };

  function canonicalEntities(created: ReturnType<typeof createScientificWorld>): string {
    return canonicalJson([...created.specified.graph.listEntities()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  }

  it('two independent creations from the same specification are canonically identical', () => {
    const a = createScientificWorld({ kind: 'specification', specification: { ...spec } });
    const b = createScientificWorld({ kind: 'specification', specification: { ...spec } });
    expect(canonicalEntities(a)).toBe(canonicalEntities(b));
    expect(canonicalJson(toGraphicsWorldFrame(a.worldFrame))).toBe(canonicalJson(toGraphicsWorldFrame(b.worldFrame)));
  });

  it('a different seed produces a genuinely different world (determinism is not a trivial constant)', () => {
    const a = createScientificWorld({ kind: 'specification', specification: { ...spec, seed: 1 } });
    const b = createScientificWorld({ kind: 'specification', specification: { ...spec, seed: 2 } });
    expect(canonicalEntities(a)).not.toBe(canonicalEntities(b));
  });

  it('replay after evolution stays byte-identical to the live graph for a Trinity-created world', () => {
    const created = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'determinism-trinity-replay' } });
    for (let i = 0; i < 4; i++) created.engine.advance(1, () => undefined);
    const live = canonicalJson([...created.engine.graph.listEntities()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    const replayed = canonicalJson([...created.engine.scrubTo(created.engine.tick).listEntities()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    expect(replayed).toBe(live);
  });
});
