import { describe, expect, it } from 'vitest';
import { decideFromDiscoveryRecord, decideFromAdjudication } from '../core/mind/mindPromotionCaller';
import { MINIMUM_OBSERVATIONS } from '../core/agent/practicalCandidateGate';
import {
  ALL_SELF_FALSIFICATION_PROBES,
  type DiscoveryRecord,
  type DiscoveryStatus,
  type IndependentReplicationRecord,
  type NoveltyEvidence,
  type SelfFalsificationReport,
} from '../core/agent/discoveryContracts';

/**
 * MIND PROMOTION CALLER — negative-first. Mirrors the fixture style already
 * proven in `discoveryRecordBridge.test.ts` (same repo, same bridge) rather
 * than inventing a second one. This suite never re-proves the bridge's own
 * vocabulary mapping or D-057's own gate arithmetic — both already have
 * dedicated suites (`discoveryRecordBridge.test.ts`, `winnerGate.test.ts`);
 * it proves only this caller's own composition: does it forward what the
 * bridge said, and does it refuse to fabricate a PromotionResult when the
 * bridge itself refused to ask.
 */

const PASSING_SELF_FALSIFICATION: SelfFalsificationReport = {
  probes: ALL_SELF_FALSIFICATION_PROBES.map((name) => ({ name, method: 'DETERMINISTIC_PROBE', result: 'PASS', evidenceRefs: [], detail: 'test fixture' })),
  allPassed: true,
  reportFingerprint: 'fp-passing',
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

describe('decideFromDiscoveryRecord: NOT_APPLICABLE never fabricates a PromotionResult (the exact defect this caller was rejected for once)', () => {
  it.each<DiscoveryStatus>(['REPRODUCTION', 'KNOWN_RESULT', 'NO_ACCESS'])('%s -> promotion is null, no gate call happened', (status) => {
    const d = decideFromDiscoveryRecord(record({ status }));
    expect(d.promotion).toBeNull();
    expect(d.taxonomyVerdict).toBeNull();
    expect(d.sourceStatus).toBe(status);
    expect(d.reasons.length).toBeGreaterThan(0);
  });

  it('EXTENSION/NOVEL_HYPOTHESIS (never produced by classifyDiscoveryStatus, but the bridge still refuses them) -> promotion is null', () => {
    const d = decideFromDiscoveryRecord(record({ status: 'EXTENSION' }));
    expect(d.promotion).toBeNull();
    expect(d.taxonomyVerdict).toBeNull();
  });
});

describe('decideFromDiscoveryRecord: PROMOTION_INPUT path forwards the bridge\'s Verdict into a real canPromoteToWinnerRecord call', () => {
  it('DISCOVERY_CANDIDATE -> NO_WINNER, gate evaluated, NO_PROMOTION (never WINNER)', () => {
    const d = decideFromDiscoveryRecord(record({ status: 'DISCOVERY_CANDIDATE', replication: null }));
    expect(d.taxonomyVerdict).toBe('NO_WINNER');
    expect(d.promotion).not.toBeNull();
    expect(d.promotion!.outcome).toBe('NO_PROMOTION');
    expect(d.promotion!.reasons.some((r) => r.includes('VERDICT_NOT_WINNER'))).toBe(true);
  });

  it('CONFLICTING_EVIDENCE -> taxonomyVerdict CONFLICTING_EVIDENCE, gate refuses', () => {
    const d = decideFromDiscoveryRecord(record({ status: 'CONFLICTING_EVIDENCE' }));
    expect(d.taxonomyVerdict).toBe('CONFLICTING_EVIDENCE');
    expect(d.promotion!.outcome).toBe('NO_PROMOTION');
  });

  it('DISCOVERY -> WINNER taxonomy verdict, but D-057 gate still NO_PROMOTION (COMPUTATIONAL evidence class / observation-count double wall, unchanged from discoveryRecordBridge.test.ts)', () => {
    const disc = record({ status: 'DISCOVERY', replication: replication('REPLICATED'), noveltyEvidence: noveltyEvidence('NO_KNOWN_PRIOR_FOUND', []) });
    const d = decideFromDiscoveryRecord(disc);
    expect(d.taxonomyVerdict).toBe('WINNER');
    expect(d.promotion!.outcome).toBe('NO_PROMOTION');
    expect(d.promotion!.totalObservations).toBeLessThan(MINIMUM_OBSERVATIONS);
  });

  it('reasons are forwarded verbatim from the bridge, including the D-057 annotation', () => {
    const d = decideFromDiscoveryRecord(record({ status: 'DISCOVERY_CANDIDATE', replication: null }));
    expect(d.reasons[d.reasons.length - 1]).toBe('promotion decided by D-057; pipeline evidence class COMPUTATIONAL declared once, never argued upward');
  });
});

describe('decideFromAdjudication: direct Verdict + inventory path, no DiscoveryRecord/bridge involved', () => {
  it('WINNER + sufficient strong evidence -> PROMOTE', () => {
    const d = decideFromAdjudication('WINNER', [
      { evidenceClass: 'DIRECT_RANDOMISED', observationCount: MINIMUM_OBSERVATIONS },
    ]);
    expect(d.sourceStatus).toBe('ADJUDICATED');
    expect(d.taxonomyVerdict).toBe('WINNER');
    expect(d.promotion!.outcome).toBe('PROMOTE');
  });

  it('WINNER + empty inventory -> NO_PROMOTION, never fabricated PROMOTE', () => {
    const d = decideFromAdjudication('WINNER', []);
    expect(d.promotion!.outcome).toBe('NO_PROMOTION');
    expect(d.promotion!.totalObservations).toBe(0);
  });

  it('NO_WINNER verdict -> NO_PROMOTION regardless of inventory strength', () => {
    const d = decideFromAdjudication('NO_WINNER', [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 10 }]);
    expect(d.promotion!.outcome).toBe('NO_PROMOTION');
    expect(d.promotion!.reasons.some((r) => r.includes('VERDICT_NOT_WINNER'))).toBe(true);
  });

  it('never returns a null promotion on this path — a real Verdict was supplied, so the gate always runs', () => {
    const d = decideFromAdjudication('INSUFFICIENT_EVIDENCE', []);
    expect(d.promotion).not.toBeNull();
  });
});
