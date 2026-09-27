/**
 * GENESIS LORENZ ATTRACTOR DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the existing deterministic RK4 Lorenz runner through the common
 * Discovery loop. The result is bounded to fixed σ=10, β=8/3, ρ=28, a 1e-4
 * initial perturbation, and the preregistered t=1–15 horizon series. It does
 * not model or forecast weather, climate, or a physical laboratory system.
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

const MODEL_ID = 'universe-lorenz-attractor';
const DOMAIN_ID = 'classical-mechanics';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded scan horyzontu czasu dla istniejącego integratora RK4 klasycznego systemu Lorenza.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { rho: 28, horizonTime: 1, divergence: true },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W istniejącym klasycznym systemie Lorenza przy ρ=28 i ustalonym zaburzeniu początkowym 1e-4 końcowa separacja trajektorii rośnie w prerejestrowanym horyzoncie t=1,2,5,10,15.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Równania Lorenza są całkowane istniejącą metodą RK4 ze stałymi σ=10 i β=8/3 oraz z krokiem 0.01.',
      'Początkowy stan to (0.1, 0, 0), a trajectory shadow otrzymuje deterministyczne zaburzenie x=1e-4.',
      'Seria obejmuje wyłącznie ρ=28 i prerejestrowane horyzonty 1, 2, 5, 10 oraz 15 jednostek czasu Lorenza.',
      'Model opisuje uproszczoną konwekcję; nie jest modelem pogody, klimatu, atmosfery, obserwacji ani prognozy świata rzeczywistego.',
    ],
    falsification: {
      metric: 'finalSeparation',
      relation: 'monotonic-increase',
      rationale: 'W dokładnie prerejestrowanej krótkiej serii t=1→2→5→10→15 końcowa odległość trajektorii głównej i shadow nie może maleć.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'horizonTime', values: [1, 2, 5, 10, 15], label: 'horyzont czasu Lorenza' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym systemie Lorenza końcowa separacja jest odtwarzalna dla ρ=28, t=12 i identycznego zaburzenia początkowego.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje ρ=28, klasyczne σ i β, RK4 oraz to samo deterministyczne zaburzenie początkowe.',
      'To osobno prerejestrowany protokół replikacji; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'finalSeparation',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-10,
      rationale: 'Ten sam deterministyczny integrator i te same warunki muszą zwrócić zgodną końcową separację wobec baseline.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { rho: 28, horizonTime: 12, divergence: true } },
  replication: {
    label: 'Replikacja Lorenza t=12',
    rationale: 'Niezależnie prerejestrowana kontrola odtwarzalności tego samego numerycznego protokołu.',
  },
  repetitionsPerArm: 1,
});

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function main(): void {
  const chain = executeScientificExperiment(design);
  const rerunChain = executeScientificExperiment(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('mechanika klasyczna grawitacja Newtona Lorenz chaos wrażliwość warunki początkowe');
  const analysis = analyseExperimentSeries(chain.allRuns, 'horizonTime', 'finalSeparation');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.horizonTime === 1);
  if (!baselineRun) throw new Error('Lorenz Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Lorenz deterministic perturbation separation scan at rho 28',
    baselineRun,
    evidencePack,
    discoveryCase,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const byHorizon = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.horizonTime), arm.outputValues[0]];
  }));
  const assertions = {
    tenRealRunsCompleted: chain.allRuns.length === 10 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    deterministicArmsMatch: chain.arms.length === 5 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allSeparationsFinite: Object.values(byHorizon).every(finiteNonNegative),
    observedSeriesStrictlyIncreases: byHorizon['1'] < byHorizon['2'] && byHorizon['2'] < byHorizon['5']
      && byHorizon['5'] < byHorizon['10'] && byHorizon['10'] < byHorizon['15'],
    independentProtocolRerunMatches: rerunChain.provenanceFingerprint === chain.provenanceFingerprint
      && rerunChain.allRuns.every((run, index) => run.provenance.runFingerprint === chain.allRuns[index]?.provenance.runFingerprint),
    evidencePackIsComplete: evidencePack.runCount === 10 && evidencePack.reproducibility.allArmsMatched,
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    correlationCandidateIsReviewGated: candidate.status === 'CANDIDATE_READY' && discoveryCase.status === 'READY_FOR_REVIEW',
    conservativeConclusion: conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' && conclusion.reviewStatus === 'NOT_REVIEWED',
    discoveryCaseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    scenarioCapsuleRetainsReviewGatedCase: capsuleReplay.status === 'MATCH' && capsuleReplay.discovery?.status === 'RETAINED_DISCOVERY_CASE',
    followUpIsPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Lorenz Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byHorizon, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
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
    finalSeparationByHorizon: byHorizon,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded deterministic RK4 integration of the classical Lorenz system for the preregistered rho and horizons only. It is not a weather or climate forecast, an observed physical measurement, or a general statement about every chaotic system.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — Lorenz Discovery Case:', error);
  process.exit(1);
}
