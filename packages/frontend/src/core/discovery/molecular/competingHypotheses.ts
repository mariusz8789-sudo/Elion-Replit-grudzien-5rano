import { assessHypothesis, type ExperimentalResult, type HypothesisAssessment, type TestableHypothesis } from './experimentalResult';

/**
 * MULTI-HYPOTHESIS COMPETITION.
 *
 * `experimentalResult.ts` already assesses ONE hypothesis against ingested
 * results. Real discovery rarely has one hypothesis: a mechanism might be
 * open-channel block, or competitive antagonism, or no direct engagement at
 * all, and the same evidence has to be checked against all three at once.
 * This module runs the existing single-hypothesis assessment over a SET and
 * adds only what a set needs: a competition-level status, and a ranking that
 * a single assessment cannot express on its own (a hypothesis can be
 * SUPPORTED by evidence and still lose a comparison to another hypothesis
 * supported by MORE independent evidence).
 *
 * WEAKENED is the state the single-hypothesis vocabulary is missing: a
 * hypothesis that is not FALSIFIED (no result contradicts it) but is also not
 * the best-supported one in its own competition — because a competitor now
 * has evidence it lacks. This must never collapse into SUPPORTED just because
 * nothing refuted it.
 */
export const COMPETING_HYPOTHESES_VERSION = '1.0.0';

export type CompetitionStatus = 'SUPPORTED' | 'WEAKENED' | 'FALSIFIED' | 'UNTESTED' | 'BLOCKED';

export interface CompetingHypothesisOutcome {
  hypothesisId: string;
  assessment: HypothesisAssessment;
  competitionStatus: CompetitionStatus;
  /** Independent deciding results — the count `assessHypothesis` already isolates. */
  independentEvidenceCount: number;
  reason: string;
}

export interface HypothesisCompetitionResult {
  outcomes: readonly CompetingHypothesisOutcome[];
  /** Highest-ranked hypothesis id still standing, or null when none is SUPPORTED. */
  leadingHypothesis: string | null;
  /** True only when exactly one hypothesis is SUPPORTED and every other competitor is FALSIFIED or WEAKENED. */
  discriminated: boolean;
  summary: string;
}

function mapStatus(status: HypothesisAssessment['status']): 'SUPPORTED' | 'FALSIFIED' | 'UNTESTED' | 'UNRESOLVED' {
  if (status === 'SUPPORTED') return 'SUPPORTED';
  if (status === 'FALSIFIED') return 'FALSIFIED';
  if (status === 'UNTESTED') return 'UNTESTED';
  return 'UNRESOLVED'; // UNCHANGED_NO_DISCRIMINATING_RESULT
}

/**
 * Runs every hypothesis through the existing single-hypothesis assessor, then
 * resolves the competition: exactly one SUPPORTED hypothesis with the most
 * independent evidence leads; every other SUPPORTED hypothesis is demoted to
 * WEAKENED, because two mutually exclusive mechanisms cannot both be the
 * leading explanation for the same evidence.
 *
 * `mutuallyExclusive` groups declare which hypothesis ids compete with each
 * other; hypotheses outside any group never demote one another.
 */
export function runHypothesisCompetition(
  hypotheses: readonly TestableHypothesis[],
  results: readonly ExperimentalResult[],
  mutuallyExclusiveGroups: readonly (readonly string[])[],
): HypothesisCompetitionResult {
  const assessments = hypotheses.map((h) => ({ hypothesis: h, assessment: assessHypothesis(h, results) }));

  const groupOf = new Map<string, number>();
  mutuallyExclusiveGroups.forEach((group, index) => group.forEach((id) => groupOf.set(id, index)));

  const outcomes: CompetingHypothesisOutcome[] = assessments.map(({ hypothesis, assessment }) => {
    const mapped = mapStatus(assessment.status);
    const independentEvidenceCount = assessment.decidingResultIds.length;

    if (mapped === 'FALSIFIED') {
      return { hypothesisId: hypothesis.hypothesisId, assessment, competitionStatus: 'FALSIFIED', independentEvidenceCount, reason: assessment.reasoning };
    }
    if (mapped === 'UNTESTED') {
      return { hypothesisId: hypothesis.hypothesisId, assessment, competitionStatus: 'UNTESTED', independentEvidenceCount, reason: assessment.reasoning };
    }
    if (mapped === 'UNRESOLVED') {
      return { hypothesisId: hypothesis.hypothesisId, assessment, competitionStatus: 'BLOCKED', independentEvidenceCount, reason: `Evidence conflicts within this hypothesis's own deciding results: ${assessment.reasoning}` };
    }
    // SUPPORTED for now; may be demoted to WEAKENED below by a stronger competitor.
    return { hypothesisId: hypothesis.hypothesisId, assessment, competitionStatus: 'SUPPORTED', independentEvidenceCount, reason: assessment.reasoning };
  });

  // Within each mutually-exclusive group, only the SUPPORTED hypothesis with
  // the most independent evidence keeps SUPPORTED; every other SUPPORTED
  // competitor in the same group is demoted to WEAKENED.
  for (const group of mutuallyExclusiveGroups) {
    const supportedInGroup = outcomes.filter((o) => group.includes(o.hypothesisId) && o.competitionStatus === 'SUPPORTED');
    if (supportedInGroup.length <= 1) continue;
    const winner = [...supportedInGroup].sort((a, b) => b.independentEvidenceCount - a.independentEvidenceCount)[0]!;
    for (const outcome of supportedInGroup) {
      if (outcome.hypothesisId === winner.hypothesisId) continue;
      const index = outcomes.findIndex((o) => o.hypothesisId === outcome.hypothesisId);
      outcomes[index] = {
        ...outcome,
        competitionStatus: 'WEAKENED',
        reason: `Supported by its own evidence (${outcome.independentEvidenceCount} independent result(s)), but demoted to WEAKENED: `
          + `${winner.hypothesisId} is mutually exclusive with this hypothesis and is supported by more independent evidence (${winner.independentEvidenceCount}). `
          + 'Both cannot be the leading explanation for the same evidence at once.',
      };
    }
  }

  const supported = outcomes.filter((o) => o.competitionStatus === 'SUPPORTED');
  const leadingHypothesis = supported.length > 0
    ? [...supported].sort((a, b) => b.independentEvidenceCount - a.independentEvidenceCount)[0]!.hypothesisId
    : null;

  const discriminated = supported.length === 1
    && outcomes.filter((o) => o.hypothesisId !== leadingHypothesis).every((o) => o.competitionStatus === 'FALSIFIED' || o.competitionStatus === 'WEAKENED');

  const counts = {
    supported: outcomes.filter((o) => o.competitionStatus === 'SUPPORTED').length,
    weakened: outcomes.filter((o) => o.competitionStatus === 'WEAKENED').length,
    falsified: outcomes.filter((o) => o.competitionStatus === 'FALSIFIED').length,
    untested: outcomes.filter((o) => o.competitionStatus === 'UNTESTED').length,
    blocked: outcomes.filter((o) => o.competitionStatus === 'BLOCKED').length,
  };

  return {
    outcomes,
    leadingHypothesis,
    discriminated,
    summary: leadingHypothesis === null
      ? `No hypothesis is currently supported among ${hypotheses.length}: ${counts.untested} untested, ${counts.falsified} falsified, ${counts.blocked} blocked on conflicting evidence.`
      : `${leadingHypothesis} leads among ${hypotheses.length} competing hypothes(es) (${counts.supported} supported, ${counts.weakened} weakened, ${counts.falsified} falsified, ${counts.untested} untested). `
        + (discriminated ? 'The evidence discriminates it from every competitor.' : 'The evidence does not yet discriminate it from every competitor.'),
  };
}
