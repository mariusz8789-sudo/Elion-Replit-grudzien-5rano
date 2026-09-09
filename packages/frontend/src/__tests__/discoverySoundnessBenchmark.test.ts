import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BENCHMARK: never rule out the truth.
 *
 * Every other test here fixes one hidden value and checks what Genesis says
 * about it. That is not enough, and this codebase has already been bitten by it:
 * a claim can be true at one hidden value and false at another, and a fixture
 * built around a single truth cannot see the difference (`§10.11` of
 * `AUTONOMOUS_DISCOVERY_ROADMAP.md` records exactly that failure, and `§10.12`
 * records the leak it was hiding).
 *
 * So this sweeps the hidden temperature across the runner's whole validated
 * range and asserts PROPERTIES rather than remembered numbers. The true value
 * is used only as an ORACLE — to check that Genesis never contradicts it — and
 * never as an expected answer Genesis is scored against. Nothing here tells
 * Genesis what the answer is, and nothing asserts that it found one.
 *
 * The properties are the ones that would matter for any discovery engine:
 *
 *   SOUNDNESS      never refute a true hypothesis, and never report an interval
 *                  that excludes the truth. A false refutation is the worst
 *                  error available to this system: it removes the right answer
 *                  from contention permanently, and memory then carries the
 *                  mistake into every later investigation.
 *   NO OVERCLAIM   a surviving derived value is never reported as identified.
 *   NO FABRICATION where the evidence does not bracket, refuse rather than
 *                  extrapolate.
 *
 * Real seeded HP-lattice Metropolis solver throughout. Declared candidates are
 * 0.3, 0.7, 1.2 and 2.0; every other value swept is one nobody proposed.
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

const DECLARED: Readonly<Record<string, number>> = {
  'h:cold': 0.3,
  'h:cool': 0.7,
  'h:warm': 1.2,
  'h:hot': 2.0,
};

/** Spans the declared range and both sides of every declared candidate. */
const SWEPT_TRUTHS = [0.25, 0.3, 0.4, 0.5, 0.55, 0.65, 0.7, 0.9, 1.2, 1.5, 2.0] as const;

describe('discovery soundness, swept across hidden values', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('NEVER refutes a true declared hypothesis, at any swept value', async () => {
    const failures: string[] = [];
    for (const truth of SWEPT_TRUTHS) {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      vi.resetModules();
      const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
      const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

      const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(truth) });
      if (outcome.status !== 'RAN') throw new Error(`expected RAN at T=${truth}`);

      for (const id of outcome.run.falsified) {
        if (DECLARED[id] === truth) failures.push(`T=${truth}: refuted the true hypothesis ${id}`);
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it('NEVER reports an interval that excludes the truth — derived or narrowed', async () => {
    const failures: string[] = [];
    let intervalsSeen = 0;
    let narrowingsSeen = 0;

    for (const truth of SWEPT_TRUTHS) {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      vi.resetModules();
      const { runResearchChain } = await import('../core/agent/researchChain');
      const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

      const chain = runResearchChain(proteinFoldingInquiry(truth), 4);
      for (const step of chain.steps) {
        if (step.outcome.status !== 'RAN') continue;

        const generated = step.outcome.generated;
        if (
          generated !== null &&
          generated.kind === 'DERIVED_PARAMETER_VALUE' &&
          generated.standing.standing !== 'REFUTED'
        ) {
          intervalsSeen++;
          const [lo, hi] = generated.standing.interval;
          if (!(truth > lo && truth < hi)) {
            failures.push(`T=${truth}: derived interval [${lo}, ${hi}] excludes the truth`);
          }
        }

        // Only a BRACKETED_PREDICTIONS range is a localisation. A
        // SURVIVOR_NEIGHBOURS range is a search region and is measured to be
        // able to exclude the truth — pinned in its own test below rather than
        // asserted away here.
        if (
          step.narrowing !== null &&
          step.narrowing.narrowed &&
          step.narrowing.basis === 'BRACKETED_PREDICTIONS'
        ) {
          narrowingsSeen++;
          const [lo, hi] = step.narrowing.narrowedInterval;
          if (!(truth >= lo && truth <= hi)) {
            failures.push(`T=${truth}: narrowed interval [${lo}, ${hi}] excludes the truth`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
    // The sweep has to actually exercise the machinery, or it proves nothing.
    expect(intervalsSeen).toBeGreaterThan(0);
    expect(narrowingsSeen).toBeGreaterThan(0);
  }, 300_000);

  it('NEVER reports a surviving derived value as identified', async () => {
    for (const truth of SWEPT_TRUTHS) {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      vi.resetModules();
      const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
      const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

      const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(truth) });
      if (outcome.status !== 'RAN') throw new Error('expected RAN');
      const generated = outcome.generated;
      if (generated === null || generated.kind !== 'DERIVED_PARAMETER_VALUE' || !generated.survived) continue;

      // A survivor is an interval claim, never a point one — whatever the truth is.
      expect(generated.standing.standing, `T=${truth}`).toBe('SUPPORTED_INTERVAL_NOT_IDENTIFIED');
      expect(generated.standing.why).toContain('not the same as being identified');
    }
  }, 300_000);

  it('refuses to extrapolate below the declared range rather than inventing a value there', async () => {
    // A fold at 0.25 sits below every declared candidate, so every prediction
    // lands on one side of the observation and nothing brackets it. Refusing is
    // the honest move; a midpoint here would be extrapolation dressed up as
    // derivation.
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { proteinFoldingInquiry } = await import('../core/agent/proteinFoldingInquiry');

    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.25) });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(outcome.run.surviving).toEqual([]);
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).not.toBeNull();
  }, 120_000);
});

/**
 * THE COUNTEREXAMPLE THAT FORCED `IntervalBasis`, pinned so it cannot be
 * quietly re-read as a localisation.
 *
 * Bounding a survivor by its refuted neighbours LOOKS like the bracketing that
 * produced the first interval and is a different, weaker inference: refuting a
 * value says the system does not have THAT value, never which side of it the
 * answer lies on. On the real solver the difference is not academic.
 */
describe('a SURVIVOR_NEIGHBOURS range is a search region, and can exclude the truth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('measured: at a true 0.45 the range excludes the truth, and is labelled so it cannot be misread', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { runResearchChain } = await import('../core/agent/researchChain');
    const { proteinFoldingSystem, PROTEIN_FOLDING_HYPOTHESES } = await import(
      '../core/agent/proteinFoldingInquiry'
    );

    // Nine observation lengths, all inside the HP runner's validated [1, 50000].
    // More lengths is a real experimental choice, and it is what exposes the
    // saturation that breaks the inference.
    const base = proteinFoldingSystem(0.45);
    const chain = runResearchChain(
      {
        question: 'What temperature did this HP-lattice protein fold actually run at?',
        system: { ...base, candidateProbeValues: [200, 500, 1000, 2000, 5000, 10000, 20000, 35000, 50000] },
        hypotheses: PROTEIN_FOLDING_HYPOTHESES,
        openingProbeValue: 200,
        maxRounds: 4,
      },
      8,
    );

    const narrowing = chain.steps.find((s) => s.narrowing !== null)?.narrowing;
    expect(narrowing, 'expected a narrowing step').toBeDefined();
    expect(narrowing!.basis).toBe('SURVIVOR_NEIGHBOURS');
    expect(narrowing!.narrowed).toBe(true);

    // 0.5 refuted while 0.7 and 0.95 both survive: the instrument saturates at
    // long runs, so distant claims agree with each other while a nearer one
    // does not.
    expect(narrowing!.refutedValues).toContain(0.5);
    const [lo, hi] = narrowing!.narrowedInterval;
    expect(0.45 >= lo && 0.45 <= hi, `range [${lo}, ${hi}] unexpectedly contains the truth`).toBe(false);
  }, 300_000);
});
