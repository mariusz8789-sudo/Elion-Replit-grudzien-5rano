import {
  buildBiologicalValidationRequest, buildCandidateCombinationHypothesis, rankNaturalCompositionHypotheses,
  canonicalJson, fnv1a, type CandidateDiscoveryReport,
} from '../biotechDiscoveryContract';
import type {
  SubstitutionCandidateAssessment, SubstitutionComparisonRecord, SubstitutionInvestigationResult,
  SubstitutionPlannerSelection, SubstitutionVerdict,
} from './substitutionInvestigation';

/**
 * SUBSTITUTION PLANNER — the adaptive addition over the existing natural
 * functional replacement pipeline (`biotechData/naturalReplacement.ts` +
 * `biotechDiscoveryContract.ts`). See `substitutionInvestigation.ts`'s module
 * doc for exactly what is reused vs. new here.
 */

/**
 * A candidate's own already-computed fields decide the verdict — never a
 * free-text judgment. Target relevance is read directly from
 * `report.ranking.components.targetRelevance`, NOT re-derived by matching
 * `targetIds` strings against `requestedTargetIds` here: this repo's target
 * identifiers mix short receptor codes ("A1") and full ChEMBL target IDs
 * ("target:chembl:CHEMBL318") for the very same biological target, and the
 * only place that already resolves that mapping correctly is the report's
 * own `targetRelevance` (hardcoded from real domain knowledge for the pinned
 * reports in `chembl.ts`/`adenosine.ts`/`theophylline.ts`, and derived from
 * real ChEMBL assay context matching for sourced reports via
 * `enrichReportsWithCompute` in `naturalReplacement.ts`). Re-deriving target
 * matching here from `targetIds` text would silently disagree with that
 * existing, already-correct computation.
 */
export function assessSubstitutionCandidate(
  report: CandidateDiscoveryReport,
  requestedTargetIds: readonly string[],
): SubstitutionCandidateAssessment {
  const hasEvidence = report.evidenceIds.length > 0;
  const targetRelevance = report.ranking?.components.targetRelevance ?? 0;
  const matched = hasEvidence && targetRelevance > 0;

  const comparison: SubstitutionComparisonRecord = {
    candidateId: report.candidateId,
    reportId: report.reportId,
    predicted: 'source-backed evidence exists and the report\'s own target-relevance score is positive',
    observed: `targetIds=[${report.targetIds.join(', ') || 'none'}] evidenceIds=${report.evidenceIds.length} targetRelevance=${targetRelevance} (requested=[${requestedTargetIds.join(', ') || 'none'}])`,
    rule: 'MATCH requires: evidenceIds non-empty AND ranking.components.targetRelevance > 0',
    result: matched ? 'MATCH' : 'MISMATCH',
  };

  let verdict: SubstitutionVerdict;
  let verdictReason: string;
  if (!report.ranking) {
    verdict = 'INSUFFICIENT_DATA';
    verdictReason = 'no CandidateRanking computed for this report';
  } else if (comparison.result === 'MATCH') {
    verdict = 'CANDIDATE_HYPOTHESIS';
    verdictReason = `source-backed, target-relevant evidence present (research-priority score=${report.ranking.score})`;
  } else {
    verdict = 'INSUFFICIENT_DATA';
    verdictReason = 'ranking exists but no source-backed evidence directly supports the requested target(s)';
  }

  return {
    candidateId: report.candidateId, reportId: report.reportId, comparison, verdict, verdictReason,
    rankingScore: report.ranking?.score ?? null,
  };
}

/**
 * Adaptive selection: only candidates already assessed `CANDIDATE_HYPOTHESIS`
 * and not yet selected this investigation are eligible — spending a
 * validation request on an `INSUFFICIENT_DATA` candidate, or reselecting one
 * already queued, would not be adaptive, it would be wasted. Ties broken by
 * `candidateId` for determinism.
 */
export function selectNextValidationCandidate(
  assessments: readonly SubstitutionCandidateAssessment[],
  alreadySelected: ReadonlySet<string>,
): { selectedCandidateId: string | null; why: string; whyNot: string } {
  const eligible = assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS' && !alreadySelected.has(a.candidateId));
  if (eligible.length === 0) {
    return {
      selectedCandidateId: null,
      why: 'brak kandydatów CANDIDATE_HYPOTHESIS jeszcze nieuwzględnionych w kolejce walidacji',
      whyNot: 'n/a',
    };
  }
  const sorted = [...eligible].sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0) || a.candidateId.localeCompare(b.candidateId));
  const best = sorted[0]!;
  const runner = sorted[1];
  return {
    selectedCandidateId: best.candidateId,
    why: `najwyższy research-priority score (${best.rankingScore}) wśród kandydatów CANDIDATE_HYPOTHESIS jeszcze niewybranych`,
    whyNot: runner ? `${runner.candidateId} score=${runner.rankingScore} — niższy` : 'brak alternatywy',
  };
}

export interface SubstitutionInvestigationInput {
  readonly question: string;
  readonly reports: readonly CandidateDiscoveryReport[];
  readonly requestedTargetIds: readonly string[];
  /** Defaults to the number of CANDIDATE_HYPOTHESIS candidates — enough steps to queue every real candidate exactly once. */
  readonly maxSteps?: number;
}

/**
 * SUBSTITUTION INVESTIGATION — the real orchestrator. Reuses
 * `buildCandidateCombinationHypothesis`/`rankNaturalCompositionHypotheses`
 * (existing) for composition analysis, and `buildBiologicalValidationRequest`
 * (existing, always `BLOCKED` in this environment) for the validation
 * request attached to each planner step. The only new logic is the
 * comparison-driven verdict (`assessSubstitutionCandidate`) and the adaptive
 * cross-candidate planner (`selectNextValidationCandidate`) above.
 */
export function runSubstitutionInvestigation(input: SubstitutionInvestigationInput): SubstitutionInvestigationResult {
  const { question, reports, requestedTargetIds } = input;
  const byId = new Map(reports.map((r) => [r.candidateId, r]));
  const assessments = reports.map((r) => assessSubstitutionCandidate(r, requestedTargetIds));
  const candidateHypothesisCount = assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS').length;
  const maxStepsUsed = input.maxSteps ?? candidateHypothesisCount;

  const selected = new Set<string>();
  const steps: SubstitutionPlannerSelection[] = [];
  let stopReason = '';
  for (let step = 0; step < maxStepsUsed; step++) {
    const sel = selectNextValidationCandidate(assessments, selected);
    if (sel.selectedCandidateId === null) {
      stopReason = sel.why;
      steps.push({ stepIndex: step, selectedCandidateId: null, why: sel.why, whyNot: sel.whyNot, validationRequest: null });
      break;
    }
    selected.add(sel.selectedCandidateId);
    const report = byId.get(sel.selectedCandidateId)!;
    const validationRequest = buildBiologicalValidationRequest({
      hypothesisId: report.hypothesisId,
      candidateId: report.candidateId,
      targetIds: requestedTargetIds.length > 0 ? requestedTargetIds : report.targetIds,
    });
    steps.push({ stepIndex: step, selectedCandidateId: sel.selectedCandidateId, why: sel.why, whyNot: sel.whyNot, validationRequest });
  }
  if (!stopReason) stopReason = `osiągnięto maxSteps=${maxStepsUsed}`;

  const combinationHypothesis = buildCandidateCombinationHypothesis(reports, requestedTargetIds);
  const compositionHypotheses = rankNaturalCompositionHypotheses(reports, requestedTargetIds, 3);
  const bestCandidate = [...assessments]
    .filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS')
    .sort((a, b) => (b.rankingScore ?? 0) - (a.rankingScore ?? 0) || a.candidateId.localeCompare(b.candidateId))[0] ?? null;

  const identity = { question, requestedTargetIds, candidateIds: reports.map((r) => r.candidateId) };
  return {
    investigationId: `substitution-investigation:${fnv1a(canonicalJson(identity))}`,
    question, requestedTargetIds, candidateIds: reports.map((r) => r.candidateId),
    assessments, steps, maxStepsUsed,
    bestCandidateId: bestCandidate?.candidateId ?? null,
    combinationHypothesis, compositionHypotheses, stopReason,
  };
}
