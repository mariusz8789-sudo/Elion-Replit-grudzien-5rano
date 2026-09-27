import { canonicalJson, fnv1a } from '../../events/hash';
import { VALUED_STATUSES } from './types';
import type {
  CandidateAssessment,
  CriterionResult,
  DiscoveryBatch,
  DiscoveryConstraints,
  DiscoveryCriterion,
  DiscoveryDecision,
  MoleculeCandidate,
  MoleculeProperty,
} from './types';

/**
 * MULTI-CRITERION SCREENING — deterministic, explainable, fail-closed.
 *
 * The one rule that matters: a criterion whose property has no value is
 * `NOT_AVAILABLE`, never `PASS`. Missing data can only ever move a candidate
 * to `NOT_RESOLVED` — it can never help it, and it can never be silently
 * dropped from the ranking rationale.
 */
export const SCREENING_VERSION = '1.0.0';

function propertyOf(candidate: MoleculeCandidate, propertyId: string): MoleculeProperty | undefined {
  return candidate.properties.find((p) => p.propertyId === propertyId);
}

function evaluateCriterion(candidate: MoleculeCandidate, criterion: DiscoveryCriterion): CriterionResult {
  const property = propertyOf(candidate, criterion.propertyId);
  if (property === undefined) {
    return {
      criterionId: criterion.criterionId, propertyId: criterion.propertyId, verdict: 'NOT_AVAILABLE',
      observed: null, observedStatus: 'NOT_AVAILABLE',
      detail: `Property "${criterion.propertyId}" is not present on this candidate.`,
    };
  }
  if (!VALUED_STATUSES.includes(property.status) || property.value === null) {
    return {
      criterionId: criterion.criterionId, propertyId: criterion.propertyId, verdict: 'NOT_AVAILABLE',
      observed: null, observedStatus: property.status,
      detail: `Property "${criterion.propertyId}" is ${property.status} — it cannot be scored, and is never read as a pass.`,
    };
  }

  const observed = property.value;
  const pass = criterion.op === 'lte' ? observed <= criterion.value
    : criterion.op === 'gte' ? observed >= criterion.value
      : observed >= criterion.value && observed <= (criterion.valueMax ?? criterion.value);
  const bound = criterion.op === 'range' ? `[${criterion.value}, ${criterion.valueMax ?? criterion.value}]` : `${criterion.op} ${criterion.value}`;
  return {
    criterionId: criterion.criterionId, propertyId: criterion.propertyId,
    verdict: pass ? 'PASS' : 'FAIL', observed, observedStatus: property.status,
    detail: `${criterion.propertyId} = ${observed} ${property.unit} (${property.status}) vs ${bound}.`,
  };
}

/**
 * Deterministic rank key over PASSED criteria only. Lower is better: it is the
 * summed normalised distance from each satisfied bound, so ranking never
 * rewards a candidate for a criterion that was unavailable.
 */
function rankScore(results: readonly CriterionResult[], criteria: readonly DiscoveryCriterion[]): number | null {
  const scored = results.filter((r) => r.verdict === 'PASS' && r.observed !== null);
  if (scored.length === 0) return null;
  let total = 0;
  for (const result of scored) {
    const criterion = criteria.find((c) => c.criterionId === result.criterionId)!;
    const reference = criterion.op === 'range' ? (criterion.value + (criterion.valueMax ?? criterion.value)) / 2 : criterion.value;
    const scale = Math.max(Math.abs(reference), 1);
    total += Math.abs(result.observed! - reference) / scale;
  }
  return Number((total / scored.length).toFixed(6));
}

export function assessCandidate(candidate: MoleculeCandidate, constraints: DiscoveryConstraints): CandidateAssessment {
  const criteria = constraints.criteria.map((criterion) => evaluateCriterion(candidate, criterion));
  const required = new Set(constraints.criteria.filter((c) => c.required).map((c) => c.criterionId));
  const failedRequired = criteria.filter((r) => required.has(r.criterionId) && r.verdict === 'FAIL').map((r) => r.criterionId);
  const unresolvedRequired = criteria.filter((r) => required.has(r.criterionId) && r.verdict === 'NOT_AVAILABLE').map((r) => r.criterionId);

  // Order matters: a real failure outranks missing data. A candidate that
  // actually violates a required bound is REJECTED even if something else is
  // unknown; only a candidate with no failures but missing required data is
  // NOT_RESOLVED. Neither is ever reported as retained.
  const verdict = failedRequired.length > 0 ? 'REJECTED' : unresolvedRequired.length > 0 ? 'NOT_RESOLVED' : 'RETAINED';

  return {
    candidateId: candidate.candidateId,
    formula: candidate.formula,
    verdict,
    criteria,
    failedRequired,
    unresolvedRequired,
    rankScore: rankScore(criteria, constraints.criteria),
  };
}

export function screenBatch(batch: DiscoveryBatch, constraints: DiscoveryConstraints): readonly CandidateAssessment[] {
  return batch.candidates.map((candidate) => assessCandidate(candidate, constraints));
}

/** Deterministic ordering: best rank first, ties broken by formula so runs are stable. */
export function rankRetained(assessments: readonly CandidateAssessment[]): readonly CandidateAssessment[] {
  return assessments
    .filter((a) => a.verdict === 'RETAINED')
    .slice()
    .sort((a, b) => (a.rankScore ?? Number.POSITIVE_INFINITY) - (b.rankScore ?? Number.POSITIVE_INFINITY) || a.formula.localeCompare(b.formula));
}

/**
 * Falsification of the batch hypothesis: "at least one enumerated candidate
 * satisfies every required criterion." FALSIFIED needs a real, measured
 * failure across the board; if nothing was retained only because required data
 * was missing, the honest verdict is NOT_RESOLVED, not falsification.
 */
export function decideBatch(assessments: readonly CandidateAssessment[]): DiscoveryDecision {
  const retainedCount = assessments.filter((a) => a.verdict === 'RETAINED').length;
  const rejectedCount = assessments.filter((a) => a.verdict === 'REJECTED').length;
  const notResolvedCount = assessments.filter((a) => a.verdict === 'NOT_RESOLVED').length;

  if (assessments.length === 0) {
    return { verdict: 'NOT_RESOLVED', reason: 'No candidates were enumerated — nothing was tested.', retainedCount, rejectedCount, notResolvedCount };
  }
  if (retainedCount > 0) {
    return { verdict: 'SUPPORTED_WITHIN_PROTOCOL', reason: `${retainedCount} candidate(s) satisfied every required criterion that could be evaluated.`, retainedCount, rejectedCount, notResolvedCount };
  }
  if (notResolvedCount > 0) {
    return { verdict: 'NOT_RESOLVED', reason: `No candidate was retained, but ${notResolvedCount} could not be fully evaluated (required properties unavailable). Absence of a pass is not evidence of failure.`, retainedCount, rejectedCount, notResolvedCount };
  }
  return { verdict: 'FALSIFIED_WITHIN_PROTOCOL', reason: `All ${rejectedCount} candidate(s) violated at least one required criterion on real, computed values.`, retainedCount, rejectedCount, notResolvedCount };
}

/** Capability gaps that actually blocked a criterion — surfaced, never hidden. */
export function collectCapabilityGaps(assessments: readonly CandidateAssessment[]): readonly { propertyId: string; status: string; detail: string }[] {
  const byProperty = new Map<string, { propertyId: string; status: string; detail: string }>();
  for (const assessment of assessments) {
    for (const result of assessment.criteria) {
      if (result.verdict !== 'NOT_AVAILABLE' || byProperty.has(result.propertyId)) continue;
      byProperty.set(result.propertyId, { propertyId: result.propertyId, status: result.observedStatus, detail: result.detail });
    }
  }
  return [...byProperty.values()].sort((a, b) => a.propertyId.localeCompare(b.propertyId));
}

export function screeningFingerprint(assessments: readonly CandidateAssessment[]): string {
  return fnv1a(canonicalJson({ v: SCREENING_VERSION, assessments }));
}
