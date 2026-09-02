import { VALUED_STATUSES, type CandidateAssessment, type CriterionResult, type DiscoveryConstraints, type DiscoveryCriterion, type MoleculeCandidate } from './types';

/**
 * ETAP 7 — FALSIFICATION PER CANDIDATE.
 *
 * For every retained candidate the loop should be able to answer: what would
 * make this fail? A retained candidate is a candidate that has not yet been
 * refuted, and the difference between that and "a good molecule" is the whole
 * discipline.
 *
 * Two kinds of answer are produced and never mixed:
 *
 *  - RUNNABLE_NOW    a check Genesis can actually perform, on values it already
 *                    has. The only honest example is margin: how close a
 *                    passing value sits to the bound it passed. That is real
 *                    arithmetic on real measurements, and a candidate passing
 *                    by 0.4% is genuinely more fragile than one passing by 60%.
 *  - REQUIRES_EXTERNAL  a check that would decide the question but cannot be
 *                    run here, named with what it needs.
 *
 * There is deliberately no third category for "checks we simulated". Nothing
 * in this module produces a substitute for an experiment, and no output here
 * is evidence that a candidate is correct — only, at most, that a specific way
 * of refuting it did not succeed with the data at hand.
 */
export const FALSIFICATION_VERSION = '1.0.0';

export type FalsificationKind = 'RUNNABLE_NOW' | 'REQUIRES_EXTERNAL';

export interface FalsificationCheck {
  kind: FalsificationKind;
  checkId: string;
  /** The question this check asks, stated as a way the candidate could fail. */
  question: string;
  /** For RUNNABLE_NOW: what the real data says. For REQUIRES_EXTERNAL: what is needed. */
  finding: string;
  /** Present only for margin checks: fractional distance from the bound. */
  marginFraction: number | null;
  /** True when a runnable check found the candidate fragile against this criterion. */
  fragile: boolean;
}

export interface CandidateFalsification {
  candidateId: string;
  formula: string;
  checks: readonly FalsificationCheck[];
  /** Criteria the candidate passes by a thin margin, most fragile first. */
  fragileCriteria: readonly string[];
  /** Honest summary of how refutable this candidate currently is. */
  robustnessStatement: string;
}

/**
 * Fraction of the allowed range by which a passing value clears its bound.
 * Returns null when there is no meaningful scale to normalise against, rather
 * than inventing one.
 */
export function passMargin(result: CriterionResult, criterion: DiscoveryCriterion): number | null {
  if (result.verdict !== 'PASS' || result.observed === null) return null;
  const observed = result.observed;

  if (criterion.op === 'lte') {
    const scale = Math.abs(criterion.value);
    return scale === 0 ? null : (criterion.value - observed) / scale;
  }
  if (criterion.op === 'gte') {
    const scale = Math.abs(criterion.value);
    return scale === 0 ? null : (observed - criterion.value) / scale;
  }
  // range: distance to the nearer edge, over the half-width.
  const lower = criterion.value;
  const upper = criterion.valueMax ?? criterion.value;
  const halfWidth = (upper - lower) / 2;
  if (halfWidth <= 0) return null;
  return Math.min(observed - lower, upper - observed) / halfWidth;
}

/** A pass this close to its bound is one small change away from failing. */
export const FRAGILE_MARGIN_THRESHOLD = 0.1;

/**
 * Builds the falsification report for one candidate.
 *
 * `unresolvedProperties` are properties the candidate carries with no real
 * value; each becomes a REQUIRES_EXTERNAL check naming what would decide it.
 */
export function falsifyCandidate(
  candidate: MoleculeCandidate,
  assessment: CandidateAssessment,
  constraints: DiscoveryConstraints,
): CandidateFalsification {
  const checks: FalsificationCheck[] = [];
  const fragile: { criterionId: string; margin: number }[] = [];

  // 1. Margin checks — real arithmetic on values that really exist.
  for (const result of assessment.criteria) {
    const criterion = constraints.criteria.find((c) => c.criterionId === result.criterionId);
    if (criterion === undefined) continue;

    if (result.verdict === 'PASS') {
      const margin = passMargin(result, criterion);
      const isFragile = margin !== null && margin < FRAGILE_MARGIN_THRESHOLD;
      if (isFragile) fragile.push({ criterionId: criterion.criterionId, margin });
      checks.push({
        kind: 'RUNNABLE_NOW',
        checkId: `margin:${criterion.criterionId}`,
        question: `Would a small change in ${criterion.propertyId} push this candidate outside "${criterion.criterionId}"?`,
        finding: margin === null
          ? `Passes "${criterion.criterionId}", but the bound has no scale to measure a margin against.`
          : `Passes "${criterion.criterionId}" with ${(margin * 100).toFixed(1)}% margin${isFragile ? ' — thin enough that a small correction to the value could flip it' : ''}.`,
        marginFraction: margin,
        fragile: isFragile,
      });
      continue;
    }

    if (result.verdict === 'NOT_AVAILABLE') {
      checks.push({
        kind: 'REQUIRES_EXTERNAL',
        checkId: `unevaluated:${criterion.criterionId}`,
        question: `Does this candidate actually satisfy "${criterion.criterionId}"?`,
        finding: `Unknown: ${criterion.propertyId} is ${result.observedStatus}. This criterion has neither passed nor failed — it was never tested.`,
        marginFraction: null,
        fragile: false,
      });
    }
  }

  // 2. Properties with no value at all — each is a way this candidate could
  //    still be refuted, and none of them can be settled here.
  for (const property of candidate.properties) {
    if (VALUED_STATUSES.includes(property.status) && property.value !== null) continue;
    checks.push({
      kind: 'REQUIRES_EXTERNAL',
      checkId: `unmeasured:${property.propertyId}`,
      question: `Could ${property.propertyId} disqualify this candidate?`,
      finding: property.status === 'REQUIRES_EXPERIMENT'
        ? `Cannot be answered computationally: ${property.propertyId} requires experimental measurement.`
        : `Cannot be answered here: ${property.propertyId} is ${property.status} and needs an external engine.`,
      marginFraction: null,
      fragile: false,
    });
  }

  fragile.sort((a, b) => a.margin - b.margin);
  const runnableCount = checks.filter((c) => c.kind === 'RUNNABLE_NOW').length;
  const externalCount = checks.filter((c) => c.kind === 'REQUIRES_EXTERNAL').length;

  const robustnessStatement = assessment.verdict !== 'RETAINED'
    ? `Not retained (${assessment.verdict}); no robustness claim applies.`
    : [
      `Survived ${runnableCount} check(s) that could actually be run`,
      fragile.length > 0
        ? `but passes ${fragile.length} of them by under ${FRAGILE_MARGIN_THRESHOLD * 100}% margin (${fragile.map((f) => f.criterionId).join(', ')})`
        : 'with no thin margins',
      `and ${externalCount} way(s) of refuting it remain untested because Genesis cannot test them here.`,
      'Surviving the available checks is not evidence of correctness.',
    ].join('; ');

  return {
    candidateId: candidate.candidateId,
    formula: candidate.formula,
    checks,
    fragileCriteria: fragile.map((f) => f.criterionId),
    robustnessStatement,
  };
}

export interface BatchFalsification {
  perCandidate: readonly CandidateFalsification[];
  /** Candidates whose retention rests on at least one thin margin. */
  fragileCandidateIds: readonly string[];
  /** Untestable refutation routes shared across the batch, deduplicated. */
  untestedRefutations: readonly string[];
}

export function falsifyBatch(
  candidates: readonly MoleculeCandidate[],
  assessments: readonly CandidateAssessment[],
  constraints: DiscoveryConstraints,
): BatchFalsification {
  const assessmentById = new Map(assessments.map((a) => [a.candidateId, a]));
  const perCandidate = candidates
    .map((candidate) => {
      const assessment = assessmentById.get(candidate.candidateId);
      return assessment === undefined ? null : falsifyCandidate(candidate, assessment, constraints);
    })
    .filter((f): f is CandidateFalsification => f !== null);

  const untested = new Set<string>();
  for (const candidate of perCandidate) {
    for (const check of candidate.checks) {
      if (check.kind === 'REQUIRES_EXTERNAL') untested.add(check.checkId);
    }
  }

  return {
    perCandidate,
    fragileCandidateIds: perCandidate.filter((c) => c.fragileCriteria.length > 0).map((c) => c.candidateId),
    untestedRefutations: [...untested].sort(),
  };
}
