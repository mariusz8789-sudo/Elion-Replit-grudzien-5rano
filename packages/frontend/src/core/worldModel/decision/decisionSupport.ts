import type { GenesisEvent } from '../../events/genesisEvent';
import { AT_HORIZON, type ObjectiveReducer } from '../../experimentFabric/objectiveReducer';
import { reduceObjectiveTrajectory } from '../discovery/objectiveTrajectory';
import { compareBranches } from '../bridge/worldFrameState';
import { diffWorldBranches, findFirstDivergenceTick, forkedArmControl } from '../discovery/worldCounterfactual';
import type { WorldGraph } from '../ecs/worldGraph';
import type { GroundingLevel } from '../ecs/types';
import { classifyGrounding, type ElementClassification } from '../evidence/worldEvidenceBundle';
import type { TemporalBranchRegistry, TemporalEngine, TemporalUpdater } from '../temporal/temporalEngine';

/**
 * DECISION SUPPORT — the modelled consequences of declared options, ranked
 * under one declared objective. NOT a recommendation.
 *
 * This is the third and last layer of the counterfactual stack, and it adds
 * no new physics and no new comparison mechanism. It runs one arm per option
 * by FORKING the baseline at the decision tick, which is what makes the arms
 * controlled by construction rather than by inspection: `forkBranch` scrubs
 * the baseline to that tick and clones its journal, so every arm shares the
 * baseline's exact history and the option's own mutation is the only thing
 * that differs. That is precisely the fix `selectNextWorldExperiment`
 * prescribes for CONTROL_NOT_VERIFIED, applied here by default instead of
 * being discovered as a defect afterwards.
 *
 * That also means the empirical control check the counterfactual layer uses
 * for independently-built arms is the wrong instrument here, and this module
 * deliberately does not run it: comparing a forked arm to its baseline AT the
 * fork tick returns the intervention itself, so a "difference" there is the
 * expected result rather than a control failure. What is worth reporting
 * instead is the INTERVENTION FOOTPRINT — which entities the option's `apply`
 * actually touched — because an `apply` that reaches past its own intervention
 * is the one thing that could still break the control, and the footprint is
 * where it would show.
 *
 * WHAT A RANKING HERE IS. An ordering of the modelled outcomes of the
 * options the caller declared, under the single objective the caller
 * declared, inside one model whose limitations it inherits whole. It is not
 * a recommendation, and this module is built so it cannot accidentally
 * become one:
 *
 *   - The winning field is `bestModelledOptionIds` — plural, because ties
 *     are reported as ties and never broken arbitrarily. There is no
 *     `recommendation` field to misread.
 *   - DOING NOTHING IS ALWAYS ON THE LIST. The baseline is ranked as an
 *     explicit option (`BASELINE_OPTION_ID`), because a decision surface
 *     that only ever ranks interventions is biased toward acting, and the
 *     honest answer is sometimes that no declared option beats inaction.
 *   - Cost, feasibility, legality, equity and everything else a real
 *     decision turns on are NOT modelled. The caller must declare them in
 *     `notModelledFactors`, and they are carried into the report so a
 *     consumer cannot read the ranking as complete.
 *   - A ranking over an objective the world only approximates is labelled
 *     with that grounding, and an objective nothing models at all is
 *     refused outright rather than ranked.
 */

export const DECISION_SUPPORT_CONTRACT_VERSION = '1.0.0';

/** The "do nothing" arm, ranked alongside the declared options rather than assumed away. */
export const BASELINE_OPTION_ID = 'option:no-intervention';

export const DECISION_SUPPORT_DISCLAIMER =
  'This ranks the MODELLED consequences of the declared options under a single declared objective, inside one ' +
  'model, and inherits every limitation of the solvers that produced it. It is not a recommendation: cost, ' +
  'feasibility, legality, equity, political acceptability and side effects outside the modelled domains are not ' +
  'represented at all. Options not declared were not considered, and an option ranked first is only the best of ' +
  'those declared, on this objective, in this model.';

// ---------------------------------------------------------------------------
// The question.
// ---------------------------------------------------------------------------

export interface DecisionObjective {
  /** A scalar some solver really writes on `entityId`. */
  readonly metric: string;
  readonly entityId: string;
  readonly direction: 'minimize' | 'maximize';
  readonly rationale: string;
  /**
   * HOW the metric is measured across the run. Omitted means `AT_HORIZON` —
   * the value at the horizon tick, which is what this module has always read,
   * so an existing caller ranks identically down to the last bit.
   *
   * This exists because ranking has exactly the same gap the falsification
   * path had: an option that halves the PEAK and converges by the horizon
   * ranked level with doing nothing, because only the horizon was ever read.
   */
  readonly reducer?: ObjectiveReducer;
}

export interface DecisionOption {
  readonly optionId: string;
  readonly label: string;
  readonly description: string;
  /**
   * Applied to the forked graph at the decision tick, and the only thing
   * that may differ between this arm and the baseline. An `apply` that
   * reaches beyond the intervention silently destroys the control this
   * module's whole claim rests on.
   */
  readonly apply: (graph: WorldGraph) => void;
}

export interface DecisionQuestion {
  readonly decisionId: string;
  readonly question: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly objective: DecisionObjective;
  /** The tick the decision is taken at — every arm forks here. */
  readonly decisionAtTick: number;
  /** The tick outcomes are read at. Must be at or after the decision tick. */
  readonly horizonTick: number;
  readonly options: readonly DecisionOption[];
  readonly declaredAssumptions: readonly string[];
  /**
   * Everything this decision really turns on that the world does NOT model.
   * Required, and deliberately not defaulted to empty: a decision surface
   * with nothing declared unmodelled is either lying or has not been thought
   * about.
   */
  readonly notModelledFactors: readonly string[];
}

// ---------------------------------------------------------------------------
// The outcome of one option.
// ---------------------------------------------------------------------------

export type OptionOutcomeStatus =
  /** The objective was read on this arm and can be compared. */
  | 'EVALUATED'
  /** The arm ran, but the objective metric does not exist on it. */
  | 'NOT_EVALUABLE'
  /** The option changed nothing anywhere in the world — as likely a wiring fault as a finding. */
  | 'NO_MODELLED_EFFECT';

export interface OptionOutcome {
  readonly optionId: string;
  readonly label: string;
  readonly status: OptionOutcomeStatus;
  readonly branchId: string;
  readonly objectiveValue: number | null;
  /** Signed difference from the baseline arm, in the metric's own units. */
  readonly deltaVsBaseline: number | null;
  /**
   * The entities the option's `apply` really changed at the decision tick —
   * the intervention's own reach, before any physics has run. An empty
   * footprint means the option did nothing to the world at all; a footprint
   * wider than the intervention is how an `apply` that overreaches shows up.
   */
  readonly interventionFootprint: readonly string[];
  /** The tick every arm forked at: shared history up to here is structural, not inferred. */
  readonly sharedHistoryUpToTick: number;
  readonly changedEntityCount: number;
  readonly firstDivergenceTick: number | null;
  readonly reason: string;
}

export type DecisionRankingStatus =
  | 'RANKED'
  | 'TIED'
  /** No ordering may be published — the reason says why. */
  | 'NOT_RANKABLE';

export interface RankedOption {
  readonly optionId: string;
  readonly label: string;
  /** Shared by tied options: two firsts are both rank 1, and the next is rank 3. */
  readonly rank: number;
  readonly objectiveValue: number;
  readonly deltaVsBaseline: number;
}

export interface DecisionReport {
  readonly contractVersion: string;
  readonly decisionId: string;
  readonly question: string;
  readonly worldId: string;
  readonly objective: DecisionObjective;
  readonly decisionAtTick: number;
  readonly horizonTick: number;
  readonly baselineValue: number | null;
  readonly outcomes: readonly OptionOutcome[];
  readonly ranking: readonly RankedOption[];
  readonly rankingStatus: DecisionRankingStatus;
  readonly rankingReason: string;
  /**
   * Every option sharing the best modelled objective value — including
   * `BASELINE_OPTION_ID` when doing nothing is as good as acting. Plural on
   * purpose: this module never breaks a tie.
   */
  readonly bestModelledOptionIds: readonly string[];
  /** How well grounded the objective entity is; a ranking is worth no more than this. */
  readonly objectiveGrounding: GroundingLevel | null;
  readonly objectiveClassification: ElementClassification | null;
  readonly notModelledFactors: readonly string[];
  readonly declaredAssumptions: readonly string[];
  readonly disclaimer: string;
}

// ---------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------

export interface DecisionEvaluationInput {
  readonly question: DecisionQuestion;
  /**
   * The do-nothing arm, already advanced to at least `horizonTick`. Options
   * are forked from it, so it is both the control and a ranked option.
   */
  readonly baseline: TemporalEngine;
  /** The registry both the baseline and its forks are registered in. */
  readonly registry: TemporalBranchRegistry;
  /** The same updater the baseline was advanced with — arms must run identical physics. */
  readonly updater: TemporalUpdater;
  /** Tick length, matching the baseline's own advance calls. */
  readonly dt?: number;
}

/**
 * How the ranking measured its objective, in words, so a reader is never left
 * to assume "at the horizon" when the ranking used a peak or a total.
 */
function measuredAs(question: { objective: DecisionObjective; horizonTick: number; decisionAtTick: number }): string {
  const reducer = question.objective.reducer;
  if (!reducer || reducer.kind === 'AT_HORIZON') return `at tick ${question.horizonTick}`;
  if (reducer.kind === 'FIRST_CROSSING') {
    return `as the first tick it crossed ${reducer.threshold} from ${reducer.direction === 'above' ? 'below' : 'above'}, over ticks ${question.decisionAtTick}-${question.horizonTick}`;
  }
  return `as its ${reducer.kind} over ticks ${question.decisionAtTick}-${question.horizonTick}`;
}

/**
 * Reduces one arm's own trajectory to the number this option is ranked on.
 *
 * Delegates to the one shared reducer rather than reading a scalar here: the
 * hand-rolled single-tick read this replaced was a second copy of
 * `discoveryLoop.ts`'s, and the two agreed only because both hardcoded the
 * horizon. A missing entity or metric still comes back as null — "not
 * rankable" — rather than throwing from inside the evaluation.
 */
function objectiveValueAt(
  engine: TemporalEngine,
  objective: DecisionObjective,
  fromTick: number,
  toTick: number,
): number | null {
  return reduceObjectiveTrajectory(
    engine,
    objective.entityId,
    objective.metric,
    objective.reducer ?? AT_HORIZON,
    fromTick,
    toTick,
  ).value;
}

function groundingOf(engine: TemporalEngine, entityId: string, tick: number): GroundingLevel | null {
  return engine.scrubTo(tick).tryGetEntity(entityId)?.grounding ?? null;
}

/**
 * Runs one arm per declared option and reports what each does to the
 * objective, alongside doing nothing.
 *
 * Every arm is a fork of the baseline at `decisionAtTick` advanced with the
 * same updater, so the arms differ by the option's mutation and nothing
 * else. The control is still verified rather than assumed: a fork whose
 * `apply` reached further than its own intervention would show up as
 * DIVERGED_AT_START, and that is reported per option instead of being
 * quietly folded into the ranking.
 */
export function evaluateDecision(input: DecisionEvaluationInput): DecisionReport {
  const { question, baseline, registry, updater } = input;
  const dt = input.dt ?? 1;
  const { objective, decisionAtTick, horizonTick } = question;

  const baselineValue = objectiveValueAt(baseline, objective, decisionAtTick, horizonTick);
  const grounding = groundingOf(baseline, objective.entityId, horizonTick);
  const classification = grounding ? classifyGrounding(grounding) : null;

  const outcomes: OptionOutcome[] = [];

  for (const option of question.options) {
    const arm = baseline.forkBranch(decisionAtTick, option.label, option.apply);
    for (let tick = decisionAtTick; tick < horizonTick; tick++) arm.advance(dt, updater);

    // The fork's control evidence, from the one shared helper that computes it
    // soundly for a forked arm.
    const { interventionFootprint: footprint } = forkedArmControl(registry, baseline.branchId, arm.branchId, decisionAtTick);
    const diff = diffWorldBranches(compareBranches(registry, baseline.branchId, arm.branchId, horizonTick));
    const value = objectiveValueAt(arm, objective, decisionAtTick, horizonTick);

    const shared = {
      optionId: option.optionId,
      label: option.label,
      branchId: arm.branchId,
      interventionFootprint: footprint,
      sharedHistoryUpToTick: decisionAtTick,
      changedEntityCount: diff.changed.length,
      firstDivergenceTick: findFirstDivergenceTick(registry, baseline.branchId, arm.branchId, decisionAtTick, horizonTick),
    };

    if (value === null) {
      outcomes.push({
        ...shared,
        status: 'NOT_EVALUABLE',
        objectiveValue: null,
        deltaVsBaseline: null,
        reason: `The objective metric "${objective.metric}" is not present on ${objective.entityId} in this arm, so this option cannot be compared on it.`,
      });
      continue;
    }
    if (diff.changed.length === 0) {
      outcomes.push({
        ...shared,
        status: 'NO_MODELLED_EFFECT',
        objectiveValue: value,
        deltaVsBaseline: baselineValue === null ? null : value - baselineValue,
        reason: 'This option changed nothing anywhere in the modelled world: either it has no modelled effect, or it was never wired to a solver. The two are indistinguishable from the outcome alone.',
      });
      continue;
    }
    outcomes.push({
      ...shared,
      status: 'EVALUATED',
      objectiveValue: value,
      deltaVsBaseline: baselineValue === null ? null : value - baselineValue,
      reason: `The option changed ${diff.changed.length} entit${diff.changed.length === 1 ? 'y' : 'ies'} by the horizon, and the objective was read on this arm.`,
    });
  }

  return {
    contractVersion: DECISION_SUPPORT_CONTRACT_VERSION,
    decisionId: question.decisionId,
    question: question.question,
    worldId: question.worldId,
    objective,
    decisionAtTick,
    horizonTick,
    baselineValue,
    outcomes,
    notModelledFactors: question.notModelledFactors,
    declaredAssumptions: question.declaredAssumptions,
    objectiveGrounding: grounding,
    objectiveClassification: classification,
    disclaimer: DECISION_SUPPORT_DISCLAIMER,
    ...rankOptions(question, outcomes, baselineValue, classification),
  };
}

/**
 * Orders the options that really produced a comparable number, with doing
 * nothing among them.
 *
 * Refusals are deliberate and come before any ordering: an objective nothing
 * models, or a baseline that never produced a value, cannot be ranked
 * against at all, and publishing an ordering anyway would give an arbitrary
 * sequence the authority of an analysis.
 */
function rankOptions(
  question: DecisionQuestion,
  outcomes: readonly OptionOutcome[],
  baselineValue: number | null,
  classification: ElementClassification | null,
): Pick<DecisionReport, 'ranking' | 'rankingStatus' | 'rankingReason' | 'bestModelledOptionIds'> {
  const refuse = (rankingReason: string) => ({
    ranking: [] as readonly RankedOption[],
    rankingStatus: 'NOT_RANKABLE' as const,
    rankingReason,
    bestModelledOptionIds: [] as readonly string[],
  });

  if (classification === null || classification === 'NOT_MODELLED') {
    return refuse(
      `Nothing in this world models "${question.objective.metric}" on ${question.objective.entityId}, so the options cannot be ordered on it. Bind a solver that produces this metric, or choose an objective the world represents.`,
    );
  }
  if (baselineValue === null) {
    return refuse(
      `The do-nothing arm produced no value for "${question.objective.metric}", so there is nothing to measure the options against.`,
    );
  }

  // Doing nothing is an option, and is ranked with the rest.
  const candidates: { optionId: string; label: string; value: number }[] = [
    { optionId: BASELINE_OPTION_ID, label: 'Take no action', value: baselineValue },
  ];
  for (const outcome of outcomes) {
    if (outcome.objectiveValue !== null) {
      candidates.push({ optionId: outcome.optionId, label: outcome.label, value: outcome.objectiveValue });
    }
  }

  const notEvaluable = outcomes.filter((o) => o.objectiveValue === null);
  if (candidates.length < 2) {
    return refuse(
      `No declared option produced a value for "${question.objective.metric}", so there is nothing to compare with taking no action.`,
    );
  }

  const better = (a: number, b: number) => (question.objective.direction === 'minimize' ? a - b : b - a);
  // Ties break by optionId only for a stable ORDER; the ranks themselves stay equal,
  // so a tie is never resolved into a winner by alphabetical accident.
  const sorted = [...candidates].sort((a, b) => better(a.value, b.value) || a.optionId.localeCompare(b.optionId));

  const ranking: RankedOption[] = [];
  let rank = 0;
  sorted.forEach((candidate, index) => {
    if (index === 0 || candidate.value !== sorted[index - 1].value) rank = index + 1;
    ranking.push({
      optionId: candidate.optionId,
      label: candidate.label,
      rank,
      objectiveValue: candidate.value,
      deltaVsBaseline: candidate.value - baselineValue,
    });
  });

  const best = ranking.filter((r) => r.rank === 1);
  const omitted = notEvaluable.length > 0 ? ` ${notEvaluable.length} declared option(s) could not be evaluated and are excluded from the ordering: ${notEvaluable.map((o) => o.optionId).join(', ')}.` : '';
  const approximate = classification === 'APPROXIMATION'
    ? ' The objective rests on an approximated element, so the ordering is only as good as that approximation.'
    : '';

  if (best.length > 1) {
    return {
      ranking,
      rankingStatus: 'TIED',
      rankingReason: `${best.length} options share the best modelled value for "${question.objective.metric}" (${best[0].objectiveValue}); the model does not distinguish between them and this module will not break the tie.${omitted}${approximate}`,
      bestModelledOptionIds: best.map((r) => r.optionId),
    };
  }
  return {
    ranking,
    rankingStatus: 'RANKED',
    rankingReason: `Ordered by "${question.objective.metric}" (${question.objective.direction}) ${measuredAs(question)}, with taking no action included as an option.${omitted}${approximate}`,
    bestModelledOptionIds: best.map((r) => r.optionId),
  };
}

/**
 * The events an option's arm produced that the baseline never did — what
 * actually happened differently, as opposed to what the numbers ended at.
 */
export function eventsUniqueToOption(baseline: TemporalEngine, optionArm: TemporalEngine): readonly GenesisEvent[] {
  const baselineIds = new Set(baseline.journal.allEvents().map((event) => event.id));
  return optionArm.journal.allEvents().filter((event) => !baselineIds.has(event.id));
}
