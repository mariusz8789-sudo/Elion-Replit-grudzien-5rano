import type { BiologicalExperimentRequest, CandidateCombinationHypothesis, RankedCompositionHypothesis } from '../biotechDiscoveryContract';

/**
 * SUBSTITUTION INVESTIGATION — the type contract, decided after inspecting
 * the real repo (not guessed from an external draft).
 *
 * This is NOT a new candidate-generation, ranking, or comparison system: it
 * is a thin orchestration layer over what already exists and is already
 * wired into `DrugDiscoveryScreen.tsx` — `CandidateDiscoveryReport`,
 * `CandidateRanking` (`rankTherapeuticCandidate`), `CandidateComparison`
 * (`compareCandidateDiscoveryReports`), `CandidateCombinationHypothesis`
 * (`buildCandidateCombinationHypothesis`), `RankedCompositionHypothesis`
 * (`rankNaturalCompositionHypotheses`), and `BiologicalExperimentRequest`
 * (`buildBiologicalValidationRequest`) — all in `core/biotechDiscoveryContract.ts`.
 *
 * What was genuinely missing, and what this shape adds:
 *  1. A comparison-driven verdict per candidate (`SubstitutionComparisonRecord`
 *     + `SubstitutionVerdict`), derived from fields the existing reports
 *     already carry (`targetIds`, `evidenceIds`, `ranking.components.targetRelevance`)
 *     — never a free-form judgment.
 *  2. An adaptive planner that prioritizes WHICH candidate's validation
 *     request to pursue next across MULTIPLE competing candidates
 *     (`selectNextValidationCandidate` in `substitutionPlanner.ts`) — today,
 *     `buildBiologicalValidationRequest` is called once per candidate with no
 *     cross-candidate prioritization at all.
 *
 * `SubstitutionVerdict` deliberately has only two states, not four:
 * `CANDIDATE_HYPOTHESIS` (source-backed, target-relevant evidence present)
 * and `INSUFFICIENT_DATA` (it is not). A `REJECTED` state was considered and
 * dropped: rejecting on safety grounds would require the underlying
 * `SafetySignal` severity, which `CandidateDiscoveryReport` does not carry
 * (only `safetySignalIds`) — modeling `REJECTED` today would mean either
 * fabricating a severity signal the data does not contain, or gating on
 * `safetySignalIds.length` alone, which is meaningless here since every
 * candidate in the real pinned/live dataset always declares exactly one
 * safety signal (deliberately `UNKNOWN`, per `biotechData/naturalReplacement.ts`'s
 * own "no fabricated toxicity data" discipline). A `VALIDATED_SUBSTITUTE`
 * ceiling state is dropped for the same reason `buildBiologicalValidationRequest`
 * always returns `status: 'BLOCKED'` in this environment: there is no
 * biological executor to ever produce a passed validation result from.
 * Inventing either state here would be exactly the "unearned status" this
 * codebase's falsification discipline exists to refuse.
 */

export const SUBSTITUTION_INVESTIGATION_CONTRACT_VERSION = '1.0.0';

export type SubstitutionVerdict = 'CANDIDATE_HYPOTHESIS' | 'INSUFFICIENT_DATA';

/** The falsifiable comparison behind every verdict — never a bare `FALSIFY`/`SUPPORT` flag. */
export interface SubstitutionComparisonRecord {
  readonly candidateId: string;
  readonly reportId: string;
  readonly predicted: string;
  readonly observed: string;
  readonly rule: string;
  readonly result: 'MATCH' | 'MISMATCH';
}

export interface SubstitutionCandidateAssessment {
  readonly candidateId: string;
  readonly reportId: string;
  readonly comparison: SubstitutionComparisonRecord;
  readonly verdict: SubstitutionVerdict;
  readonly verdictReason: string;
  /** Mirrors `report.ranking?.score`; `null` when the report carries no ranking at all. */
  readonly rankingScore: number | null;
}

export interface SubstitutionPlannerSelection {
  readonly stepIndex: number;
  readonly selectedCandidateId: string | null;
  readonly why: string;
  readonly whyNot: string;
  /** The real `BiologicalExperimentRequest` for the selected candidate — always BLOCKED today; see module doc. */
  readonly validationRequest: BiologicalExperimentRequest | null;
}

export interface SubstitutionInvestigationResult {
  readonly investigationId: string;
  readonly question: string;
  readonly requestedTargetIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly assessments: readonly SubstitutionCandidateAssessment[];
  readonly steps: readonly SubstitutionPlannerSelection[];
  /** The `maxSteps` value actually used (explicit input or the computed default) — persisted so replay can reproduce it exactly. */
  readonly maxStepsUsed: number;
  readonly bestCandidateId: string | null;
  readonly combinationHypothesis: CandidateCombinationHypothesis | undefined;
  readonly compositionHypotheses: readonly RankedCompositionHypothesis[];
  readonly stopReason: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSubstitutionComparisonRecord(value: unknown): value is SubstitutionComparisonRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return nonEmptyString(v.candidateId) && nonEmptyString(v.reportId) && nonEmptyString(v.predicted)
    && nonEmptyString(v.observed) && nonEmptyString(v.rule) && (v.result === 'MATCH' || v.result === 'MISMATCH');
}

function isSubstitutionCandidateAssessment(value: unknown): value is SubstitutionCandidateAssessment {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return nonEmptyString(v.candidateId) && nonEmptyString(v.reportId) && isSubstitutionComparisonRecord(v.comparison)
    && (v.verdict === 'CANDIDATE_HYPOTHESIS' || v.verdict === 'INSUFFICIENT_DATA') && nonEmptyString(v.verdictReason)
    && (v.rankingScore === null || typeof v.rankingScore === 'number');
}

/**
 * Structural validation before anything is banked to Science Memory. Every
 * assessment must trace back to a declared candidate — anti-fabrication, not
 * just a non-empty-array check.
 */
export function isWellFormedSubstitutionInvestigation(value: unknown): value is SubstitutionInvestigationResult {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!nonEmptyString(v.investigationId) || !nonEmptyString(v.question)) return false;
  if (!Array.isArray(v.requestedTargetIds)) return false;
  if (!Array.isArray(v.candidateIds) || v.candidateIds.length === 0) return false;
  if (!Array.isArray(v.assessments) || v.assessments.length === 0 || !v.assessments.every(isSubstitutionCandidateAssessment)) return false;
  if (!Array.isArray(v.steps)) return false;
  if (typeof v.maxStepsUsed !== 'number') return false;
  if (!nonEmptyString(v.stopReason)) return false;
  const candidateIds = new Set(v.candidateIds as string[]);
  for (const a of v.assessments as SubstitutionCandidateAssessment[]) {
    if (!candidateIds.has(a.candidateId)) return false;
  }
  return true;
}
