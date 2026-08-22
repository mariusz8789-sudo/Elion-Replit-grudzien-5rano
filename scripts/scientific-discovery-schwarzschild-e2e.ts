/**
 * GENESIS SCHWARZSCHILD DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the existing analytic Schwarzschild-radius model through the common
 * Discovery loop. The bounded observation covers a non-rotating, uncharged
 * mass parameter scan only; it is not an astronomical measurement, black-hole
 * mass estimate, Kerr calculation, or physical simulation of an accretion disk.
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

const MODEL_ID = 'einstein-schwarzschild';
const DOMAIN_ID = 'spacetime-einstein';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded scan masy dla istniejącego analitycznego promienia Schwarzschilda.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { massSolar: 1 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W istniejącym nieobracającym się i nienaładowanym modelu Schwarzschilda zwiększenie prerejestrowanej masy od 1 do 5 M☉ zwiększa obliczony promień Schwarzschilda.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model używa wyłącznie relacji r_s=2GM/c² dla masy wejściowej wyrażonej w masach Słońca.',
      'Obiekt jest idealnie nieobracający się i nienaładowany; model nie uwzględnia metryki Kerra, ładunku, dysku akrecyjnego, soczewkowania ani propagacji promieni.',
      'Seria obejmuje wyłącznie prerejestrowane masy: 1, 2 i 5 M☉.',
      'Wynik jest obliczeniem modelowym dla parametrów wejściowych, nie pomiarem ani estymacją masy rzeczywistej czarnej dziury.',
    ],
    falsification: {
      metric: 'radiusKm',
      relation: 'monotonic-increase',
      rationale: 'W prerejestrowanej rosnącej serii mas 1→2→5 M☉ promień r_s nie może maleć.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'massSolar', values: [1, 2, 5], label: 'masa Schwarzschilda (M☉)' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym modelu Schwarzschilda zwiększenie masy od 10 do 20 M☉ nie zmniejsza radiusKm.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje relację r_s=2GM/c² oraz ograniczenie do obiektu nieobracającego się i nienaładowanego.',
      'To osobno prerejestrowany protokół; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'radiusKm',
      relation: 'monotonic-increase',
      rationale: 'W kolejności 10→20 M☉ następny promień modelowy nie może maleć.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { massSolar: 10 } },
  sweep: { parameter: 'massSolar', values: [10, 20], label: 'walidacyjna masa Schwarzschilda (M☉)' },
  repetitionsPerArm: 2,
});

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function main(): void {
  const chain = executeScientificExperiment(design);
  const rerunChain = executeScientificExperiment(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('Einstein ogólna względność Schwarzschild czarna dziura masa promień horyzont');
  const analysis = analyseExperimentSeries(chain.allRuns, 'massSolar', 'radiusKm');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.massSolar === 1);
  if (!baselineRun) throw new Error('Schwarzschild Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Schwarzschild-radius bounded mass scan',
    baselineRun,
    evidencePack,
    discoveryCase,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const byMass = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.massSolar), arm.outputValues[0]];
  }));
  const assertions = {
    sixRealRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    deterministicArmsMatch: chain.arms.length === 3 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allRadiiFinite: Object.values(byMass).every(finitePositive),
    observedSeriesStrictlyIncreases: byMass['1'] < byMass['2'] && byMass['2'] < byMass['5'],
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
    throw new Error(`Schwarzschild Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byMass, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
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
    radiusKmByMassSolar: byMass,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded analytic Schwarzschild-radius calculation only. It is not a black-hole observation, mass estimate, Kerr calculation, disk model, or general-relativistic numerical relativity simulation.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — Schwarzschild Discovery Case:', error);
  process.exit(1);
}
