import { describe, expect, it, beforeEach } from 'vitest';
import { runAutonomousOrchestrator } from '../core/agent/campaignOrchestrator';
import { makeKeplerDomainAdapter, makeQe4DomainAdapter } from '../core/biotechData/domainAdapterRegistry';
import { KEPLER_MARS_ANCHOR_ID } from '../core/biotechData/externalAnchor';
import { runGenuineDiscoveryPipeline, type GenuineDiscoveryPipelineInput } from '../core/agent/genuineDiscoveryOrchestrator';
import type { ModelSpec } from '../core/agent/modelSpace';
import type { StructuralDeclaration } from '../core/agent/selfFalsificationBattery';
import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { resetNoveltyGateRegistryForTests } from '../core/agent/noveltyGate';

/**
 * PHASE F — GENUINE-AUTONOMOUS-DISCOVERY-E2E-01, on already-pinned QE4/
 * Kepler data (the user's own chosen substitute for a live external
 * snapshot, per the Krok 0 network-reality question). This is the
 * capstone acceptance test: the real value Phase F adds ON TOP of Phase
 * E's own noveltyGate.ts is proven here on a REAL case where the two
 * disagree.
 */

const RIVAL: ModelSpec = { id: 'rival', terms: [{ basis: 'CONSTANT' }], lineage: null };
const CLEAN_DECLARATION: StructuralDeclaration = {
  representativeSampling: true, leakageChecked: true, knownUncontrolledConfounders: [],
  measurementInstrumentValidated: true, numericalPrecisionChecked: true, preprocessingDocumented: true, temporalOrderingRespected: true,
};

function baseFields(): Pick<GenuineDiscoveryPipelineInput, 'rivalSpec' | 'structuralDeclaration' | 'numberOfHypothesesTested' | 'multipleTestingCorrectionApplied'> {
  return { rivalSpec: RIVAL, structuralDeclaration: CLEAN_DECLARATION, numberOfHypothesesTested: 1, multipleTestingCorrectionApplied: false };
}

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
  resetNoveltyGateRegistryForTests();
});

describe('E2E-01, Kepler seed (declared public anchor) -> REPRODUCTION, exactly as Phase E\'s TE5 already established', () => {
  it('reaches REPRODUCTION with overall=KNOWN, no external search even needed', async () => {
    const trace = runAutonomousOrchestrator({
      seedAdapter: makeKeplerDomainAdapter(),
      options: { maxRounds: 7, maxTerms: 2 },
      maxCampaigns: 1,
      declaredPublicAnchorResolver: () => ({ anchorId: KEPLER_MARS_ANCHOR_ID, summary: "Kepler's third law — established public knowledge." }),
    });
    const campaign = trace.campaigns[0]!;
    const record = await runGenuineDiscoveryPipeline({
      campaign,
      literatureClients: [],
      matchThreshold: 0.5,
      discoveryDataset: { datasetId: 'kepler-disc', points: [] },
      replicationDataset: null,
      ...baseFields(),
    });

    expect(record).not.toBeNull();
    expect(record!.status).toBe('REPRODUCTION');
    expect(record!.noveltyEvidence.overall).toBe('KNOWN');
    expect(record!.noveltyEvidence.matchedPriorArt.length).toBeGreaterThan(0);
    expect(record!.externalValidation).toBe('NOT_SOUGHT');
    expect(record!.outcomeFingerprint.length).toBeGreaterThan(0);
  });
});

describe('E2E-01, QE4 seed (no declared anchor) -> the core Phase F finding: catches Phase E\'s own novelty gate producing an UNVERIFIED DISCOVERY', () => {
  it('Phase E alone (noveltyGate.ts) labels this DISCOVERY from internal checks only', () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
    expect(trace.campaigns[0]!.resultLabel).toBe('DISCOVERY');
    expect(trace.campaigns[0]!.noveltyAssessment.level).toBe('NOVEL_WITHIN_CHECKED_CORPUS');
  });

  it('Phase F, requiring L5/L6 external verification before DISCOVERY, downgrades the SAME real campaign to UNKNOWN when literature search is genuinely unreachable (this sandbox\'s real network policy)', async () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
    const campaign = trace.campaigns[0]!;

    const record = await runGenuineDiscoveryPipeline({
      campaign,
      literatureClients: [], // honest: no source declared/reachable, matching Krok 0's real finding
      matchThreshold: 0.5,
      discoveryDataset: { datasetId: 'qe4-disc', points: campaign.result.rounds.flatMap((r) => r.admittedX).map((x) => ({ x, y: 0, sigma: 1 })) },
      replicationDataset: null,
      ...baseFields(),
    });

    expect(record).not.toBeNull();
    // The single most important assertion in this whole file: Phase F never
    // lets Phase E's internal-only DISCOVERY pass through unverified.
    expect(record!.status).not.toBe('DISCOVERY');
    expect(record!.status).toBe('UNKNOWN');
    expect(record!.noveltyEvidence.overall).toBe('NO_ACCESS');
    expect(record!.noveltyEvidence.limitations.length).toBeGreaterThan(0);
  });
});

describe('determinism — the same campaign produces the same outcome fingerprint', () => {
  it('two independent pipeline runs on the same Kepler campaign agree', async () => {
    const trace = runAutonomousOrchestrator({
      seedAdapter: makeKeplerDomainAdapter(), options: { maxRounds: 7, maxTerms: 2 }, maxCampaigns: 1,
      declaredPublicAnchorResolver: () => ({ anchorId: KEPLER_MARS_ANCHOR_ID, summary: 'x' }),
    });
    const campaign = trace.campaigns[0]!;
    const input: GenuineDiscoveryPipelineInput = { campaign, literatureClients: [], matchThreshold: 0.5, discoveryDataset: { datasetId: 'd', points: [] }, replicationDataset: null, ...baseFields() };
    const a = await runGenuineDiscoveryPipeline(input);
    const b = await runGenuineDiscoveryPipeline(input);
    expect(a!.outcomeFingerprint).toBe(b!.outcomeFingerprint);
    expect(a!.status).toBe(b!.status);
  });
});

describe('a campaign with no winning model -> null, never fabricated', () => {
  it('returns null when there is nothing to assess', async () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
    const campaign = trace.campaigns[0]!;
    const fakeCampaign = { ...campaign, result: { ...campaign.result, discovery: { ...campaign.result.discovery, winningModel: null } } };
    const record = await runGenuineDiscoveryPipeline({ campaign: fakeCampaign, literatureClients: [], matchThreshold: 0.5, discoveryDataset: { datasetId: 'd', points: [] }, replicationDataset: null, ...baseFields() });
    expect(record).toBeNull();
  });
});
