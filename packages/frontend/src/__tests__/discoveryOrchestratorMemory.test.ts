import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InquiryLoopInput, ParameterHypothesis } from '../core/agent/inquiryLoop';

/**
 * MEMORY → SELECTION (P1) — Genesis reads a real prior investigation,
 * recognises which declared hypotheses it already refuted, and lets that
 * decide what THIS run still needs to find out, on the SAME persisted
 * Science Memory `worldDiscoverySession.ts`/`inquirySession.ts` already
 * narrow on.
 *
 * `window.localStorage` is faked (the existing `scienceMemory` idiom —
 * `inquirySession.test.ts`'s own comment explains why) and `vi.resetModules()`
 * stands in for a process restart between the seeding run and the checked
 * run, so the second call genuinely READS persisted memory rather than
 * holding a reference to the first one's in-process state.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const PUMP_GOAL = 'Minimise peak flood depth using the pump, at most 4 experiments.';
const FULL_FLOOD_GOAL = 'Minimise peak flood depth, at most 6 experiments.';

describe('discoveryOrchestrator — memory decides what still needs testing (MECHANISM)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no prior investigation: priorInvestigation is null, exactly as an honest "nothing to report" should be', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');

    const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
    expect(outcome.priorInvestigation).toBeNull();
  });

  it('THE DEFINING BEHAVIOUR: skips a hypothesis an earlier run already refuted, and tests only what is still open', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    // First "session", scoped to the pump alone, so only `h:pump-capacity`
    // ever gets a verdict — the legacy memory-aware seam
    // (`GenesisWorldScreen.tsx`'s own live-experiment-scene runs through this
    // exact function).
    const seed = await import('../core/agent/worldDiscoverySession');
    const seedCatalog = await import('../core/agent/worldGoalIntent');
    const seeded = seed.runWorldDiscoveryAndRemember(PUMP_GOAL, seedCatalog.GENESIS_FLOOD_CATALOG.catalogId);
    if (seeded.kind !== 'COMPLETE') throw new Error('expected the seeding run to complete');
    // The real falsification P3's regeneration produces, confirmed before
    // trusting the narrowing decision built on top of it.
    expect(seeded.result.beliefs.find((b) => b.hypothesisId === 'h:pump-capacity')!.status).toBe('REFUTED');

    // A process restart: fresh modules, same persisted storage. This time the
    // FULL catalog (pump + infiltration + outlet) so narrowing has something
    // real to leave open, not just the one hypothesis memory already settled.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');

    const outcome = runDiscovery({ shape: 'MECHANISM', goal: FULL_FLOOD_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    expect(outcome.priorInvestigation).not.toBeNull();
    expect(outcome.priorInvestigation!.skippedHypothesisIds).toEqual(['h:pump-capacity']);
    expect(outcome.priorInvestigation!.reason).toContain('already refuted');
    expect(outcome.priorInvestigation!.reason).toContain('tests only what is still open');

    // The narrowed hypothesis never appears in any round: memory decided WHAT
    // is asked before the strategy ran, not after.
    const tested = outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    expect(tested).not.toContain('h:pump-capacity');
    expect(tested.length).toBeGreaterThan(0);
  });

  it('THE FALLBACK: if every declared hypothesis is already refuted, runs the full set again rather than testing nothing', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    // Seeded and re-asked with the SAME pump-only scope: the one declared
    // hypothesis is the one already refuted, so nothing would be left to test.
    const seed = await import('../core/agent/worldDiscoverySession');
    const seedCatalog = await import('../core/agent/worldGoalIntent');
    const seeded = seed.runWorldDiscoveryAndRemember(PUMP_GOAL, seedCatalog.GENESIS_FLOOD_CATALOG.catalogId);
    if (seeded.kind !== 'COMPLETE') throw new Error('expected the seeding run to complete');

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');

    const outcome = runDiscovery({ shape: 'MECHANISM', goal: PUMP_GOAL, catalog: GENESIS_FLOOD_CATALOG });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    // Memory has something to say (a real prior run exists)...
    expect(outcome.priorInvestigation).not.toBeNull();
    // ...but skips NOTHING, because skipping the one declared hypothesis would
    // leave an empty set — a result that "tested nothing" is not a result.
    expect(outcome.priorInvestigation!.skippedHypothesisIds).toEqual([]);
    expect(outcome.priorInvestigation!.reason).toContain('running the full declared set again');
    expect(outcome.run.rounds[0]!.verdicts[0]!.hypothesisId).toBe('h:pump-capacity');
  });

  it('a DIFFERENT objective on the same world is not narrowed — the match is scoped to (catalog, metric, direction)', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const seed = await import('../core/agent/worldDiscoverySession');
    const seedCatalog = await import('../core/agent/worldGoalIntent');
    const seeded = seed.runWorldDiscoveryAndRemember(PUMP_GOAL, seedCatalog.GENESIS_FLOOD_CATALOG.catalogId);
    if (seeded.kind !== 'COMPLETE') throw new Error('expected the seeding run to complete');

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');

    // Same world, opposite direction — "worsen" was never refuted for the pump.
    const outcome = runDiscovery({
      shape: 'MECHANISM', goal: 'Maximise peak flood depth using the pump, at most 4 experiments.', catalog: GENESIS_FLOOD_CATALOG,
    });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
    expect(outcome.priorInvestigation).toBeNull();
    expect(outcome.run.rounds[0]!.verdicts[0]!.hypothesisId).toBe('h:pump-capacity');
  });
});

describe('discoveryOrchestrator — memory decides what still needs testing (PARAMETER)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Same fixture shape `inquirySession.test.ts` already proves: four points on the Arrhenius compensation line. */
  const ON_COMPENSATION_LINE = [
    { id: 'h:A-Ea60', ea: 60, logA: 11.0 },
    { id: 'h:C-Ea62', ea: 62, logA: 11.2985 },
    { id: 'h:B-Ea66', ea: 66, logA: 11.8956 },
    { id: 'h:D-Ea70', ea: 70, logA: 12.4926 },
  ] as const;
  const HYPOTHESES: readonly ParameterHypothesis[] = ON_COMPENSATION_LINE.map((h) => ({
    hypothesisId: h.id,
    statement: `Activation energy ${h.ea} kJ/mol with log10 A = ${h.logA}`,
    claimedValues: { activationEnergyKJ: h.ea, preExponentialLog10: h.logA },
    priorConfidence: 0.5,
  }));

  function inputFor(ea: number, logA: number): InquiryLoopInput {
    return {
      question: 'Which activation energy / pre-exponential pair does this sample actually have?',
      system: {
        systemId: `sample-Ea${ea}`,
        label: `Unmeasured kinetic sample (Ea = ${ea} kJ/mol)`,
        modelId: 'chemistry-arrhenius',
        hiddenParameters: { activationEnergyKJ: ea, preExponentialLog10: logA },
        probeParameterId: 'temperatureK',
        candidateProbeValues: [350, 400, 450, 500, 600, 800],
        fixedParameters: {},
        observedMetric: 'rateConstant',
        agreementTolerance: 0.25,
      },
      hypotheses: HYPOTHESES,
      openingProbeValue: 400,
      maxRounds: 4,
    };
  }

  it('THE DEFINING BEHAVIOUR: skips hypotheses an earlier inquiry into the SAME system already falsified', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const seed = await import('../core/agent/inquirySession');
    const seeded = seed.runInquiryAndRemember(inputFor(60, 11.0));
    const alreadyFalsified = seeded.result.falsifiedHypothesisIds;
    expect(alreadyFalsified.length).toBeGreaterThan(0);
    // The true hypothesis (A, Ea=60) is never among the falsified — a
    // survivor is re-tested, never banked. Confirmed on the real result
    // before trusting the narrowing decision built on it.
    expect(alreadyFalsified).not.toContain('h:A-Ea60');

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');

    const outcome = runDiscovery({ shape: 'PARAMETER', input: inputFor(60, 11.0) });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);

    expect(outcome.priorInvestigation).not.toBeNull();
    expect(outcome.priorInvestigation!.skippedHypothesisIds).toEqual(alreadyFalsified);

    // The narrowed hypotheses never get measured this round — the SAME
    // narrowing `inquirySession.ts`'s own test proves, now also true for this
    // front door. The survivor DOES still appear, re-tested rather than banked.
    const tested = outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    for (const id of alreadyFalsified) expect(tested).not.toContain(id);
    expect(tested).toContain('h:A-Ea60');
  });

  it('a DIFFERENT system (different sample) is not narrowed — the match is scoped to the real system key', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const seed = await import('../core/agent/inquirySession');
    seed.runInquiryAndRemember(inputFor(60, 11.0));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const { runDiscovery } = await import('../core/agent/discoveryOrchestrator');

    // Different `systemId` — a genuinely different system, per `parameterInquirySystemKey`.
    const differentSystem = inputFor(60, 11.0);
    const outcome = runDiscovery({
      shape: 'PARAMETER',
      input: { ...differentSystem, system: { ...differentSystem.system, systemId: 'a-genuinely-different-sample' } },
    });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN, got REFUSED: ${outcome.admission.why}`);
    expect(outcome.priorInvestigation).toBeNull();
    const tested = outcome.run.rounds.flatMap((r) => r.verdicts.map((v) => v.hypothesisId));
    expect(tested).toContain('h:C-Ea62'); // nothing was narrowed away
  });
});
