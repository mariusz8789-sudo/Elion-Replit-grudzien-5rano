import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * THE WHOLE CHAIN, WITH NO HUMAN BETWEEN THE STEPS.
 *
 *   a question
 *     -> Genesis tests A, B, C, D
 *     -> all four refuted
 *     -> Genesis concludes the declared space is insufficient
 *     -> Genesis generates E, a value nobody proposed
 *     -> E is tested on evidence E did not author
 *     -> E survives, as an INTERVAL and not as an identification
 *     -> Genesis remembers all of it
 *     -> Genesis chooses the next experiment
 *     -> Genesis chooses the next RESEARCH QUESTION
 *     -> Genesis runs it, and the interval narrows
 *
 * Nothing in this test tells Genesis to do any step after the first. Each one
 * is chosen by `nextQuestion.ts` from what the previous run itself left open.
 *
 * Real seeded HP-lattice Metropolis solver throughout, at a true temperature of
 * 0.5 — a value nobody declared. The four declared candidates are 0.3, 0.7,
 * 1.2 and 2.0.
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

describe('the autonomous discovery chain, end to end', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs the whole loop, and every step after the first is Genesis\'s own decision', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');
    const { listParameterInquiriesForSystem } = await import('../core/scienceMemory');
    const { assessModelSufficiency } = await import('../core/agent/modelSufficiency');

    const input = proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE);
    const chain = runResearchChain(input, 4);

    // ---- A, B, C, D all refuted -------------------------------------------
    const step1 = chain.steps[0]!;
    expect(step1.kind).toBe('INITIAL');
    if (step1.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect([...step1.outcome.run.falsified].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);
    expect(step1.outcome.run.surviving).toEqual([]);

    // ---- the declared space is named insufficient --------------------------
    expect(assessModelSufficiency(step1.outcome.run).status).toBe('DECLARED_SPACE_INSUFFICIENT');

    // ---- E is generated, unprompted, and tested on fresh evidence ----------
    const generated = step1.outcome.generated!;
    if (generated.kind !== 'DERIVED_PARAMETER_VALUE') throw new Error('expected a derived value');
    expect(generated.derived.value).toBe(0.5);
    expect(generated.derived.hypothesisId).toBe('h:derived-temperature-0.5');
    expect(generated.run.rounds.length).toBeGreaterThan(0);
    // Never judged at the measurement that produced it.
    for (const round of generated.run.rounds) {
      expect(generated.derived.excludedProbeValues).not.toContain(
        Number(/=(-?\d+(?:\.\d+)?)$/.exec(round.what)![1]),
      );
    }

    // ---- E survives, reported as an interval and not as the answer ---------
    expect(generated.survived).toBe(true);
    expect(generated.standing.standing).toBe('SUPPORTED_INTERVAL_NOT_IDENTIFIED');
    expect(generated.standing.interval).toEqual([0.3, 0.7]);
    // The truth is inside that interval. That the point value happens to equal
    // it here is not what the run established — the interval is, and the very
    // next step is what tests whether the point can be pinned down at all.
    expect(TRUE_HIDDEN_TEMPERATURE).toBeGreaterThan(generated.standing.interval[0]);
    expect(TRUE_HIDDEN_TEMPERATURE).toBeLessThan(generated.standing.interval[1]);

    // ---- Genesis remembers it ---------------------------------------------
    expect(step1.remembered.length).toBe(2); // the inquiry, and its generated follow-up
    const remembered = listParameterInquiriesForSystem(input.system);
    const derivedRecord = remembered.find((r) =>
      r.input.hypotheses.some((h) => h.hypothesisId === 'h:derived-temperature-0.5'),
    );
    expect(derivedRecord, 'the derived hypothesis must reach memory').toBeDefined();

    // ---- Genesis chooses the next research question, and runs it -----------
    expect(chain.selfChosenSteps).toBeGreaterThanOrEqual(1);
    const step2 = chain.steps[1]!;
    expect(step2.kind).toBe('NARROW_A_DERIVED_INTERVAL');
    expect(step2.question).toContain('[0.3, 0.7]');
    if (step2.outcome.status !== 'RAN') throw new Error('expected RAN');

    // ---- and the interval really narrows ----------------------------------
    expect(step2.narrowing!.narrowed).toBe(true);
    expect(step2.narrowing!.priorInterval).toEqual([0.3, 0.7]);
    const [lo, hi] = step2.narrowing!.narrowedInterval;
    expect(hi - lo).toBeLessThan(0.7 - 0.3);
    // The truth is still inside the narrower interval — the refinement did not
    // throw the answer away.
    expect(TRUE_HIDDEN_TEMPERATURE).toBeGreaterThanOrEqual(lo);
    expect(TRUE_HIDDEN_TEMPERATURE).toBeLessThanOrEqual(hi);

    // ---- and that step is remembered too ----------------------------------
    expect(step2.remembered.length).toBeGreaterThanOrEqual(1);
    expect(listParameterInquiriesForSystem(input.system).length).toBeGreaterThan(remembered.length - 1);
  });

  it('no step reuses a setting an earlier step already measured at', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE), 4);
    const seen = new Set<string>();
    for (const step of chain.steps) {
      if (step.outcome.status !== 'RAN') continue;
      const runs =
        step.outcome.generated === null ? [step.outcome.run] : [step.outcome.run, step.outcome.generated.run];
      for (const run of runs) {
        for (const round of run.rounds) {
          expect(seen.has(round.what), `setting reused: ${round.what}`).toBe(false);
          seen.add(round.what);
        }
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('when the support turns out to be DISCONNECTED, it says so instead of reporting an interval', async () => {
    // At a true 0.55 the narrowing step refutes the derived 0.5 while both 0.4
    // and 0.6 survive. The supported set has a hole in the middle of it, so no
    // interval describes it — and the honest report is neither a narrower range
    // (there isn't one) nor "nothing was refuted" (0.5 was).
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(0.55), 4);
    const step2 = chain.steps[1]!;
    expect(step2.kind).toBe('NARROW_A_DERIVED_INTERVAL');

    const narrowing = step2.narrowing!;
    expect(narrowing.refutedValues).toContain(0.5);
    expect([...narrowing.survivingValues].sort()).toEqual([0.4, 0.6]);
    expect(narrowing.narrowed).toBe(false);
    expect(narrowing.narrowedInterval).toEqual([0.3, 0.7]);
    expect(narrowing.why).toContain('NOT an interval');
    expect(narrowing.why).toContain('disconnected');
  });

  it('the chain says what stopped it, in the vocabulary of questions rather than of rounds', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const chain = runResearchChain(proteinFoldingInquiry(TRUE_HIDDEN_TEMPERATURE), 4);
    expect(chain.stoppedBecause).toMatch(
      /settled its question|none of which Genesis can run|no actuator for|Step budget/,
    );
  });
});
