/**
 * GENESIS GALAXY ROTATION-CURVE DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the common Discovery loop using the existing deterministic galaxy
 * rotation model in Experiment Fabric. The bounded result concerns only the
 * registered pseudo-isothermal halo parameterization at its fixed marker
 * radius; it does not fit observed galaxies or decide CDM versus MOND.
 */
import {
  analyseExperimentSeries,
  concludeScientificDiscovery,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScenarioCapsule,
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperiment,
  formulateScientificHypothesisCandidate,
  replayDiscoveryCaseRecord,
  replayScenarioCapsule,
  selectNextScientificExperiment,
} from '../packages/frontend/src/core/experimentFabric/index';

const MODEL_ID = 'universe-rotation-curve';
const DOMAIN_ID = 'universe';

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded scan parametru halo pseudo-izotermicznego dla istniejącej krzywej rotacji Genesis.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { haloVInf: 0, altGravity: false },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym modelu wykładniczego dysku z halo pseudo-izotermicznym większa prerejestrowana wartość haloVInf zwiększa modelowaną prędkość rotacji przy stałym markerRadiusKpc.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model używa przybliżenia sferycznie symetrycznego dla wykładniczego dysku oraz halo pseudo-izotermicznego przy stałym punkcie markerRadiusKpc.',
      'Wszystkie runy korzystają z gałęzi halo (altGravity=false); MOND nie jest oceniane tym protokołem.',
      'Seria obejmuje wyłącznie prerejestrowane wartości haloVInf: 0, 110 i 220 km/s.',
      'Wynik nie jest dopasowaniem do danych konkretnej galaktyki, pomiarem astronomicznym ani rozstrzygnięciem CDM kontra MOND.',
    ],
    falsification: {
      metric: 'modeledVelocityKmS',
      relation: 'monotonic-increase',
      rationale: 'W prerejestrowanej rosnącej serii haloVInf=110→220 km/s modelowana prędkość w stałym markerze musi nie maleć.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'haloVInf', values: [0, 110, 220], label: 'prędkość graniczna halo (km/s)' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym modelu krzywej rotacji zwiększenie haloVInf od 150 do 180 km/s nie zmniejsza modeledVelocityKmS w stałym markerze.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje gałąź halo pseudo-izotermicznego i ustalony markerRadiusKpc.',
      'To osobno prerejestrowany protokół; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'modeledVelocityKmS',
      relation: 'monotonic-increase',
      rationale: 'W kolejności 150→180 km/s następna wartość modelowana nie może maleć.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { haloVInf: 150, altGravity: false } },
  sweep: { parameter: 'haloVInf', values: [150, 180], label: 'walidacyjna prędkość graniczna halo (km/s)' },
  repetitionsPerArm: 2,
});

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function main(): void {
  const chain = executeScientificExperiment(design);
  const rerunChain = executeScientificExperiment(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('galaktyka krzywa rotacji halo pseudo-izotermiczne ciemna materia MOND');
  const analysis = analyseExperimentSeries(chain.allRuns, 'haloVInf', 'modeledVelocityKmS');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.haloVInf === 0);
  if (!baselineRun) throw new Error('Rotation-curve Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Galaxy rotation-curve halo parameter scan at fixed marker radius',
    baselineRun,
    evidencePack,
    discoveryCase,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const byHalo = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.haloVInf), arm.outputValues[0]];
  }));
  const assertions = {
    sixRealRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    armsAreDeterministic: chain.arms.length === 3 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allModeledVelocitiesFinite: Object.values(byHalo).every(finitePositive),
    observedSeriesIsStrictlyIncreasing: byHalo['0'] < byHalo['110'] && byHalo['110'] < byHalo['220'],
    independentProtocolRerunMatches: rerunChain.provenanceFingerprint === chain.provenanceFingerprint
      && rerunChain.allRuns.every((run, index) => run.provenance.runFingerprint === chain.allRuns[index]?.provenance.runFingerprint),
    evidencePackIsComplete: evidencePack.runCount === 6 && evidencePack.reproducibility.allArmsMatched,
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    correlationCandidateIsReviewGated: candidate.status === 'CANDIDATE_READY' && discoveryCase.status === 'READY_FOR_REVIEW',
    conservativeConclusion: conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' && conclusion.reviewStatus === 'NOT_REVIEWED',
    discoveryCaseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    scenarioCapsuleRetainsReviewGatedCase: capsuleReplay.status === 'MATCH' && capsuleReplay.discovery?.status === 'RETAINED_DISCOVERY_CASE',
    followUpIsPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Rotation-curve Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byHalo, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    model: MODEL_ID,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    candidate: candidate.status,
    discoveryCase: discoveryCase.status,
    conclusion: conclusion.status,
    modeledVelocityKmSByHaloVInf: byHalo,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded parameter scan of the existing pseudo-isothermal halo branch at a fixed marker radius. It is not an observational galaxy fit, a measurement, or a verdict on CDM versus MOND.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — rotation-curve Discovery Case:', error);
  process.exit(1);
}
