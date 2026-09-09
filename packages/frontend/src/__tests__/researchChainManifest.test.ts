import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * THE CHAIN ITSELF, BANKED: `mechanismResearchChainGenerator.test.ts` already
 * proves the killer case's SCIENCE (falsify -> generate -> real closure ->
 * SETTLED). This file proves the one thing that science alone does not
 * carry once saved: that Genesis's own step sequence — which step, why it
 * was chosen, and how it terminated — survives as its own Science Memory
 * record (`SavedResearchChainManifest`), not just as each step's individual
 * `worldDiscovery`/`mechanismComposition` record with no link between them.
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

describe('Research chain manifest — banking the chain itself, not just its steps', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a SETTLED MECHANISM chain banks exactly one researchChain manifest, MATCH on replay', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments, replaySavedResearchChainManifest } = await import('../core/scienceMemory');

    const chain = runMechanismResearchChain({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG }, 4);
    expect(chain.terminalStatus).toBe('SETTLED');

    const experiments = listExperiments();
    const manifestRecords = experiments.filter((e) => e.researchChain !== undefined);
    expect(manifestRecords).toHaveLength(1);

    const manifest = manifestRecords[0]!.researchChain!;
    expect(manifest.chainShape).toBe('MECHANISM');
    expect(manifest.initialQuestion).toBe(GOAL);
    expect(manifest.terminalStatus).toBe('SETTLED');
    expect(manifest.steps).toHaveLength(1);
    expect(manifest.steps[0]!.ranSuccessfully).toBe(true);
    expect(manifest.steps[0]!.savedExperimentIds.length).toBeGreaterThan(0);

    // The step's own savedExperimentIds point at a record still resolvable
    // right now, and that record's own replay still matches — a real
    // re-execution, not a cached claim about the manifest alone.
    const replay = replaySavedResearchChainManifest(manifestRecords[0]!);
    expect(replay.status).toBe('MATCH');
  });

  it('a chain that never ran a step successfully (BLOCKED on step 1) banks no manifest', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_FLOOD_CATALOG } = await import('../core/agent/worldGoalIntent');
    const { listExperiments } = await import('../core/scienceMemory');

    const chain = runMechanismResearchChain(
      { shape: 'MECHANISM', goal: 'Will the volcano erupt tomorrow?', catalog: GENESIS_FLOOD_CATALOG },
      4,
    );
    expect(chain.terminalStatus).toBe('BLOCKED');

    const manifestRecords = listExperiments().filter((e) => e.researchChain !== undefined);
    expect(manifestRecords).toHaveLength(0);
  });

  it('replaySavedResearchChainManifest reports DRIFT when the manifest is tampered after save', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments, replaySavedResearchChainManifest } = await import('../core/scienceMemory');

    runMechanismResearchChain({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG }, 4);
    const saved = listExperiments().find((e) => e.researchChain !== undefined)!;

    const tampered = { ...saved, researchChain: { ...saved.researchChain!, terminalStatus: 'BLOCKED' as const } };
    const replay = replaySavedResearchChainManifest(tampered);
    expect(replay.status).toBe('DRIFT');
  });

  it('surfaces in Evidence Showcase as a RESEARCH_CHAIN case study, ranked above every other kind', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');
    const { listCaseStudyCandidates, buildCaseStudy, replayCaseStudy } = await import(
      '../components/visual-simulation/evidenceShowcase'
    );

    runMechanismResearchChain({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG }, 4);
    const manifestRecord = listExperiments().find((e) => e.researchChain !== undefined)!;

    const candidates = listCaseStudyCandidates();
    // The chain manifest, plus its own step's worldDiscovery record and the
    // generated composition's own record, are all independently real
    // Science Memory records — this only asserts the chain is the default.
    expect(candidates[0]!.id).toBe(manifestRecord.id);

    const caseStudy = buildCaseStudy(manifestRecord);
    expect(caseStudy?.kind).toBe('RESEARCH_CHAIN');
    expect(caseStudy?.steps.length).toBeGreaterThanOrEqual(2); // at least step 1 + verdict
    expect(caseStudy?.steps[caseStudy.steps.length - 1]!.label).toBe('Verdict');

    const replay = replayCaseStudy(manifestRecord);
    expect(replay.status).toBe('MATCH');
    expect(replay.computedLive).toBe(true);
  });

  it('a non-chain record replays as BLOCKED, not thrown', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment, replaySavedResearchChainManifest } = await import('../core/scienceMemory');

    const saved = saveExperiment({
      labId: 'test', experimentId: 'no-chain', experimentName: 'no chain',
      params: {}, honesty: 'simplified', honestyNote: 'test', assumptions: [],
    });
    const replay = replaySavedResearchChainManifest(saved);
    expect(replay.status).toBe('BLOCKED');
  });
});
