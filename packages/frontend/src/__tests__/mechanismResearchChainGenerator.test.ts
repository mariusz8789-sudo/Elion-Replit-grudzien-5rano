import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * THE KILLER CASE, on the generator domain: the SAME full chain
 * `e2eAutonomousResearchChain.test.ts` already proves on
 * `proteinFoldingInquiry` (PARAMETER), now proven on `GENESIS_GENERATOR_CATALOG`
 * (MECHANISM) through `runMechanismResearchChain` —
 *
 *   a person's QUESTION -> Genesis proposes hypotheses (the catalog's four
 *   declared levers) -> real experiment (a forked WorldGraph arm per lever)
 *   -> Evidence -> falsification/support -> Science Memory -> Genesis's OWN
 *   generation step (a mechanism nobody declared: the composed joint arm)
 *   -> a real closure (the joint arm measured, not assumed) -> the chain
 *   stops honestly SETTLED, never because it ran out of step budget -> a
 *   SECOND, later session (a real module reset, same persisted storage)
 *   reads what the first banked and skips re-testing it.
 *
 * "Generated hypothesis -> real closure -> validated discovery": the composed
 * mechanism (`h:fuel-efficiency+h:load-shedding`) is exactly that generated
 * hypothesis, `SUB_ADDITIVE` is the real closure a genuine forked arm
 * measured (not asserted), and the two Science Memory records this test
 * checks — one for the base investigation, one for the composition — plus a
 * real re-execution replay are what makes it a VALIDATED discovery rather
 * than a one-off print statement.
 *
 * No new loop and no new replay mechanism: `runMechanismResearchChain` reads
 * `discoveryOrchestrator.ts::runMechanismDiscoveryAndRemember` (admission ->
 * plan -> memory-narrow -> run -> composed-mechanism generation -> save ->
 * replay, already real) and `nextQuestion.ts` (already real) — the actuator
 * work is entirely in how the chain reads and terminates on what those two
 * already report.
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

const GOAL = 'Maximise remaining fuel, at most 12 experiments.';

describe('THE KILLER CASE: one continuous MECHANISM research chain on the generator domain, with memory carried into a second session', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bare start -> falsify/support -> generated composition -> real closure -> honestly SETTLED, with Memory banked for both findings', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments, replaySavedWorldDiscoveryRun, replaySavedMechanismComposition } = await import(
      '../core/scienceMemory'
    );

    const chain = runMechanismResearchChain({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG }, 4);

    // Step 1 is the person's own question. The chain reached a real,
    // honest stop, not a budget cap: maxSteps was 4, and it used 1.
    expect(chain.steps[0]!.kind).toBe('INITIAL');
    expect(chain.steps.length).toBeLessThan(4);
    expect(chain.terminalStatus).toBe('SETTLED');
    expect(chain.stoppedBecause).toContain('settled');

    const step = chain.steps[0]!;
    if (step.outcome.status !== 'RAN') throw new Error('expected RAN');

    // Real hypotheses, really tested: two declared levers survive, two are
    // genuinely refuted (structurally inert in this model, not a fabricated
    // result — see `electricalGeneratorLeverCatalog.ts`'s own module doc).
    expect([...step.outcome.run.surviving].sort()).toEqual(['h:fuel-efficiency', 'h:load-shedding']);
    expect([...step.outcome.run.falsified].sort()).toEqual(['h:generator-rating', 'h:larger-tank']);

    // THE GENERATED HYPOTHESIS: two independently-survived mechanisms are
    // not rivals, so Genesis composed them into a joint arm nobody declared.
    expect(step.outcome.generated?.kind).toBe('COMPOSED_MECHANISM');
    if (step.outcome.generated?.kind !== 'COMPOSED_MECHANISM') throw new Error('expected COMPOSED_MECHANISM');
    expect(step.outcome.generated.derived.hypothesisId).toBe('h:fuel-efficiency+h:load-shedding');

    // THE REAL CLOSURE: a genuine forked arm measured the interaction —
    // SUB_ADDITIVE, not assumed additive and not left untested.
    expect(step.outcome.generated.assessment.interaction).toBe('SUB_ADDITIVE');

    // No further question is raised for it: the closure genuinely settled
    // the question `TEST_WHETHER_MECHANISMS_COMPOSE` would otherwise ask.
    expect(chain.stoppedBecause).not.toContain('compose');

    // THE VALIDATED DISCOVERY: two separate, real, replayable Science Memory
    // records — the base investigation and the composition, neither
    // subsuming the other, the same discipline `mechanismCompositionMemory.test.ts`
    // already established for the legacy front door.
    expect(step.remembered.savedExperimentId).not.toBeNull();
    expect(step.remembered.replay?.status).toBe('MATCH');
    expect(step.remembered.mechanismComposition).not.toBeNull();

    const experiments = listExperiments();
    const worldDiscoveryRecords = experiments.filter((e) => e.worldDiscovery !== undefined);
    const compositionRecords = experiments.filter((e) => e.mechanismComposition !== undefined);
    expect(worldDiscoveryRecords).toHaveLength(1);
    expect(compositionRecords).toHaveLength(1);
    expect(compositionRecords[0]!.mechanismComposition!.resultFingerprint).toBe(
      step.remembered.mechanismComposition!.resultFingerprint,
    );

    // Both records independently replay by REAL re-execution, never a cached claim.
    expect(replaySavedWorldDiscoveryRun(worldDiscoveryRecords[0]!).status).toBe('MATCH');
    expect(replaySavedMechanismComposition(compositionRecords[0]!).status).toBe('MATCH');
  });

  it('a SECOND, later session reads that banked memory and skips re-testing what it already refuted', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');

    const firstChain = first.runMechanismResearchChain(
      { shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG },
      4,
    );
    const firstStep = firstChain.steps[0]!;
    if (firstStep.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(firstStep.outcome.run.falsified.length).toBeGreaterThan(0);

    // A REAL restart: fresh modules, the SAME persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/researchChain');

    const secondChain = second.runMechanismResearchChain(
      { shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG },
      4,
    );
    const secondStep = secondChain.steps[0]!;
    if (secondStep.outcome.status !== 'RAN') throw new Error('expected RAN');

    // The second session's very first step already knows what the first
    // session refuted — `priorRefutedHypothesisIds`, exercised through the
    // ordinary production seam every MECHANISM step already uses.
    expect(secondStep.outcome.priorInvestigation).not.toBeNull();
    expect(secondStep.outcome.priorInvestigation!.skippedHypothesisIds).toEqual(
      expect.arrayContaining([...firstStep.outcome.run.falsified]),
    );

    // Still settles honestly, and still finds and closes the same composition.
    expect(secondChain.terminalStatus).toBe('SETTLED');
    expect(secondStep.outcome.generated?.kind).toBe('COMPOSED_MECHANISM');
  });

  it('BLOCKED: no capability behind the question at all, on step 1', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');

    // The same real refusal `discoveryOrchestrator.test.ts` measures directly
    // (a volcano question against a flood city's levers) — genuinely no
    // capability, not a fact this evidence could ever settle.
    const chain = runMechanismResearchChain(
      { shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG },
      4,
    );
    expect(chain.terminalStatus).toBe('BLOCKED');
    expect(chain.stoppedBecause).toContain('refused');
    expect(chain.steps).toHaveLength(1);
  });
});
