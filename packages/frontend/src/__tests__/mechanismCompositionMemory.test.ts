import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * MECHANISM GENERATION REACHES EVIDENCE -> MEMORY THROUGH THE REAL PRODUCTION
 * SEAM, not just through `discoveryOrchestrator.runDiscovery`.
 *
 * `discoveryOrchestrator.ts` already routes composed-mechanism generation into
 * a second `StrategyRun` (P0, `618df9e`). But grep confirmed `runDiscovery`
 * with `shape: 'MECHANISM'` has exactly ONE production call site outside
 * tests — `researchChain.ts`, which is PARAMETER-only. The real MECHANISM
 * entry point every screen actually calls is
 * `worldDiscoverySession.ts::runWorldDiscoveryAndRemember`
 * (`WorldDiscoveryPanel.tsx`, `GenesisWorldScreen.tsx`, `CellLabScreen.tsx`),
 * and it called `runAutonomousDiscoveryWithEngines` directly — bypassing
 * generation entirely, and never persisting a composed mechanism to memory at
 * all. A composed mechanism could be produced through the orchestrator's own
 * front door and never through the door anything in the product actually uses.
 *
 * `generateJointMechanismFrom` closes this WITHOUT re-running the base search:
 * it takes the `DiscoveryLoopResult` `runWorldDiscoveryAndRemember` already
 * computed for its Evidence Bundle and derives the joint arm from that, since
 * `runJointIntervention` builds its own fresh world regardless of which run
 * produced `first`.
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

describe('the real production seam persists a composed mechanism, not only the orchestrator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE DEFINING BEHAVIOUR: runWorldDiscoveryAndRemember banks the composition as its OWN memory record', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(
      'Maximise remaining fuel, at most 12 experiments.',
      GENESIS_GENERATOR_CATALOG.catalogId,
    );
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // The base search really did leave rival survivors — the state this
    // capability exists for.
    expect(state.result.bestSupported.map((b) => b.hypothesisId).sort()).toEqual([
      'h:fuel-efficiency',
      'h:load-shedding',
    ]);

    const composition = state.mechanismComposition;
    expect(composition).not.toBeNull();
    expect(composition!.derived.hypothesisId).toBe('h:fuel-efficiency+h:load-shedding');
    expect(composition!.assessment.interaction).toBe('SUB_ADDITIVE');

    // Two SEPARATE Science Memory records — the base investigation and the
    // composition — never merged into one, the same discipline
    // discoveryOrchestrator's StrategyRun/generated split already established.
    const experiments = listExperiments();
    const worldDiscoveryRecords = experiments.filter((e) => e.worldDiscovery !== undefined);
    const compositionRecords = experiments.filter((e) => e.mechanismComposition !== undefined);
    expect(worldDiscoveryRecords).toHaveLength(1);
    expect(compositionRecords).toHaveLength(1);
    expect(compositionRecords[0]!.mechanismComposition!.resultFingerprint).toBe(composition!.resultFingerprint);
  });

  it('the persisted composition REPLAYS by real re-execution of both arms', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments, replaySavedMechanismComposition } = await import('../core/scienceMemory');

    runWorldDiscoveryAndRemember('Maximise remaining fuel, at most 12 experiments.', GENESIS_GENERATOR_CATALOG.catalogId);
    const record = listExperiments().find((e) => e.mechanismComposition !== undefined)!;

    const replay = replaySavedMechanismComposition(record);
    expect(replay.status).toBe('MATCH');
  });

  it('tampering with the stored composition is caught as DRIFT before any re-execution', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments, replaySavedMechanismComposition } = await import('../core/scienceMemory');

    runWorldDiscoveryAndRemember('Maximise remaining fuel, at most 12 experiments.', GENESIS_GENERATOR_CATALOG.catalogId);
    const record = listExperiments().find((e) => e.mechanismComposition !== undefined)!;

    const tampered = {
      ...record,
      mechanismComposition: {
        ...record.mechanismComposition!,
        assessment: { ...record.mechanismComposition!.assessment, jointObserved: 999 },
      },
    };
    expect(replaySavedMechanismComposition(tampered).status).toBe('DRIFT');
  });

  it('no composition is persisted when the base search settles on one explanation', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');
    const { listExperiments } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember('Minimise peak flood depth, at most 8 experiments.', GENESIS_FLOOD_CATALOG.catalogId);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    expect(state.mechanismComposition).toBeNull();
    expect(listExperiments().some((e) => e.mechanismComposition !== undefined)).toBe(false);
  });
});
