import {
  buildExternalDatasetCase,
  type ExternalDatasetCase,
  type ExternalDatasetHypothesisInput,
} from '../agent/externalDatasetCase';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { runQe4BrydgesAnalysis, type Qe4AnalysisResult, type Qe4HypothesisResult, type Qe4Verdict } from './qe4BrydgesAnalysis';
import qe4Manifest from './qe4-brydges/manifest.json';

/**
 * QE4 EVIDENCE CASE — the ONLY file that imports both
 * `core/agent/externalDatasetCase.ts` (the new, domain-agnostic multi-verdict
 * container) and `qe4BrydgesAnalysis.ts` (the existing, unmodified scientific
 * module). Pure glue: reshapes QE4's own already-computed `Qe4HypothesisResult`s
 * into the generic container's input shape. Contains zero preregistration
 * text edits, zero bootstrap/threshold logic, zero verdict computation — see
 * `qe4BrydgesAnalysis.ts` for all of that, unchanged.
 */

export const QE4_EVIDENCE_CASE_ID = 'qe4-brydges-zenodo-2527010';

const HYPOTHESIS_STATEMENTS: Readonly<Record<Qe4HypothesisResult['id'], string>> = {
  P1: 'Clean 10-ion chain: ballistic entanglement growth with extensive (volume-law-like) saturation, k=1..5 at T=5ms.',
  P2: 'Disordered 10-ion chain: logarithmic-in-time growth with sub-extensive saturation relative to the clean system.',
  P3: 'A deliberately mixed-state preparation shows significantly higher S2 than a deliberately pure-state preparation.',
  P4: "Genesis's independently recomputed S2 agrees with the authors' own published RenyiEntropy values within a preregistered ±3σ_bootstrap band.",
};

/**
 * Translates QE4's own three-value verdict vocabulary onto the shared
 * `HypothesisAssessment` vocabulary for belief-revision bookkeeping ONLY —
 * `Qe4HypothesisResult.verdict` itself is stored and rendered verbatim,
 * never overwritten by this mapping.
 */
function qe4VerdictToAssessment(verdict: string): HypothesisAssessment {
  const v = verdict as Qe4Verdict;
  if (v === 'SUPPORTED_WITHIN_MODEL') return 'SUPPORTED_WITHIN_PROTOCOL';
  if (v === 'FALSIFIED') return 'FALSIFIED_WITHIN_PROTOCOL';
  return 'INCONCLUSIVE';
}

function criterionFor(id: Qe4HypothesisResult['id']): FalsificationCriterion {
  return {
    metric: `qe4-${id.toLowerCase()}`,
    relation: 'equal-within-tolerance',
    rationale: `Preregistered verdict rule for ${id} (docs/QE4_PREREGISTRATION.md) — the verdict itself is decided by QE4's own bootstrap/statistical procedure in qe4BrydgesAnalysis.ts, not by this belief-revision bookkeeping.`,
  };
}

function toInput(result: Qe4HypothesisResult): ExternalDatasetHypothesisInput {
  return {
    id: result.id,
    statement: HYPOTHESIS_STATEMENTS[result.id],
    verdict: result.verdict,
    reasons: result.reasons,
    tautology: result.tautology,
    toHypothesisAssessment: qe4VerdictToAssessment,
    criterion: criterionFor(result.id),
  };
}

interface Qe4Manifest {
  readonly zenodo: { readonly recordUrl: string; readonly doi: string; readonly license: string };
  readonly retrieval: { readonly retrievedAt: string };
}

/**
 * Builds the QE4 external dataset case from a QE4 analysis result.
 *
 * Defaults to running `runQe4BrydgesAnalysis()` itself (a pure function of
 * the pinned CSVs, deterministic — see `qe4BrydgesAnalysis.test.ts`'s own
 * replay test), but accepts an already-computed `analysis` so a caller doing
 * its own replay comparison does not need to reason about which of two
 * separately-run analyses this function used.
 */
export function buildQe4EvidenceCase(analysis: Qe4AnalysisResult = runQe4BrydgesAnalysis()): ExternalDatasetCase {
  const manifest = qe4Manifest as unknown as Qe4Manifest;
  return buildExternalDatasetCase({
    caseId: QE4_EVIDENCE_CASE_ID,
    provenance: {
      datasetId: 'zenodo-2527010-brydges-2019',
      sourceUrl: manifest.zenodo.recordUrl,
      sourceVersion: `DOI ${analysis.provenance.datasetDoi}`,
      retrievedAt: manifest.retrieval.retrievedAt,
      license: analysis.provenance.datasetLicense,
      archiveSha256: analysis.provenance.archiveSha256,
    },
    hypotheses: [analysis.p1, analysis.p2, analysis.p3, analysis.p4].map(toInput),
    domainResultFingerprint: analysis.resultFingerprint,
  });
}
