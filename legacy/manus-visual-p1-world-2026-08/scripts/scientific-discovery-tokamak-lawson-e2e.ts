/**
 * GENESIS TOKAMAK LAWSON DISCOVERY CASE — REAL BACKEND E2E
 *
 * Exercises the existing backend `nuclear-tokamak-lawson` engine through the
 * common Discovery loop. It evaluates only the registered homogeneous D–T 0D
 * n·T·τ_E ratio with a fixed reference threshold. It is not MHD, a reactor
 * design, an ignition prediction, or a claim about ITER, NIF, or any device.
 */
import {
  analyseExperimentSeries,
  createBackendReplayReceipt,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScientificEvidencePack,
  createScientificReviewDecision,
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  formulateScientificHypothesisCandidate,
  replayDiscoveryCaseRecord,
  replayScientificReviewDecision,
  selectNextScientificExperiment,
} from '../packages/frontend/src/core/experimentFabric/index';

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const nativeFetch = globalThis.fetch;
if (typeof nativeFetch !== 'function') throw new Error('A standards-compatible fetch implementation is required for backend E2E.');
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return nativeFetch(rawUrl.startsWith('/api/') ? `${backendBaseUrl}${rawUrl}` : rawUrl, init);
}) as typeof globalThis.fetch;

const MODEL_ID = 'nuclear-tokamak-lawson';
const DOMAIN_ID = 'nuclear';
const baselineRequest = {
  contractVersion: '1.0.0' as const,
  sourceText: 'Prerejestrowany bounded backendowy scan τ_E dla istniejącego jednorodnego kryterium Lawsona D–T.',
  domainId: DOMAIN_ID,
  operation: 'compute' as const,
  modelId: MODEL_ID,
  parameters: { densityExponent: 20, temperatureKeV: 15, confinementSeconds: 0.5 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym jednorodnym modelu D–T Lawsona przy stałej gęstości i temperaturze zwiększenie prerejestrowanego czasu utrzymania energii τ_E zwiększa iloraz n·T·τ_E wobec stałego progu.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Model liczy wyłącznie jednorodny iloraz 0D n·T·τ_E wobec jawnego progu referencyjnego 3×10²¹ keV·s/m³.',
      'Gęstość jest stała: log₁₀(n/m³)=20; temperatura jest stała: 15 keV.',
      'Seria obejmuje wyłącznie prerejestrowane wartości τ_E: 0.5, 1.0 i 2.0 s.',
      'Wynik nie obejmuje MHD, transportu, profili plazmy, strat promienistych, geometrii, bilansu mocy, materiałów, niestabilności ani predykcji zapłonu konkretnego urządzenia.',
    ],
    falsification: {
      metric: 'lawsonRatio',
      relation: 'monotonic-increase',
      rationale: 'Przy stałych n i T iloraz 0D n·T·τ_E / próg Lawsona nie może maleć w prerejestrowanej kolejności rosnącego τ_E.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'confinementSeconds', values: [0.5, 1, 2], label: 'czas utrzymania energii τ_E (s)' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym modelu D–T Lawsona zwiększenie τ_E od 3 do 4 s nie zmniejsza lawsonRatio przy stałych n i T.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Follow-up zachowuje jednorodny iloraz 0D, log₁₀(n/m³)=20 i T=15 keV.',
      'To osobno prerejestrowany protokół; nie jest wykonywany przez ten E2E.',
    ],
    falsification: {
      metric: 'lawsonRatio',
      relation: 'monotonic-increase',
      rationale: 'W kolejności τ_E=3→4 s następna wartość ilorazu nie może maleć.',
    },
  },
  baselineRequest: { ...baselineRequest, parameters: { densityExponent: 20, temperatureKeV: 15, confinementSeconds: 3 } },
  sweep: { parameter: 'confinementSeconds', values: [3, 4], label: 'walidacyjny czas utrzymania energii τ_E (s)' },
  repetitionsPerArm: 2,
});

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const backendRerun = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const receipt = createBackendReplayReceipt(chain, backendRerun);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('fuzja D-T tokamak kryterium Lawsona triple product plasma confinement');
  const analysis = analyseExperimentSeries(chain.allRuns, 'confinementSeconds', 'lawsonRatio');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const reviewInput = {
    reviewerReference: 'e2e:declared-lawson-0d-reviewer',
    reviewedAt: '2026-08-22T05:15:00.000Z',
    decision: 'ACCEPT_FOR_PREREGISTRATION' as const,
    rationale: 'Review zapisuje wyłącznie możliwość niezależnej prerejestracji następnego bounded 0D protocolu; nie potwierdza zapłonu, osiągów urządzenia ani prawdy naukowej poza modelem.',
  };
  const review = createScientificReviewDecision(discoveryCase, reviewInput);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const replayedReview = replayScientificReviewDecision(discoveryCase, reviewInput);
  const byConfinement = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    return [String(protocolArm?.request.parameters.confinementSeconds), arm.outputValues[0]];
  }));
  const assertions = {
    sixBackendRunsCompleted: chain.allRuns.length === 6 && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsUseExistingRealBackendEngine: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine' && Boolean(
      run.provenance.backendExecution?.backendRunId && run.provenance.backendExecution.backendEngine && run.provenance.backendExecution.backendModelVersion,
    )),
    deterministicArmsMatch: chain.arms.length === 3 && chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    preregisteredCriterionSupported: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    allRatiosFinite: Object.values(byConfinement).every(finiteNonNegative),
    observedRatiosStrictlyIncrease: byConfinement['0.5'] < byConfinement['1'] && byConfinement['1'] < byConfinement['2'],
    backendReplayMatches: receipt.status === 'MATCH' && receipt.armReceipts.every((arm) => arm.status === 'MATCH'),
    evidencePackIsComplete: evidencePack.runCount === 6 && evidencePack.reproducibility.allArmsMatched,
    sourceBoundResearch: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    correlationCandidateIsReviewGated: candidate.status === 'CANDIDATE_READY' && discoveryCase.status === 'READY_FOR_REVIEW',
    declaredReviewIsAuditable: review.decision === 'ACCEPT_FOR_PREREGISTRATION' && review.provenance.reviewerIdentity === 'DECLARED_NOT_VERIFIED',
    caseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    reviewReplayMatches: replayedReview.reviewFingerprint === review.reviewFingerprint,
    followUpIsPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Tokamak Lawson Discovery E2E assertions failed:\n${JSON.stringify({ assertions, byConfinement, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, review, receipt }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    backendBaseUrl,
    model: MODEL_ID,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    candidate: candidate.status,
    discoveryCase: discoveryCase.status,
    backendReplayReceipt: receipt.status,
    lawsonRatioByConfinementSeconds: byConfinement,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    reviewId: review.reviewId,
    assertions,
    disclaimer: 'COMPUTATIONAL_RESULT: bounded backend calculation of a homogeneous D–T 0D Lawson ratio only. It is not MHD, a reactor design, an ignition prediction, an ITER/NIF prediction, or an experimentally validated fusion result.',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — Tokamak Lawson Discovery Case:', error);
  process.exit(1);
});
