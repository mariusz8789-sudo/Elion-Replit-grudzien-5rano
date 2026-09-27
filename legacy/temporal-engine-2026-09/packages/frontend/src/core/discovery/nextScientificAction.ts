/**
 * NEXT SCIENTIFIC ACTION — a domain-agnostic "what to do next" contract.
 *
 * Every domain in this engine already has its OWN next-step vocabulary,
 * correctly shaped for that domain: `molecular/nextStep.ts` and
 * `molecular/discriminatingExperiment.ts` work over `MoleculeCandidate`;
 * `discoveryFollowUp.ts` works over the epidemic simulation's
 * `DiscoveryCase`. None of them is reusable outside their domain, and
 * rewriting them would be pure churn for no capability gained.
 *
 * This module adds the piece that was actually missing: a SHARED shape any
 * domain can project its own next-step reasoning into, so a caller that
 * doesn't know which domain produced a result can still ask "what's the
 * most informative next step, and can Genesis run it?" — closing Phase E of
 * the mission (a generic NextScientificAction/NextExperiment abstraction).
 *
 * THE DISCIPLINE THIS MODULE ENFORCES, THE SAME ONE EVERY OTHER
 * NEXT-STEP MODULE IN THIS ENGINE ALREADY FOLLOWS:
 *
 *   - `missingInputs` is COMPUTED (required minus available), never
 *     independently declared — a caller cannot claim an action is runnable
 *     while separately admitting an input is missing.
 *   - `expectedDiscriminatingPower` is QUALITATIVE (HIGH/MODERATE/LOW/
 *     UNKNOWN) with a stated reason, never a fabricated numeric expected
 *     value of information — Genesis has no calibrated model that would
 *     make such a number honest.
 *   - `estimatedBurden` is QUALITATIVE or UNKNOWN, for the same reason.
 *   - `availability` fails closed: an action with any missing input cannot
 *     be constructed as RUNNABLE_IN_GENESIS.
 */
export const NEXT_SCIENTIFIC_ACTION_VERSION = '1.0.0';

export type ActionAvailability =
  | 'RUNNABLE_IN_GENESIS'
  | 'REQUIRES_EXTERNAL_DATA'
  | 'REQUIRES_EXTERNAL_EXPERIMENT'
  | 'REQUIRES_EXTERNAL_ENGINE'
  /** Progress needed is conceptual/mathematical (e.g. a missing theory), not experimental or computational. */
  | 'REQUIRES_THEORETICAL_ADVANCE'
  | 'BLOCKED';

export type DiscriminatingPower = 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
export type EstimatedBurden = 'LOW' | 'MODERATE' | 'HIGH' | 'UNKNOWN';

export interface NextScientificAction {
  actionId: string;
  question: string;
  targetHypothesisIds: readonly string[];
  requiredInputs: readonly string[];
  availableInputs: readonly string[];
  /** required minus available — always computed, never independently declared. */
  missingInputs: readonly string[];
  method: string;
  expectedDiscriminatingPower: DiscriminatingPower;
  discriminatingPowerReasoning: string;
  constraints: readonly string[];
  expectedOutputs: readonly string[];
  successCriteria: string;
  falsificationCriteria: string;
  availability: ActionAvailability;
  estimatedBurden: EstimatedBurden;
  burdenReasoning: string;
}

export interface BuildNextScientificActionInput {
  actionId: string;
  question: string;
  targetHypothesisIds: readonly string[];
  requiredInputs: readonly string[];
  availableInputs: readonly string[];
  method: string;
  expectedDiscriminatingPower: DiscriminatingPower;
  discriminatingPowerReasoning: string;
  constraints: readonly string[];
  expectedOutputs: readonly string[];
  successCriteria: string;
  falsificationCriteria: string;
  /** The caller's claimed availability — validated, not trusted blindly (see the fail-closed check below). */
  availability: ActionAvailability;
  estimatedBurden: EstimatedBurden;
  burdenReasoning: string;
}

/**
 * The only constructor. Computes `missingInputs` itself and refuses a
 * self-contradictory claim: an action cannot be RUNNABLE_IN_GENESIS while
 * declaring a required input that isn't available.
 */
export function buildNextScientificAction(input: BuildNextScientificActionInput): NextScientificAction {
  const availableSet = new Set(input.availableInputs);
  const missingInputs = input.requiredInputs.filter((r) => !availableSet.has(r));

  if (missingInputs.length > 0 && input.availability === 'RUNNABLE_IN_GENESIS') {
    throw new Error(
      `Action "${input.actionId}" claims RUNNABLE_IN_GENESIS but is missing required input(s): ${missingInputs.join(', ')}. `
      + 'An action cannot be runnable while a required input is unavailable — that is exactly the fail-closed check this constructor exists to enforce.',
    );
  }

  return { ...input, missingInputs };
}

const AVAILABILITY_RANK: Readonly<Record<ActionAvailability, number>> = {
  RUNNABLE_IN_GENESIS: 0,
  REQUIRES_EXTERNAL_DATA: 1,
  REQUIRES_EXTERNAL_EXPERIMENT: 2,
  REQUIRES_EXTERNAL_ENGINE: 3,
  REQUIRES_THEORETICAL_ADVANCE: 4,
  BLOCKED: 5,
};

const POWER_RANK: Readonly<Record<DiscriminatingPower, number>> = {
  HIGH: 0,
  MODERATE: 1,
  LOW: 2,
  UNKNOWN: 3,
};

/**
 * Ranks actions closest-to-actionable first (an action Genesis can run now
 * always outranks one that needs an external experiment, regardless of its
 * discriminating power — an unreachable HIGH-power test helps nobody today),
 * then by expected discriminating power within the same availability tier.
 * This is a DETERMINISTIC, DEFENSIBLE ORDERING RULE, not a probability model.
 */
export function rankNextScientificActions(actions: readonly NextScientificAction[]): readonly NextScientificAction[] {
  return [...actions].sort((a, b) => {
    const availabilityDiff = AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability];
    if (availabilityDiff !== 0) return availabilityDiff;
    const powerDiff = POWER_RANK[a.expectedDiscriminatingPower] - POWER_RANK[b.expectedDiscriminatingPower];
    if (powerDiff !== 0) return powerDiff;
    return a.actionId.localeCompare(b.actionId);
  });
}
