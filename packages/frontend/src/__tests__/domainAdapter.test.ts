import { describe, expect, it } from 'vitest';
import { meetsProductionContract, observeViaAdapter, runExperimentViaAdapter, compareDomainAdapterReplay, type DomainAdapter } from '../core/agent/domainAdapter';
import { makeDemonstratorDomainAdapterRegistry, makeKeplerDomainAdapter, makeQe4DomainAdapter } from '../core/biotechData/domainAdapterRegistry';

describe('E4 — shared DomainAdapter contract, production requirement', () => {
  it('the demonstrator registry (QE4 + Kepler) meets the production contract of >= 2 adapters', () => {
    const registry = makeDemonstratorDomainAdapterRegistry();
    expect(registry.adapters.length).toBe(2);
    expect(meetsProductionContract(registry)).toBe(true);
  });

  it('the contract is NOT hardcoded to any named domain — a single-adapter or empty registry correctly fails it', () => {
    expect(meetsProductionContract({ adapters: [] })).toBe(false);
    expect(meetsProductionContract({ adapters: [makeQe4DomainAdapter()] })).toBe(false);
  });

  it('every adapter declares capabilities, provenance and limitations — never silent', () => {
    for (const adapter of makeDemonstratorDomainAdapterRegistry().adapters) {
      expect(adapter.capabilities.domainId.length).toBeGreaterThan(0);
      expect(adapter.capabilities.description.length).toBeGreaterThan(0);
      expect(adapter.availableData().length).toBeGreaterThan(0);
      expect(adapter.provenance.sourceUrl.length).toBeGreaterThan(0);
      expect(adapter.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe('E4 — runExperimentViaAdapter calls the real, unmodified engine on both domains', () => {
  function runBoth(): { readonly qe4: ReturnType<typeof runExperimentViaAdapter>; readonly kepler: ReturnType<typeof runExperimentViaAdapter> } {
    const qe4 = runExperimentViaAdapter(makeQe4DomainAdapter(), { maxRounds: 6, maxTerms: 2 });
    const kepler = runExperimentViaAdapter(makeKeplerDomainAdapter(), { maxRounds: 7, maxTerms: 2 });
    return { qe4, kepler };
  }

  it('both domains produce real, distinct CampaignResults from the SAME engine call path', () => {
    const { qe4, kepler } = runBoth();
    expect(qe4.rounds.length).toBeGreaterThan(0);
    expect(kepler.rounds.length).toBeGreaterThan(0);
    // Genuinely different domains: different problems, different fingerprints.
    expect(qe4.labId).not.toBe(kepler.labId);
    expect(qe4.campaignFingerprint).not.toBe(kepler.campaignFingerprint);
  });

  it('observeViaAdapter reads real data for a declared x on each domain', () => {
    const qe4Adapter = makeQe4DomainAdapter();
    const keplerAdapter = makeKeplerDomainAdapter();
    const qe4X = qe4Adapter.availableData()[0]!;
    const keplerX = keplerAdapter.availableData()[0]!;
    expect(observeViaAdapter(qe4Adapter, qe4X)).not.toBeNull();
    expect(observeViaAdapter(keplerAdapter, keplerX)).not.toBeNull();
  });

  it('replay: two independent runs of the same adapter MATCH; different domains DRIFT', () => {
    const a = runExperimentViaAdapter(makeQe4DomainAdapter(), { maxRounds: 6, maxTerms: 2 });
    const b = runExperimentViaAdapter(makeQe4DomainAdapter(), { maxRounds: 6, maxTerms: 2 });
    expect(compareDomainAdapterReplay(a, b)).toBe('MATCH');

    const kepler = runExperimentViaAdapter(makeKeplerDomainAdapter(), { maxRounds: 7, maxTerms: 2 });
    expect(compareDomainAdapterReplay(a, kepler)).toBe('DRIFT');
  });
});

describe('E4 — the contract itself is domain-agnostic: a third, synthetic adapter plugs in with no changes to domainAdapter.ts', () => {
  it('a hand-built third adapter (proving E4 is not secretly a 2-domain-only system) runs through the same functions', () => {
    const xs = [1, 2, 3, 4, 5];
    const byX = new Map(xs.map((x) => [x, { x, y: 3 + 2 * x, sigma: 0.01 }]));
    const thirdAdapter: DomainAdapter = {
      capabilities: { domainId: 'synthetic-third-domain', description: 'A hand-built third domain to prove the contract is not hardcoded to QE4/Kepler.', xLabel: 'x', yLabel: 'y' },
      availableData: () => xs,
      laboratory: {
        labId: 'synthetic-third-domain',
        problem: 'Synthetic: y = 3 + 2x.',
        candidateX: xs,
        observe: (x) => byX.get(x) ?? null,
        xRange: { min: 1, max: 5 },
        xLabel: 'x',
        yLabel: 'y',
      },
      provenance: { sourceUrl: 'synthetic://test-fixture', sourceVersion: '1', license: null, retrievedAt: null },
      limitations: ['Synthetic test fixture only.'],
    };
    const registry = { adapters: [makeQe4DomainAdapter(), makeKeplerDomainAdapter(), thirdAdapter] };
    expect(meetsProductionContract(registry)).toBe(true);
    expect(registry.adapters.length).toBe(3);

    const result = runExperimentViaAdapter(thirdAdapter, { maxRounds: 4, maxTerms: 2 });
    expect(result.rounds.length).toBeGreaterThan(0);
  });
});
