import { afterEach, describe, expect, it, vi } from 'vitest';

import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';

/**
 * P0 — MECHANISM's OWN GAP CLOSED: `runDiscovery`'s MECHANISM path produced a
 * real `StrategyRun` but persisted nothing — the front door dead-ended at its
 * return value, unlike PARAMETER (`runInquiryWithGenerationAndRemember`).
 * `runMechanismDiscoveryAndRemember` closes it by reusing the EXACT persistence
 * `worldDiscoverySession.ts::runWorldDiscoveryAndRemember` already uses
 * (`buildWorldDiscoveryEvidenceBundle` / `buildSavedWorldDiscoveryRun` /
 * `saveWorldDiscoveryRunToMemory` / `replaySavedWorldDiscoveryRun`), fed from
 * the same real `DiscoveryLoopExecution` `mechanismGeneration.ts` already
 * computes internally (now exposed as `firstExecution` for exactly this).
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

const GOAL = 'Maximise remaining fuel, at most 12 experiments.';

describe('runMechanismDiscoveryAndRemember — MECHANISM investigations now persist and replay, exactly like PARAMETER', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('THE DEFINING BEHAVIOUR: the same StrategyRun runDiscovery already produces, PLUS a real, replayable Memory record', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runDiscovery, runMechanismDiscoveryAndRemember } = await import('../core/agent/discoveryOrchestrator');
    const { getExperiment } = await import('../core/scienceMemory');

    const direct = runDiscovery({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    const remembered = runMechanismDiscoveryAndRemember({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });

    if (remembered.outcome.status !== 'RAN') throw new Error(`expected RAN: ${remembered.outcome.status}`);
    if (direct.status !== 'RAN') throw new Error('expected RAN');

    // The equivalence `runDiscovery` itself guarantees: the persisting wrapper
    // reports the identical finding, not a second, separately-derived one.
    expect(remembered.outcome.run.surviving).toEqual(direct.run.surviving);
    expect(remembered.outcome.generated?.derived.hypothesisId).toBe(direct.generated?.derived.hypothesisId);

    // Persisted for real — not merely returned and discarded.
    expect(remembered.savedExperimentId).not.toBeNull();
    const record = getExperiment(remembered.savedExperimentId!);
    expect(record).not.toBeUndefined();
    expect(record!.worldDiscovery?.goal).toBe(GOAL);
    expect(record!.worldDiscovery?.catalogId).toBe(GENESIS_GENERATOR_CATALOG.catalogId);

    // A REAL re-execution verdict, not a claim that it would reproduce.
    expect(remembered.replay).not.toBeNull();
    expect(remembered.replay!.status).toBe('MATCH');
  });

  it('a later investigation of the SAME catalog/objective reads the banked memory and skips what it already refuted', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/discoveryOrchestrator');
    const round1 = first.runMechanismDiscoveryAndRemember({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (round1.outcome.status !== 'RAN') throw new Error('expected RAN');
    expect(round1.outcome.run.falsified.length).toBeGreaterThan(0);

    // A real process restart: fresh modules, same persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/discoveryOrchestrator');
    const round2 = second.runMechanismDiscoveryAndRemember({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (round2.outcome.status !== 'RAN') throw new Error('expected RAN');

    expect(round2.outcome.priorInvestigation).not.toBeNull();
    expect(round2.outcome.priorInvestigation!.skippedHypothesisIds).toEqual(
      expect.arrayContaining([...round1.outcome.run.falsified]),
    );
  });
});
