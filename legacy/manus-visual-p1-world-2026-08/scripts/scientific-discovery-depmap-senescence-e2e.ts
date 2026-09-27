/**
 * GENESIS DEPMAP SENESCENCE DISCOVERY CASE — REAL BACKEND E2E
 *
 * Exercises the full Scientific Discovery Loop on DepMap 24Q2 CRISPR data:
 * hypothesis → design → backend execution → evidence chain → analysis →
 * hypothesis candidate → next protocol → discovery case record → review →
 * conclusion → replay → evidence pack.
 *
 * The model is descriptive only. It reports CERES gene-effect medians for the
 * senescence cell-cycle axis (CDKN1A/p21, CDKN2A/p16, TP53, RB1, CDK4, CDK6,
 * MDM2) across 1150 cancer cell lines. It does not predict clinical outcomes,
 * therapeutic efficacy or patient response.
 *
 * Requires: GENESIS_DEPMAP_24Q2_DATA_DIR and a running Genesis backend.
 */

import {
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  createScientificEvidencePack,
  createGenesisResearchPacket,
  analyseReplicationExperimentSeries,
  formulateScientificHypothesisCandidate,
  createDiscoveryCaseRecord,
  replayDiscoveryCaseRecord,
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

const MODEL_ID = 'biology-depmap-crispr-senescence-panel';
const DOMAIN_ID = 'biology-aging-lab';

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  modelId: MODEL_ID,
  domainId: DOMAIN_ID,
  sourceText: 'Uruchom opisowy panel DepMap 24Q2 dla osi senescencji CDKN1A/p21, CDKN2A/p16, TP53, RB1, CDK4, CDK6, MDM2.',
  inputs: {},
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W zbiorze DepMap 24Q2 mediana efektu genowego CERES dla CDKN1A jest wyższa (mniej negatywna) niż dla CDK4 i CDK6, co jest zgodne z rolą CDKN1A jako inhibitora proliferacji, a nie genu niezbędnego do przeżycia komórek nowotworowych.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'Dane DepMap 24Q2 są zweryfikowane przez SHA-256 i nie zostały zmodyfikowane.',
      'Mediana efektu genowego CERES jest miarą zależności od przeżycia, a nie bezpośrednim wskaźnikiem ekspresji.',
      'Wynik jest opisowy i nie przewiduje skuteczności terapeutycznej.',
    ],
    falsification: {
      metric: 'cdkn1aMedian',
      relation: 'greater-than',
      expectedValue: -0.5,
      rationale: 'Prerejestrowane kryterium: mediana CDKN1A > -0.5 (mniej negatywna niż typowe geny niezbędne).',
    },
  },
  baselineRequest,
  replication: {
    label: 'Świeża replikacja DepMap 24Q2',
    rationale: 'Model nie ma dopuszczalnego parametru wejściowego; drugi identyczny arm sprawdza wyłącznie odtwarzalność zweryfikowanego executionu.',
  },
  repetitionsPerArm: 2,
});

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('DepMap 24Q2 senescencja CDKN1A p21 p16 RB1 CDK4 CDK6 MDM2');
  const analysis = analyseReplicationExperimentSeries(chain.allRuns, 'cdkn1aMedian');
  const candidate = formulateScientificHypothesisCandidate(analysis, chain);
  const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate });
  const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate });

  const assertions = {
    allRunsCompleted: chain.allRuns.length >= 2 && chain.allRuns.every((run) => run.result.status === 'completed'),
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
    replicationAnalysisIsBounded: analysis.diagnostics.status === 'AVAILABLE' && analysis.diagnostics.monotonicTrend === 'NOT_ASSESSABLE',
    candidateIsCorrectlyBlocked: candidate.status === 'BLOCKED_NO_REVIEWABLE_FINDING',
    discoveryCaseIsCorrectlyIncomplete: discoveryCase.status === 'INCOMPLETE_CANDIDATE',
    caseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
  };

  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`DepMap Discovery E2E assertions failed:\n${JSON.stringify({ assertions, assessment: chain.assessment, analysis, candidate, discoveryCase }, null, 2)}`);
  }

  const cdkn1aMedian = chain.allRuns[0]?.result.outputs?.cdkn1aMedian as number | undefined;
  const cdk4Median = chain.allRuns[0]?.result.outputs?.cdk4Median as number | undefined;
  const cellLineCount = chain.allRuns[0]?.result.outputs?.cellLineCount as number | undefined;
  const controlCalibrationPass = chain.allRuns[0]?.result.outputs?.controlCalibrationPass as number | undefined;

  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    backendBaseUrl,
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    analysisStatus: analysis.diagnostics.status,
    candidateStatus: candidate.status,
    discoveryCaseStatus: discoveryCase.status,
    cellLineCount,
    cdkn1aMedian,
    cdk4Median,
    controlCalibrationPass,
    runIds: chain.allRuns.map((run) => run.runId),
    engines: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendEngine ?? 'unknown'))],
    discoveryCaseId: discoveryCase.caseId,
    discoveryCaseFingerprint: discoveryCase.caseFingerprint,
    assertionSummary: assertions,
    disclaimer: 'Wynik jest opisowy. Nie przewiduje skuteczności terapeutycznej, nie jest diagnozą kliniczną i nie stanowi rekomendacji terapii.',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — DepMap Senescence Discovery Case:', error);
  process.exit(1);
});
