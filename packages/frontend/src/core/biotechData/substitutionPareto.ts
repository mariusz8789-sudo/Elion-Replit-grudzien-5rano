import type { CandidateRanking } from '../biotechDiscoveryContract';

/**
 * SUBSTITUTION PARETO + COUNTERFACTUAL — adapted from an external draft
 * (Qwen), given the exact real `CandidateRanking`/`CandidateRankingComponents`
 * shape (`biotechDiscoveryContract.ts`) and nothing else. The draft's own
 * standalone `RankedCandidate` type is replaced here by the canonical
 * `CandidateRanking` already used throughout the substitution investigation
 * — same fields, so no behavior changed, just no parallel type.
 *
 * Multi-objective comparison over `CandidateRanking.components`
 * (`evidenceQuality`/`targetRelevance`/`safetyPenalty`/`uncertaintyPenalty`/
 * `computeSupport?`) — never a reimplementation of the ranking itself
 * (`rankTherapeuticCandidate`), which this module has no dependency on.
 */

export type ComponentAxis = keyof CandidateRanking['components'];

export interface CounterfactualScenario {
  readonly replacementFraction: number;
  readonly potencyFactor: number;
  readonly toxicityLimit: number | null;
}

export interface CounterfactualResult {
  readonly candidateId: string;
  readonly scenario: CounterfactualScenario;
  readonly functionRetained: number;
  readonly violations: readonly string[];
  readonly label: 'COUNTERFACTUAL/SIMULATED';
  readonly mergedIntoEvidence: false;
}

/** `safetyPenalty`/`uncertaintyPenalty` are penalties: lower is better. Every other component: higher is better. */
const PENALTY_AXES: readonly ComponentAxis[] = ['safetyPenalty', 'uncertaintyPenalty'];

const betterOrEqual = (a: number, b: number, axis: ComponentAxis): boolean =>
  PENALTY_AXES.includes(axis) ? a <= b : a >= b;
const strictlyBetter = (a: number, b: number, axis: ComponentAxis): boolean =>
  PENALTY_AXES.includes(axis) ? a < b : a > b;

/**
 * `a` dominates `b` on the given axes. An axis missing on either side (only
 * `computeSupport` can be `undefined`) is skipped for that pair — missing
 * data is never treated as 0, which would fabricate a penalty/benefit that
 * was never measured.
 */
function dominates(a: CandidateRanking, b: CandidateRanking, objectives: readonly ComponentAxis[]): boolean {
  let strict = false;
  for (const axis of objectives) {
    const va = a.components[axis];
    const vb = b.components[axis];
    if (va === undefined || vb === undefined) continue;
    if (!betterOrEqual(va, vb, axis)) return false;
    if (strictlyBetter(va, vb, axis)) strict = true;
  }
  return strict;
}

export function paretoFrontier(candidates: readonly CandidateRanking[], objectives: readonly ComponentAxis[]): string[] {
  return candidates
    .filter((c) => !candidates.some((other) => other !== c && dominates(other, c, objectives)))
    .map((c) => c.candidateId)
    .sort();
}

/**
 * A hypothetical "what if we substituted at this fraction/potency" projection
 * — NEVER a measured or observed result. `label`/`mergedIntoEvidence` are
 * fixed literals so nothing downstream can mistake this for real evidence.
 */
export function counterfactualSubstitution(candidate: CandidateRanking, scenario: CounterfactualScenario): CounterfactualResult {
  const functionRetained = Math.min(
    1,
    (1 - candidate.components.uncertaintyPenalty) * scenario.potencyFactor * scenario.replacementFraction,
  );
  const violations: string[] = [];
  if (functionRetained < 0.5) violations.push(`functionRetained=${functionRetained} < 0.5`);
  if (scenario.toxicityLimit !== null && candidate.components.safetyPenalty > scenario.toxicityLimit) {
    violations.push('safety penalty too high');
  }
  return {
    candidateId: candidate.candidateId,
    scenario,
    functionRetained,
    violations,
    label: 'COUNTERFACTUAL/SIMULATED',
    mergedIntoEvidence: false,
  };
}
