import { describe, expect, it } from 'vitest';
import {
  analyseExperimentSeries,
  concludeScientificDiscovery,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScientificReviewDecision,
  createScenarioCapsule,
  designScientificExperiment,
  executeScientificExperiment,
  formulateScientificHypothesisCandidate,
  parseScienceChatMessage,
  replayDiscoveryCaseRecord,
  replayScenarioCapsule,
  replayScientificConclusion,
  replayScientificReviewDecision,
  selectNextScientificExperiment,
  serializeDiscoveryCaseRecord,
  serializeScientificConclusion,
  serializeScientificReviewDecision,
} from '../core/experimentFabric';

function realSchwarzschildArtifacts() {
  const baselineRequest = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.');
  const observedDesign = designScientificExperiment({
    hypothesis: {
      statement: 'W granicach modelu Schwarzschilda promień horyzontu rośnie wraz z masą.',
      domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', declaredAssumptions: [],
      supplementalKnowledgeIds: ['einstein-general-relativity-static'],
      falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Przerejestrowana seria mas.' },
    },
    baselineRequest,
    sweep: { parameter: 'massSolar', values: [1, 2, 3], label: 'Masa M☉' },
    repetitionsPerArm: 1,
  });
  const nextDesign = designScientificExperiment({
    hypothesis: {
      statement: 'W granicach modelu Schwarzschilda relacja promienia i masy pozostaje dodatnia dla prerejestrowanego rozszerzenia.',
      domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', declaredAssumptions: [],
      supplementalKnowledgeIds: ['einstein-general-relativity-static'],
      falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Przerejestrowane rozszerzenie zakresu.' },
    },
    baselineRequest,
    sweep: { parameter: 'massSolar', values: [1, 4, 5], label: 'Masa M☉' },
    repetitionsPerArm: 1,
  });
  const evidence = executeScientificExperiment(observedDesign);
  const analysis = analyseExperimentSeries(evidence.allRuns, 'massSolar', 'radiusKm');
  const candidate = formulateScientificHypothesisCandidate(analysis, evidence);
  const nextSelection = selectNextScientificExperiment({ evidence, candidates: [nextDesign, observedDesign] });
  return { evidence, analysis, candidate, nextSelection };
}

describe('Genesis Discovery Case Record', () => {
  it('serializes and deterministically replays one complete, real, review-gated Discovery Loop', () => {
    const artifacts = realSchwarzschildArtifacts();
    const research = createGenesisResearchPacket('czarna dziura Schwarzschilda');
    const record = createDiscoveryCaseRecord({ research, ...artifacts });
    const replay = replayDiscoveryCaseRecord({ research, ...artifacts });

    expect(record.status).toBe('READY_FOR_REVIEW');
    expect(record.evidence.createdFromRealRunsOnly).toBe(true);
    expect(record.candidate.status).toBe('CANDIDATE_READY');
    expect(record.nextSelection?.status).toBe('SELECTED');
    expect(record.provenance).toMatchObject({
      researchPacketFingerprint: research.packetFingerprint,
      evidenceFingerprint: artifacts.evidence.provenanceFingerprint,
      candidateFingerprint: artifacts.candidate.selectionFingerprint,
      nextSelectionFingerprint: artifacts.nextSelection.selectionFingerprint,
    });
    expect(JSON.parse(serializeDiscoveryCaseRecord(record)).caseId).toBe(record.caseId);
    expect(replay.caseFingerprint).toBe(record.caseFingerprint);
    expect(record.disclaimer).toContain('Nie jest zatwierdzeniem hipotezy');

    const capsule = createScenarioCapsule({
      title: 'Schwarzschild discovery case',
      baselineRun: artifacts.evidence.allRuns[0],
      discoveryCase: record,
    });
    const capsuleReplay = replayScenarioCapsule(capsule);
    expect(capsule.references).toMatchObject({
      discoveryCaseId: record.caseId,
      discoveryCaseFingerprint: record.caseFingerprint,
    });
    expect(capsule.discovery?.record.caseFingerprint).toBe(record.caseFingerprint);
    expect(capsuleReplay.status).toBe('MATCH');
    expect(capsuleReplay.discovery).toMatchObject({
      status: 'RETAINED_DISCOVERY_CASE',
      caseId: record.caseId,
      evidenceFingerprint: record.provenance.evidenceFingerprint,
    });
  });

  it('records an explicitly declared human review for a real review-ready case without approving a protocol', () => {
    const artifacts = realSchwarzschildArtifacts();
    const research = createGenesisResearchPacket('czarna dziura Schwarzschilda');
    const record = createDiscoveryCaseRecord({ research, ...artifacts });
    const input = {
      reviewerReference: 'reviewer:independent-scientist-01',
      reviewedAt: '2026-08-22T01:30:00.000Z',
      decision: 'ACCEPT_FOR_PREREGISTRATION' as const,
      rationale: 'Obserwacja jest source-bound, odtwarzalna i kwalifikuje się wyłącznie do niezależnej prerejestracji follow-up.',
    };
    const review = createScientificReviewDecision(record, input);
    const replay = replayScientificReviewDecision(record, input);

    expect(review).toMatchObject({
      decision: 'ACCEPT_FOR_PREREGISTRATION',
      caseId: record.caseId,
      caseFingerprint: record.caseFingerprint,
      candidateFingerprint: record.candidate.selectionFingerprint,
      evidenceFingerprint: record.evidence.provenanceFingerprint,
      provenance: {
        reviewerIdentity: 'DECLARED_NOT_VERIFIED',
        caseStatusAtReview: 'READY_FOR_REVIEW',
      },
    });
    expect(JSON.parse(serializeScientificReviewDecision(review)).reviewId).toBe(review.reviewId);
    expect(replay.reviewFingerprint).toBe(review.reviewFingerprint);
    expect(review.disclaimer).toContain('nie uruchamia eksperymentu');
  });

  it('derives a source-bound, conservative conclusion from a real case without claiming discovery', () => {
    const artifacts = realSchwarzschildArtifacts();
    const research = createGenesisResearchPacket('czarna dziura Schwarzschilda');
    const record = createDiscoveryCaseRecord({ research, ...artifacts });
    const review = createScientificReviewDecision(record, {
      reviewerReference: 'reviewer:independent-scientist-01',
      reviewedAt: '2026-08-22T01:30:00.000Z',
      decision: 'ACCEPT_FOR_PREREGISTRATION',
      rationale: 'Replikowalne source-bound evidence może być ocenione wyłącznie w granicach prerejestrowanego protokołu.',
    });
    const conclusion = concludeScientificDiscovery(record, review);
    const replay = replayScientificConclusion(record, review);

    expect(conclusion).toMatchObject({
      status: 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL',
      reviewStatus: 'DECLARED_REVIEW_RECORDED',
      protocolAssessment: 'SUPPORTED_WITHIN_PROTOCOL',
      evidenceId: artifacts.evidence.evidenceId,
      provenance: {
        caseFingerprint: record.caseFingerprint,
        reviewFingerprint: review.reviewFingerprint,
      },
    });
    expect(conclusion.statement).toContain('prerejestrowanego protokołu');
    expect(conclusion.disclaimer).toContain('nie ogłasza odkrycia');
    expect(JSON.parse(serializeScientificConclusion(conclusion)).conclusionId).toBe(conclusion.conclusionId);
    expect(replay.conclusionFingerprint).toBe(conclusion.conclusionFingerprint);

    const mismatchedReview = { ...review, evidenceFingerprint: 'evidence_mismatch' };
    expect(concludeScientificDiscovery(record, mismatchedReview).status).toBe('BLOCKED_REVIEW_MISMATCH');
  });

  it('blocks a case record when research does not cover the Evidence Chain domain', () => {
    const artifacts = realSchwarzschildArtifacts();
    const unrelatedResearch = createGenesisResearchPacket('Tesla silnik indukcyjny');
    const record = createDiscoveryCaseRecord({ research: unrelatedResearch, ...artifacts });

    expect(record.status).toBe('BLOCKED_ARTIFACT_MISMATCH');
    expect(record.blockingReasons).toEqual(expect.arrayContaining([
      expect.stringContaining('nie obejmuje domeny Evidence Chain'),
    ]));
    expect(() => createScenarioCapsule({
      title: 'Blocked discovery case',
      baselineRun: artifacts.evidence.allRuns[0],
      discoveryCase: record,
    })).toThrow('READY_FOR_REVIEW');
    expect(() => createScientificReviewDecision(record, {
      reviewerReference: 'reviewer:independent-scientist-01',
      reviewedAt: '2026-08-22T01:30:00.000Z',
      decision: 'RETURN_FOR_MORE_EVIDENCE',
      rationale: 'Brak zgodnego source-bound case nie pozwala rozpocząć review.',
    })).toThrow('READY_FOR_REVIEW');
  });
});
