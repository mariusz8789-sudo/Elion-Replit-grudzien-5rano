import { describe, expect, it } from 'vitest';
import { rerankWithRealEvidence, selectNextRealEvidenceCandidate, type RealEvidenceRerankResult } from '../core/biotechData/biotechRealEvidenceRerank';
import { verifyPredictionAgainstRealExperiment, type PredictionVerification } from '../core/agent/predictionVerification';
import type { CandidateDiscoveryReport } from '../core/biotechDiscoveryContract';
import { resolveNaturalFunctionalReplacement } from '../core/biotechData/naturalReplacement';
import { createReferenceMeasurementRun, type ReferenceMeasurementRequest } from '../core/experimentFabric/realExperiment';
import { EXPERIMENT_FABRIC_VERSION, type StructuredExperimentRequest } from '../core/experimentFabric/types';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

const report = (id: string, score: number | null, withRanking = true): CandidateDiscoveryReport => ({
  reportId: `report:${id}`,
  candidateId: id,
  materialId: `material:${id}`,
  compoundIds: [`compound:${id}`],
  targetIds: ['A1'],
  mechanismIds: [],
  evidenceIds: [`evidence:${id}`],
  safetySignalIds: [`safety:${id}`],
  hypothesisId: `hypothesis:${id}`,
  ranking: withRanking && score !== null ? {
    candidateId: id, score,
    components: { evidenceQuality: 0.5, targetRelevance: 0.5, safetyPenalty: 0.5, uncertaintyPenalty: 0.5 },
    rationale: 'test fixture', uncertainty: 'test fixture', epistemicStatus: 'PREDICTION',
  } : undefined,
  epistemicStatus: 'PREDICTION',
  scientificEvidenceStatus: 'PREDICTION',
  clinicalEfficacy: 'UNKNOWN',
  uncertainty: 'test fixture',
  provenance: [],
  scientificFingerprint: `fingerprint:${id}`,
});

const verification = (assessment: PredictionVerification['assessment'], predictedValue = 1, observedValue: number | null = 1): PredictionVerification => ({
  contractVersion: '1.0.0',
  predictedValue,
  observedValue,
  criterion: { metric: 'targetRelevance', relation: 'equal-within-tolerance', tolerance: 0.1, rationale: 'test fixture' },
  outcome: null,
  assessment,
  message: 'test fixture',
});

describe('rerankWithRealEvidence', () => {
  it('no real evidence submitted → KEEP, simulated ranking unchanged', () => {
    const [result] = rerankWithRealEvidence([report('a', 0.9)], new Map());
    expect(result.recommendation).toBe('KEEP');
    expect(result.realAssessment).toBeNull();
    expect(result.simulatedScore).toBe(0.9);
    expect(result.why).toMatch(/no real or cited evidence/);
  });

  it('FALSIFIED_WITHIN_PROTOCOL beats a high simulatedScore — always DROP', () => {
    const [result] = rerankWithRealEvidence(
      [report('a', 0.95)],
      new Map([['a', verification('FALSIFIED_WITHIN_PROTOCOL')]]),
    );
    expect(result.recommendation).toBe('DROP');
    expect(result.realAssessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(result.why).toContain('despite simulatedScore=0.95');
  });

  it('FALSIFIED_WITHIN_PROTOCOL still drops a candidate with no ranking at all', () => {
    const [result] = rerankWithRealEvidence(
      [report('a', null, false)],
      new Map([['a', verification('FALSIFIED_WITHIN_PROTOCOL')]]),
    );
    expect(result.recommendation).toBe('DROP');
    expect(result.simulatedScore).toBeNull();
    expect(result.why).toContain('no simulatedScore');
  });

  it('SUPPORTED_WITHIN_PROTOCOL → PROMOTE', () => {
    const [result] = rerankWithRealEvidence(
      [report('a', 0.4)],
      new Map([['a', verification('SUPPORTED_WITHIN_PROTOCOL')]]),
    );
    expect(result.recommendation).toBe('PROMOTE');
    expect(result.realAssessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });

  it('INCONCLUSIVE → KEEP, same treatment as no evidence', () => {
    const [result] = rerankWithRealEvidence(
      [report('a', 0.4)],
      new Map([['a', verification('INCONCLUSIVE')]]),
    );
    expect(result.recommendation).toBe('KEEP');
    expect(result.realAssessment).toBe('INCONCLUSIVE');
  });

  it('never modifies report.ranking.score or any input field', () => {
    const r = report('a', 0.77);
    const before = JSON.stringify(r);
    rerankWithRealEvidence([r], new Map([['a', verification('FALSIFIED_WITHIN_PROTOCOL')]]));
    expect(JSON.stringify(r)).toBe(before);
  });

  it('processes multiple candidates independently', () => {
    const results = rerankWithRealEvidence(
      [report('a', 0.9), report('b', 0.5), report('c', 0.2)],
      new Map([['a', verification('FALSIFIED_WITHIN_PROTOCOL')], ['b', verification('SUPPORTED_WITHIN_PROTOCOL')]]),
    );
    expect(results.map((r) => r.recommendation)).toEqual(['DROP', 'PROMOTE', 'KEEP']);
  });
});

describe('selectNextRealEvidenceCandidate', () => {
  it('selects the highest simulatedScore among eligible candidates', () => {
    const results = rerankWithRealEvidence([report('a', 0.3), report('b', 0.9), report('c', 0.6)], new Map());
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBe('b');
    expect(selection.whyNotAlternative).toContain('c');
  });

  it('excludes DROPPED candidates', () => {
    const results = rerankWithRealEvidence(
      [report('a', 0.99), report('b', 0.5)],
      new Map([['a', verification('FALSIFIED_WITHIN_PROTOCOL')]]),
    );
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBe('b');
  });

  it('excludes candidates that already have real evidence (do not duplicate)', () => {
    const results = rerankWithRealEvidence(
      [report('a', 0.99), report('b', 0.5)],
      new Map([['a', verification('SUPPORTED_WITHIN_PROTOCOL')]]),
    );
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBe('b');
  });

  it('excludes candidates with an already-outstanding request', () => {
    const results = rerankWithRealEvidence([report('a', 0.99), report('b', 0.5)], new Map());
    const selection = selectNextRealEvidenceCandidate(results, new Set(['a']));
    expect(selection.selectedCandidateId).toBe('b');
  });

  it('ties broken deterministically by candidateId', () => {
    const results = rerankWithRealEvidence([report('b', 0.5), report('a', 0.5)], new Map());
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBe('a');
  });

  it('no eligible candidates → null with an explanatory why', () => {
    const results = rerankWithRealEvidence([report('a', 0.9)], new Map([['a', verification('SUPPORTED_WITHIN_PROTOCOL')]]));
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBeNull();
    expect(selection.why).toBeTruthy();
    expect(selection.whyNotAlternative).toBe('n/a');
  });

  it('null simulatedScore treated as 0 for sorting only, field itself untouched', () => {
    const results: RealEvidenceRerankResult[] = [
      { candidateId: 'a', reportId: 'r:a', simulatedScore: null, realAssessment: null, recommendation: 'KEEP', why: 'x' },
      { candidateId: 'b', reportId: 'r:b', simulatedScore: 0.1, realAssessment: null, recommendation: 'KEEP', why: 'x' },
    ];
    const selection = selectNextRealEvidenceCandidate(results, new Set());
    expect(selection.selectedCandidateId).toBe('b');
    expect(results[0]!.simulatedScore).toBeNull();
  });

  it('empty input → null selection', () => {
    const selection = selectNextRealEvidenceCandidate([], new Set());
    expect(selection.selectedCandidateId).toBeNull();
  });
});

/**
 * END-TO-END WITH THE REAL PINNED DATASET — not synthetic fixtures. Proves
 * the module composes with the real natural-replacement pipeline
 * (`naturalReplacement.ts`) and the real comparator
 * (`verifyPredictionAgainstRealExperiment`) that Dome World already uses,
 * exactly the seam this module was built to close.
 */
describe('real-data integration: naturalReplacement -> verifyPredictionAgainstRealExperiment -> rerank -> next selection', () => {
  function structuredRequestFor(sourceText: string): StructuredExperimentRequest {
    return { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText, domainId: 'biotech-real-evidence-rerank-test', operation: 'compute', parameters: {} };
  }

  it('a real candidate falsified by a cited reference figure is dropped despite its real simulated score', () => {
    const resolved = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
    expect(resolved.status).toBe('RESOLVED');
    if (resolved.status !== 'RESOLVED') throw new Error('unreachable');

    const withRanking = resolved.reports.filter((r) => r.ranking !== undefined && r.ranking.score > 0);
    expect(withRanking.length).toBeGreaterThan(0);
    const target = withRanking[0]!;

    const criterion: FalsificationCriterion = {
      metric: 'targetRelevance', relation: 'equal-within-tolerance', tolerance: 0.05,
      rationale: 'Real cited target-relevance figure judged against this candidate\'s own predicted component.',
    };
    const request: ReferenceMeasurementRequest = {
      structuredRequest: structuredRequestFor(`Cited target-relevance figure for ${target.candidateId}`),
      citation: { citationText: 'Independently cited assay figure contradicting the predicted target relevance (test fixture, real comparator).', sourceRef: 'test-fixture-reference' },
    };
    // A cited value far from the prediction so the real comparator falsifies it.
    const realRun = createReferenceMeasurementRun({
      request,
      derived: [{ outputKey: 'targetRelevance', value: 0, unit: 'score' }],
      summary: 'Cited figure contradicts the predicted target relevance.',
    });
    const verification = verifyPredictionAgainstRealExperiment({
      predictedValue: target.ranking!.components.targetRelevance,
      criterion, realRun,
    });
    expect(verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');

    const [result] = rerankWithRealEvidence([target], new Map([[target.candidateId, verification]]));
    expect(result.recommendation).toBe('DROP');
    expect(result.simulatedScore).toBe(target.ranking!.score);

    const selection = selectNextRealEvidenceCandidate([result], new Set());
    expect(selection.selectedCandidateId).toBeNull();
  });

  it('a real candidate supported by a cited reference figure is promoted and no longer selected for further evidence-gathering', () => {
    const resolved = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
    if (resolved.status !== 'RESOLVED') throw new Error('unreachable');
    const withRanking = resolved.reports.filter((r) => r.ranking !== undefined);
    const target = withRanking[0]!;

    const criterion: FalsificationCriterion = {
      metric: 'targetRelevance', relation: 'equal-within-tolerance', tolerance: 0.5,
      rationale: 'Real cited target-relevance figure judged against this candidate\'s own predicted component.',
    };
    const request: ReferenceMeasurementRequest = {
      structuredRequest: structuredRequestFor(`Cited target-relevance figure for ${target.candidateId}`),
      citation: { citationText: 'Independently cited assay figure consistent with the predicted target relevance (test fixture, real comparator).', sourceRef: 'test-fixture-reference' },
    };
    const realRun = createReferenceMeasurementRun({
      request,
      derived: [{ outputKey: 'targetRelevance', value: target.ranking!.components.targetRelevance, unit: 'score' }],
      summary: 'Cited figure matches the predicted target relevance.',
    });
    const verification = verifyPredictionAgainstRealExperiment({
      predictedValue: target.ranking!.components.targetRelevance,
      criterion, realRun,
    });
    expect(verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');

    const [result] = rerankWithRealEvidence(resolved.reports.filter((r) => r.ranking !== undefined), new Map([[target.candidateId, verification]]));
    expect(result.recommendation).toBe('PROMOTE');

    // Already resolved by real evidence — the adaptive selector must not re-request it.
    const allResults = rerankWithRealEvidence(withRanking, new Map([[target.candidateId, verification]]));
    const selection = selectNextRealEvidenceCandidate(allResults, new Set());
    expect(selection.selectedCandidateId).not.toBe(target.candidateId);
  });
});
