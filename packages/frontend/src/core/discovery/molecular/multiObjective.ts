import { VALUED_STATUSES, type CandidateAssessment, type DiscoveryConstraints, type MoleculeCandidate } from './types';

/**
 * ETAP 6 — MULTI-OBJECTIVE SCIENTIFIC SEARCH.
 *
 * The existing `rankRetained` collapses every criterion into one scalar, which
 * silently trades objectives off against each other at a fixed exchange rate
 * nobody declared. This adds the honest alternative: report the objectives
 * separately and identify the non-dominated (Pareto) set, so "best" is a
 * defensible statement about trade-offs rather than an artefact of averaging.
 *
 * THE RULE THAT MATTERS: an objective a candidate has no real value for does
 * not participate in its ranking. It cannot help it and cannot hurt it. A
 * missing measurement is not a zero, not a median, and not a penalty — those
 * are all ways of letting an absent number influence a conclusion.
 *
 * Dominance here matches `packages/backend/src/campaign/pareto.mjs` exactly
 * (minimisation; a dominates b when it is no worse on all objectives and
 * strictly better on at least one). That equivalence is asserted by test
 * against the backend's own implementation rather than assumed, because the
 * frontend cannot import backend .mjs into a browser bundle.
 */
export const MULTI_OBJECTIVE_VERSION = '1.0.0';

export type ObjectiveDirection = 'minimise' | 'maximise' | 'target';

export interface Objective {
  objectiveId: string;
  propertyId: string;
  direction: ObjectiveDirection;
  /** Required for 'target': the value to be close to. */
  targetValue?: number;
  rationale: string;
}

export type ObjectiveValue =
  | { objectiveId: string; evaluable: true; raw: number; cost: number; engine: string }
  | { objectiveId: string; evaluable: false; reason: string; status: string };

export interface CandidateObjectives {
  candidateId: string;
  formula: string;
  values: readonly ObjectiveValue[];
  /** Objectives with a real value — the only ones that may affect ranking. */
  evaluableCount: number;
}

/**
 * Normalises one objective to a COST (lower is better), so several directions
 * can be compared. Only a property whose status carries a real value is read.
 */
export function objectiveValueFor(candidate: MoleculeCandidate, objective: Objective): ObjectiveValue {
  const property = candidate.properties.find((p) => p.propertyId === objective.propertyId);
  if (property === undefined) {
    return { objectiveId: objective.objectiveId, evaluable: false, reason: `Candidate carries no "${objective.propertyId}" property at all.`, status: 'NOT_AVAILABLE' };
  }
  if (!VALUED_STATUSES.includes(property.status) || property.value === null) {
    return {
      objectiveId: objective.objectiveId,
      evaluable: false,
      reason: `"${objective.propertyId}" is ${property.status}; it carries no value and therefore cannot influence ranking.`,
      status: property.status,
    };
  }

  const raw = property.value;
  const cost = objective.direction === 'minimise'
    ? raw
    : objective.direction === 'maximise'
      ? -raw
      : Math.abs(raw - (objective.targetValue ?? 0));

  return { objectiveId: objective.objectiveId, evaluable: true, raw, cost, engine: property.engine ?? 'unknown' };
}

export function candidateObjectives(candidate: MoleculeCandidate, objectives: readonly Objective[]): CandidateObjectives {
  const values = objectives.map((objective) => objectiveValueFor(candidate, objective));
  return {
    candidateId: candidate.candidateId,
    formula: candidate.formula,
    values,
    evaluableCount: values.filter((v) => v.evaluable).length,
  };
}

/**
 * Minimisation dominance, identical to the backend's `dominates`.
 * Both vectors must cover the same objectives in the same order.
 */
export function dominates(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  let strictly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! > b[i]!) return false;
    if (a[i]! < b[i]!) strictly = true;
  }
  return strictly;
}

export function paretoFrontIndices(vectors: readonly (readonly number[])[]): readonly number[] {
  const front: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    let dominated = false;
    for (let j = 0; j < vectors.length; j++) {
      if (i !== j && dominates(vectors[j]!, vectors[i]!)) { dominated = true; break; }
    }
    if (!dominated) front.push(i);
  }
  return front;
}

export type MultiObjectiveOutcome = 'RETAINED' | 'REJECTED' | 'UNEVALUABLE' | 'BLOCKED';

export interface RankedCandidate {
  candidateId: string;
  formula: string;
  outcome: MultiObjectiveOutcome;
  /** Why this candidate landed where it did, in words. */
  justification: string;
  objectives: CandidateObjectives;
  /** True only for candidates on the non-dominated front. */
  onParetoFront: boolean;
  /** Objectives that could not be evaluated, named. */
  missingObjectives: readonly string[];
}

export interface MultiObjectiveResult {
  objectives: readonly Objective[];
  ranked: readonly RankedCandidate[];
  retained: readonly RankedCandidate[];
  rejected: readonly RankedCandidate[];
  unevaluable: readonly RankedCandidate[];
  blocked: readonly RankedCandidate[];
  /**
   * Objectives no candidate could evaluate. A front computed without these is
   * a front over a SUBSET of the declared objectives, and saying so is the
   * difference between a ranking and a misleading ranking.
   */
  objectivesNeverEvaluable: readonly string[];
  /** Plain statement of what the front does and does not account for. */
  frontCaveat: string;
}

/**
 * Ranks a screened batch over declared objectives.
 *
 * Screening outcome is authoritative and is never overridden: a candidate the
 * criteria REJECTED stays rejected however good its objective values look, and
 * a NOT_RESOLVED candidate is UNEVALUABLE rather than quietly ranked. Only
 * candidates that passed screening compete on the Pareto front.
 *
 * The front is computed over the objectives EVERY competing candidate can
 * evaluate. Comparing candidates on different objective subsets would make
 * dominance meaningless, so a candidate missing any of those objectives is
 * BLOCKED — reported, with the missing objectives named, never dropped.
 */
export function rankMultiObjective(
  candidates: readonly MoleculeCandidate[],
  assessments: readonly CandidateAssessment[],
  objectives: readonly Objective[],
  _constraints?: DiscoveryConstraints,
): MultiObjectiveResult {
  const byId = new Map(candidates.map((c) => [c.candidateId, c]));
  const assessmentById = new Map(assessments.map((a) => [a.candidateId, a]));

  const withObjectives = candidates.map((candidate) => ({
    candidate,
    objectives: candidateObjectives(candidate, objectives),
    assessment: assessmentById.get(candidate.candidateId),
  }));

  const objectivesNeverEvaluable = objectives
    .filter((o) => withObjectives.every((w) => !w.objectives.values.find((v) => v.objectiveId === o.objectiveId)?.evaluable))
    .map((o) => o.objectiveId);

  // Candidates that passed screening are the only ones that compete.
  const competitors = withObjectives.filter((w) => w.assessment?.verdict === 'RETAINED');

  const isComplete = (w: typeof withObjectives[number]) =>
    objectives.length > 0 && objectives.every((o) => w.objectives.values.find((v) => v.objectiveId === o.objectiveId)?.evaluable === true);

  /**
   * Choosing the objective set to compare on.
   *
   * One candidate missing an objective must NOT silently delete that objective
   * for everybody — that would let a data gap in one molecule quietly change
   * what "best" means for all the others. So when at least one competitor has
   * every objective, the comparison runs over ALL declared objectives among
   * those complete candidates, and the incomplete ones are reported BLOCKED.
   *
   * Only when no competitor is complete does the set fall back to the
   * objectives every competitor shares — a genuinely narrower question, which
   * `frontCaveat` then states explicitly.
   */
  const completeCompetitors = competitors.filter(isComplete);
  const comparisonBasis = completeCompetitors.length > 0 ? 'complete' : 'shared';
  const comparableObjectives = comparisonBasis === 'complete'
    ? objectives
    : objectives.filter((o) =>
      competitors.length > 0 && competitors.every((w) => w.objectives.values.find((v) => v.objectiveId === o.objectiveId)?.evaluable === true));
  const frontCompetitors = comparisonBasis === 'complete' ? completeCompetitors : competitors;

  const frontMembers = new Set<string>();
  if (comparableObjectives.length > 0 && frontCompetitors.length > 0) {
    const vectors = frontCompetitors.map((w) =>
      comparableObjectives.map((o) => {
        const value = w.objectives.values.find((v) => v.objectiveId === o.objectiveId);
        return value !== undefined && value.evaluable ? value.cost : Number.POSITIVE_INFINITY;
      }));
    for (const index of paretoFrontIndices(vectors)) frontMembers.add(frontCompetitors[index]!.candidate.candidateId);
  }

  const ranked: RankedCandidate[] = withObjectives.map((w) => {
    const missingObjectives = w.objectives.values.filter((v) => !v.evaluable).map((v) => v.objectiveId);
    const verdict = w.assessment?.verdict;

    let outcome: MultiObjectiveOutcome;
    let justification: string;

    if (verdict === 'REJECTED') {
      outcome = 'REJECTED';
      justification = `Failed required criteria on real values: ${w.assessment!.failedRequired.join(', ')}. Objective values cannot rescue a candidate that violates a declared constraint.`;
    } else if (verdict === 'NOT_RESOLVED') {
      outcome = 'UNEVALUABLE';
      justification = `Required criteria could not be evaluated (${w.assessment!.unresolvedRequired.join(', ')}). This is missing data, not a failure.`;
    } else if (comparableObjectives.length === 0) {
      outcome = 'BLOCKED';
      justification = objectives.length === 0
        ? 'No objectives were declared, so no ranking was performed.'
        : `No objective could be evaluated for every competing candidate, so no meaningful comparison exists. Unevaluable: ${objectivesNeverEvaluable.join(', ') || 'varies by candidate'}.`;
    } else if (missingObjectives.some((id) => comparableObjectives.some((o) => o.objectiveId === id))) {
      outcome = 'BLOCKED';
      justification = `Cannot be compared on the shared objective set; missing: ${missingObjectives.join(', ')}. Ranking it against candidates with more data would be a comparison of different things.`;
    } else {
      outcome = 'RETAINED';
      justification = frontMembers.has(w.candidate.candidateId)
        ? `On the non-dominated front over ${comparableObjectives.length} evaluable objective(s): no competing candidate is at least as good on all of them and better on one.`
        : `Passed all required criteria but is dominated on the ${comparableObjectives.length} evaluable objective(s) by at least one other candidate.`;
    }

    return {
      candidateId: w.candidate.candidateId,
      formula: w.candidate.formula,
      outcome,
      justification,
      objectives: w.objectives,
      onParetoFront: frontMembers.has(w.candidate.candidateId),
      missingObjectives,
    };
  });

  // Deterministic order: front first, then retained, then the rest by formula.
  const sorted = [...ranked].sort((a, b) =>
    Number(b.onParetoFront) - Number(a.onParetoFront)
    || a.outcome.localeCompare(b.outcome)
    || a.formula.localeCompare(b.formula));

  const frontCaveat = comparableObjectives.length === 0
    ? 'No Pareto front was computed: no objective was evaluable for every competing candidate.'
    : `Pareto front computed over ${comparableObjectives.length} of ${objectives.length} declared objective(s): ${comparableObjectives.map((o) => o.objectiveId).join(', ')},`
      + ` among ${frontCompetitors.length} candidate(s) with values for all of them.`
      + (comparisonBasis === 'shared'
        ? ' No candidate had every declared objective, so the comparison was narrowed to the objectives all competitors share — a narrower question than the one declared.'
        : '')
      + (objectivesNeverEvaluable.length > 0
        ? ` Not accounted for, because no candidate had a real value: ${objectivesNeverEvaluable.join(', ')}.`
        : '');

  void byId;

  return {
    objectives,
    ranked: sorted,
    retained: sorted.filter((r) => r.outcome === 'RETAINED'),
    rejected: sorted.filter((r) => r.outcome === 'REJECTED'),
    unevaluable: sorted.filter((r) => r.outcome === 'UNEVALUABLE'),
    blocked: sorted.filter((r) => r.outcome === 'BLOCKED'),
    objectivesNeverEvaluable,
    frontCaveat,
  };
}
