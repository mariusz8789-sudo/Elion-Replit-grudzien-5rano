/**
 * GENESIS PYSCF H₂ DISCOVERY CASE — REAL BACKEND E2E
 *
 * Exercises the complete Discovery loop on a bounded, real PySCF H₂ RHF/STO-3G
 * scan: protocol → backend execution → evidence → analysis → review-gated
 * candidate → next preregistered protocol → declared review → replay receipt.
 *
 * The protocol covers only 0.50–0.74 Å and only the real PySCF RHF/STO-3G
 * model. It does not establish an experimental equilibrium distance, predict a
 * material, validate a larger basis, or claim a chemical discovery.
 *
 * Requires: GENESIS_PYSCF_PYTHON and a running Genesis backend.
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
if (typeof nativeFetch !== 'function') {
  throw new Error('A standards-compatible fetch implementation is required for backend E2E.');
}
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = rawUrl.startsWith('/api/') ? `${backendBaseUrl}${rawUrl}` : rawUrl;
  return nativeFetch(url, init);
}) as typeof globalThis.fetch;

const MODEL_ID = 'quantum-chemistry-pyscf-h2-rhf';
const DOMAIN_ID = 'chemistry';

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  modelId: MODEL_ID,
  domainId: DOMAIN_ID,
  sourceText: 'Uruchom ograniczony PySCF H2 RHF/STO-3G bond-length scan jako source-bound Discovery protocol.',
  parameters: { bondLengthAngstrom: 0.5 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W ograniczonym modelu PySCF H₂ RHF/STO-3G energia elektroniczna maleje monotonicznie przy wydłużeniu wiązania od 0.50 Å do 0.74 Å.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Geometria jest liniowa H–H, neutralna i singletowa.',
      'Metoda jest RHF, baza jest STO-3G, a obliczenie jest single-point.',
      'Wynik dotyczy wyłącznie obserwowanej serii 0.50–0.74 Å.',
      'Energia modelu nie jest eksperymentalną energią dysocjacji, predykcją materiału ani walidacją dla innej metody lub bazy.',
    ],
    falsification: {
      metric: 'energyHartree',
      relation: 'monotonic-decrease',
      rationale: 'Prerejestrowany bounded scan kompresji: kolejne punkty 0.50, 0.60 i 0.74 Å muszą mieć malejącą energię RHF/STO-3G.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'bondLengthAngstrom', values: [0.5, 0.6, 0.74], label: 'długość wiązania H–H (Å)' },
  repetitionsPerArm: 2,
});

const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W tym samym ograniczonym modelu energia elektroniczna rośnie monotonicznie dla wydłużenia wiązania od 0.74 Å do 1.50 Å.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Ten follow-up zachowuje RHF/STO-3G, geometrię liniową, stan neutralny i singletowy.',
      'Jest to osobno prerejestrowany protokół; nie jest wykonany przez ten E2E.',
    ],
    falsification: {
      metric: 'energyHartree',
      relation: 'monotonic-increase',
      rationale: 'Niezależnie prerejestrowany scan wydłużenia od 0.74 Å do 1.50 Å.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'bondLengthAngstrom', values: [0.74, 1.0, 1.5], label: 'długość wiązania H–H (Å)' },
  repetitionsPerArm: 2,
});

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const backendRerun = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const receipt = createBackendReplayReceipt(chain, backendRerun);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('H2 wodór PySCF RHF STO-3G długość wiązania energia Hartree chemia kwantowa');
  const analysis = analyseExperimentSeries(chain.allRuns, 'bondLengthAngstrom', 'energyHartree');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const reviewInput = {
    reviewerReference: 'e2e:declared-pyscf-rhf-reviewer',
    reviewedAt: '2026-08-22T03:15:00.000Z',
    decision: 'ACCEPT_FOR_PREREGISTRATION' as const,
    rationale: 'Realne, deterministyczne runy PySCF są odtwarzalne w granicach RHF/STO-3G; review przyjmuje wyłącznie osobno prerejestrowany follow-up, nie twierdzenie o chemii poza zakresem modelu.',
  };
  const review = createScientificReviewDecision(discoveryCase, reviewInput);
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
  const replayedReview = replayScientificReviewDecision(discoveryCase, reviewInput);

  const energyHartreeByBondLength = Object.fromEntries(chain.arms.map((arm) => {
    const protocolArm = design.arms.find((candidateArm) => candidateArm.armId === arm.armId);
    const bondLengthAngstrom = protocolArm?.request.parameters.bondLengthAngstrom;
    return [String(bondLengthAngstrom), arm.outputValues[0]];
  }));

  const assertions = {
    allRunsCompleted: chain.allRuns.length === design.arms.length * design.repetitionsPerArm
      && chain.allRuns.every((run) => run.result.status === 'completed'),
    allRunsReal: chain.allRuns.every((run) => run.provenance.resultOrigin === 'real-engine'),
    allRunsHaveBackendProvenance: chain.allRuns.every((run) => Boolean(
      run.provenance.backendExecution?.backendRunId
        && run.provenance.backendExecution.backendEngine
        && run.provenance.backendExecution.backendModelVersion,
    )),
    deterministicArmsMatch: chain.arms.every((arm) => arm.reproduction === 'MATCH'),
    hypothesisAssessment: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    evidencePackMatches: evidencePack.runCount === chain.allRuns.length && evidencePack.reproducibility.allArmsMatched,
    researchPacketIsSourceBound: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    analysisIsReviewable: analysis.findings.some((finding) => finding.kind === 'observed-correlation' && finding.verdict === 'REQUIRES_SCIENTIFIC_REVIEW'),
    candidateIsReviewGated: candidate.status === 'CANDIDATE_READY',
    nextProtocolWasPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
    discoveryCaseIsCompatible: discoveryCase.status === 'READY_FOR_REVIEW',
    declaredReviewIsAuditable: review.decision === 'ACCEPT_FOR_PREREGISTRATION'
      && review.provenance.reviewerIdentity === 'DECLARED_NOT_VERIFIED',
    caseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    reviewReplayMatches: replayedReview.reviewFingerprint === review.reviewFingerprint,
    backendReplayMatches: receipt.status === 'MATCH' && receipt.armReceipts.every((arm) => arm.status === 'MATCH'),
    hasThreeDeclaredBondLengths: Object.keys(energyHartreeByBondLength).join(',') === '0.5,0.6,0.74',
    allBondLengthEnergiesAreNumeric: Object.values(energyHartreeByBondLength).every((energy) => typeof energy === 'number' && Number.isFinite(energy)),
    predeclaredCompressionTrendObserved: energyHartreeByBondLength['0.5'] > energyHartreeByBondLength['0.6']
      && energyHartreeByBondLength['0.6'] > energyHartreeByBondLength['0.74'],
  };

  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`PySCF H2 Discovery E2E assertions failed:\n${JSON.stringify({ assertions, assessment: chain.assessment, analysis, candidate, nextSelection, discoveryCase, review, receipt }, null, 2)}`);
  }

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    backendBaseUrl,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    analysisStatus: analysis.diagnostics.status,
    candidateStatus: candidate.status,
    discoveryCaseStatus: discoveryCase.status,
    backendReplayReceiptStatus: receipt.status,
    energyHartreeByBondLength,
    nextProtocolId: nextSelection.selectedDesign?.designId,
    reviewId: review.reviewId,
    runIds: chain.allRuns.map((run) => run.runId),
    replayRunIds: backendRerun.allRuns.map((run) => run.runId),
    engines: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendEngine ?? 'unknown'))],
    assertionSummary: assertions,
    disclaimer: 'Wynik jest ograniczonym, obliczeniowym RHF/STO-3G single-point scan H₂. Nie jest eksperymentalnym pomiarem, predykcją materiału, walidacją dla innych metod/baz ani odkryciem chemicznym.',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — PySCF H2 Discovery Case:', error);
  process.exit(1);
});
