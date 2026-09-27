/**
 * GENESIS SCHWARZSCHILD GEODESIC DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the existing RK4 null-geodesic solver in the equatorial
 * Schwarzschild plane. The protocol is restricted to three preregistered
 * escaping trajectories above the runner's capture threshold. It is not Kerr,
 * 3D ray tracing, a disk simulation, or a prediction of an observed black hole.
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

const MODEL_ID = 'einstein-schwarzschild-geodesic';
const DOMAIN_ID = 'spacetime-einstein';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded scan parametru zderzenia dla istniejącej RK4 geodezyjnej zerowej Schwarzschilda.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { impact: 1.05 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W istniejącym równikowym solverze geodezyjnej zerowej Schwarzschilda dla prerejestrowanych torów ucieczkowych impact=1.05,1.10,1.20 większy parametr zderzenia zwiększa minimalny promień toru.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model rozwiązuje pojedynczą geodezyjną zerową w płaszczyźnie równikowej metryki Schwarzschilda istniejącym krokiem RK4.',
      'Seria obejmuje wyłącznie prerejestrowane impact: 1.05, 1.10 i 1.20, dla których runner klasyfikuje wynik jako escaped.',
      'Parametr impact jest bezwymiarowym b/bₖ stosowanym przez istniejący runner i nie jest obserwacyjnym parametrem źródła astronomicznego.',
      'Model nie obejmuje Kerra, 3D ray tracingu, polaryzacji, pełnego soczewkowania obrazu, fizyki dysku ani konkretnego obiektu obserwowanego.',
    ],
    falsification: {
      metric: 'minRadius',
      relation: 'monotonic-increase',
      rationale: 'W prerejestrowanej kolejności 1.05→1.10→1.20 minimalny promień ucieczkowej geodezyjnej nie może maleć.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'impact', values: [1.05, 1.1, 1.2], label: 'parametr zderzenia b/bₖ' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym solverze Schwarzschilda ucieczkowa geodezyjna dla impact=1.30 daje odtwarzalny minRadius.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje pojedynczy promień, metrykę Schwarzschilda i istniejący schemat RK4.',
      'To osobno prerejestrowany protokół replikacji; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'minRadius',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-10,
      rationale: 'Deterministyczny solver przy identycznym impact=1.30 musi zwrócić zgodny minRadius wobec baseline.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { impact: 1.3 } },
  replication: {
    label: 'Replikacja geodezyjnej impact 1.30',
    rationale: 'Niezależnie prerejestrowana kontrola deterministycznego przebiegu ucieczkowej geodezyjnej.',
  },
  repetitionsPerArm: 1,
});

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function main(): void {
  const chain = executeScientificExperiment(design);
  const rerunChain = executeScientificExperiment(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('Einstein ogólna względność Schwarzschild geodezyjna fotonów horyzont czarna dziura');
  const analysis = analyseExperimentSeries(chain.allRuns, 'impact', 'minRadius');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.impact === 1.05);
  if (!baselineRun) throw new Error('Schwarzschild-geodesic Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Schwarzschild null-geodesic escaping-impact scan',
    baselineRun,
    evidencePack,
    discoveryCase,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const byImpact = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.impact), arm.outputValues[0]];
  }));
  const escaped = chain.allRuns.every((run) => run.result.outputs.outcome === 'escaped');
  const assertions = {
    sixRealRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    allRunsStayWithinEscapingProtocol: escaped,
    deterministicArmsMatch: chain.arms.length === 3 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allMinRadiiFinite: Object.values(byImpact).every(finitePositive),
    observedSeriesStrictlyIncreases: byImpact['1.05'] < byImpact['1.1'] && byImpact['1.1'] < byImpact['1.2'],
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
    throw new Error(`Schwarzschild-geodesic Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byImpact, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
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
    minRadiusByImpact: byImpact,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded equatorial null-geodesic RK4 scan for preregistered escaping impact parameters only. It is not Kerr, 3D ray tracing, disk physics, an image simulation, or a result for an observed black hole.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — Schwarzschild-geodesic Discovery Case:', error);
  process.exit(1);
}
