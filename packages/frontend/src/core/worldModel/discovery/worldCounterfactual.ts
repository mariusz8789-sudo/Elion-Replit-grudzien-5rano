import { canonicalJson, fnv1a } from '../../events/hash';
import { evaluateTwoArmRelation, SERIES_ONLY_RELATIONS } from '../../experimentFabric/falsificationRelation';
import type { FalsificationCriterion, HypothesisAssessment } from '../../experimentFabric/scientificDiscovery';
import type { ReplayVerdict } from '../../matrixFoundation/replayVerdict';
import { collectScalars, compareBranches, type BranchComparison } from '../bridge/worldFrameState';
import type { TemporalBranchRegistry } from '../temporal/temporalEngine';

/**
 * WORLD-MODEL COUNTERFACTUAL — baseline vs intervention on the SAME world,
 * assessed against a criterion declared BEFORE the run.
 *
 * WHAT THIS IS. Genesis already had two halves that never met. The
 * `TemporalEngine` half can fork a world, run both arms and tell you which
 * entities differ (`compareBranches`). The `experimentFabric` half knows what
 * a preregistered hypothesis is, what falsification means, and what an
 * honest verdict may say. Nothing joined them: `compareBranches` returns
 * whole-entity booleans with no magnitudes, and the hypothesis layer runs on
 * `ExperimentRun`s produced by the router, which cannot read a
 * `TemporalEngine` at all. This module is that join — the diff gets
 * magnitudes, and the magnitudes get judged against a criterion that could
 * not have been written after seeing them.
 *
 * WHAT A DIFFERENCE HERE DOES AND DOES NOT MEAN. Two branches of one
 * deterministic model that started identical and differ only by a declared
 * intervention establish COUNTERFACTUAL DEPENDENCE WITHIN THE MODEL: given
 * these solvers and these inputs, the outcome depends on the intervention.
 * That is a fact about the model, not a causal claim about the world. It
 * inherits every limitation of the solvers that produced it, and it is worth
 * exactly as much as they are. Nothing in this module ever upgrades that
 * status, and `COUNTERFACTUAL_DEPENDENCE_DISCLAIMER` is carried on every
 * assessment so a consumer cannot drop it by accident.
 *
 * FAIL-CLOSED. An assessment reaches SUPPORTED/FALSIFIED only when the two
 * arms provably started from the same state, the run replays, the declared
 * metric actually exists, and the relation is decidable from two arms.
 * Every other path is INCONCLUSIVE with a reason. A criterion that cannot
 * be evaluated is never reported as falsified.
 *
 * NOT A FIFTH DISCOVERY ENGINE. Genesis already has four next-experiment
 * selectors (`hypothesisLoop`, `experimentGraph`, `discoveryFollowUp`,
 * `whyNextExperiment`), all lexicographic priority cascades over declared
 * uncertainty kinds, none of them scoring. This module reuses that
 * discipline and the existing `FalsificationCriterion`/`HypothesisAssessment`
 * vocabulary rather than inventing parallel ones; it exists separately only
 * because those four consume `ExperimentRun`s and this substrate is a
 * `TemporalEngine`. The relation itself is decided by the one shared
 * primitive, `evaluateTwoArmRelation`.
 */

export const WORLD_COUNTERFACTUAL_CONTRACT_VERSION = '1.0.0';

export const COUNTERFACTUAL_DEPENDENCE_DISCLAIMER =
  'A difference between two branches of one deterministic model establishes counterfactual dependence WITHIN THE ' +
  'MODEL — given these solvers and these inputs, the outcome depends on the declared intervention. It is not ' +
  'evidence of a causal relationship in the real world, and it carries every limitation of the solvers that ' +
  'produced it.';

// ---------------------------------------------------------------------------
// 1. The diff: whole-entity booleans become per-scalar magnitudes.
// ---------------------------------------------------------------------------

/** How the two arms differ on one numeric scalar of one entity. */
export interface WorldScalarDelta {
  readonly entityId: string;
  readonly label: string;
  readonly key: string;
  readonly baseline: number;
  readonly intervention: number;
  readonly absoluteDelta: number;
  /**
   * Null when the baseline is zero: a percentage change from zero is not a
   * number, and reporting `Infinity` would read as a real magnitude.
   */
  readonly relativeDeltaPercent: number | null;
  readonly relativeDeltaStatus: 'AVAILABLE' | 'BASELINE_ZERO';
}

export type EntityPresence = 'BOTH' | 'BASELINE_ONLY' | 'INTERVENTION_ONLY';

export interface ChangedEntity {
  readonly entityId: string;
  readonly label: string;
  readonly presence: EntityPresence;
  readonly deltas: readonly WorldScalarDelta[];
  /**
   * Scalars present on one arm and absent on the other. These are real
   * differences that have no delta, and silently dropping them would
   * understate the divergence.
   */
  readonly scalarsOnlyOnOneSide: readonly string[];
}

export interface WorldCounterfactualDiff {
  readonly contractVersion: string;
  readonly atTick: number;
  readonly baselineBranchId: string;
  readonly interventionBranchId: string;
  readonly changed: readonly ChangedEntity[];
  readonly unchangedEntityCount: number;
  /** Every delta, flattened and deterministically ordered. */
  readonly deltas: readonly WorldScalarDelta[];
  /**
   * Entities that really differ but expose no numeric scalar accounting for
   * it — the difference is in a label, a status string or a component this
   * projection does not reduce to numbers. Named rather than hidden, because
   * a consumer reading only `deltas` would conclude nothing changed.
   */
  readonly changedWithoutNumericExplanation: readonly string[];
}

/**
 * Turns a `BranchComparison` into per-scalar magnitudes.
 *
 * This consumes the existing comparison rather than re-deriving one: the
 * scrub-and-compare work stays in `compareBranches`, and the scalar
 * projection stays in `collectScalars`, so a domain that adds state to
 * `domainState` shows up here with no change to this module.
 */
export function diffWorldBranches(comparison: BranchComparison): WorldCounterfactualDiff {
  const changed: ChangedEntity[] = [];
  const deltas: WorldScalarDelta[] = [];
  const withoutNumeric: string[] = [];
  let unchanged = 0;

  // Sorted so the diff is byte-stable regardless of the graph's insertion order.
  const ordered = [...comparison.entityDiffs].sort((a, b) => a.id.localeCompare(b.id));

  for (const entityDiff of ordered) {
    if (entityDiff.equal) {
      unchanged += 1;
      continue;
    }
    const a = entityDiff.worldA;
    const b = entityDiff.worldB;
    const presence: EntityPresence = a && b ? 'BOTH' : a ? 'BASELINE_ONLY' : 'INTERVENTION_ONLY';
    const scalarsA = a ? collectScalars(a) : {};
    const scalarsB = b ? collectScalars(b) : {};
    const label = a?.label ?? b?.label ?? entityDiff.id;

    const entityDeltas: WorldScalarDelta[] = [];
    const oneSided: string[] = [];
    for (const key of [...new Set([...Object.keys(scalarsA), ...Object.keys(scalarsB)])].sort()) {
      const baseline = scalarsA[key];
      const intervention = scalarsB[key];
      if (baseline === undefined || intervention === undefined) {
        oneSided.push(key);
        continue;
      }
      if (baseline === intervention) continue;
      const absoluteDelta = intervention - baseline;
      entityDeltas.push({
        entityId: entityDiff.id,
        label,
        key,
        baseline,
        intervention,
        absoluteDelta,
        relativeDeltaPercent: baseline === 0 ? null : (absoluteDelta / baseline) * 100,
        relativeDeltaStatus: baseline === 0 ? 'BASELINE_ZERO' : 'AVAILABLE',
      });
    }

    if (entityDeltas.length === 0 && oneSided.length === 0) withoutNumeric.push(entityDiff.id);
    changed.push({ entityId: entityDiff.id, label, presence, deltas: entityDeltas, scalarsOnlyOnOneSide: oneSided });
    deltas.push(...entityDeltas);
  }

  return {
    contractVersion: WORLD_COUNTERFACTUAL_CONTRACT_VERSION,
    atTick: comparison.tick,
    baselineBranchId: comparison.branchA.branchId,
    interventionBranchId: comparison.branchB.branchId,
    changed,
    unchangedEntityCount: unchanged,
    deltas,
    changedWithoutNumericExplanation: withoutNumeric,
  };
}

/** The value of one declared metric on one declared entity, or null with a reason. */
export function readMetric(
  diff: WorldCounterfactualDiff,
  entityId: string,
  key: string,
): { baseline: number; intervention: number } | null {
  const entity = diff.changed.find((e) => e.entityId === entityId);
  const delta = entity?.deltas.find((d) => d.key === key);
  return delta ? { baseline: delta.baseline, intervention: delta.intervention } : null;
}

// ---------------------------------------------------------------------------
// 2. Controlled difference: did the two arms really start from the same state?
// ---------------------------------------------------------------------------

export type ControlledDifferenceStatus = 'VERIFIED_IDENTICAL_START' | 'DIVERGED_AT_START' | 'NOT_CHECKED';

export interface ControlledDifference {
  readonly status: ControlledDifferenceStatus;
  readonly atTick: number;
  readonly differingEntityIds: readonly string[];
  readonly reason: string;
}

/**
 * Verifies that baseline and intervention were the SAME WORLD at `atTick`.
 *
 * This is what makes the later divergence attributable. Without it, two arms
 * that differ at the end might have differed at the start too, and the diff
 * would be measuring construction noise rather than the intervention. Pass
 * the fork tick for forked arms, or 0 for arms built independently from the
 * same construction — the check is the same and so is its meaning.
 *
 * It cannot detect an intervention applied at or before `atTick` that leaves
 * the state identical there and acts later (a scheduled event, say). Such a
 * design is still controlled, but this function's evidence for it is limited
 * to "the states matched", which is what the status name says.
 */
export function verifyControlledDifference(
  registry: TemporalBranchRegistry,
  baselineBranchId: string,
  interventionBranchId: string,
  atTick: number,
): ControlledDifference {
  const comparison = compareBranches(registry, baselineBranchId, interventionBranchId, atTick);
  const differing = comparison.entityDiffs.filter((d) => !d.equal).map((d) => d.id).sort();
  if (differing.length === 0) {
    return {
      status: 'VERIFIED_IDENTICAL_START',
      atTick,
      differingEntityIds: [],
      reason: `Both arms held an identical world state at tick ${atTick}, so every later difference is downstream of the declared intervention within the model.`,
    };
  }
  return {
    status: 'DIVERGED_AT_START',
    atTick,
    differingEntityIds: differing,
    reason: `The arms already differed at tick ${atTick} in ${differing.length} entit${differing.length === 1 ? 'y' : 'ies'}, so a later difference cannot be attributed to the declared intervention alone.`,
  };
}

/**
 * The earliest tick in `[fromTick, toTick]` at which the two arms differ, or
 * null if they never do.
 *
 * Scanned linearly on purpose. A bisection would assume that once the arms
 * differ they stay different, and that is not guaranteed: two arms can
 * re-converge when a quantity saturates (both floodplains reaching the same
 * spill elevation, both fuels burnt out). A bisection over a
 * non-monotone predicate silently returns the wrong tick, which is worse
 * than being slow.
 */
export function findFirstDivergenceTick(
  registry: TemporalBranchRegistry,
  baselineBranchId: string,
  interventionBranchId: string,
  fromTick: number,
  toTick: number,
): number | null {
  for (let tick = fromTick; tick <= toTick; tick++) {
    const comparison = compareBranches(registry, baselineBranchId, interventionBranchId, tick);
    if (comparison.entityDiffs.some((d) => !d.equal)) return tick;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Preregistration: the criterion has to exist before the numbers do.
// ---------------------------------------------------------------------------

export interface WorldCounterfactualQuestion {
  readonly questionId: string;
  readonly question: string;
  readonly worldId: string;
  /** The entity the primary metric is read from. */
  readonly entityId: string;
  readonly interventionDescription: string;
  readonly criterion: FalsificationCriterion;
  readonly declaredAssumptions: readonly string[];
}

export interface WorldCounterfactualPreregistration {
  readonly contractVersion: string;
  readonly question: WorldCounterfactualQuestion;
  readonly createdAt: string;
  /**
   * Content hash of the question as declared. Recomputing it after the run
   * is what makes "declared beforehand" checkable rather than asserted:
   * a criterion edited to fit the result no longer matches its own
   * preregistration.
   */
  readonly fingerprint: string;
}

export function worldCounterfactualQuestionFingerprint(question: WorldCounterfactualQuestion): string {
  return `wcf_${fnv1a(canonicalJson(question))}`;
}

export function preregisterWorldCounterfactual(
  question: WorldCounterfactualQuestion,
  now: () => Date = () => new Date(),
): WorldCounterfactualPreregistration {
  return {
    contractVersion: WORLD_COUNTERFACTUAL_CONTRACT_VERSION,
    question,
    createdAt: now().toISOString(),
    fingerprint: worldCounterfactualQuestionFingerprint(question),
  };
}

export function verifyWorldPreregistrationIntact(
  prereg: WorldCounterfactualPreregistration,
): { intact: boolean; reason: string } {
  const recomputed = worldCounterfactualQuestionFingerprint(prereg.question);
  return recomputed === prereg.fingerprint
    ? { intact: true, reason: 'The question and its falsification criterion are unchanged since preregistration.' }
    : {
        intact: false,
        reason: `The preregistered question was modified after registration (expected ${prereg.fingerprint}, got ${recomputed}). Any assessment against it would be post-hoc.`,
      };
}

// ---------------------------------------------------------------------------
// 4. Assessment.
// ---------------------------------------------------------------------------

export type CounterfactualAttribution = 'ATTRIBUTABLE_WITHIN_MODEL' | 'UNATTRIBUTED';

export interface WorldCounterfactualAssessment {
  readonly contractVersion: string;
  readonly questionId: string;
  /** Reuses the codebase's existing four-value vocabulary — no fifth verdict word. */
  readonly assessment: HypothesisAssessment;
  readonly attribution: CounterfactualAttribution;
  readonly criterion: FalsificationCriterion;
  readonly entityId: string;
  readonly metricKey: string;
  readonly baseline: number | null;
  readonly intervention: number | null;
  readonly reference: number | null;
  readonly controlledDifference: ControlledDifference;
  readonly replayVerdict: ReplayVerdict | null;
  readonly message: string;
  readonly disclaimer: string;
}

export interface WorldCounterfactualAssessmentInput {
  readonly preregistration: WorldCounterfactualPreregistration;
  readonly diff: WorldCounterfactualDiff;
  readonly controlledDifference: ControlledDifference;
  /**
   * The bundle's replay verdict, when one was computed. An unverified run
   * cannot support a verdict, so null and DRIFT both end INCONCLUSIVE.
   */
  readonly replayVerdict?: ReplayVerdict | null;
}

/**
 * Judges a real branch diff against a preregistered criterion.
 *
 * Every gate below is a reason the numbers cannot bear a verdict, and each
 * one ends INCONCLUSIVE rather than FALSIFIED: failing to evaluate a
 * criterion is not the same as evaluating it and finding it false.
 */
export function assessWorldCounterfactual(input: WorldCounterfactualAssessmentInput): WorldCounterfactualAssessment {
  const { preregistration, diff, controlledDifference } = input;
  const { question } = preregistration;
  const criterion = question.criterion;
  const replayVerdict = input.replayVerdict ?? null;

  const base = {
    contractVersion: WORLD_COUNTERFACTUAL_CONTRACT_VERSION,
    questionId: question.questionId,
    criterion,
    entityId: question.entityId,
    metricKey: criterion.metric,
    controlledDifference,
    replayVerdict,
    disclaimer: COUNTERFACTUAL_DEPENDENCE_DISCLAIMER,
  };
  const inconclusive = (message: string, values?: { baseline: number; intervention: number }): WorldCounterfactualAssessment => ({
    ...base,
    assessment: 'INCONCLUSIVE',
    attribution: 'UNATTRIBUTED',
    baseline: values?.baseline ?? null,
    intervention: values?.intervention ?? null,
    reference: null,
    message,
  });

  const intact = verifyWorldPreregistrationIntact(preregistration);
  if (!intact.intact) return inconclusive(intact.reason);

  if (controlledDifference.status !== 'VERIFIED_IDENTICAL_START') {
    return inconclusive(
      `The difference is not attributable: ${controlledDifference.reason} The criterion is left unevaluated rather than judged against an uncontrolled comparison.`,
    );
  }

  if (replayVerdict !== 'MATCH') {
    return inconclusive(
      `The run is not independently reproduced (replay: ${replayVerdict ?? 'NOT_VERIFIED'}), so its numbers cannot support or falsify a criterion.`,
    );
  }

  const values = readMetric(diff, question.entityId, criterion.metric);
  if (!values) {
    const entity = diff.changed.find((e) => e.entityId === question.entityId);
    return inconclusive(
      entity
        ? `Entity ${question.entityId} differs between the arms, but not in the preregistered metric "${criterion.metric}", so the criterion has no value to be judged on.`
        : `Entity ${question.entityId} does not differ between the arms at tick ${diff.atTick}, so the preregistered metric "${criterion.metric}" has no counterfactual difference to assess.`,
    );
  }

  const outcome = evaluateTwoArmRelation(criterion, values.baseline, values.intervention);
  if (!outcome.applicable) return inconclusive(outcome.explanation, values);

  return {
    ...base,
    assessment: outcome.met ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL',
    attribution: 'ATTRIBUTABLE_WITHIN_MODEL',
    baseline: values.baseline,
    intervention: values.intervention,
    reference: outcome.reference,
    message: `${outcome.met ? 'The preregistered criterion held' : 'The preregistered criterion did not hold'} against the real branch diff. ${outcome.explanation}`,
  };
}

// ---------------------------------------------------------------------------
// 5. What to run next.
// ---------------------------------------------------------------------------

/**
 * Ordered most-blocking first, and evaluated as a strict cascade. There is no
 * weighted informativeness score here, for the same reason `hypothesisLoop`
 * gives for not having one: no methodology in this codebase would justify the
 * weights, and an unjustified number would look more principled than it is.
 */
export const WORLD_COUNTERFACTUAL_UNCERTAINTIES = [
  'PREREGISTRATION_VIOLATED',
  'CONTROL_NOT_VERIFIED',
  'REPLAY_NOT_VERIFIED',
  'NO_DIVERGENCE',
  'METRIC_ABSENT',
  'RELATION_NEEDS_SERIES',
  'SINGLE_INTERVENTION_POINT',
] as const;

export type WorldCounterfactualUncertainty = (typeof WORLD_COUNTERFACTUAL_UNCERTAINTIES)[number];

export interface NextWorldExperiment {
  readonly kind: WorldCounterfactualUncertainty | 'NONE';
  readonly status: 'READY_TO_RUN' | 'BLOCKED' | 'RESOLVED';
  /** What to change, concretely enough to act on. Never executed from here. */
  readonly action: string;
  readonly why: string;
  readonly resolves: string;
  readonly rule: string;
}

/**
 * Names the single most blocking uncertainty and the experiment that would
 * resolve it. Descriptive only: nothing in this module runs an experiment,
 * because choosing to spend compute is the caller's decision.
 */
export function selectNextWorldExperiment(
  assessment: WorldCounterfactualAssessment,
  diff: WorldCounterfactualDiff,
): NextWorldExperiment {
  const { criterion } = assessment;

  if (assessment.assessment === 'INCONCLUSIVE' && assessment.message.includes('post-hoc')) {
    return {
      kind: 'PREREGISTRATION_VIOLATED',
      status: 'BLOCKED',
      action: 'Re-declare the question and criterion, then re-run both arms against the fresh preregistration.',
      why: 'The criterion no longer matches the fingerprint it was registered under, so it may have been written to fit the result.',
      resolves: 'Restores the criterion as a prediction rather than a description.',
      rule: 'PREREGISTRATION_VIOLATED: a violated preregistration invalidates every verdict downstream of it.',
    };
  }

  if (assessment.controlledDifference.status !== 'VERIFIED_IDENTICAL_START') {
    return {
      kind: 'CONTROL_NOT_VERIFIED',
      status: 'READY_TO_RUN',
      action: `Build the intervention arm by forking the baseline at tick ${assessment.controlledDifference.atTick} and applying only the declared intervention, instead of constructing the two arms independently.`,
      why: `The arms differed before the intervention could act: ${assessment.controlledDifference.differingEntityIds.slice(0, 5).join(', ') || 'none reported'}.`,
      resolves: 'Makes every later difference attributable to the intervention within the model.',
      rule: 'CONTROL_NOT_VERIFIED: an uncontrolled pair measures construction differences, not the intervention.',
    };
  }

  if (assessment.replayVerdict !== 'MATCH') {
    return {
      kind: 'REPLAY_NOT_VERIFIED',
      status: 'READY_TO_RUN',
      action: 'Rebuild the baseline arm from its construction and re-run it to the same tick, then compare fingerprints.',
      why: `Replay reported ${assessment.replayVerdict ?? 'NOT_VERIFIED'}; unreproduced numbers cannot support a verdict.`,
      resolves: 'Establishes that the reported difference is a property of the model rather than of one execution.',
      rule: 'REPLAY_NOT_VERIFIED: a result that has not been reproduced is not yet evidence.',
    };
  }

  if (diff.changed.length === 0) {
    return {
      kind: 'NO_DIVERGENCE',
      status: 'READY_TO_RUN',
      action: 'Confirm the intervention was actually applied, then repeat it at a larger magnitude or an earlier tick.',
      why: `The arms are identical at tick ${diff.atTick}: either the intervention had no modelled effect, or it never reached a solver.`,
      resolves: 'Distinguishes "no modelled effect" from "intervention not wired", which look the same in a diff.',
      rule: 'NO_DIVERGENCE: an unchanged world is as likely to be a wiring fault as a finding.',
    };
  }

  if (assessment.baseline === null) {
    return {
      kind: 'METRIC_ABSENT',
      status: 'BLOCKED',
      action: `Declare a metric the solver actually writes on ${assessment.entityId}, or bind a solver that produces "${criterion.metric}".`,
      why: `The preregistered metric "${criterion.metric}" has no counterfactual value on that entity.`,
      resolves: 'Gives the criterion a real number to be judged against.',
      rule: 'METRIC_ABSENT: a criterion over a metric nothing computes can never be tested.',
    };
  }

  if (SERIES_ONLY_RELATIONS.includes(criterion.relation)) {
    return {
      kind: 'RELATION_NEEDS_SERIES',
      status: 'READY_TO_RUN',
      action: 'Run a sweep of at least three intervention magnitudes and assess the ordered series instead of a pair.',
      why: `Relation "${criterion.relation}" is a statement about a series; two arms give it nothing to be monotone along.`,
      resolves: 'Makes the declared relation decidable at all.',
      rule: 'RELATION_NEEDS_SERIES: monotonicity needs three or more points.',
    };
  }

  return {
    kind: 'SINGLE_INTERVENTION_POINT',
    status: 'READY_TO_RUN',
    action: 'Repeat the counterfactual at a second intervention magnitude to see whether the effect scales or is an artefact of this one setting.',
    why: 'The criterion was decided at exactly one intervention magnitude, so the result says nothing about the response shape.',
    resolves: 'Separates a dose-dependent modelled effect from a single-point coincidence.',
    rule: 'SINGLE_INTERVENTION_POINT: one point is a result, not a response.',
  };
}
