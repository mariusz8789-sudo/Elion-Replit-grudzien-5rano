import { describe, expect, it } from 'vitest';
import {
  AGING_LAB_KNOWLEDGE_SOURCE,
  createAgingModelDataRequirement,
  rankAgingEvidenceCandidates,
} from '../core/experimentFabric/agingEvidenceRanking';

describe('Aging Lab evidence ranking', () => {
  const completeEvidence = {
    knowledgeSources: [{
      sourceId: 'review-1',
      title: 'Reviewed senescence source',
      epistemicStatus: 'PRECLINICAL' as const,
      provenanceReference: 'PMID:example',
    }],
    evidenceQuality: 0.8,
    reproducibilityCoverage: 0.7,
    mechanismCoverage: 0.9,
    safetyCoverage: 0.4,
    oncogenicRiskCharacterization: 0.5,
    dataCoverage: 0.6,
    declaredLimitations: ['Preclinical evidence only.'],
  };

  it('ranks supplied evidence record completeness deterministically without biological efficacy claims', () => {
    const rows = rankAgingEvidenceCandidates([
      { candidateId: 'beta', label: 'Candidate B', ...completeEvidence },
      { candidateId: 'alpha', label: 'Candidate A', ...completeEvidence },
    ]);

    expect(rows.map((row) => row.candidateId)).toEqual(['alpha', 'beta']);
    expect(rows[0]).toMatchObject({
      disposition: 'EVIDENCE_REVIEW_REQUIRED',
      evidenceReadinessScore: 67,
      sourceCount: 1,
      epistemicStatuses: ['PRECLINICAL'],
    });
    expect(rows[0].disclaimer).toContain('Nie przewiduje skuteczności biologicznej');
    expect(rows[0].disclaimer).toContain('nie stanowi rekomendacji terapii');
  });

  it('returns DATA_REQUIRED rather than fabricating a score for incomplete evidence', () => {
    const [row] = rankAgingEvidenceCandidates([{
      candidateId: 'incomplete',
      label: 'Incomplete record',
      knowledgeSources: [],
      evidenceQuality: 0.8,
      declaredLimitations: [],
    }]);

    expect(row).toMatchObject({ disposition: 'DATA_REQUIRED', evidenceReadinessScore: null, sourceCount: 0 });
    expect(row.missingFields).toEqual(expect.arrayContaining(['knowledgeSources', 'reproducibilityCoverage', 'dataCoverage']));
  });

  it('rejects invalid evidence assessments instead of silently clamping them', () => {
    expect(() => rankAgingEvidenceCandidates([{
      candidateId: 'invalid', label: 'Invalid', ...completeEvidence, safetyCoverage: 1.1,
    }])).toThrow('safetyCoverage');
  });

  it('creates an explicit DATA_REQUIRED seam for future biological execution', () => {
    const requirement = createAgingModelDataRequirement('senescence marker dynamics');
    expect(requirement).toMatchObject({
      domainId: 'biology-aging-lab',
      status: 'DATA_REQUIRED',
      requestedModel: 'senescence marker dynamics',
    });
    expect(requirement.requiredProvenance).toContain('dataset version and content hash');
    expect(requirement.limitation).toContain('nie tworzy wyniku zastępczego');
    expect(AGING_LAB_KNOWLEDGE_SOURCE).toBe('biology-aging-senescence-cancer.md');
  });
});
