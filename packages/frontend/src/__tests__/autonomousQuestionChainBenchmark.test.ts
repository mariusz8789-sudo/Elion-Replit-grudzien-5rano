import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InquiryLoopInput } from '../core/agent/inquiryLoop';

/**
 * THE BENCHMARK: three successive research questions, with a human present only
 * for the first.
 *
 *   Q1 (the caller's)  →  experiment  →  evidence  →  falsification/support
 *     →  Q2 chosen by Genesis  →  experiment  →  evidence
 *     →  Q3 chosen by Genesis  →  experiment  →  evidence
 *
 * NOTHING BELOW NAMES A STEP AFTER THE FIRST. The test asserts what the chain
 * produced and how each step was justified; it never tells the chain which
 * question to ask, and if `nextQuestion.ts`'s cascade changed, these assertions
 * would fail rather than quietly keep passing.
 *
 * Real seeded HP-lattice Metropolis solver throughout, at a true temperature of
 * 0.8 — a value nobody declared. Nine observation lengths are declared, all
 * inside the runner's validated `steps` range [1, 50000]; more lengths is a
 * real experimental choice, and it is what leaves Genesis enough untried
 * settings to keep going without ever reusing one.
 *
 * ## The measured ceiling, stated rather than hidden
 *
 * Two self-chosen steps is the MAXIMUM this substrate reaches. Swept across 64
 * combinations of hidden temperature (0.35 to 1.90) and two declared probe
 * sets, no chain reached three. The reasons are real and are reported by the
 * chain itself, not worked around here:
 *
 *   - a narrowing that leaves survivors with no refuted value on one side gives
 *     no bounded region, so there is no next narrowing to design;
 *   - `SEPARATE_SURVIVORS` runs only while the loop's own selector still names
 *     an untried discriminating setting;
 *   - the instrument saturates at long runs, so distant claims stop being
 *     separable at all.
 *
 * Reporting the ceiling is the point. A benchmark tuned until it produced a
 * longer chain would be measuring the tuning.
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

async function benchmarkChain() {
  vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  vi.resetModules();
  const { runResearchChain } = await import('../core/agent/researchChain');
  const { proteinFoldingSystem, PROTEIN_FOLDING_HYPOTHESES } = await import(
    '../core/agent/proteinFoldingInquiry'
  );
  const base = proteinFoldingSystem(TRUE_HIDDEN_TEMPERATURE);
  const input: InquiryLoopInput = {
    question: 'What temperature did this HP-lattice protein fold actually run at?',
    system: { ...base, candidateProbeValues: DECLARED_PROBES },
    hypotheses: PROTEIN_FOLDING_HYPOTHESES,
    openingProbeValue: DECLARED_PROBES[0]!,
    maxRounds: 4,
  };
  return { input, chain: runResearchChain(input, 10) };
}

describe('autonomous question chain — three questions, one of them asked by a person', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE BENCHMARK: three successive questions, two of them chosen by Genesis', async () => {
    const { chain } = await benchmarkChain();

    expect(chain.steps).toHaveLength(3);
    expect(chain.selfChosenSteps).toBe(2);

    // Only the first question came from outside.
    expect(chain.steps[0]!.kind).toBe('INITIAL');
    for (const step of chain.steps.slice(1)) {
      expect(step.kind, `step ${step.step} should have been chosen by the selector`).not.toBe('INITIAL');
      // Each self-chosen step carries the ranking that chose it, decided BEFORE
      // it ran — not a description written afterwards.
      expect(step.why.length).toBeGreaterThan(0);
    }

    // Every step really investigated something.
    for (const step of chain.steps) {
      if (step.outcome.status !== 'RAN') throw new Error(`step ${step.step} did not run`);
      expect(step.outcome.run.rounds.length).toBeGreaterThan(0);
    }
  }, 300_000);

  it('each self-chosen question is grounded in what the PREVIOUS step actually established', async () => {
    const { chain } = await benchmarkChain();
    const { selectNextResearchQuestion } = await import('../core/agent/nextQuestion');

    for (let i = 1; i < chain.steps.length; i++) {
      const previous = chain.steps[i - 1]!;
      if (previous.outcome.status !== 'RAN') throw new Error('expected RAN');

      // Re-run the selector on the previous step's own outcome and check it
      // names the kind the chain actually went on to run. This is what makes
      // "Genesis chose it" checkable rather than asserted.
      const selection = selectNextResearchQuestion(previous.outcome, previous.executedInput);
      expect(selection.nextExecutable?.kind, `step ${i + 1} was not what the selector named`).toBe(
        chain.steps[i]!.kind,
      );
      expect(selection.nextExecutable!.groundedIn.length).toBeGreaterThan(0);
    }
  }, 300_000);

  it('the chain refines a real region, and never reuses a setting to do it', async () => {
    const { chain } = await benchmarkChain();

    const narrowings = chain.steps.map((s) => s.narrowing).filter((n) => n !== null);
    expect(narrowings.length).toBe(2);

    // Each narrowing strictly shrinks the previous region.
    for (const narrowing of narrowings) {
      expect(narrowing!.narrowed).toBe(true);
      const [priorLo, priorHi] = narrowing!.priorInterval;
      const [lo, hi] = narrowing!.narrowedInterval;
      expect(hi - lo).toBeLessThan(priorHi - priorLo);
      // A survivor-neighbour region is a search region, and the chain labels it
      // as one rather than as a localisation.
      expect(narrowing!.basis).toBe('SURVIVOR_NEIGHBOURS');
    }

    // The truth is inside the final region here. Asserted as an observation
    // about this run, NOT as a property of survivor-neighbour regions in
    // general — `discoverySoundnessBenchmark.test.ts` pins a measured case
    // where such a region excludes the truth.
    const last = narrowings[narrowings.length - 1]!;
    expect(TRUE_HIDDEN_TEMPERATURE).toBeGreaterThanOrEqual(last.narrowedInterval[0]);
    expect(TRUE_HIDDEN_TEMPERATURE).toBeLessThanOrEqual(last.narrowedInterval[1]);

    // Anti-HARKing across the whole chain.
    const seen = new Set<string>();
    for (const step of chain.steps) {
      if (step.outcome.status !== 'RAN') continue;
      for (const round of step.outcome.run.rounds) {
        expect(seen.has(round.what), `setting reused: ${round.what}`).toBe(false);
        seen.add(round.what);
      }
    }
  }, 300_000);

  it('every step is remembered, so the chain accumulates rather than repeats', async () => {
    const { input, chain } = await benchmarkChain();
    const { listParameterInquiriesForSystem } = await import('../core/scienceMemory');

    for (const step of chain.steps) {
      expect(step.remembered.length, `step ${step.step} banked nothing`).toBeGreaterThanOrEqual(1);
    }
    expect(listParameterInquiriesForSystem(input.system).length).toBeGreaterThanOrEqual(chain.steps.length);
  }, 300_000);

  it('stops with a real reason, and reports the ceiling rather than spinning', async () => {
    const { chain } = await benchmarkChain();
    expect(chain.stoppedBecause).toContain('settled its question and raised no new one');
  }, 300_000);
});
