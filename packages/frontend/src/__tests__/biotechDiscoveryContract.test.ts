import { describe, expect, it } from 'vitest';
import {
  biotechScientificFingerprint,
  createCandidateDiscoveryReport,
  rankTherapeuticCandidate,
  isPredictiveBiotechStatus,
  type BiologicalEvidence,
  biologicalExperimentRequestFingerprint,
  type TherapeuticCandidate,
  type TherapeuticHypothesis,
  type SafetySignal,
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

  it('builds a deterministic structured candidate discovery report', () => {
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
    const report = createCandidateDiscoveryReport({ candidate, hypothesis, uncertainty: 'Synthetic demo; no biological validation.' });
    expect(report.reportId).toBe(`report:${report.scientificFingerprint}`);
    expect(report.evidenceIds).toEqual(['evidence-1']);
    expect(report.safetySignalIds).toEqual(['safety-1']);
    expect(report.epistemicStatus).toBe('HYPOTHESIS');
    expect(report.uncertainty).toContain('no biological validation');
  });

  it('represents hypothesis to biological experiment without claiming execution', () => {
    const request = {
      hypothesisId: 'hypothesis-1', candidateId: 'candidate-1', targetIds: ['target-1'],
      researchQuestion: 'What should be measured?', primaryMetric: 'defined-metric', constraints: { assay: 'example' },
    } as const;
    expect(biologicalExperimentRequestFingerprint(request)).toMatch(/^[0-9a-f]{8}$/);
    expect({ ...request, targetIds: ['target-2'] }).not.toEqual(request);
  });

  it('ranks research priority with explicit components, not efficacy probability', () => {
    const candidate: TherapeuticCandidate = {
      kind: 'therapeutic-candidate', id: 'candidate-rank', namespace: 'synthetic-demo', label: 'Synthetic demo candidate', status: 'HYPOTHESIS',
      materialId: 'material-demo', compoundIds: ['compound-demo'], targetIds: ['target-demo'], mechanismIds: ['mechanism-demo'],
      supportingEvidenceIds: ['evidence-demo'], safetySignalIds: ['safety-demo'], hypothesisIds: ['hypothesis-demo'], provenance: [],
    };
    const ranked = rankTherapeuticCandidate({ candidate, evidenceQuality: 'HIGH', targetRelevance: 1, safetySignals: [], uncertaintyPenalty: 0.25 });
    expect(ranked.candidateId).toBe(candidate.id);
    expect(ranked.score).toBe(0.675);
    expect(ranked.components).toEqual({ evidenceQuality: 1, targetRelevance: 1, safetyPenalty: 0, uncertaintyPenalty: 0.25 });
    expect(ranked.epistemicStatus).toBe('PREDICTION');
    expect(ranked.rationale).toContain('not efficacy or probability');
  });

  it('keeps safety signals explicit without inventing a safety score', () => {
    const signal: SafetySignal = {
      kind: 'safety-signal', id: 'safety-demo', namespace: 'synthetic-demo', label: 'Synthetic demo safety signal', status: 'UNKNOWN',
      signalType: 'uncertainty', description: 'Synthetic demo only.', evidenceQuality: 'UNKNOWN', uncertainty: 'Not assessed.', provenance: [],
    };
    expect(signal.evidenceQuality).toBe('UNKNOWN');
    expect(signal.uncertainty).toBe('Not assessed.');
    expect(signal).not.toHaveProperty('score');
  });

  it('keeps predictive statuses distinct from established fact', () => {
    expect(isPredictiveBiotechStatus('PREDICTION')).toBe(true);
    expect(isPredictiveBiotechStatus('INFERENCE')).toBe(true);
    expect(isPredictiveBiotechStatus('HYPOTHESIS')).toBe(true);
    expect(isPredictiveBiotechStatus('FACT')).toBe(false);
    expect(isPredictiveBiotechStatus('UNKNOWN')).toBe(false);
  });
});
