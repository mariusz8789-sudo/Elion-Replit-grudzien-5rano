import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_CLASS_RANK,
  assertComparisonEvidenceClass,
  assertVetoEvidenceIsStrongest,
  classifyComparisonEvidenceClass,
  compareCountedOutcomes,
  selectDecisionComparison,
  strongestEvidenceClass,
  yieldsRiskRatio,
  type CountedOutcomeObservation,
  type SourceStudyIdentity,
} from '../core/agent/evidenceProvenance';

const STUDY_A: SourceStudyIdentity = {
  registry: 'CLINICALTRIALS_GOV',
  studyId: 'NCT00000001',
  title: 'Study A',
  sourceUrl: 'https://example.invalid/NCT00000001',
  contentSha256: 'aaaa',
  contentBytes: 10,
  retrievedAt: '2026-01-01T00:00:00.000Z',
  randomised: true,
};
const STUDY_B: SourceStudyIdentity = { ...STUDY_A, studyId: 'NCT00000002', title: 'Study B', contentSha256: 'bbbb' };
const COHORT: SourceStudyIdentity = { ...STUDY_A, studyId: 'NCT00000003', title: 'Cohort', contentSha256: 'cccc', randomised: false };

function obs(study: SourceStudyIdentity, groupId: string, numAffected: number, numAtRisk: number, term = 'Diarrhoea'): CountedOutcomeObservation {
  return {
    observationId: `${study.studyId}:${groupId}:${term}`,
    study,
    arm: { groupId, title: `arm ${groupId}`, nAtRisk: numAtRisk },
    term,
    numAffected,
    numAtRisk,
    codingSystem: null,
    population: 'test population',
  };
}

describe('evidence class is computed, never declared', () => {
  it('two arms of the SAME randomised study are DIRECT_RANDOMISED', () => {
    expect(classifyComparisonEvidenceClass(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_A, 'EG001', 5, 100))).toBe('DIRECT_RANDOMISED');
  });

  it('arms of DIFFERENT randomised studies are INDIRECT_RANDOMISED, however good each study is', () => {
    expect(classifyComparisonEvidenceClass(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_B, 'EG003', 5, 100))).toBe('INDIRECT_RANDOMISED');
  });

  it('a non-randomised source degrades the whole comparison to OBSERVATIONAL', () => {
    expect(classifyComparisonEvidenceClass(obs(COHORT, 'C1', 10, 100), obs(STUDY_A, 'EG003', 5, 100))).toBe('OBSERVATIONAL');
  });

  it('DIRECT outranks INDIRECT outranks POOLED outranks NETWORK', () => {
    expect(EVIDENCE_CLASS_RANK.DIRECT_RANDOMISED).toBeGreaterThan(EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED);
    expect(EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED).toBeGreaterThan(EVIDENCE_CLASS_RANK.POOLED_META);
    expect(EVIDENCE_CLASS_RANK.POOLED_META).toBeGreaterThan(EVIDENCE_CLASS_RANK.NETWORK_META);
    expect(EVIDENCE_CLASS_RANK.NETWORK_META).toBeGreaterThan(EVIDENCE_CLASS_RANK.OBSERVATIONAL);
  });

  it('spontaneous-report evidence cannot yield a risk ratio at all', () => {
    expect(yieldsRiskRatio('POST_MARKETING')).toBe(false);
    expect(yieldsRiskRatio('MECHANISTIC')).toBe(false);
    expect(yieldsRiskRatio('UNVERIFIED')).toBe(false);
    expect(yieldsRiskRatio('DIRECT_RANDOMISED')).toBe(true);
    expect(yieldsRiskRatio('OBSERVATIONAL')).toBe(true);
  });

  it('rejects an observation with no source study', () => {
    const orphan = { ...obs(STUDY_A, 'EG000', 10, 100), study: { ...STUDY_A, studyId: '  ' } };
    expect(() => classifyComparisonEvidenceClass(orphan, obs(STUDY_A, 'EG001', 5, 100))).toThrow(/empty studyId/);
  });

  it('rejects an observation with no arm', () => {
    const orphan = obs(STUDY_A, '  ', 10, 100);
    expect(() => classifyComparisonEvidenceClass(orphan, obs(STUDY_A, 'EG001', 5, 100))).toThrow(/empty arm groupId/);
  });

  it('rejects an arm denominator that disagrees with the outcome denominator', () => {
    const mismatched = { ...obs(STUDY_A, 'EG000', 10, 100), arm: { groupId: 'EG000', title: 'x', nAtRisk: 99 } };
    expect(() => classifyComparisonEvidenceClass(mismatched, obs(STUDY_A, 'EG001', 5, 100))).toThrow(/disagrees with outcome denominator/);
  });

  it('rejects more events than participants', () => {
    expect(() => classifyComparisonEvidenceClass(obs(STUDY_A, 'EG000', 101, 100), obs(STUDY_A, 'EG001', 5, 100))).toThrow(/exceeds numAtRisk/);
  });

  it('refuses to compare different outcome terms', () => {
    expect(() => classifyComparisonEvidenceClass(obs(STUDY_A, 'EG000', 10, 100, 'Nausea'), obs(STUDY_A, 'EG001', 5, 100, 'Diarrhoea'))).toThrow(/different outcome terms/);
  });

  it('refuses to compare an arm with itself', () => {
    expect(() => classifyComparisonEvidenceClass(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_A, 'EG000', 10, 100))).toThrow(/with itself/);
  });

  it('catches an evidenceClass that was written down rather than derived', () => {
    const real = compareCountedOutcomes(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_A, 'EG001', 5, 100))!;
    const forged = { ...real, evidenceClass: 'POST_MARKETING' as const };
    expect(() => assertComparisonEvidenceClass(forged, 'test')).toThrow(/computed, never declared/);
    expect(() => assertComparisonEvidenceClass(real, 'test')).not.toThrow();
  });
});

describe('risk ratio', () => {
  it('returns null rather than an invented interval when an arm has zero events', () => {
    expect(compareCountedOutcomes(obs(STUDY_A, 'EG000', 0, 100), obs(STUDY_A, 'EG001', 5, 100))).toBeNull();
    expect(compareCountedOutcomes(obs(STUDY_A, 'EG000', 5, 100), obs(STUDY_A, 'EG001', 0, 100))).toBeNull();
  });

  it('counts events, not participants, as the weight of a comparison', () => {
    const c = compareCountedOutcomes(obs(STUDY_A, 'EG000', 10, 1000), obs(STUDY_A, 'EG001', 5, 1000))!;
    expect(c.totalEvents).toBe(15);
    expect(c.riskRatio).toBeCloseTo(2, 10);
  });

  it('fingerprint does not move when only the retrieval clock moves', () => {
    const a = compareCountedOutcomes(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_A, 'EG001', 5, 100))!;
    const later: SourceStudyIdentity = { ...STUDY_A, retrievedAt: '2027-07-07T07:07:07.000Z' };
    const b = compareCountedOutcomes(obs(later, 'EG000', 10, 100), obs(later, 'EG001', 5, 100))!;
    expect(b.fingerprint).toBe(a.fingerprint);
  });

  it('fingerprint DOES move when the source bytes change', () => {
    const a = compareCountedOutcomes(obs(STUDY_A, 'EG000', 10, 100), obs(STUDY_A, 'EG001', 5, 100))!;
    const edited: SourceStudyIdentity = { ...STUDY_A, contentSha256: 'deadbeef' };
    const b = compareCountedOutcomes(obs(edited, 'EG000', 10, 100), obs(edited, 'EG001', 5, 100))!;
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });
});

describe('selection prefers evidence quality, never effect size', () => {
  const weakButDramatic = compareCountedOutcomes(obs(STUDY_A, 'EG000', 5, 16), obs(STUDY_B, 'EG003', 54, 469))!;
  const strongAndModest = compareCountedOutcomes(obs(STUDY_B, 'EG001', 77, 469), obs(STUDY_B, 'EG003', 54, 469))!;

  it('the dramatic comparison is the weak one here — that is the whole point', () => {
    expect(weakButDramatic.evidenceClass).toBe('INDIRECT_RANDOMISED');
    expect(strongAndModest.evidenceClass).toBe('DIRECT_RANDOMISED');
    expect(weakButDramatic.riskRatio).toBeGreaterThan(strongAndModest.riskRatio);
  });

  it('selects the direct comparison despite its smaller effect', () => {
    expect(selectDecisionComparison([weakButDramatic, strongAndModest])).toBe(strongAndModest);
    expect(selectDecisionComparison([strongAndModest, weakButDramatic])).toBe(strongAndModest);
    expect(strongestEvidenceClass([weakButDramatic, strongAndModest])).toBe('DIRECT_RANDOMISED');
  });

  it('breaks ties on events, not on effect size', () => {
    const few = compareCountedOutcomes(obs(STUDY_A, 'EG000', 30, 100), obs(STUDY_A, 'EG001', 10, 100))!;
    const many = compareCountedOutcomes(obs(STUDY_A, 'EG002', 120, 1000), obs(STUDY_A, 'EG003', 100, 1000))!;
    expect(few.riskRatio).toBeGreaterThan(many.riskRatio);
    expect(selectDecisionComparison([few, many])).toBe(many);
  });

  it('returns null on an empty set rather than inventing a comparison', () => {
    expect(selectDecisionComparison([])).toBeNull();
    expect(strongestEvidenceClass([])).toBeNull();
  });
});

describe('THE GATE: no veto from weaker evidence while stronger evidence exists', () => {
  const weak = compareCountedOutcomes(obs(STUDY_A, 'EG000', 5, 16), obs(STUDY_B, 'EG003', 54, 469))!;
  const strong = compareCountedOutcomes(obs(STUDY_B, 'EG001', 77, 469), obs(STUDY_B, 'EG003', 54, 469))!;

  it('refuses the weak veto and names what should have been used', () => {
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, strong], null, 'safety gate')).toThrow(/refusing to veto on INDIRECT_RANDOMISED/);
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, strong], null, 'safety gate')).toThrow(/DIRECT_RANDOMISED from NCT00000002/);
  });

  it('allows the weak veto only with a recorded, non-empty reason', () => {
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, strong], { reason: '', recordedBy: 'C1' }, 'safety gate')).toThrow(/refusing to veto/);
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, strong], { reason: 'direct arms are a different population', recordedBy: '' }, 'safety gate')).toThrow(/must name who recorded it/);
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, strong], { reason: 'direct arms are a different population', recordedBy: 'C1' }, 'safety gate')).not.toThrow();
  });

  it('allows the veto with no waiver when nothing stronger exists', () => {
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak], null, 'safety gate')).not.toThrow();
    expect(() => assertVetoEvidenceIsStrongest(strong, [weak, strong], null, 'safety gate')).not.toThrow();
  });

  it('a stronger comparison of a DIFFERENT outcome does not block this veto', () => {
    const otherTerm = compareCountedOutcomes(obs(STUDY_B, 'EG001', 90, 469, 'Nausea'), obs(STUDY_B, 'EG003', 84, 469, 'Nausea'))!;
    expect(() => assertVetoEvidenceIsStrongest(weak, [weak, otherTerm], null, 'safety gate')).not.toThrow();
  });

  it('a POST_MARKETING class cannot be smuggled in past the gate', () => {
    // The recompute fires first, which is the stronger of the two refusals:
    // a comparison built from two counted arms can never legitimately BE
    // post-marketing, so relabelling it is caught as a forged class rather
    // than merely as unusable evidence.
    const faers = { ...weak, evidenceClass: 'POST_MARKETING' as const };
    expect(() => assertVetoEvidenceIsStrongest(faers, [faers], null, 'safety gate')).toThrow(/computed, never declared/);
  });
});
