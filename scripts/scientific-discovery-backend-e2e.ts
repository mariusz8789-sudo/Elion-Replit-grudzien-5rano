/*
 * Real E2E proof for the complete Discovery → Backend Fabric loop.
 *
 * Usage:
 *   GENESIS_E2E_BACKEND_BASE_URL=http://127.0.0.1:18123 \
 *     npx esbuild scripts/scientific-discovery-backend-e2e.ts --bundle --platform=node --format=esm --outfile=/tmp/genesis-discovery-e2e.mjs \
 *     && node /tmp/genesis-discovery-e2e.mjs
 *
 * The script forwards only the frontend client's relative /api request to an
 * already running real Genesis backend. It does not mock a run, create a
 * solver, launch HPC work, or claim an autonomous scientific discovery.
 */

import {
  analyseExperimentSeries,
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
} from '../packages/frontend/src/core/experimentFabric';

const backendBaseUrl = (process.env.GENESIS_E2E_BACKEND_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const nativeFetch = globalThis.fetch;

if (typeof nativeFetch !== 'function') {
  throw new Error('A standards-compatible fetch implementation is required for backend E2E.');
}

/** Forward relative browser API requests to the real local backend without faking any response. */
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const url = rawUrl.startsWith('/api/') ? `${backendBaseUrl}${rawUrl}` : rawUrl;
  return nativeFetch(url, init);
}) as typeof globalThis.fetch;

const baselineRequest = {
  contractVersion: '1.0.0',
  sourceText: 'Prerejestrowany realny E2E Discovery protocol: Gaussian PDF.',
  domainId: 'mathematics',
  operation: 'compute' as const,
  modelId: 'math-gaussian',
  parameters: { mean: 0, sigma: 1, xValue: 0 },
};

const design = designScientificExperiment({
  hypothesis: {
    statement: 'W granicach modelu Gaussa gęstość PDF maleje monotonicznie dla rosnącego x ≥ μ.',
    domainId: 'mathematics',
    modelId: 'math-gaussian',
    declaredAssumptions: [],
    falsification: {
      metric: 'pdfValue',
      relation: 'monotonic-decrease',
      rationale: 'Dla σ > 0 rozkład normalny maleje od średniej po dodatniej półosi.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'xValue', values: [0, 1, 2], label: 'x' },
  repetitionsPerArm: 2,
});

/** Already preregistered candidate protocol; it is selected but never executed here. */
const followUpDesign = designScientificExperiment({
  hypothesis: {
    statement: 'W granicach modelu Gaussa spadek PDF pozostaje obserwowalny dla rozszerzonego dodatniego zakresu x.',
    domainId: 'mathematics',
    modelId: 'math-gaussian',
    declaredAssumptions: [],
    falsification: {
      metric: 'pdfValue',
      relation: 'monotonic-decrease',
      rationale: 'Niezależnie prerejestrowany rozszerzony zakres dodatniego x.',
    },
  },
  baselineRequest,
  sweep: { parameter: 'xValue', values: [0, 3, 4], label: 'x' },
  repetitionsPerArm: 2,
});

const chain = await executeScientificExperimentOnBackend(design);
const evidencePack = createScientificEvidencePack(chain);
const research = createGenesisResearchPacket('rozkład normalny Gaussa');
const analysis = analyseExperimentSeries(chain.allRuns, 'xValue', 'pdfValue');
const candidate = formulateScientificHypothesisCandidate(analysis, chain);
const nextSelection = selectNextScientificExperiment({ evidence: chain, candidates: [followUpDesign] });
const discoveryCase = createDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
const reviewInput = {
  reviewerReference: 'e2e:declared-reviewer',
  reviewedAt: '2026-08-22T01:45:00.000Z',
  decision: 'ACCEPT_FOR_PREREGISTRATION' as const,
  rationale: 'Source-bound backend evidence jest odtwarzalne w granicach modelu i kwalifikuje się wyłącznie do niezależnej prerejestracji follow-up.',
};
const review = createScientificReviewDecision(discoveryCase, reviewInput);
const replayedCase = replayDiscoveryCaseRecord({ research, evidence: chain, analysis, candidate, nextSelection });
const replayedReview = replayScientificReviewDecision(discoveryCase, reviewInput);

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
  researchPacketIsSourceBound: research.status === 'RETRIEVED' && research.corpusSources.some((source) => source.domainId === 'mathematics'),
  analysisIsReviewable: analysis.findings.some((finding) => finding.kind === 'observed-correlation' && finding.verdict === 'REQUIRES_SCIENTIFIC_REVIEW'),
  candidateIsReviewGated: candidate.status === 'CANDIDATE_READY',
  nextProtocolWasPreRegistered: nextSelection.status === 'SELECTED' && nextSelection.selectedDesign?.designId === followUpDesign.designId,
  discoveryCaseIsCompatible: discoveryCase.status === 'READY_FOR_REVIEW',
  declaredReviewIsAuditable: review.decision === 'ACCEPT_FOR_PREREGISTRATION'
    && review.provenance.reviewerIdentity === 'DECLARED_NOT_VERIFIED',
  caseReplayMatches: replayedCase.caseFingerprint === discoveryCase.caseFingerprint,
  reviewReplayMatches: replayedReview.reviewFingerprint === review.reviewFingerprint,
};

if (Object.values(assertions).some((value) => !value)) {
  throw new Error(`Scientific backend E2E assertions failed: ${JSON.stringify({ assertions, chain, research, analysis, candidate, nextSelection, discoveryCase, review }, null, 2)}`);
}

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  backendBaseUrl,
  designId: design.designId,
  protocolFingerprint: design.protocolFingerprint,
  evidenceId: chain.evidenceId,
  provenanceFingerprint: chain.provenanceFingerprint,
  assessment: chain.assessment.assessment,
  researchPacketFingerprint: research.packetFingerprint,
  candidateId: candidate.candidateId,
  nextProtocolId: nextSelection.selectedDesign?.designId,
  discoveryCaseId: discoveryCase.caseId,
  discoveryCaseFingerprint: discoveryCase.caseFingerprint,
  reviewId: review.reviewId,
  reviewFingerprint: review.reviewFingerprint,
  runIds: chain.allRuns.map((run) => run.runId),
  runFingerprints: chain.allRuns.map((run) => run.provenance.runFingerprint),
  engines: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendEngine ?? 'unknown'))],
  modelVersions: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendModelVersion ?? 'unknown'))],
  assertionSummary: assertions,
}, null, 2)}\n`);
