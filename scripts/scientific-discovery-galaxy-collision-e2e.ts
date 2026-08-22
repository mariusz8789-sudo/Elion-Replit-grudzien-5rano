/**
 * GENESIS GALAXY-COLLISION DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the common Discovery loop through the existing deterministic
 * restricted three-body Toomre–Toomre collision integrator. The bounded result
 * applies only to the preregistered 0.25–1.00 mass-ratio series, fixed horizon,
 * and prograde configuration. It is not a hydrodynamic/N-body merger model or
 * a prediction for a named galaxy pair.
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

const MODEL_ID = 'universe-galaxy-collision';
const DOMAIN_ID = 'universe';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded scan stosunku mas dla istniejącego prograde restricted three-body collision integrator Genesis.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { ratio: 0.25, retro: false, horizonMyr: 120 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym prograde restricted three-body modelu kolizji galaktyk zwiększenie prerejestrowanego stosunku mas od 0.25 do 1.00 zmniejsza minimalną separację jąder w 120 mln lat skalowania widoku.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model zawiera dwa punktowe jądra z grawitacją Newtonowską i zmiękczeniem oraz bezmasowe cząstki próbne gwiazd.',
      'Konfiguracja jest wyłącznie współbieżna (retro=false), a horyzont jest stały: 120 mln lat skalowania widoku.',
      'Seria obejmuje wyłącznie prerejestrowane ratio: 0.25, 0.50 i 1.00.',
      'Model nie obejmuje gazu, samograwitacji dysków, tarcia dynamicznego, gwiazdotworzenia ani rekonstrukcji konkretnej pary galaktyk.',
    ],
    falsification: {
      metric: 'minCoreSeparationSceneUnits',
      relation: 'monotonic-decrease',
      rationale: 'W prerejestrowanej kolejności 0.25→0.50→1.00 minimalna separacja jąder nie może rosnąć w granicach tego istniejącego modelu.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'ratio', values: [0.25, 0.5, 1], label: 'stosunek mas galaktyk' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym prograde integratorze wynik minimalnej separacji jąder jest odtwarzalny dla prerejestrowanego ratio=0.75.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje restricted three-body, retro=false i horyzont 120 mln lat skalowania widoku.',
      'To osobno prerejestrowany protokół replikacji; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'minCoreSeparationSceneUnits',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-10,
      rationale: 'Deterministyczny follow-up dla identycznych parametrów musi zwrócić zgodny wynik wobec baseline.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { ratio: 0.75, retro: false, horizonMyr: 120 } },
  replication: {
    label: 'Replikacja ratio 0.75',
    rationale: 'Niezależnie prerejestrowana kontrola deterministycznego integratora dla nowego ratio.',
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
  const research = createGenesisResearchPacket('galaktyki kolizje Toomre Toomre restricted three body ogony pływowe dynamika');
  const analysis = analyseExperimentSeries(chain.allRuns, 'ratio', 'minCoreSeparationSceneUnits');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.ratio === 0.25);
  if (!baselineRun) throw new Error('Galaxy-collision Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Galaxy collision prograde mass-ratio scan at fixed 120 Myr view horizon',
    baselineRun,
    evidencePack,
    discoveryCase,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const byRatio = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.ratio), arm.outputValues[0]];
  }));
  const assertions = {
    sixRealRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    deterministicArmsMatch: chain.arms.length === 3 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allSeparationsFinite: Object.values(byRatio).every(finiteNonNegative),
    observedSeriesStrictlyDecreases: byRatio['0.25'] > byRatio['0.5'] && byRatio['0.5'] > byRatio['1'],
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
    throw new Error(`Galaxy-collision Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byRatio, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
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
    minCoreSeparationSceneUnitsByRatio: byRatio,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded prograde restricted three-body mass-ratio scan with a fixed view-time horizon only. It is not a full N-body/hydrodynamic merger simulation, a reconstruction, or a prediction for a real galaxy pair.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — galaxy-collision Discovery Case:', error);
  process.exit(1);
}
