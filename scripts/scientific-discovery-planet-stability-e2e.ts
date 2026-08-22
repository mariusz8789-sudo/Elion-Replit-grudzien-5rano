/**
 * GENESIS PLANET-STABILITY DISCOVERY CASE — REAL LOCAL E2E
 *
 * Exercises the common Discovery loop through the existing deterministic
 * four-body velocity-Verlet planet-stability integrator. It does not claim an
 * eight-planet ephemeris, a prediction of the Solar System, or a discovery in
 * celestial mechanics. The only supported observation is exact, bounded model
 * replication for an already preregistered input protocol.
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

const MODEL_ID = 'universe-planet-stability';
const DOMAIN_ID = 'universe';

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany, bounded protocol replikacji planet-stability dla identycznych parametrów integratora.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { years: 2, jupiter: true, saturn: true },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym czteroplanetowym integratorze planet-stability identyczna replikacja protokołu zwraca tę samą ekscentryczność Ziemi.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model jest deterministycznym, ograniczonym integratorem N-ciał velocity-Verlet dla konfiguracji Ziemia–Mars–Jowisz–Saturn.',
      'Protokół obejmuje wyłącznie dwa lata modelowe przy włączonych Jowiszu i Saturnie.',
      'Nie jest to pełna efemeryda ośmiu planet, kalibracja do obserwacji astronomicznych ani predykcja długookresowej stabilności Układu Słonecznego.',
      'Wynik testuje wyłącznie odtwarzalność implementacji dla identycznych parametrów.',
    ],
    falsification: {
      metric: 'earthEccentricity',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-10,
      rationale: 'Przy identycznych parametrach deterministyczny integrator musi zwrócić ekscentryczność Ziemi zgodną z baseline w prerejestrowanej tolerancji.',
    },
  },
  baselineRequest,
  replication: {
    label: 'Replikacja deterministyczna',
    rationale: 'Arm replikacji wykonuje niezmieniony protokół na tym samym integratorze i z tymi samymi parametrami.',
  },
  repetitionsPerArm: 1,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym integratorze identyczna replikacja pięcioletniego protokołu zwraca tę samą ekscentryczność Ziemi.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje ten sam ograniczony czteroplanetowy integrator velocity-Verlet.',
      'To osobno prerejestrowany protokół replikacji; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'earthEccentricity',
      relation: 'equal-to-baseline-within-tolerance',
      tolerance: 1e-10,
      rationale: 'Deterministyczny follow-up wymaga równości wobec baseline dla identycznych parametrów.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { years: 5, jupiter: true, saturn: true } },
  replication: {
    label: 'Replikacja pięcioletnia',
    rationale: 'Niezależnie prerejestrowana kontrola odtwarzalności przy dłuższym horyzoncie modelowym.',
  },
  repetitionsPerArm: 1,
});

function finiteEarthEccentricity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function main(): void {
  const chain = executeScientificExperiment(design);
  const rerunChain = executeScientificExperiment(design);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('układ słoneczny planety ekscentryczność N-ciał stabilność orbitalna velocity Verlet');
  const analysis = analyseExperimentSeries(chain.allRuns, 'years', 'earthEccentricity');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const conclusion = concludeScientificDiscovery(discoveryCase);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const baselineRun = chain.allRuns.find((run) => run.request.parameters.years === 2 && run.runId === chain.arms[0]?.runIds[0]);
  if (!baselineRun) throw new Error('Planet-stability Discovery Case could not locate the canonical baseline run.');
  const capsule = createScenarioCapsule({
    title: 'Planet-stability deterministic replication: two-year Earth eccentricity',
    baselineRun,
    evidencePack,
  });
  const capsuleReplay = replayScenarioCapsule(capsule);
  const baselineValue = chain.arms.find((arm) => arm.kind === 'baseline')?.outputValues[0];
  const replicationValue = chain.arms.find((arm) => arm.kind === 'replication')?.outputValues[0];
  const assertions = {
    twoRealRunsCompleted: chain.allRuns.length === 2 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    deterministicArmsComplete: chain.arms.length === 2 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    replicationMeetsPreregisteredCriterion: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    earthEccentricityIsFinite: finiteEarthEccentricity(baselineValue) && finiteEarthEccentricity(replicationValue),
    exactReplicationObserved: baselineValue === replicationValue,
    independentProtocolRerunMatches: rerunChain.provenanceFingerprint === chain.provenanceFingerprint
      && rerunChain.allRuns.every((run, index) => run.provenance.runFingerprint === chain.allRuns[index]?.provenance.runFingerprint),
    evidencePackIsComplete: evidencePack.runCount === 2 && evidencePack.reproducibility.allArmsMatched,
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    replicationDoesNotMasqueradeAsDiscoveryCandidate: discoveryCase.status === 'INCOMPLETE_CANDIDATE'
      && candidate.status === 'BLOCKED_NO_REVIEWABLE_FINDING',
    conservativeConclusion: conclusion.status === 'OBSERVATION_SUPPORTED_WITHIN_PROTOCOL' && conclusion.reviewStatus === 'NOT_REVIEWED',
    discoveryCaseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    scenarioCapsuleReplayMatches: capsuleReplay.status === 'MATCH',
    followUpIsPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Planet-stability Discovery E2E assertions failed:\n${JSON.stringify({ assertions, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, conclusion, capsuleReplay }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    model: MODEL_ID,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    conclusion: conclusion.status,
    earthEccentricity: baselineValue,
    marsEccentricity: chain.allRuns[0]?.result.outputs.marsEccentricity,
    capsuleReplay: capsuleReplay.status,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded deterministic replication of an existing four-planet velocity-Verlet integrator for two model years only. This is not a full ephemeris, observational validation, Solar-System prediction, or scientific discovery.',
  }, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error('[E2E] FAIL — planet-stability Discovery Case:', error);
  process.exit(1);
}
