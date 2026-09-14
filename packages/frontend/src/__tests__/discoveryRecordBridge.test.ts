import { describe, expect, it, beforeEach } from 'vitest';
import {
  bridgeDiscoveryRecordToPromotionInput,
  DISCOVERY_PIPELINE_EVIDENCE_CLASS,
  type DiscoveryPromotionBridgeResult,
} from '../core/orchestrator/discoveryRecordBridge';
import { canPromoteToWinnerRecord } from '../core/orchestrator/winnerGate';
import { MINIMUM_OBSERVATIONS } from '../core/agent/practicalCandidateGate';
import {
  ALL_SELF_FALSIFICATION_PROBES,
  type DiscoveryRecord,
  type DiscoveryStatus,
  type IndependentReplicationRecord,
  type NoveltyEvidence,
  type SelfFalsificationReport,
} from '../core/agent/discoveryContracts';
import { runAutonomousOrchestrator } from '../core/agent/campaignOrchestrator';
import { makeQe4DomainAdapter } from '../core/biotechData/domainAdapterRegistry';
import { runGenuineDiscoveryPipeline, type GenuineDiscoveryPipelineInput } from '../core/agent/genuineDiscoveryOrchestrator';
import type { ModelSpec } from '../core/agent/modelSpace';
import type { StructuralDeclaration } from '../core/agent/selfFalsificationBattery';
import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { resetNoveltyGateRegistryForTests } from '../core/agent/noveltyGate';

/**
 * DISCOVERY -> PROMOTION BRIDGE — negative-first. Every test either proves a
 * refusal (NOT_APPLICABLE, never WINNER, never NO_PROMOTION silently
 * skipped) or proves a real, disclosed number.
 */

const PASSING_SELF_FALSIFICATION: SelfFalsificationReport = {
  probes: ALL_SELF_FALSIFICATION_PROBES.map((name) => ({ name, method: 'DETERMINISTIC_PROBE', result: 'PASS', evidenceRefs: [], detail: 'test fixture' })),
  allPassed: true,
  reportFingerprint: 'fp-passing',
};

const FAILING_SELF_FALSIFICATION: SelfFalsificationReport = {
  probes: ALL_SELF_FALSIFICATION_PROBES.map((name, i) => ({ name, method: 'DETERMINISTIC_PROBE', result: i === 0 ? 'FAIL' : 'PASS', evidenceRefs: [], detail: 'test fixture' })),
  allPassed: false,
  reportFingerprint: 'fp-failing',
};

function replication(result: IndependentReplicationRecord['result']): IndependentReplicationRecord {
  return {
    discoveryDatasetFingerprint: 'disc-fp',
    replicationDatasetFingerprint: 'repl-fp',
    disjointnessProof: 'DIFFERENT_SOURCE',
    frozenBeforeReplicationAccess: true,
    adversarialAttempts: [],
    result,
    effectComparison: { discoveryEffect: 1, replicationEffect: 1, agreementWithinUncertainty: result === 'REPLICATED' },
    outcomeFingerprint: `repl-outcome-${result}`,
  };
}

function noveltyEvidence(overall: NoveltyEvidence['overall'], limitations: readonly string[] = ['bounded corpus']): NoveltyEvidence {
  return {
    l1InternalMemory: 'POSSIBLY_NOVEL', l2PreregisteredCorpus: 'POSSIBLY_NOVEL', l3PinnedPublicDatasets: 'POSSIBLY_NOVEL', l4DeclaredAnchors: 'POSSIBLY_NOVEL',
    l5ExternalLiteratureSearch: overall === 'KNOWN' ? 'NOT_RUN' : overall,
    l6PostDiscoveryRecheck: overall === 'KNOWN' ? 'NOT_RUN' : overall,
    overall,
    searchedCorpus: [],
    matchedPriorArt: overall === 'KNOWN' ? [{ ref: { id: 'x', kind: 'internal', summary: 'x', fingerprint: 'fp' }, similarity: 1, matchedClaim: 'x' }] : [],
    unresolvedMatches: [],
    limitations: overall === 'KNOWN' ? [] : limitations,
    confidence: overall === 'KNOWN' ? 1 : 0.5,
  };
}

/** Every field a real DiscoveryRecord carries; overridable per test. Fields not under test get honest, unremarkable values. */
function record(overrides: Partial<DiscoveryRecord> & { status: DiscoveryStatus }): DiscoveryRecord {
  return {
    recordId: 'rec-1', campaignId: 'camp-1', directionId: 'dir-1', strategy: 'RESIDUAL',
    anomaly: null,
    chain: [{ observationId: 'o1', anomalyId: null, gapStatement: 'g', hypothesisId: 'h1', modelId: 'm1', predictionId: 'p1' }],
    preregFreeze: { hypothesisFingerprint: 'hf', predictionFingerprint: 'pf', frozenAt: 0 },
    noveltyEvidence: noveltyEvidence('NO_KNOWN_PRIOR_FOUND'),
    replication: null,
    selfFalsification: PASSING_SELF_FALSIFICATION,
    graphRootId: 'root-1',
    externalValidation: 'NOT_SOUGHT',
    outcomeFingerprint: 'outcome-1',
    replayHandle: 'replay-1',
    ...overrides,
  };
}

function expectPromotionInput(r: DiscoveryPromotionBridgeResult): asserts r is DiscoveryPromotionBridgeResult & { promotionInput: NonNullable<DiscoveryPromotionBridgeResult['promotionInput']> } {
  expect(r.kind).toBe('PROMOTION_INPUT');
  expect(r.promotionInput).not.toBeNull();
}

describe('DISCOVERY_CANDIDATE never becomes WINNER (the exact thing this bridge was built not to do)', () => {
  it('replication absent -> NO_WINNER', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'DISCOVERY_CANDIDATE', replication: null }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('NO_WINNER');
    expect(r.promotionInput.adjudicationVerdict).not.toBe('WINNER');
  });

  it('replication PARTIAL -> NO_WINNER', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'DISCOVERY_CANDIDATE', replication: replication('PARTIAL') }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('NO_WINNER');
  });

  it('self-falsification incomplete -> NO_WINNER', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'DISCOVERY_CANDIDATE', replication: replication('REPLICATED'), selfFalsification: FAILING_SELF_FALSIFICATION }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('NO_WINNER');
  });
});

describe('FAILED_DISCOVERY -> NO_WINNER, a negative result stated as such', () => {
  it('names the FAILED replication result in reasons', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'FAILED_DISCOVERY', replication: replication('FAILED') }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('NO_WINNER');
    expect(r.reasons.join(' ')).toMatch(/FAILED/);
  });
});

describe('CONFLICTING_EVIDENCE maps 1:1 to Verdict.CONFLICTING_EVIDENCE', () => {
  it('direct match', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'CONFLICTING_EVIDENCE' }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('CONFLICTING_EVIDENCE');
  });
});

describe('UNKNOWN maps to INSUFFICIENT_EVIDENCE, with a reason that names UNRESOLVED PRIOR-ART, never experimental weakness', () => {
  it('reasons distinguish prior-art from evidence strength', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'UNKNOWN', noveltyEvidence: noveltyEvidence('NO_ACCESS') }));
    expectPromotionInput(r);
    expect(r.promotionInput.adjudicationVerdict).toBe('INSUFFICIENT_EVIDENCE');
    const joined = r.reasons.join(' ');
    expect(joined).toMatch(/prior-art|PRIOR-ART/);
    expect(joined).not.toMatch(/experimental evidence (is )?weak/i);
  });
});

describe('REPRODUCTION / KNOWN_RESULT / NO_ACCESS -> NOT_APPLICABLE (no Verdict is fabricated)', () => {
  it.each<DiscoveryStatus>(['REPRODUCTION', 'KNOWN_RESULT', 'NO_ACCESS'])('%s refuses to construct a PromotionInput', (status) => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status }));
    expect(r.kind).toBe('NOT_APPLICABLE');
    expect(r.promotionInput).toBeNull();
    expect(r.reasons.length).toBeGreaterThan(0);
  });
});

describe('EXTENSION / NOVEL_HYPOTHESIS -> NOT_APPLICABLE (classifyDiscoveryStatus never produces these)', () => {
  it.each<DiscoveryStatus>(['EXTENSION', 'NOVEL_HYPOTHESIS'])('%s is refused with an explicit "never produced" reason', (status) => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status }));
    expect(r.kind).toBe('NOT_APPLICABLE');
    expect(r.promotionInput).toBeNull();
    expect(r.reasons.join(' ')).toMatch(/never returns this value|classifyDiscoveryStatus/);
  });
});

describe('every PROMOTION_INPUT result carries the D-057 annotation (addition 1)', () => {
  it.each<DiscoveryStatus>(['DISCOVERY', 'DISCOVERY_CANDIDATE', 'FAILED_DISCOVERY', 'CONFLICTING_EVIDENCE', 'UNKNOWN'])('%s reasons end with the D-057 annotation', (status) => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status, replication: status === 'DISCOVERY' ? replication('REPLICATED') : status === 'FAILED_DISCOVERY' ? replication('FAILED') : null }));
    expectPromotionInput(r);
    expect(r.reasons[r.reasons.length - 1]).toBe('promotion decided by D-057; pipeline evidence class COMPUTATIONAL declared once, never argued upward');
  });
});

describe('DISCOVERY -> WINNER, but the D-057 gate still says NO_PROMOTION (the double wall, addition 3)', () => {
  it('COMPUTATIONAL evidence class AND observation count both fall short, independently', () => {
    const disc = record({ status: 'DISCOVERY', replication: replication('REPLICATED'), noveltyEvidence: noveltyEvidence('NO_KNOWN_PRIOR_FOUND', []) });
    const bridged = bridgeDiscoveryRecordToPromotionInput(disc);
    expectPromotionInput(bridged);
    expect(bridged.promotionInput.adjudicationVerdict).toBe('WINNER');
    expect(bridged.promotionInput.inventory).toEqual([{ evidenceClass: DISCOVERY_PIPELINE_EVIDENCE_CLASS, observationCount: 2 }]);

    const promotion = canPromoteToWinnerRecord(bridged.promotionInput);
    expect(promotion.outcome).toBe('NO_PROMOTION');
    // Wall 1: evidence strength. COMPUTATIONAL never clears the strong-evidence floor.
    expect(promotion.strongCount).toBe(0);
    // Wall 2: evidence volume. discovery dataset + replication = 2, one short of the real minimum.
    expect(MINIMUM_OBSERVATIONS).toBe(3);
    expect(promotion.totalObservations).toBe(2);
    expect(promotion.totalObservations).toBeLessThan(MINIMUM_OBSERVATIONS);
    // Neither wall alone is load-bearing: both fail independently.
    expect(promotion.reasons.some((r) => r.includes('EVIDENCE_STRENGTH'))).toBe(true);
    expect(promotion.reasons.some((r) => r.includes('EVIDENCE_SUFFICIENT'))).toBe(true);
  });
});

describe('the bridge TRUSTS assertValidDiscoveryStatus rather than duplicating it', () => {
  it('a well-formed DISCOVERY record (the only shape assertValidDiscoveryStatus allows to exist) translates without the bridge re-validating replication/self-falsification itself', () => {
    const disc = record({ status: 'DISCOVERY', replication: replication('REPLICATED'), selfFalsification: PASSING_SELF_FALSIFICATION, noveltyEvidence: noveltyEvidence('NO_KNOWN_PRIOR_FOUND', []) });
    expect(() => bridgeDiscoveryRecordToPromotionInput(disc)).not.toThrow();
  });
});

describe('observationCount is exact, never inflated by the 13 self-falsification probes (addition-adjacent, guards D-059-style inflation)', () => {
  it('DISCOVERY_CANDIDATE with replication=null -> observationCount is exactly 1', () => {
    const r = bridgeDiscoveryRecordToPromotionInput(record({ status: 'DISCOVERY_CANDIDATE', replication: null }));
    expectPromotionInput(r);
    expect(r.promotionInput.inventory).toEqual([{ evidenceClass: DISCOVERY_PIPELINE_EVIDENCE_CLASS, observationCount: 1 }]);
  });
});

describe('the real QE4 pinned run reaches this bridge, and the bridged result never fabricates a promotion (regression against genuineDiscoveryOrchestrator.test.ts\'s own real finding)', () => {
  const RIVAL: ModelSpec = { id: 'rival', terms: [{ basis: 'CONSTANT' }], lineage: null };
  const CLEAN_DECLARATION: StructuralDeclaration = {
    representativeSampling: true, leakageChecked: true, knownUncontrolledConfounders: [],
    measurementInstrumentValidated: true, numericalPrecisionChecked: true, preprocessingDocumented: true, temporalOrderingRespected: true,
  };

  beforeEach(() => {
    resetFalsifiedModelRegistryForTests();
    resetNoveltyGateRegistryForTests();
  });

  it('QE4 -> UNKNOWN -> bridged to INSUFFICIENT_EVIDENCE, never WINNER', async () => {
    const trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
    const campaign = trace.campaigns[0]!;
    const input: GenuineDiscoveryPipelineInput = {
      campaign, literatureClients: [], matchThreshold: 0.5,
      discoveryDataset: { datasetId: 'qe4-disc', points: campaign.result.rounds.flatMap((r) => r.admittedX).map((x) => ({ x, y: 0, sigma: 1 })) },
      replicationDataset: null,
      rivalSpec: RIVAL, structuralDeclaration: CLEAN_DECLARATION, numberOfHypothesesTested: 1, multipleTestingCorrectionApplied: false,
    };
    const disc = await runGenuineDiscoveryPipeline(input);
    expect(disc).not.toBeNull();
    expect(disc!.status).toBe('UNKNOWN'); // regression: this is genuineDiscoveryOrchestrator.test.ts's own real finding, unchanged

    const bridged = bridgeDiscoveryRecordToPromotionInput(disc!);
    expectPromotionInput(bridged);
    expect(bridged.promotionInput.adjudicationVerdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(bridged.promotionInput.adjudicationVerdict).not.toBe('WINNER');
    expect(canPromoteToWinnerRecord(bridged.promotionInput).outcome).toBe('NO_PROMOTION');
  });
});
