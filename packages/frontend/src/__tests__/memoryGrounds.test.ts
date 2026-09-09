import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * MEMORY AS EVIDENCE, NOT AS A LIST OF NAMES.
 *
 * A `SavedParameterInquiry` has always carried the whole `InquiryLoopResult` —
 * every round's observation, every hypothesis's own prediction, and the loop's
 * own sentence for each verdict. Nothing read them. The narrowing step took
 * `falsifiedHypothesisIds` and dropped the rest, so a second investigation
 * could say WHICH hypotheses it skipped and never WHY.
 *
 * This proves the grounds now travel with the decision, recovered from the
 * stored record rather than restated — the minimum a context-aware reuse needs.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe('memory carries WHY a hypothesis was skipped, not just that it was', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE DEFINING BEHAVIOUR: each skip carries the probe, the prediction and the observation', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const seed = await import('../core/agent/inquirySession');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    const input = fixture.proteinFoldingInquiry(1.0);
    const seeded = seed.runInquiryAndRemember(input);
    // Three of the four refuted, one survivor: the branch that genuinely
    // narrows, rather than the one that re-runs everything.
    expect(seeded.result.falsifiedHypothesisIds).toHaveLength(3);
    expect(seeded.result.survivingHypothesisIds).toEqual(['h:warm']);

    // A restart, so the second call genuinely reads persisted memory.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { memoryNarrowedHypotheses } = await import('../core/agent/inquirySession');
    const again = await import('../core/agent/proteinFoldingInquiry');

    const { resumedFromMemory } = memoryNarrowedHypotheses(again.proteinFoldingInquiry(1.0));
    expect(resumedFromMemory).not.toBeNull();

    const grounds = resumedFromMemory!.grounds!;
    expect(grounds.length).toBeGreaterThan(0);

    for (const ground of grounds) {
      // Every field is a real number off the stored run, not a placeholder.
      expect(typeof ground.probeValue).toBe('number');
      expect(ground.predicted).not.toBeNull();
      expect(ground.observed).not.toBeNull();
      // And the disagreement is real: a refutation means the prediction and the
      // measurement genuinely differed.
      expect(ground.predicted).not.toBe(ground.observed);
      // The loop's own words, carried verbatim rather than re-composed.
      expect(ground.reason).toContain('outside the declared');
    }
  }, 30_000);

  it('the grounds match the stored inquiry exactly — recovered, never restated', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const seed = await import('../core/agent/inquirySession');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    const seeded = seed.runInquiryAndRemember(fixture.proteinFoldingInquiry(1.0));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { memoryNarrowedHypotheses } = await import('../core/agent/inquirySession');
    const again = await import('../core/agent/proteinFoldingInquiry');
    const { resumedFromMemory } = memoryNarrowedHypotheses(again.proteinFoldingInquiry(1.0));

    for (const ground of resumedFromMemory!.grounds!) {
      const round = seeded.result.rounds.find((r) => r.probeValue === ground.probeValue)!;
      const outcome = round.outcomes.find((o) => o.hypothesisId === ground.hypothesisId)!;
      expect(ground.predicted).toBe(outcome.predicted);
      expect(ground.observed).toBe(round.observed);
      expect(ground.reason).toBe(outcome.reason);
    }
  }, 30_000);

  it('the human-readable reason states the grounds too, not only the count', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const seed = await import('../core/agent/inquirySession');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    seed.runInquiryAndRemember(fixture.proteinFoldingInquiry(1.0));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { memoryNarrowedHypotheses } = await import('../core/agent/inquirySession');
    const again = await import('../core/agent/proteinFoldingInquiry');
    const { resumedFromMemory } = memoryNarrowedHypotheses(again.proteinFoldingInquiry(1.0));

    expect(resumedFromMemory!.reason).toContain('Podstawy z zapamiętanych pomiarów');
    expect(resumedFromMemory!.reason).toMatch(/przewidywało .+ przy .+, zmierzono/);
  }, 30_000);

  it('no prior inquiry means no grounds and no fabricated ones', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { memoryNarrowedHypotheses } = await import('../core/agent/inquirySession');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    const { resumedFromMemory } = memoryNarrowedHypotheses(fixture.proteinFoldingInquiry(1.0));
    expect(resumedFromMemory).toBeNull();
  });
});
