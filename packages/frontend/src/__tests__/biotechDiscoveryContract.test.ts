import { describe, expect, it } from 'vitest';
import {
  biotechScientificFingerprint,
  isPredictiveBiotechStatus,
  type BiologicalEvidence,
  biologicalExperimentRequestFingerprint,
  type TherapeuticCandidate,
  type TherapeuticHypothesis,
} from '../core/biotechDiscoveryContract';

const evidence: BiologicalEvidence = {
  kind: 'biological-evidence',
  id: 'evidence-1',
  namespace: 'example',
  label: 'Example evidence',
  status: 'LITERATURE_SUPPORTED',
  claim: 'A bounded biological claim.',
  subjectIds: ['compound-1'],
  provenance: [{ source: 'UNSPECIFIED', sourceId: 'UNSPECIFIED', evidenceType: 'UNSPECIFIED', status: 'UNKNOWN' }],
};

describe('biotech discovery contract', () => {
  it('fingerprints scientific identity and is stable under object key order', () => {
    const reordered = { ...evidence, provenance: [{ ...evidence.provenance[0] }], subjectIds: ['compound-1'] };
    expect(biotechScientificFingerprint(evidence)).toBe(biotechScientificFingerprint(reordered));
    expect(biotechScientificFingerprint({ ...evidence, claim: 'A changed biological claim.' } as BiologicalEvidence)).not.toBe(biotechScientificFingerprint(evidence));
  });

  it('represents candidate to evidence, target, safety and hypothesis by stable IDs', () => {
    const candidate: TherapeuticCandidate = {
      kind: 'therapeutic-candidate', id: 'candidate-1', namespace: 'example', label: 'Example candidate', status: 'HYPOTHESIS',
      materialId: 'material-1', compoundIds: ['compound-1'], targetIds: ['target-1'], mechanismIds: ['mechanism-1'],
      supportingEvidenceIds: ['evidence-1'], safetySignalIds: ['safety-1'], hypothesisIds: ['hypothesis-1'], provenance: [],
    };
    const hypothesis: TherapeuticHypothesis = {
      kind: 'therapeutic-hypothesis', id: 'hypothesis-1', namespace: 'example', label: 'Example hypothesis', status: 'HYPOTHESIS',
      claim: 'A bounded hypothesis.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: candidate.mechanismIds,
      supportingEvidenceIds: candidate.supportingEvidenceIds, safetySignalIds: candidate.safetySignalIds, provenance: [],
    };
    expect(candidate.supportingEvidenceIds).toContain(evidence.id);
    expect(hypothesis.candidateId).toBe(candidate.id);
    expect(hypothesis.supportingEvidenceIds).toEqual(candidate.supportingEvidenceIds);
  });

  it('represents hypothesis to biological experiment without claiming execution', () => {
    const request = {
      hypothesisId: 'hypothesis-1', candidateId: 'candidate-1', targetIds: ['target-1'],
      researchQuestion: 'What should be measured?', primaryMetric: 'defined-metric', constraints: { assay: 'example' },
    } as const;
    expect(biologicalExperimentRequestFingerprint(request)).toMatch(/^[0-9a-f]{8}$/);
    expect({ ...request, targetIds: ['target-2'] }).not.toEqual(request);
  });

  it('keeps predictive statuses distinct from established fact', () => {
    expect(isPredictiveBiotechStatus('PREDICTION')).toBe(true);
    expect(isPredictiveBiotechStatus('INFERENCE')).toBe(true);
    expect(isPredictiveBiotechStatus('HYPOTHESIS')).toBe(true);
    expect(isPredictiveBiotechStatus('FACT')).toBe(false);
    expect(isPredictiveBiotechStatus('UNKNOWN')).toBe(false);
  });
});
