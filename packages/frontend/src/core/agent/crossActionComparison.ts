import {
  BASELINE_OPTION_ID,
  evaluateDecision,
  type DecisionObjective,
  type DecisionOption,
  type DecisionReport,
  type OptionOutcome,
} from '../worldModel/decision/decisionSupport';
import { TemporalBranchRegistry, TemporalEngine } from '../worldModel/temporal/temporalEngine';
import {
  buildWorldDiscoveryPlan,
  parseWorldDiscoveryGoal,
  type WorldGoalIntent,
  type WorldLever,
  type WorldLeverCatalog,
} from './worldGoalIntent';

/**
 * CROSS-ACTION COMPARISON — every declared action against the SAME control.
 *
 * Genesis could already run one counterfactual and could already rank a set of
 * options a programmer wrote by hand (`evaluateDecision`). What it could not do
 * is answer "of the things this world can actually do, which should we do?"
 * from the world's own declared lever catalogue. That is the whole of this
 * module: candidate generation from the catalogue, and the honest states a
 * comparison can end in. Execution, forking and ranking are delegated to
 * `evaluateDecision`, which already does them correctly — reimplementing them
 * here would have produced a second ranking engine that could disagree with
 * the first.
 *
 * ## Domain-generic by construction
 *
 * Nothing here knows what a floodplain is. The objective metric, the entity it
 * is read from, and every candidate action come from the `WorldLeverCatalog`
 * the caller supplies. A world that declares different levers gets a different
 * comparison with no change to this file; a world that declares none gets a
 * refusal rather than an empty ranking.
 *
 * ## Every arm shares one control
 *
 * Arms are never compared to each other sequentially. `evaluateDecision` forks
 * each one from the same baseline at the same tick and measures each against
 * that baseline, so "A beat B" is always mediated by a common control rather
 * than by chaining one intervention onto another. Doing nothing is a ranked
 * candidate, not an implicit floor.
 *
 * ## The states are not collapsed
 *
 * A comparison that was refused before it ran, one that ran but cannot be
 * ordered, and one that produced a tie are three different outcomes. Reporting
 * any of them as a fourth — a winner — would be the failure this module exists
 * to prevent.
 */

export const CROSS_ACTION_CONTRACT_VERSION = '1.0.0';

/**
 * How a comparison ended.
 *
 * `REFUSED` and `NOT_RANKABLE` are deliberately distinct: the first means the
 * request could not be understood well enough to run, the second that real
 * arms ran and still cannot be honestly ordered. Collapsing them would hide
 * which of the two happened, and they call for different fixes.
 */
export type CrossActionStatus =
  /** A real ordering, with a single best candidate. */
  | 'RANKED'
  /** A real ordering whose best position is shared. Never broken. */
  | 'TIED'
  /** Arms ran, but no honest ordering exists over them. */
  | 'NOT_RANKABLE'
  /** The goal could not be read well enough to run anything. */
  | 'REFUSED'
  /** The world declares no action that could be compared for this objective. */
  | 'NOT_MODELLED'
  /** Execution could not proceed for a stated structural reason. */
  | 'BLOCKED';

/** Why one candidate could not take part, when it could not. */
export type CandidateAvailability =
  | 'AVAILABLE'
  /** Named in the goal, but this world declares no such mechanism. */
  | 'NOT_MODELLED'
  /** Declared by the world, but produced no value for the objective. */
  | 'NOT_COMPARABLE';

export interface ActionCandidate {
  readonly actionId: string;
  readonly label: string;
  readonly mechanism: string;
  readonly availability: CandidateAvailability;
  readonly reason: string;
}

/** The full numerical record for one arm. Every field is measured, none derived from text. */
export interface ActionEvidence {
  readonly actionId: string;
  readonly label: string;
  readonly rank: number | null;
  readonly branchId: string;
  readonly baselineMetric: number | null;
  readonly interventionMetric: number | null;
  readonly absoluteDelta: number | null;
  /** Null when the baseline is zero — a percentage change from zero is not a number. */
  readonly relativeDeltaPercent: number | null;
  readonly relativeDeltaStatus: 'AVAILABLE' | 'BASELINE_ZERO' | 'NOT_APPLICABLE';
  /** Whether this arm moved the objective the way the goal asked for. */
  readonly directionVerdict: 'IMPROVED' | 'WORSENED' | 'NO_CHANGE' | 'NOT_EVALUABLE';
  readonly outcomeStatus: OptionOutcome['status'];
  /** Entities the action's mutation actually touched, before any physics ran. */
  readonly interventionFootprint: readonly string[];
  readonly limitations: readonly string[];
  /** Why this arm sits where it does, stated from its own numbers. */
  readonly explanation: string;
}

export interface CrossActionComparison {
  readonly contractVersion: string;
  readonly status: CrossActionStatus;
  readonly goal: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly objective: DecisionObjective | null;
  /** Present only when the comparison was refused or blocked. */
  readonly refusalReason: string | null;
  readonly intent: WorldGoalIntent | null;
  /** Every declared action considered, including those that could not take part. */
  readonly candidates: readonly ActionCandidate[];
  /** Ordered best-first for RANKED and TIED; empty otherwise. */
  readonly ranking: readonly ActionEvidence[];
  /** Shared by every candidate at rank 1. Empty unless the status is RANKED or TIED. */
  readonly bestActionIds: readonly string[];
  readonly baselineMetric: number | null;
  /** The underlying report, so nothing is lost behind this projection. */
  readonly decision: DecisionReport | null;
  readonly notModelledFactors: readonly string[];
  readonly declaredAssumptions: readonly string[];
  readonly disclaimer: string;
}

export const CROSS_ACTION_DISCLAIMER =
  'This orders the MODELLED consequences of the actions this world declares, under one declared objective, and ' +
  'inherits every limitation of the solvers that produced it. It is not a recommendation: cost, build time, ' +
  'legality, maintenance, equity and political feasibility are not represented at all unless this world models ' +
  'them. Actions the world does not declare were not considered.';

function refused(
  goal: string,
  catalog: WorldLeverCatalog,
  status: Extract<CrossActionStatus, 'REFUSED' | 'NOT_MODELLED' | 'BLOCKED'>,
  reason: string,
  intent: WorldGoalIntent | null,
  candidates: readonly ActionCandidate[] = [],
): CrossActionComparison {
  return {
    contractVersion: CROSS_ACTION_CONTRACT_VERSION,
    status,
    goal,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    objective: null,
    refusalReason: reason,
    intent,
    candidates,
    ranking: [],
    bestActionIds: [],
    baselineMetric: null,
    decision: null,
    notModelledFactors: catalog.notModelledFactors,
    declaredAssumptions: catalog.declaredAssumptions,
    disclaimer: CROSS_ACTION_DISCLAIMER,
  };
}

/**
 * Turns one declared lever into a decision option.
 *
 * Levers describe a mechanism at a strength; a comparison runs each at full
 * declared strength so the arms differ by WHICH mechanism, not by how hard
 * each was pushed. Comparing a full-strength lever against a half-strength one
 * would measure the strengths, not the mechanisms.
 */
function optionFromLever(lever: WorldLever, metric: string, direction: 'minimize' | 'maximize'): DecisionOption {
  const hypothesis = lever.hypothesis(metric, direction);
  return {
    optionId: lever.leverId,
    label: hypothesis.mechanism,
    description: hypothesis.statement,
    apply: (graph) => hypothesis.apply(graph, 1),
  };
}

function directionVerdict(
  delta: number | null,
  direction: 'minimize' | 'maximize',
): ActionEvidence['directionVerdict'] {
  if (delta === null) return 'NOT_EVALUABLE';
  if (delta === 0) return 'NO_CHANGE';
  const improved = direction === 'minimize' ? delta < 0 : delta > 0;
  return improved ? 'IMPROVED' : 'WORSENED';
}

function explain(
  evidence: Omit<ActionEvidence, 'explanation'>,
  direction: 'minimize' | 'maximize',
  metric: string,
  bestDelta: number | null,
): string {
  if (evidence.actionId === BASELINE_OPTION_ID) {
    return `The control: the world left alone. Every other action is measured against this ${metric} of ${evidence.baselineMetric}.`;
  }
  switch (evidence.directionVerdict) {
    case 'NOT_EVALUABLE':
      return `Ran, but produced no value for "${metric}", so it cannot be placed against the others.`;
    case 'NO_CHANGE':
      return `Changed the world but left "${metric}" exactly at the control value, so it ranks level with doing nothing.`;
    case 'WORSENED':
      return `Moved "${metric}" by ${evidence.absoluteDelta} — the wrong way for a goal that asks to ${direction} it, so it ranks below doing nothing.`;
    default: {
      const strongest = bestDelta !== null && evidence.absoluteDelta === bestDelta;
      return strongest
        ? `Moved "${metric}" by ${evidence.absoluteDelta}, the strongest modelled change of any declared action.`
        : `Moved "${metric}" by ${evidence.absoluteDelta}, a real improvement but smaller than the strongest action here.`;
    }
  }
}

export interface CrossActionInput {
  readonly goal: string;
  readonly catalog: WorldLeverCatalog;
  /** Overrides the catalogue's horizon when a caller needs a longer or shorter run. */
  readonly horizonTick?: number;
}

/**
 * Compares every declared action in a world against one shared control.
 *
 * The goal is read by the same parser the single-hypothesis path uses, so a
 * metric this world does not compute, or a goal that never says which way to
 * move it, is refused here exactly as it is refused there — one set of
 * semantics, not two.
 */
export function compareWorldActions(input: CrossActionInput): CrossActionComparison {
  const { goal, catalog } = input;
  const horizonTick = input.horizonTick ?? catalog.horizonTick;
  const intent = parseWorldDiscoveryGoal(goal, catalog);

  // Goal READABILITY is the planner's judgement, reused rather than re-derived:
  // it already decides what an unreadable goal is, and two copies would drift.
  // Candidate AVAILABILITY is this module's own concern, and is checked after —
  // so a world that declares no action reports NOT_MODELLED rather than being
  // folded into the planner's generic refusal, which would lose which of the two
  // actually happened.
  if (intent.objectiveMetric === null || intent.direction === null) {
    const plan = buildWorldDiscoveryPlan(intent, catalog);
    const reason = 'error' in plan ? plan.error : 'The goal could not be read.';
    return refused(goal, catalog, 'REFUSED', reason, intent);
  }

  const metric = intent.objectiveMetric!;
  const direction = intent.direction!;
  const entityId = catalog.entityIdForMetric[metric];

  // A goal may name specific levers; otherwise every declared lever competes.
  const eligible = intent.requestedLeverIds.length > 0
    ? catalog.levers.filter((lever) => intent.requestedLeverIds.includes(lever.leverId))
    : catalog.levers;

  const candidates: ActionCandidate[] = [
    ...eligible.map((lever) => {
      const hypothesis = lever.hypothesis(metric, direction);
      return {
        actionId: lever.leverId,
        label: hypothesis.mechanism,
        mechanism: hypothesis.mechanism,
        availability: 'AVAILABLE' as CandidateAvailability,
        reason: hypothesis.rationale,
      };
    }),
    // Phrases the goal named that this world has no mechanism for are reported
    // as candidates that could not take part, never silently dropped.
    ...intent.unknownLeverPhrases.map((phrase) => ({
      actionId: `not-modelled:${phrase}`,
      label: phrase,
      mechanism: phrase,
      availability: 'NOT_MODELLED' as CandidateAvailability,
      reason: `Named in the goal, but this world declares no mechanism for it, so it could not be tested.`,
    })),
  ];

  if (eligible.length === 0) {
    return refused(
      goal,
      catalog,
      'NOT_MODELLED',
      `This world declares no action that could be tested against "${metric}".`,
      intent,
      candidates,
    );
  }

  const objective: DecisionObjective = {
    metric,
    entityId,
    direction,
    rationale: `Read from the goal: ${direction} "${metric}" on ${entityId}.`,
  };

  // Execution and ranking are `evaluateDecision`'s: one baseline, one fork per
  // action, doing nothing ranked alongside the rest.
  const world = catalog.buildWorld();
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(world.graph, { registry, label: 'control' });
  for (let i = 0; i < horizonTick; i++) baseline.advance(catalog.dt, world.updater);

  let decision: DecisionReport;
  try {
    decision = evaluateDecision({
      question: {
        decisionId: `cross-action:${catalog.worldId}:${metric}`,
        question: goal,
        worldId: catalog.worldId,
        domainId: catalog.domainId,
        objective,
        decisionAtTick: catalog.decisionAtTick,
        horizonTick,
        options: eligible.map((lever) => optionFromLever(lever, metric, direction)),
        declaredAssumptions: catalog.declaredAssumptions,
        notModelledFactors: [
          ...catalog.notModelledFactors,
          ...intent.unknownLeverPhrases.map((p) => `Named in the goal but not modelled in this world: "${p}"`),
        ],
      },
      baseline,
      registry,
      updater: world.updater,
      dt: catalog.dt,
    });
  } catch (error) {
    // A world whose lever cannot be applied is a structural failure of the run,
    // not a scientific finding, and must not be reported as one.
    return refused(
      goal,
      catalog,
      'BLOCKED',
      `The comparison could not be executed: ${error instanceof Error ? error.message : String(error)}`,
      intent,
      candidates,
    );
  }

  const outcomeById = new Map(decision.outcomes.map((outcome) => [outcome.optionId, outcome]));
  const improvingDeltas = decision.ranking
    .filter((row) => row.optionId !== BASELINE_OPTION_ID)
    .map((row) => row.deltaVsBaseline)
    .filter((delta) => (direction === 'minimize' ? delta < 0 : delta > 0));
  const bestDelta = improvingDeltas.length > 0
    ? (direction === 'minimize' ? Math.min(...improvingDeltas) : Math.max(...improvingDeltas))
    : null;

  const ranking: ActionEvidence[] = decision.ranking.map((row) => {
    const outcome = outcomeById.get(row.optionId);
    const isBaseline = row.optionId === BASELINE_OPTION_ID;
    const baselineMetric = decision.baselineValue;
    const absoluteDelta = isBaseline ? 0 : row.deltaVsBaseline;
    const relativeDeltaStatus: ActionEvidence['relativeDeltaStatus'] = isBaseline
      ? 'NOT_APPLICABLE'
      : baselineMetric === null || baselineMetric === 0
        ? 'BASELINE_ZERO'
        : 'AVAILABLE';
    const partial: Omit<ActionEvidence, 'explanation'> = {
      actionId: row.optionId,
      label: row.label,
      rank: row.rank,
      branchId: outcome?.branchId ?? baseline.branchId,
      baselineMetric,
      interventionMetric: row.objectiveValue,
      absoluteDelta,
      relativeDeltaPercent:
        relativeDeltaStatus === 'AVAILABLE' ? (absoluteDelta / (baselineMetric as number)) * 100 : null,
      relativeDeltaStatus,
      directionVerdict: isBaseline ? 'NO_CHANGE' : directionVerdict(absoluteDelta, direction),
      outcomeStatus: outcome?.status ?? 'EVALUATED',
      interventionFootprint: outcome?.interventionFootprint ?? [],
      limitations: outcome && outcome.status === 'NO_MODELLED_EFFECT' ? [outcome.reason] : [],
    };
    return { ...partial, explanation: explain(partial, direction, metric, bestDelta) };
  });

  // Declared actions that ran but produced no comparable value are reported as
  // candidates that could not take part, rather than vanishing from the result.
  const rankedIds = new Set(ranking.map((row) => row.actionId));
  const finalCandidates = candidates.map((candidate) =>
    candidate.availability === 'AVAILABLE' && !rankedIds.has(candidate.actionId)
      ? {
          ...candidate,
          availability: 'NOT_COMPARABLE' as CandidateAvailability,
          reason: outcomeById.get(candidate.actionId)?.reason ?? 'Ran, but produced no value for the objective.',
        }
      : candidate,
  );

  const status: CrossActionStatus =
    decision.rankingStatus === 'NOT_RANKABLE'
      ? 'NOT_RANKABLE'
      : decision.rankingStatus === 'TIED'
        ? 'TIED'
        : 'RANKED';

  return {
    contractVersion: CROSS_ACTION_CONTRACT_VERSION,
    status,
    goal,
    worldId: catalog.worldId,
    domainId: catalog.domainId,
    objective,
    refusalReason: status === 'NOT_RANKABLE' ? decision.rankingReason : null,
    intent,
    candidates: finalCandidates,
    ranking: status === 'NOT_RANKABLE' ? [] : ranking,
    bestActionIds: status === 'NOT_RANKABLE' ? [] : decision.bestModelledOptionIds,
    baselineMetric: decision.baselineValue,
    decision,
    notModelledFactors: decision.notModelledFactors,
    declaredAssumptions: decision.declaredAssumptions,
    disclaimer: CROSS_ACTION_DISCLAIMER,
  };
}
