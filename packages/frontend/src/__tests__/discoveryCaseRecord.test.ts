import { describe, expect, it } from 'vitest';
import {
  analyseExperimentSeries,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  designScientificExperiment,
  executeScientificExperiment,
  formulateScientificHypothesisCandidate,
  parseScienceChatMessage,
  replayDiscoveryCaseRecord,
  selectNextScientificExperiment,
  serializeDiscoveryCaseRecord,
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
  });

  it('blocks a case record when research does not cover the Evidence Chain domain', () => {
    const artifacts = realSchwarzschildArtifacts();
    const unrelatedResearch = createGenesisResearchPacket('Tesla silnik indukcyjny');
    const record = createDiscoveryCaseRecord({ research: unrelatedResearch, ...artifacts });

    expect(record.status).toBe('BLOCKED_ARTIFACT_MISMATCH');
    expect(record.blockingReasons).toEqual(expect.arrayContaining([
      expect.stringContaining('nie obejmuje domeny Evidence Chain'),
    ]));
  });
});
