import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * THE SINGLE E2E PROOF, tying together capabilities this codebase already
 * proves separately, into one continuous, honest run:
 *
 *   a person's QUESTION -> Genesis proposes hypotheses -> picks and runs a
 *   real experiment -> Evidence -> falsification/support -> Science Memory
 *   -> Genesis picks its OWN next question (never hardcoded here) -> next
 *   experiment -> ... -> the chain stops because it is honestly SETTLED, not
 *   because it ran out of step budget -> a SECOND, later session (a real
 *   module reset, same persisted storage) reads that banked memory, and its
 *   own first step is demonstrably narrowed by what the first session
 *   already refuted.
 *
 * No text of a second or third question appears anywhere below. This reuses
 * the exact substrate `autonomousQuestionChainBenchmark.test.ts` measured to
 * reach 3 self-chosen steps and terminate SETTLED, and adds the one link
 * that benchmark does not check: that a LATER, independent session actually
 * benefits from what an EARLIER one banked — `researchChain.ts` runs every
 * step through `discoveryOrchestrator.runDiscovery`, which already applies
 * `memoryNarrowedHypotheses` to every admitted step, so this needs no new
 * production code — only a test proving the seam actually closes.
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

const TRUE_HIDDEN_TEMPERATURE = 0.8;
const DECLARED_PROBES = [200, 500, 1000, 2000, 5000, 10000, 20000, 35000, 50000];
const QUESTION = 'What temperature did this HP-lattice protein fold actually run at?';

describe('THE E2E PROOF: one continuous autonomous research chain, with memory carried into a second session', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bare start -> falsify/support -> Memory -> self-chosen next question(s) -> honestly SETTLED, with no hardcoded Q2/Q3', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingSystem, PROTEIN_FOLDING_HYPOTHESES } = await import('../core/agent/proteinFoldingInquiry');
    const { listExperiments } = await import('../core/scienceMemory');

    const base = proteinFoldingSystem(TRUE_HIDDEN_TEMPERATURE);
    const input: InquiryLoopInput = {
      question: QUESTION,
      system: { ...base, candidateProbeValues: DECLARED_PROBES },
      hypotheses: PROTEIN_FOLDING_HYPOTHESES,
      openingProbeValue: DECLARED_PROBES[0]!,
      maxRounds: 4,
    };

    const chain = runResearchChain(input, 10);

    // Step 1 is the person's own question; everything after it, the chain
    // named for itself — asserted on the chain's OWN record of why, not on
    // this test's expectation of what it should have asked.
    expect(chain.steps[0]!.kind).toBe('INITIAL');
    expect(chain.selfChosenSteps).toBeGreaterThanOrEqual(2);
    for (const step of chain.steps.slice(1)) {
      expect(step.kind, `step ${step.step} should have been chosen by the selector, not asserted here`).not.toBe(
        'INITIAL',
      );
      expect(step.why.length).toBeGreaterThan(0);
    }

    // A real stop, not merely running out of budget: step budget was 10, and
    // the chain used far fewer, because the question genuinely settled.
    expect(chain.steps.length).toBeLessThan(10);
    expect(chain.terminalStatus).toBe('SETTLED');
    expect(chain.stoppedBecause).toContain('settled');

    // Evidence really reached Memory at every step, not merely a return
    // value — and it is independently retrievable, not just present on the
    // in-process result.
    for (const step of chain.steps) {
      if (step.outcome.status !== 'RAN') throw new Error(`step ${step.step} did not run`);
      expect(step.outcome.run.rounds.length).toBeGreaterThan(0);
      expect(step.remembered.length).toBeGreaterThan(0);
    }
    const banked = listExperiments();
    expect(banked.length).toBeGreaterThanOrEqual(chain.steps.length);
  }, 300_000);

  it('a SECOND, later session reads that banked memory, and its own first step is genuinely narrowed by it', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/researchChain');
    const { proteinFoldingSystem, PROTEIN_FOLDING_HYPOTHESES } = await import('../core/agent/proteinFoldingInquiry');

    const base = proteinFoldingSystem(TRUE_HIDDEN_TEMPERATURE);
    const input: InquiryLoopInput = {
      question: QUESTION,
      system: { ...base, candidateProbeValues: DECLARED_PROBES },
      hypotheses: PROTEIN_FOLDING_HYPOTHESES,
      openingProbeValue: DECLARED_PROBES[0]!,
      maxRounds: 4,
    };

    // A budget of 1 stops this session after its own first (human-asked)
    // question — real further work is left (the full chain above reaches 3
    // steps at a higher budget), which is exactly the situation a second,
    // later session should be able to build on rather than repeat.
    const firstChain = first.runResearchChain(input, 1);
    const firstStep = firstChain.steps[0]!;
    if (firstStep.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(firstStep.outcome.run.falsified.length).toBeGreaterThan(0);
    expect(firstStep.outcome.run.falsified.length).toBeLessThan(PROTEIN_FOLDING_HYPOTHESES.length);

    // A REAL restart: fresh modules, the SAME persisted storage — the only
    // thing carrying knowledge across this boundary is `localStorage`, same
    // as a real second process would have.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/researchChain');

    const secondChain = second.runResearchChain(input, 10);
    const secondStep = secondChain.steps[0]!;
    if (secondStep.outcome.status !== 'RAN') throw new Error('expected RAN');

    // The second session's very first step already knows what the first
    // session refuted — this is `memoryNarrowedHypotheses`, exercised
    // through the ordinary production seam every step of the chain uses,
    // never a special case written for this test — and it genuinely skips
    // those hypotheses rather than merely reporting that it could.
    expect(secondStep.outcome.priorInvestigation).not.toBeNull();
    expect(secondStep.outcome.priorInvestigation!.skippedHypothesisIds).toEqual(
      expect.arrayContaining([...firstStep.outcome.run.falsified]),
    );
    // Not merely reported as skippable — actually not spent on: no round in
    // the second session's own first step tests a hypothesis memory already
    // refuted. `executedInput` on `ResearchStep` is deliberately the chain's
    // OWN pre-narrowing input (see its doc), so the real narrowed input is
    // read off what the orchestrator actually ran, via the rounds it produced.
    const testedThisStep = new Set(
      secondStep.outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId)),
    );
    for (const skipped of firstStep.outcome.run.falsified) {
      expect(testedThisStep.has(skipped), `"${skipped}" should not have been re-tested`).toBe(false);
    }
  }, 300_000);
});
