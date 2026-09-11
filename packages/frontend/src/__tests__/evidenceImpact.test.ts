import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * EVIDENCE IMPACT SCORING — proves `computeEvidenceImpact` (`evidenceImpact.ts`)
 * against REAL, saved multi-cycle chains, never fixtures: a Research Campaign
 * (`researchCampaign.ts`) chained 3 real cycles deep, each saved through the
 * existing `saveScientificDiscoveryLoopToMemory` with real
 * `campaignProvenance`, and a real banked `SavedResearchChainManifest`
 * (`researchChain.ts`) for the "dependent campaign" case.
 */

function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

describe('computeEvidenceImpact — real multi-cycle Research Campaign chain', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('evidence from Cycle #1, used to justify Cycle #2 and Cycle #3 → impact score = 2 (one direct, one transitive)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { startResearchCampaign, continueResearchCampaign, isNoJustifiedNextQuestion } = await import('../core/experimentFabric/researchCampaign');
    const { saveScientificDiscoveryLoopToMemory, listExperiments } = await import('../core/scienceMemory');
    const { computeEvidenceImpact } = await import('../core/agent/evidenceImpact');

    const cycle1 = await startResearchCampaign('problem:intervention-timing');
    expect(cycle1.result.nextExperiment.status).toBe('READY_TO_RUN');
    const saved1 = saveScientificDiscoveryLoopToMemory(cycle1.result);

    const step2 = await continueResearchCampaign(cycle1);
    if (isNoJustifiedNextQuestion(step2)) throw new Error('Cycle #2 unexpectedly had no justified next question.');
    const saved2 = saveScientificDiscoveryLoopToMemory(step2.result, {
      previousCycleId: saved1.id,
      resolvedFrom: cycle1.result.nextExperiment.resolves,
      previousCycleFingerprint: saved1.discoveryLoop!.discoveryLoopFingerprint,
    });

    const step3 = await continueResearchCampaign(step2);
    if (isNoJustifiedNextQuestion(step3)) throw new Error('Cycle #3 unexpectedly had no justified next question.');
    const saved3 = saveScientificDiscoveryLoopToMemory(step3.result, {
      previousCycleId: saved2.id,
      resolvedFrom: step2.result.nextExperiment.resolves,
      previousCycleFingerprint: saved2.discoveryLoop!.discoveryLoopFingerprint,
    });

    // Persisted campaignProvenance really carries the SAVED record ids, not the
    // in-memory cycleId researchCampaign.ts uses internally.
    expect(saved2.discoveryLoop!.campaignProvenance!.previousCycleId).toBe(saved1.id);
    expect(saved3.discoveryLoop!.campaignProvenance!.previousCycleId).toBe(saved2.id);

    const report = computeEvidenceImpact(saved1.id, listExperiments());
    expect(report.impactScore).toBe(2);
    expect(report.dependentExperiments.map((d) => d.id).sort()).toEqual([saved2.id, saved3.id].sort());

    const dependent2 = report.dependentExperiments.find((d) => d.id === saved2.id)!;
    const dependent3 = report.dependentExperiments.find((d) => d.id === saved3.id)!;
    expect(dependent2.transitive).toBe(false); // directly references saved1
    expect(dependent2.via).toContain('discoveryLoop.campaignProvenance.previousCycleId');
    expect(dependent3.transitive).toBe(true); // only reaches saved1 THROUGH saved2

    // A record with real downstream provenance still reports its own status
    // exactly as already recorded — never a re-derived or re-executed verdict.
    for (const dependent of [dependent2, dependent3]) {
      const record = listExperiments().find((e) => e.id === dependent.id)!;
      const recordedStatuses = record.discoveryLoop!.evidenceChain.map((link) => link.status);
      const flaggedEntry = report.downstreamFalsifiedOrInconclusive.find((d) => d.id === dependent.id);
      const hasConcerningStatus = recordedStatuses.some((status) => status === 'FALSIFIED' || status === 'INCONCLUSIVE' || status === 'BLOCKED');
      expect(Boolean(flaggedEntry)).toBe(hasConcerningStatus);
    }
  });

  it('a record with no dependents reports zero impact honestly, not an error', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { startResearchCampaign } = await import('../core/experimentFabric/researchCampaign');
    const { saveScientificDiscoveryLoopToMemory, listExperiments } = await import('../core/scienceMemory');
    const { computeEvidenceImpact } = await import('../core/agent/evidenceImpact');

    const cycle1 = await startResearchCampaign('problem:intervention-timing');
    const saved1 = saveScientificDiscoveryLoopToMemory(cycle1.result);

    const report = computeEvidenceImpact(saved1.id, listExperiments());
    expect(report.impactScore).toBe(0);
    expect(report.dependentExperiments).toEqual([]);
    expect(report.dependentCampaigns).toEqual([]);
    expect(report.downstreamFalsifiedOrInconclusive).toEqual([]);
  });

  it('an unknown targetId (never saved, never referenced) also reports zero impact rather than throwing', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { listExperiments } = await import('../core/scienceMemory');
    const { computeEvidenceImpact } = await import('../core/agent/evidenceImpact');

    const report = computeEvidenceImpact('does-not-exist', listExperiments());
    expect(report.impactScore).toBe(0);
  });
});

describe('computeEvidenceImpact — real banked SavedResearchChainManifest counts as a dependent campaign', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a step record referenced by researchChain.steps[].savedExperimentIds is counted as impacting that real campaign', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');
    const { computeEvidenceImpact } = await import('../core/agent/evidenceImpact');

    const goal = 'Maximise remaining fuel, at most 12 experiments.';
    const chain = runMechanismResearchChain({ shape: 'MECHANISM', goal, catalog: GENESIS_GENERATOR_CATALOG }, 4);
    expect(chain.terminalStatus).toBe('SETTLED');

    const experiments = listExperiments();
    const manifestRecord = experiments.find((e) => e.researchChain !== undefined)!;
    const stepSavedId = manifestRecord.researchChain!.steps[0]!.savedExperimentIds[0]!;

    const report = computeEvidenceImpact(stepSavedId, experiments);
    expect(report.impactScore).toBeGreaterThanOrEqual(1);
    expect(report.dependentCampaigns.map((d) => d.id)).toContain(manifestRecord.id);
    expect(report.dependentExperiments.map((d) => d.id)).toContain(manifestRecord.id);
    const dependent = report.dependentCampaigns.find((d) => d.id === manifestRecord.id)!;
    expect(dependent.via.some((via) => via.startsWith('researchChain.steps'))).toBe(true);
  });
});
