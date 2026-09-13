import { describe, expect, it } from 'vitest';
import {
  computeProofLadder,
  renderTieredStatus,
  assertTieredStatusText,
  PROOF_LEVELS,
  type ProofLadderInput,
  type EvidenceSignal,
} from '../core/agent/proofLadder';
import {
  ALL_SELF_FALSIFICATION_PROBES,
  type DiscoveryRecord,
  type DiscoveryStatus,
  type NoveltyEvidence,
  type IndependentReplicationRecord,
  type SelfFalsificationReport,
} from '../core/agent/discoveryContracts';

const NOT_RUN_NOVELTY: NoveltyEvidence = {
  l1InternalMemory: 'NOT_NEW', l2PreregisteredCorpus: 'NOT_NEW', l3PinnedPublicDatasets: 'NOT_NEW', l4DeclaredAnchors: 'NOT_NEW',
  l5ExternalLiteratureSearch: 'NOT_RUN', l6PostDiscoveryRecheck: 'NOT_RUN',
  overall: 'KNOWN', searchedCorpus: [], matchedPriorArt: [{ ref: { id: 'anchor:1', kind: 'anchor', summary: 'x', fingerprint: 'f' }, similarity: 1, matchedClaim: 'x' }],
  unresolvedMatches: [], limitations: [], confidence: 1,
};

const NOVEL_CLEARED: NoveltyEvidence = {
  l1InternalMemory: 'NOVEL_WITHIN_CHECKED_CORPUS', l2PreregisteredCorpus: 'NOVEL_WITHIN_CHECKED_CORPUS',
  l3PinnedPublicDatasets: 'NOVEL_WITHIN_CHECKED_CORPUS', l4DeclaredAnchors: 'NOVEL_WITHIN_CHECKED_CORPUS',
  l5ExternalLiteratureSearch: 'NOT_RUN', l6PostDiscoveryRecheck: 'NOT_RUN',
  overall: 'UNVERIFIABLE', searchedCorpus: [], matchedPriorArt: [], unresolvedMatches: [], limitations: ['L5/L6 not run'], confidence: 0.5,
};

const NO_KNOWN_PRIOR: NoveltyEvidence = {
  ...NOVEL_CLEARED,
  l5ExternalLiteratureSearch: 'NO_KNOWN_PRIOR_FOUND', l6PostDiscoveryRecheck: 'NO_KNOWN_PRIOR_FOUND',
  overall: 'NO_KNOWN_PRIOR_FOUND',
};

const ALL_PROBES_PASS: SelfFalsificationReport = {
  probes: ALL_SELF_FALSIFICATION_PROBES.map((name) => ({ name, method: 'DETERMINISTIC_PROBE' as const, result: 'PASS' as const, evidenceRefs: [], detail: 'ok' })),
  allPassed: true, reportFingerprint: 'sf-fp',
};

const REPLICATED: IndependentReplicationRecord = {
  discoveryDatasetFingerprint: 'a', replicationDatasetFingerprint: 'b', disjointnessProof: 'HELD_OUT_SPLIT',
  frozenBeforeReplicationAccess: true, adversarialAttempts: [{ attack: 'label-shuffle', result: 'WITHSTOOD', detail: 'ok' }],
  result: 'REPLICATED', effectComparison: { discoveryEffect: 1, replicationEffect: 1.01, agreementWithinUncertainty: true },
  outcomeFingerprint: 'rep-fp',
};

const FAILED_REPLICATION: IndependentReplicationRecord = { ...REPLICATED, result: 'FAILED', effectComparison: { discoveryEffect: 1, replicationEffect: 5, agreementWithinUncertainty: false } };
const PARTIAL_REPLICATION: IndependentReplicationRecord = { ...REPLICATED, result: 'PARTIAL' };

function makeRecord(overrides: Partial<DiscoveryRecord> & { status: DiscoveryStatus }): DiscoveryRecord {
  return {
    recordId: 'rec-1', campaignId: 'camp-1', directionId: 'dir-1', strategy: 'RESIDUAL', anomaly: null,
    chain: [], preregFreeze: { hypothesisFingerprint: 'h', predictionFingerprint: 'p', frozenAt: 1000 },
    noveltyEvidence: NOT_RUN_NOVELTY, replication: null,
    selfFalsification: { probes: [], allPassed: false, reportFingerprint: 'empty' },
    graphRootId: 'root-1', externalValidation: 'NOT_SOUGHT', outcomeFingerprint: 'out-1', replayHandle: 'replay-1',
    ...overrides,
  };
}

const ALL_NOT_ATTEMPTED: Omit<ProofLadderInput, 'record'> = {
  replay: 'NOT_ATTEMPTED', heldoutPrediction: 'NOT_ATTEMPTED', predictionOrdering: 'NOT_ATTEMPTED',
  independentImplementation: 'NOT_ATTEMPTED', orthogonalMethod: 'NOT_ATTEMPTED', causalEvidence: 'NOT_ATTEMPTED', externalAudit: 'NOT_ATTEMPTED',
};

describe('internal status -> ladder position (the mapping is not arbitrary)', () => {
  it('REPRODUCTION reaches exactly P1 when replay is also verified', () => {
    const record = makeRecord({ status: 'REPRODUCTION' });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.maxLevel).toBe('P1');
    expect(result.tier).toBe('A_COMPUTATIONAL');
    expect(result.gateResults.P3).toBe('NOT_ATTEMPTED');
  });

  it('an unverified replay caps EVERYTHING at P0, even for a REPRODUCTION record — no rung is free', () => {
    const record = makeRecord({ status: 'REPRODUCTION' });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED });
    expect(result.maxLevel).toBe('P0');
    expect(result.gateResults.P0).toBe('NOT_ATTEMPTED');
    expect(result.gateResults.P1).toBe('PASS'); // reported honestly even though it didn't raise maxLevel
  });

  it('NOVEL_HYPOTHESIS reaches P3 (internal novelty), never further', () => {
    const record = makeRecord({ status: 'NOVEL_HYPOTHESIS', noveltyEvidence: NOVEL_CLEARED });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.maxLevel).toBe('P3');
    expect(result.gateResults.P4).toBe('NOT_ATTEMPTED');
  });

  it('DISCOVERY_CANDIDATE reaches P4 (external prior-art search actually ran)', () => {
    const record = makeRecord({ status: 'DISCOVERY_CANDIDATE', noveltyEvidence: NO_KNOWN_PRIOR, replication: null });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.maxLevel).toBe('P4');
    expect(result.gateResults.P6).toBe('NOT_ATTEMPTED');
  });

  it('DISCOVERY_CANDIDATE with a PARTIAL replication reports P6 as an explicit FAIL, not silence', () => {
    const record = makeRecord({ status: 'DISCOVERY_CANDIDATE', noveltyEvidence: NO_KNOWN_PRIOR, replication: PARTIAL_REPLICATION });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.gateResults.P6).toBe('FAIL');
    expect(result.maxLevel).toBe('P4');
  });

  it('FAILED_DISCOVERY reports P6 as FAIL, having reached P4 first', () => {
    const record = makeRecord({ status: 'FAILED_DISCOVERY', noveltyEvidence: NO_KNOWN_PRIOR, replication: FAILED_REPLICATION });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.maxLevel).toBe('P4');
    expect(result.gateResults.P6).toBe('FAIL');
  });

  it('DISCOVERY reaches P6 -- the disjoint, frozen, fully-self-falsified internal chain is genuinely P6-grade, given a checked holdout prediction and a registered prediction ordering', () => {
    const record = makeRecord({ status: 'DISCOVERY', noveltyEvidence: NO_KNOWN_PRIOR, replication: REPLICATED, selfFalsification: ALL_PROBES_PASS });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS', heldoutPrediction: 'PASS', predictionOrdering: 'PASS' });
    expect(result.maxLevel).toBe('P6');
    expect(result.tier).toBe('B_EMPIRICAL');
  });

  it('DISCOVERY does NOT reach P6 without a checked holdout prediction, even with everything else in place', () => {
    const record = makeRecord({ status: 'DISCOVERY', noveltyEvidence: NO_KNOWN_PRIOR, replication: REPLICATED, selfFalsification: ALL_PROBES_PASS });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS', predictionOrdering: 'PASS' });
    expect(result.maxLevel).toBe('P4');
    expect(result.gateResults.P6).toBe('PASS'); // reported honestly -- the internal chain itself did reach it
  });

  it('UNKNOWN and NO_ACCESS never climb past P0, and NO_ACCESS reports BLOCKED not FAIL', () => {
    const unknown = computeProofLadder({ record: makeRecord({ status: 'UNKNOWN' }), ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(unknown.maxLevel).toBe('P0');
    const noAccess = computeProofLadder({ record: makeRecord({ status: 'NO_ACCESS' }), ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(noAccess.maxLevel).toBe('P0');
    expect(noAccess.gateResults.P1).toBe('BLOCKED');
  });

  it('CONFLICTING_EVIDENCE stays at P0 with an explicit P6 FAIL (a real attempt that disagreed with itself)', () => {
    const record = makeRecord({ status: 'CONFLICTING_EVIDENCE' });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    expect(result.maxLevel).toBe('P0');
    expect(result.gateResults.P6).toBe('FAIL');
  });
});

describe('the ladder is a STAIRCASE: a later PASS behind an earlier gap does not count', () => {
  it('P7 PASS with P6 not attempted does not raise maxLevel past P4/P6 baseline', () => {
    const record = makeRecord({ status: 'DISCOVERY_CANDIDATE', noveltyEvidence: NO_KNOWN_PRIOR, replication: null });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS', independentImplementation: 'PASS' });
    expect(result.maxLevel).toBe('P4'); // P6 is NOT_ATTEMPTED, so P7's PASS is stranded
    expect(result.gateResults.P7).toBe('PASS'); // still reported honestly
  });

  it('climbing to P8 requires every rung from P0 through P8 to PASS, and stays Tier B without externalValidation', () => {
    const record = makeRecord({ status: 'DISCOVERY', noveltyEvidence: NO_KNOWN_PRIOR, replication: REPLICATED, selfFalsification: ALL_PROBES_PASS, externalValidation: 'NOT_SOUGHT' });
    const upToP8: Record<Exclude<keyof ProofLadderInput, 'record'>, EvidenceSignal> = {
      replay: 'PASS', heldoutPrediction: 'PASS', predictionOrdering: 'PASS',
      independentImplementation: 'PASS', orthogonalMethod: 'PASS', causalEvidence: 'NOT_ATTEMPTED', externalAudit: 'NOT_ATTEMPTED',
    };
    const result = computeProofLadder({ record, ...upToP8 });
    expect(result.maxLevel).toBe('P8');
    expect(result.tier).toBe('B_EMPIRICAL');
  });
});

describe('Tier C requires externalValidation=CONFIRMED, not just P9/P10 gates', () => {
  const fullChainRecord = (externalValidation: DiscoveryRecord['externalValidation']) => makeRecord({
    status: 'DISCOVERY', noveltyEvidence: NO_KNOWN_PRIOR, replication: REPLICATED, selfFalsification: ALL_PROBES_PASS, externalValidation,
  });
  const allPass: Omit<ProofLadderInput, 'record'> = {
    replay: 'PASS', heldoutPrediction: 'PASS', predictionOrdering: 'PASS',
    independentImplementation: 'PASS', orthogonalMethod: 'PASS', causalEvidence: 'PASS', externalAudit: 'PASS',
  };

  it('THROWS when gates reach P10 but externalValidation is not CONFIRMED — an inconsistent record, not a lesser one', () => {
    expect(() => computeProofLadder({ record: fullChainRecord('PENDING'), ...allPass })).toThrow(/CONFIRMED/);
  });

  it('reaches Tier C only when both the gates AND externalValidation agree', () => {
    const result = computeProofLadder({ record: fullChainRecord('CONFIRMED'), ...allPass });
    expect(result.maxLevel).toBe('P10');
    expect(result.tier).toBe('C_VALIDATED');
  });
});

describe('renderTieredStatus never emits a bare status', () => {
  it('always carries tier and level', () => {
    const record = makeRecord({ status: 'DISCOVERY_CANDIDATE', noveltyEvidence: NO_KNOWN_PRIOR });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    const text = renderTieredStatus(result);
    expect(text).toContain('DISCOVERY_CANDIDATE');
    expect(text).toMatch(/Tier A_COMPUTATIONAL/);
    expect(text).toMatch(/max P4/);
  });
});

describe('the reproduction branch can NEVER climb into novelty territory (reviewer question)', () => {
  it('a REPRODUCTION record with every novelty-path signal PASSing still caps at P1 — reaching P3+ requires a different record, classified from scratch', () => {
    const record = makeRecord({ status: 'REPRODUCTION' });
    const everythingPasses: Omit<ProofLadderInput, 'record'> = {
      replay: 'PASS', heldoutPrediction: 'PASS', predictionOrdering: 'PASS',
      independentImplementation: 'PASS', orthogonalMethod: 'PASS', causalEvidence: 'PASS', externalAudit: 'PASS',
    };
    const result = computeProofLadder({ record, ...everythingPasses });
    expect(result.maxLevel).toBe('P1');
    expect(result.tier).toBe('A_COMPUTATIONAL');
    // The novelty rungs are reported as NOT_ATTEMPTED, never silently credited.
    expect(result.gateResults.P3).toBe('NOT_ATTEMPTED');
    expect(result.gateResults.P4).toBe('NOT_ATTEMPTED');
    expect(result.gateResults.P6).toBe('NOT_ATTEMPTED');
  });

  it('the same is true for KNOWN_RESULT — "we already knew this internally" is not a stepping stone to a novelty claim', () => {
    const record = makeRecord({ status: 'KNOWN_RESULT' });
    const result = computeProofLadder({
      record, replay: 'PASS', heldoutPrediction: 'PASS', predictionOrdering: 'PASS',
      independentImplementation: 'PASS', orthogonalMethod: 'PASS', causalEvidence: 'PASS', externalAudit: 'PASS',
    });
    expect(result.maxLevel).toBe('P1');
  });
});

describe('assertTieredStatusText — the presentation-layer guard', () => {
  it('THROWS on a bare "DISCOVERY" in text meant for a reader', () => {
    expect(() => assertTieredStatusText('Result: DISCOVERY', 'test surface')).toThrow(/bare "DISCOVERY"/);
  });

  it('accepts a properly tiered status', () => {
    expect(() => assertTieredStatusText('Result: DISCOVERY (Tier B_EMPIRICAL, max P6)', 'test surface')).not.toThrow();
  });

  it('allows the longer status names that are not unqualified verdicts', () => {
    expect(() => assertTieredStatusText('Result: DISCOVERY_CANDIDATE', 'test')).not.toThrow();
    expect(() => assertTieredStatusText('Result: FAILED_DISCOVERY', 'test')).not.toThrow();
  });

  it('allows the fixed product title', () => {
    expect(() => assertTieredStatusText('GENESIS DISCOVERY CERTIFICATE (v2.0.0)', 'test')).not.toThrow();
  });

  it('catches a bare occurrence even when a tiered one appears elsewhere in the same text', () => {
    const text = 'STATUS: DISCOVERY (Tier B_EMPIRICAL, max P6)\nSummary: this is a DISCOVERY.';
    expect(() => assertTieredStatusText(text, 'test')).toThrow();
  });
});

describe('every proof level is represented in the gate-results record', () => {
  it('all 11 levels P0-P10 always appear, never a sparse object', () => {
    const record = makeRecord({ status: 'REPRODUCTION' });
    const result = computeProofLadder({ record, ...ALL_NOT_ATTEMPTED, replay: 'PASS' });
    for (const level of PROOF_LEVELS) expect(result.gateResults[level]).toBeDefined();
    expect(Object.keys(result.gateResults).length).toBe(11);
  });
});
