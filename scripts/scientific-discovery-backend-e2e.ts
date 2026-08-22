/*
 * Real E2E proof for Discovery → Backend Fabric.
 *
 * Usage:
 *   GENESIS_E2E_BACKEND_BASE_URL=http://127.0.0.1:18123 \
 *     npx esbuild scripts/scientific-discovery-backend-e2e.ts --bundle --platform=node --format=esm --outfile=/tmp/genesis-discovery-e2e.mjs \
 *     && node /tmp/genesis-discovery-e2e.mjs
 *
 * This script intentionally does not invent a backend result. It forwards the
 * frontend client's relative /api request to an already running real Genesis
 * backend and fails unless the resulting ScientificEvidenceChain carries real
 * engine provenance and deterministic repeats match semantically.
 */

import {
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperimentOnBackend,
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
  baselineRequest: {
    contractVersion: '1.0.0',
    sourceText: 'Prerejestrowany realny E2E Discovery protocol: Gaussian PDF.',
    domainId: 'mathematics',
    operation: 'compute',
    modelId: 'math-gaussian',
    parameters: { mean: 0, sigma: 1, xValue: 0 },
  },
  sweep: { parameter: 'xValue', values: [0, 1, 2], label: 'x' },
  repetitionsPerArm: 2,
});

const chain = await executeScientificExperimentOnBackend(design);
const evidencePack = createScientificEvidencePack(chain);
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
};

if (Object.values(assertions).some((value) => !value)) {
  throw new Error(`Scientific backend E2E assertions failed: ${JSON.stringify({ assertions, chain }, null, 2)}`);
}

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  backendBaseUrl,
  designId: design.designId,
  protocolFingerprint: design.protocolFingerprint,
  evidenceId: chain.evidenceId,
  provenanceFingerprint: chain.provenanceFingerprint,
  assessment: chain.assessment.assessment,
  runIds: chain.allRuns.map((run) => run.runId),
  runFingerprints: chain.allRuns.map((run) => run.provenance.runFingerprint),
  engines: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendEngine ?? 'unknown'))],
  modelVersions: [...new Set(chain.allRuns.map((run) => run.provenance.backendExecution?.backendModelVersion ?? 'unknown'))],
  assertionSummary: assertions,
}, null, 2)}\n`);
