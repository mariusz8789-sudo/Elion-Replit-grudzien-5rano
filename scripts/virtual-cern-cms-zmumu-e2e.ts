/**
 * VIRTUAL CERN FOUNDATION — REAL CMS OPEN DATA Z→μμ E2E
 *
 * Exercises the Genesis Discovery Fabric using CERN Open Data record 5208:
 * hypothesis → preregistered zero-input replication → real backend execution
 * → evidence → bounded replication analysis → replay → evidence pack.
 *
 * It is a source-bound, descriptive computation on an educational, Z-enriched
 * sample. It does not reconstruct the CMS detector, measure the Z mass, test
 * the Standard Model, or claim a particle discovery.
 *
 * Requires: GENESIS_CERN_OPEN_DATA_DIR and a running Genesis backend.
 */

import {
  analyseReplicationExperimentSeries,
  createBackendReplayReceipt,
  createDiscoveryCaseRecord,
  createGenesisResearchPacket,
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperimentOnBackend,
  formulateScientificHypothesisCandidate,
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

const MODEL_ID = 'particle-cern-cms-zmumu-invariant-mass';
const DOMAIN_ID = 'particle';

const baselineRequest = {
  contractVersion: '1.0.0' as const,
  modelId: MODEL_ID,
  domainId: DOMAIN_ID,
  sourceText: 'Uruchom opisową, source-bound analizę CMS Open Data Z do dwóch mionów z 2011 roku.',
  inputs: {},
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'Dla checksumowo zweryfikowanego rekordu CMS Open Data 5208 obliczenie masy niezmienniczej w predefiniowanym oknie 80–100 GeV zwróci niezerową liczbę zdarzeń w dwóch świeżych uruchomieniach tego samego protokołu.',
    domainId: DOMAIN_ID,
    modelId: MODEL_ID,
    declaredAssumptions: [
      'CSV rekordu CMS Open Data 5208 ma zatwierdzony SHA-256 i nie został zmodyfikowany.',
      'Próbka jest uprzednio wyselekcjonowana, edukacyjna i Z-enriched.',
      'Obliczenie stosuje zdefiniowaną relację masy niezmienniczej, a nie rekonstrukcję detektora.',
      'Wynik nie jest pomiarem masy Z, pełną analizą HEP ani twierdzeniem o odkryciu.',
    ],
    falsification: {
      metric: 'events80To100GeV',
      relation: 'greater-than',
      expectedValue: 0,
      rationale: 'Prerejestrowane minimum: liczone źródłowe zdarzenia w z góry opisanym oknie muszą być niezerowe; kryterium nie jest testem fizyki.',
    },
  },
  baselineRequest,
  replication: {
    label: 'Świeża replikacja CMS Open Data record 5208',
    rationale: 'Model nie przyjmuje parametrów wejściowych; identyczny arm sprawdza wyłącznie odtwarzalność checksumowo zweryfikowanego executionu.',
  },
  repetitionsPerArm: 2,
});

async function main(): Promise<void> {
  const chain = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const backendRerun = await executeScientificExperimentOnBackend(design, backendBaseUrl);
  const receipt = createBackendReplayReceipt(chain, backendRerun);
  const evidencePack = createScientificEvidencePack(chain);
  const research = createGenesisResearchPacket('CERN CMS Open Data Z muon dimuon invariant mass LHC particle detector');
  const analysis = analyseReplicationExperimentSeries(chain.allRuns, 'events80To100GeV');
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
    protocolAssessment: chain.assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL',
    evidencePackMatches: evidencePack.runCount === chain.allRuns.length && evidencePack.reproducibility.allArmsMatched,
    researchPacketIsSourceBound: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === DOMAIN_ID),
    replicationAnalysisIsBounded: analysis.diagnostics.status === 'AVAILABLE' && analysis.diagnostics.monotonicTrend === 'NOT_ASSESSABLE',
    candidateIsCorrectlyBlocked: candidate.status === 'BLOCKED_NO_REVIEWABLE_FINDING',
    discoveryCaseIsCorrectlyIncomplete: discoveryCase.status === 'INCOMPLETE_CANDIDATE',
    caseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
    backendReplayMatches: receipt.status === 'MATCH' && receipt.armReceipts.every((arm) => arm.status === 'MATCH'),
  };

  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Virtual CERN CMS E2E assertions failed:\n${JSON.stringify({ assertions, assessment: chain.assessment, analysis, candidate, discoveryCase, receipt }, null, 2)}`);
  }

  const outputs = chain.allRuns[0]?.result.outputs ?? {};
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    backendBaseUrl,
    dataset: 'CERN Open Data record 5208: Z to two muons from 2011',
    datasetSha256: '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1',
    designId: design.designId,
    evidenceId: chain.evidenceId,
    assessment: chain.assessment.assessment,
    eventCount: outputs.eventCount,
    massMedianGeV: outputs.massMedianGeV,
    events80To100GeV: outputs.events80To100GeV,
    peakBin90To95GeV: outputs.peakBin90To95GeV,
    analysisStatus: analysis.diagnostics.status,
    candidateStatus: candidate.status,
    discoveryCaseStatus: discoveryCase.status,
    backendReplayReceiptStatus: receipt.status,
    runIds: chain.allRuns.map((run) => run.runId),
    replayRunIds: backendRerun.allRuns.map((run) => run.runId),
    engines: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendEngine ?? 'unknown'))],
    discoveryCaseId: discoveryCase.caseId,
    discoveryCaseFingerprint: discoveryCase.caseFingerprint,
    assertionSummary: assertions,
    disclaimer: 'Wynik jest opisową analizą wcześniej wyselekcjonowanej próbki edukacyjnej. Nie jest rekonstrukcją CMS, pełną analizą HEP, pomiarem Z, testem Modelu Standardowego ani odkryciem.',
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error('[E2E] FAIL — Virtual CERN CMS Open Data Foundation:', error);
  process.exit(1);
});
