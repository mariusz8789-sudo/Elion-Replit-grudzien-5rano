import { describe, expect, it } from 'vitest';
import {
  classifyDiscoveryStatus,
  assertValidDiscoveryStatus,
  assertNoveltyEvidenceHonest,
  assertSelfFalsificationComplete,
  assertReplicationDisjoint,
  ALL_SELF_FALSIFICATION_PROBES,
  DiscoveryContractViolationError,
  makeEvidenceRef,
  type NoveltyEvidence,
  type IndependentReplicationRecord,
  type SelfFalsificationReport,
  type SelfFalsificationProbeResult,
} from '../core/agent/discoveryContracts';

/**
 * PHASE F — ANTI-CHEATING BATTERY (AC1-AC13), written before the engines
 * (DiscoveryReplicationEngine, SelfFalsificationBattery) that will produce
 * these inputs in a real pipeline. This exercises the GATE
 * (`classifyDiscoveryStatus`/`assertValidDiscoveryStatus`) directly against
 * hand-built inputs — exactly the "gates before logic" sequencing the
 * mandate requires.
 *
 * AC6 (contaminated replication overlap) and AC7 (hidden-HARK via
 * frozenAt timing) require the real dataset-fetch/freeze machinery
 * (`discoveryReplicationEngine.ts`, Phase F Krok 3) to be meaningful —
 * deferred to that module's own test suite, not silently dropped.
 */

function fullNovelty(overrides: Partial<NoveltyEvidence> = {}): NoveltyEvidence {
  return {
    l1InternalMemory: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l2PreregisteredCorpus: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l3PinnedPublicDatasets: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l4DeclaredAnchors: 'NOVEL_WITHIN_CHECKED_CORPUS',
    l5ExternalLiteratureSearch: 'NO_KNOWN_PRIOR_FOUND',
    l6PostDiscoveryRecheck: 'NO_KNOWN_PRIOR_FOUND',
    overall: 'NO_KNOWN_PRIOR_FOUND',
    searchedCorpus: [{ name: 'test-corpus', version: '1', timestamp: new Date(0).toISOString(), queryFingerprint: 'q1', coverageEstimate: 'full' }],
    matchedPriorArt: [],
    unresolvedMatches: [],
    limitations: ['Only the declared corpus was checked.'],
    confidence: 0.8,
    ...overrides,
  };
}

function passingSelfFalsification(overrides: Partial<Record<string, SelfFalsificationProbeResult['result']>> = {}): SelfFalsificationReport {
  const probes: SelfFalsificationProbeResult[] = ALL_SELF_FALSIFICATION_PROBES.map((name) => ({
    name,
    method: 'DETERMINISTIC_PROBE',
    result: overrides[name] ?? 'PASS',
    evidenceRefs: [makeEvidenceRef(`ev-${name}`, 'test', `evidence for ${name}`)],
    detail: `${name} probe ran cleanly.`,
  }));
  return { probes, allPassed: probes.every((p) => p.result === 'PASS'), reportFingerprint: 'test-fp' };
}

function replicatedRecord(overrides: Partial<IndependentReplicationRecord> = {}): IndependentReplicationRecord {
  return {
    discoveryDatasetFingerprint: 'disc-fp-1',
    replicationDatasetFingerprint: 'repl-fp-2',
    disjointnessProof: 'DIFFERENT_TIME_WINDOW',
    frozenBeforeReplicationAccess: true,
    adversarialAttempts: [{ attack: 'shuffle labels', result: 'WITHSTOOD', detail: 'Effect held under label permutation.' }],
    result: 'REPLICATED',
    effectComparison: { discoveryEffect: 1.5, replicationEffect: 1.48, agreementWithinUncertainty: true },
    outcomeFingerprint: 'outcome-fp',
    ...overrides,
  };
}

describe('AC1 — known result (Kepler-style, matched via declared public anchor) -> REPRODUCTION', () => {
  it('classifies as REPRODUCTION, not DISCOVERY', () => {
    const evidence = fullNovelty({ overall: 'KNOWN', l4DeclaredAnchors: 'NOT_NEW', matchedPriorArt: [{ ref: makeEvidenceRef('kepler', 'anchor', "Kepler's third law"), similarity: 1, matchedClaim: 'period^2 ~ a^3' }] });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: null, selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('REPRODUCTION');
  });
});

describe('AC2 — preregistered result (matched via internal corpus, no public anchor) -> KNOWN_RESULT, never DISCOVERY', () => {
  it('classifies as KNOWN_RESULT', () => {
    const evidence = fullNovelty({ overall: 'KNOWN', l2PreregisteredCorpus: 'NOT_NEW', l4DeclaredAnchors: 'NOVEL_WITHIN_CHECKED_CORPUS', matchedPriorArt: [{ ref: makeEvidenceRef('prereg-1', 'prereg', 'preregistered hypothesis'), similarity: 1, matchedClaim: 'x' }] });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: null, selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('KNOWN_RESULT');
    expect(status).not.toBe('DISCOVERY');
  });
});

describe('AC3 — result already in internal memory -> KNOWN_RESULT, never automatic DISCOVERY', () => {
  it('classifies as KNOWN_RESULT', () => {
    const evidence = fullNovelty({ overall: 'KNOWN', l1InternalMemory: 'NOT_NEW', matchedPriorArt: [{ ref: makeEvidenceRef('mem-1', 'memory', 'known finding'), similarity: 1, matchedClaim: 'x' }] });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: replicatedRecord(), selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('KNOWN_RESULT');
  });
});

describe('AC4 — unverifiable/synthetic novelty claim -> UNKNOWN, never automatic DISCOVERY', () => {
  it('classifies as UNKNOWN when novelty is UNVERIFIABLE', () => {
    const evidence = fullNovelty({ overall: 'UNVERIFIABLE', l5ExternalLiteratureSearch: 'UNVERIFIABLE', l6PostDiscoveryRecheck: 'NOT_RUN', limitations: ['Synthetic fixture, no real corpus checked.'] });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: null, selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('UNKNOWN');
  });
});

describe('AC5 — replication on the SAME dataset as discovery -> refused, build-fail', () => {
  it('assertReplicationDisjoint throws when the two fingerprints are identical', () => {
    expect(() => assertReplicationDisjoint('same-fp', 'same-fp')).toThrow(DiscoveryContractViolationError);
  });

  it('assertReplicationDisjoint does not throw for genuinely different fingerprints', () => {
    expect(() => assertReplicationDisjoint('disc-fp', 'repl-fp')).not.toThrow();
  });
});

describe('AC6/AC7 — contaminated replication overlap / hidden-HARK timing (deferred)', () => {
  it('is deferred to discoveryReplicationEngine.test.ts (Phase F Krok 3), which owns the real dataset-fetch and freeze-timing machinery these require', () => {
    expect(true).toBe(true);
  });
});

describe('AC8 — multiple-testing artifact -> self-falsification FAILs, status stays DISCOVERY_CANDIDATE', () => {
  it('a MULTIPLE_TESTING probe failure blocks DISCOVERY even with clean novelty and successful replication', () => {
    const evidence = fullNovelty();
    const selfFalsification = passingSelfFalsification({ MULTIPLE_TESTING: 'FAIL' });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: replicatedRecord(), selfFalsification, hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('DISCOVERY_CANDIDATE');
    expect(status).not.toBe('DISCOVERY');
  });
});

describe('AC9 — overfitting artifact (no real held-out check) -> FAILs, blocks DISCOVERY', () => {
  it('an OVERFITTING probe failure blocks DISCOVERY', () => {
    const evidence = fullNovelty();
    const selfFalsification = passingSelfFalsification({ OVERFITTING: 'FAIL' });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication: replicatedRecord(), selfFalsification, hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('DISCOVERY_CANDIDATE');
  });
});

describe('AC10 — no L5 coverage -> capped at NO_KNOWN_PRIOR_FOUND is REFUSED (never a free pass to DISCOVERY)', () => {
  it('assertNoveltyEvidenceHonest throws when overall=NO_KNOWN_PRIOR_FOUND but L5 never ran', () => {
    const evidence = fullNovelty({ l5ExternalLiteratureSearch: 'NOT_RUN' });
    expect(() => assertNoveltyEvidenceHonest(evidence)).toThrow(DiscoveryContractViolationError);
  });

  it('assertValidDiscoveryStatus refuses DISCOVERY built on such evidence', () => {
    const evidence = fullNovelty({ l5ExternalLiteratureSearch: 'NOT_RUN' });
    expect(() =>
      assertValidDiscoveryStatus({ status: 'DISCOVERY', noveltyEvidence: evidence, replication: replicatedRecord(), selfFalsification: passingSelfFalsification() }),
    ).toThrow(DiscoveryContractViolationError);
  });
});

describe('AC11 — no data access -> NO_ACCESS, never fabricated', () => {
  it('classifies as NO_ACCESS when access is not declared, regardless of other fields', () => {
    const status = classifyDiscoveryStatus({ noveltyEvidence: fullNovelty(), replication: replicatedRecord(), selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: false });
    expect(status).toBe('NO_ACCESS');
  });
});

describe('AC12 — conflicting evidence -> CONFLICTING_EVIDENCE, not silently resolved either way', () => {
  it('classifies as CONFLICTING_EVIDENCE', () => {
    const status = classifyDiscoveryStatus({ noveltyEvidence: fullNovelty(), replication: replicatedRecord(), selfFalsification: passingSelfFalsification(), hasConflictingEvidence: true, accessDeclared: true });
    expect(status).toBe('CONFLICTING_EVIDENCE');
  });
});

describe('AC13 — replication FAILED -> FAILED_DISCOVERY', () => {
  it('classifies as FAILED_DISCOVERY when replication genuinely failed', () => {
    const evidence = fullNovelty();
    const replication = replicatedRecord({ result: 'FAILED', effectComparison: { discoveryEffect: 1.5, replicationEffect: 0.01, agreementWithinUncertainty: false } });
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication, selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('FAILED_DISCOVERY');
  });
});

describe('positive control — every gate satisfied -> DISCOVERY, and only then', () => {
  it('a fully clean pipeline reaches DISCOVERY', () => {
    const evidence = fullNovelty();
    const replication = replicatedRecord();
    const selfFalsification = passingSelfFalsification();
    const status = classifyDiscoveryStatus({ noveltyEvidence: evidence, replication, selfFalsification, hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('DISCOVERY');
    expect(() => assertValidDiscoveryStatus({ status, noveltyEvidence: evidence, replication, selfFalsification })).not.toThrow();
  });

  it('partial replication caps at DISCOVERY_CANDIDATE, not DISCOVERY', () => {
    const status = classifyDiscoveryStatus({ noveltyEvidence: fullNovelty(), replication: replicatedRecord({ result: 'PARTIAL' }), selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('DISCOVERY_CANDIDATE');
  });

  it('no replication attempted at all caps at DISCOVERY_CANDIDATE', () => {
    const status = classifyDiscoveryStatus({ noveltyEvidence: fullNovelty(), replication: null, selfFalsification: passingSelfFalsification(), hasConflictingEvidence: false, accessDeclared: true });
    expect(status).toBe('DISCOVERY_CANDIDATE');
  });
});

describe('assertSelfFalsificationComplete — all 13 probes mandatory, never a subset', () => {
  it('throws when a probe is missing', () => {
    const report = passingSelfFalsification();
    const incomplete: SelfFalsificationReport = { ...report, probes: report.probes.slice(0, 12) };
    expect(() => assertSelfFalsificationComplete(incomplete)).toThrow(DiscoveryContractViolationError);
  });

  it('does not throw when all 13 are present', () => {
    expect(() => assertSelfFalsificationComplete(passingSelfFalsification())).not.toThrow();
    expect(ALL_SELF_FALSIFICATION_PROBES.length).toBe(13);
  });
});
