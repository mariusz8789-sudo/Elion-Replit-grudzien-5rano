import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * P0 — MEMORY -> SELECTION -> GENERATION -> SELECTION AGAIN.
 *
 * The chain this file proves, end to end, with a process restart in the middle:
 *
 *   declared A/B/C/D -> all refuted -> Genesis derives E -> tests E
 *     -> BOTH investigations banked in Science Memory
 *     -> [restart]
 *     -> the next investigation reads that memory and runs on E
 *
 * The last step is the one that matters. A derived hypothesis that is merely
 * reported is a line in a log; one that changes what the NEXT investigation
 * spends its probes on is part of what Genesis knows. Here memory refutes all
 * four declared values and leaves exactly the one Genesis invented itself —
 * through the ordinary `memoryNarrowedHypotheses` path, with no special case
 * for derived ids anywhere.
 *
 * `window.localStorage` is faked (the existing `scienceMemory` idiom) and
 * `vi.resetModules()` stands in for a restart, so the second run genuinely
 * reads persisted memory rather than in-process state.
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

const TRUE_HIDDEN_TEMPERATURE = 0.5;
const DERIVED_ID = 'h:derived-temperature-0.5';

describe('generation reaches memory, and memory carries it into the next selection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('banks BOTH investigations, with the derived hypothesis in the follow-up record', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runInquiryWithGenerationAndRemember } = await import('../core/agent/inquirySession');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');
    const { listParameterInquiriesForSystem } = await import('../core/scienceMemory');

    const input = proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const session = runInquiryWithGenerationAndRemember(input);

    expect(session.generation.generated).not.toBeNull();
    expect(session.savedFollowUp).not.toBeNull();

    // Two records, not one merged record: they asked different questions over
    // different hypothesis sets, and the derived value's provenance is exactly
    // what must not be lost.
    const remembered = listParameterInquiriesForSystem(input.system);
    expect(remembered).toHaveLength(2);

    const followUpRecord = remembered.find((r) =>
      r.input.hypotheses.some((h) => h.hypothesisId === DERIVED_ID),
    );
    expect(followUpRecord).toBeDefined();
    // The record carries the real verdict, not just the proposal.
    expect(followUpRecord!.result.survivingHypothesisIds).toContain(DERIVED_ID);
  });

  it('THE DEFINING BEHAVIOUR: after a restart, memory leaves exactly the hypothesis Genesis invented', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const seed = await import('../core/agent/inquirySession');
    const seedFixture = await import('../core/agent/proteinFoldingInquiry');
    const seedInput = seedFixture.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const session = seed.runInquiryWithGenerationAndRemember(seedInput);

    const derived = session.generation.generated!.derived;
    // Confirmed on the real result before anything is built on it.
    expect(session.generation.first.falsifiedHypothesisIds).toHaveLength(4);

    // ---- restart ----
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { asParameterHypothesis } = await import('../core/agent/parameterAlternative');
    const fixture = await import('../core/agent/proteinFoldingInquiry');

    // The next investigation offers everything: the four declared values AND
    // the one Genesis derived. Nothing here tells it which is which.
    const base = fixture.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const next: InquiryLoopInput = {
      ...base,
      hypotheses: [...base.hypotheses, asParameterHypothesis(derived)],
    };

    const outcome = runDiscovery({ shape: 'PARAMETER', input: next });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    // Memory refuted all four declared values in the earlier session, so this
    // run skips them — and the ONLY hypothesis it still needs to test is the
    // one Genesis proposed itself.
    expect(outcome.priorInvestigation).not.toBeNull();
    expect([...outcome.priorInvestigation!.skippedHypothesisIds].sort()).toEqual([
      'h:cold',
      'h:cool',
      'h:hot',
      'h:warm',
    ]);

    const tested = outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    expect(new Set(tested)).toEqual(new Set([DERIVED_ID]));
  });

  it('a derived value banked for one system does not leak into a different system', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const seed = await import('../core/agent/inquirySession');
    const seedFixture = await import('../core/agent/proteinFoldingInquiry');
    seed.runInquiryWithGenerationAndRemember(seedFixture.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const fixture = await import('../core/agent/proteinFoldingInquiry');

    const other = fixture.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const outcome = runDiscovery({
      shape: 'PARAMETER',
      input: { ...other, system: { ...other.system, systemId: 'a-genuinely-different-fold' } },
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    // Nothing narrowed: an earlier falsification does not transfer across systems.
    expect(outcome.priorInvestigation).toBeNull();
    const tested = outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    expect(tested).toContain('h:cold');
  });

  /**
   * THE FULL DEFINITION-OF-DONE CHAIN IN ONE TEST — the property the other
   * tests in this file each prove PART of, but never together:
   *
   *   bare start -> falsify -> derive -> bank (both investigations)
   *     -> EACH banked record independently REPLAYS to MATCH
   *     -> [restart]
   *     -> the NEXT investigation reads that memory, tests only what is
   *        still open, and its OWN record ALSO replays to MATCH
   *
   * Every earlier test proves the memory-narrowing half or the persistence
   * half; this is the one place both halves and the replay check on BOTH
   * generations of records sit in a single, ordered story.
   */
  it('THE FULL CHAIN: falsify -> bank -> replay -> [restart] -> next experiment uses it -> replay again', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const round1Module = await import('../core/agent/inquirySession');
    const memory1 = await import('../core/scienceMemory');
    const fixture1 = await import('../core/agent/proteinFoldingInquiry');
    const round1 = round1Module.runInquiryWithGenerationAndRemember(fixture1.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE));

    // Bare start really falsified the whole declared space.
    expect(round1.generation.first.falsifiedHypothesisIds).toHaveLength(4);
    expect(round1.generation.generated).not.toBeNull();
    expect(round1.savedFollowUp).not.toBeNull();

    // EVERY banked record from round 1 independently replays to MATCH — not
    // asserted, RE-EXECUTED. This is the audit trail a real next decision
    // would be built on, proven reproducible before it is trusted.
    const firstReplay = memory1.replaySavedParameterInquiry(round1.savedFirst);
    expect(firstReplay.status).toBe('MATCH');
    const followUpReplay = memory1.replaySavedParameterInquiry(round1.savedFollowUp!);
    expect(followUpReplay.status).toBe('MATCH');

    // ---- restart: a genuinely separate process reads what round 1 banked ----
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const round2Module = await import('../core/agent/inquirySession');
    const memory2 = await import('../core/scienceMemory');
    const paramAlt = await import('../core/agent/parameterAlternative');
    const fixture2 = await import('../core/agent/proteinFoldingInquiry');

    const derived = round1.generation.generated!.derived;
    const base = fixture2.proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    // THE NEXT QUESTION / NEXT EXPERIMENT: offers the four declared values
    // (already refuted) alongside the one Genesis derived for itself — the
    // same shape a real follow-on investigation would construct, not a
    // hand-picked shortcut.
    const round2 = round2Module.runInquiryWithGenerationAndRemember({
      ...base,
      hypotheses: [...base.hypotheses, paramAlt.asParameterHypothesis(derived)],
    });

    // Memory drove the selection: only the derived hypothesis was still open.
    expect(round2.generation.executedInput.hypotheses.map((h) => h.hypothesisId)).toEqual([derived.hypothesisId]);

    // The NEXT experiment's own record ALSO replays to MATCH — provenance and
    // reproducibility do not stop at the record that changed the decision;
    // they hold for the record the decision produced, too.
    const round2Replay = memory2.replaySavedParameterInquiry(round2.savedFirst);
    expect(round2Replay.status).toBe('MATCH');
  });
});
