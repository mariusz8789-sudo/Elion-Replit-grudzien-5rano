import { canonicalJson, fnv1a } from '../events/hash';
import { AT_HORIZON } from '../experimentFabric/objectiveReducer';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { compareBranches } from '../worldModel/bridge/worldFrameState';
import { CAPABILITY_CODE, type SolverCapability } from '../worldModel/capability/solverCapability';
import { reduceObjectiveTrajectory } from '../worldModel/discovery/objectiveTrajectory';
import {
  forkedArmControl,
  preregisterWorldCounterfactual,
  type ObjectiveOverride,
  type WorldCounterfactualAssessment,
  type WorldCounterfactualDiff,
} from '../worldModel/discovery/worldCounterfactual';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { GENESIS_TOOLS, WORLD_COUNTERFACTUAL_TOOL, WORLD_DIFF_TOOL } from './genesisAgentTools';
import { worldCounterfactualNextAction, type NextAction } from './nextAction';

/**
 * THE AUTONOMOUS DISCOVERY LOOP — round N's result changes what round N+1 does.
 *
 * Every organ this uses already existed and is used here rather than rebuilt:
 * `TemporalEngine.forkBranch` runs the experiments, `compareBranches` +
 * `diffWorldBranches` produce the observation, `assessWorldCounterfactual`
 * falsifies against a criterion preregistered before the run,
 * `worldCounterfactualNextAction` (the dispatcher) chooses what to do next,
 * and `GENESIS_TOOLS` is how the tools are invoked so their declared
 * capability travels with every step. This module contributes exactly one
 * thing: the control flow that makes those into a search rather than a
 * sequence.
 *
 * ## What makes it adaptive rather than a for-loop
 *
 * The hypothesis tested in a round is not fixed in advance. It is chosen from
 * the belief state, which is written by the previous round's REAL observation:
 *
 *   - a mechanism the model shows to be inert is abandoned, and the next
 *     round moves to a different mechanism entirely;
 *   - a mechanism that survived its criterion is not accepted, it is
 *     re-tested at a smaller magnitude, because the dispatcher's own
 *     SINGLE_INTERVENTION_POINT rule says one point is a result and not a
 *     response.
 *
 * Those two paths execute DIFFERENT interventions on the world — a different
 * fork, a different mutation, a different resulting state — so the adaptation
 * is in what actually runs, not in a label attached afterwards.
 *
 * ## Belief is a ladder, not a probability
 *
 * `ConfidenceLabel` is ordinal and derived from counted outcomes. This
 * codebase has repeatedly and deliberately refused to attach numeric
 * credences to hypotheses — `modelVsModelCompare.ts` and `hypothesisLoop.ts`
 * both say so, on the grounds that no methodology here would justify the
 * numbers. Emitting a posterior would make this loop look more principled
 * than it is, so it emits what it can defend: what was tested, what happened,
 * and how many times.
 *
 * ## What this is not
 *
 * Not autonomous reasoning about the world. It is an automated search over
 * MECHANISMS THE CALLER DECLARED, inside one model, judged by criteria the
 * caller wrote before seeing results. It cannot invent a hypothesis nobody
 * supplied, and every verdict it reaches is a statement about the model, not
 * about reality — `assessWorldCounterfactual` attaches that disclaimer to
 * each one and this loop never strips it.
 */

export const DISCOVERY_LOOP_CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Hypotheses and belief.
// ---------------------------------------------------------------------------

/**
 * A hypothesis with a MECHANISM attached: not just a claim, but the
 * intervention that would test it. Without the mechanism the loop could
 * describe a hypothesis and never act on it, which is the difference between
 * a trace and an experiment.
 */
export interface MechanisticHypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  /** The lever this hypothesis says controls the objective. */
  readonly mechanism: string;
  /** The entity the criterion's metric is read from. */
  readonly entityId: string;
  /** Declared before any run, and fingerprinted when the round preregisters it. */
  readonly criterion: FalsificationCriterion;
  /**
   * Applies the mechanism at a given strength. `strength` is 1 for the full
   * declared intervention; the loop re-tests a surviving hypothesis at a
   * fraction of it, which is why this is a function of strength rather than a
   * fixed mutation.
   */
  readonly apply: (graph: WorldGraph, strength: number) => void;
  readonly rationale: string;
}

/**
 * How confident the loop is, on an ordinal ladder. Deliberately NOT a
 * probability: see the module doc.
 */
export type ConfidenceLabel =
  | 'UNTESTED'
  | 'REFUTED_BY_NO_EFFECT'
  | 'REFUTED_BY_CRITERION'
  | 'SUPPORTED_ONCE'
  | 'SUPPORTED_AT_TWO_MAGNITUDES'
  | 'CONTESTED'
  | 'UNRESOLVED';

export type HypothesisStatus = 'UNTESTED' | 'SUPPORTED' | 'REFUTED' | 'UNRESOLVED';

export interface HypothesisBelief {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly status: HypothesisStatus;
  readonly confidence: ConfidenceLabel;
  /** Rounds whose observation supported it, and rounds whose observation went against it. */
  readonly supportedInRounds: readonly number[];
  readonly refutedInRounds: readonly number[];
  /** Strengths this mechanism has actually been run at — what "replicated" really means here. */
  readonly testedAtStrengths: readonly number[];
  /** The effect really observed on the objective, most recent first. Signed, in the metric's units. */
  readonly observedEffects: readonly number[];
  /** Why the loop currently believes what it does, in one sentence. */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// The trace. Shaped to `agent_run_steps` so the backend persists it unchanged.
// ---------------------------------------------------------------------------

/**
 * One decision, recorded as it happened.
 *
 * The six human-readable fields are the required trace vocabulary; the rest
 * are named to match `agent_run_steps` exactly, so `toAgentStepInput` is a
 * rename and not a translation. A trace that had to be reshaped to be stored
 * would drift from what was stored.
 */
export interface DiscoveryTraceStep {
  readonly stepIndex: number;
  readonly round: number;
  readonly why: string;
  readonly what: string;
  readonly tool: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly nextAction: string;

  readonly hypothesis: { readonly hypothesisId: string; readonly statement: string; readonly strength: number };
  readonly toolInvoked: string;
  readonly capability: string;
  readonly branchId: string | null;
  readonly observation: Record<string, unknown> | null;
  readonly falsificationVerdict: Record<string, unknown> | null;
  readonly provenanceEventIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Loop input and result.
// ---------------------------------------------------------------------------

export type DiscoveryStopReason =
  | 'ALL_HYPOTHESES_RESOLVED'
  | 'ROUND_BUDGET_EXHAUSTED'
  | 'LEADER_CONFIRMED_AT_TWO_MAGNITUDES'
  | 'NO_TESTABLE_HYPOTHESIS';

export interface DiscoveryLoopInput {
  readonly question: string;
  readonly worldId: string;
  readonly domainId: string;
  /** Builds a fresh world. Called once; every arm forks from the baseline it produces. */
  readonly buildWorld: () => { graph: WorldGraph; updater: TemporalUpdater };
  /** The declared search space. The loop cannot invent a mechanism outside it. */
  readonly hypotheses: readonly MechanisticHypothesis[];
  readonly decisionAtTick: number;
  readonly horizonTick: number;
  readonly dt: number;
  readonly maxRounds: number;
  /** The fraction of full strength a surviving hypothesis is re-tested at. */
  readonly replicationStrength?: number;
  readonly declaredAssumptions: readonly string[];
  readonly notModelledFactors: readonly string[];
}

export interface DiscoveryRound {
  readonly round: number;
  readonly hypothesisId: string;
  readonly strength: number;
  readonly branchId: string;
  readonly objectiveBaseline: number | null;
  readonly objectiveObserved: number | null;
  readonly effect: number | null;
  readonly assessment: WorldCounterfactualAssessment;
  readonly diff: WorldCounterfactualDiff;
  readonly nextAction: NextAction;
  /** Why this hypothesis, at this strength, in this round — decided before the round ran. */
  readonly selectionReason: string;
}

export interface DiscoveryLoopResult {
  readonly contractVersion: string;
  readonly question: string;
  readonly worldId: string;
  readonly domainId: string;
  readonly beliefs: readonly HypothesisBelief[];
  readonly rounds: readonly DiscoveryRound[];
  readonly trace: readonly DiscoveryTraceStep[];
  readonly stopReason: DiscoveryStopReason;
  /** Hypotheses the model refuted, kept rather than dropped — negative evidence is a result. */
  readonly failedHypotheses: readonly HypothesisBelief[];
  /** The best-supported mechanisms, or empty when nothing survived. Never a single "winner" by default. */
  readonly bestSupported: readonly HypothesisBelief[];
  /** What the loop could not settle, named explicitly. */
  readonly unresolvedQuestions: readonly string[];
  readonly declaredAssumptions: readonly string[];
  readonly notModelledFactors: readonly string[];
}

// ---------------------------------------------------------------------------
// Execution.
// ---------------------------------------------------------------------------

function initialBelief(hypothesis: MechanisticHypothesis): HypothesisBelief {
  return {
    hypothesisId: hypothesis.hypothesisId,
    statement: hypothesis.statement,
    status: 'UNTESTED',
    confidence: 'UNTESTED',
    supportedInRounds: [],
    refutedInRounds: [],
    testedAtStrengths: [],
    observedEffects: [],
    reason: 'Declared but not yet tested.',
  };
}

/**
 * Writes the new belief from what the round actually observed.
 *
 * The distinction between the two refuting paths is deliberate and is the one
 * place this loop reads a real observation more strongly than
 * `assessWorldCounterfactual` does. That function returns INCONCLUSIVE when
 * the preregistered metric shows no difference, and it is right to: with one
 * value it cannot evaluate a relation. But a mechanism that moved the world
 * and did NOT move the objective has told us something — within this model,
 * that lever does not control that quantity. The loop records that as
 * REFUTED_BY_NO_EFFECT, distinct from REFUTED_BY_CRITERION, so the two are
 * never conflated and neither is mistaken for a criterion that was evaluated
 * and held.
 */
function updateBelief(
  belief: HypothesisBelief,
  round: number,
  strength: number,
  assessment: WorldCounterfactualAssessment,
  effect: number | null,
  metricMoved: boolean,
): HypothesisBelief {
  const testedAtStrengths = [...belief.testedAtStrengths, strength];
  const observedEffects = [effect, ...belief.observedEffects].filter((e): e is number => e !== null);

  if (assessment.assessment === 'SUPPORTED_WITHIN_PROTOCOL') {
    const supportedInRounds = [...belief.supportedInRounds, round];
    const distinctStrengths = new Set(testedAtStrengths).size;
    const contested = belief.refutedInRounds.length > 0;
    return {
      ...belief,
      status: contested ? 'UNRESOLVED' : 'SUPPORTED',
      confidence: contested
        ? 'CONTESTED'
        : distinctStrengths > 1
          ? 'SUPPORTED_AT_TWO_MAGNITUDES'
          : 'SUPPORTED_ONCE',
      supportedInRounds,
      testedAtStrengths,
      observedEffects,
      reason: contested
        ? 'The criterion held in one round and failed in another; the model does not settle this.'
        : `The preregistered criterion held at ${distinctStrengths} magnitude(s) of the declared mechanism.`,
    };
  }

  if (assessment.assessment === 'FALSIFIED_WITHIN_PROTOCOL' || !metricMoved) {
    const refutedInRounds = [...belief.refutedInRounds, round];
    const contested = belief.supportedInRounds.length > 0;
    return {
      ...belief,
      status: contested ? 'UNRESOLVED' : 'REFUTED',
      confidence: contested ? 'CONTESTED' : metricMoved ? 'REFUTED_BY_CRITERION' : 'REFUTED_BY_NO_EFFECT',
      refutedInRounds,
      testedAtStrengths,
      observedEffects,
      reason: metricMoved
        ? 'The mechanism moved the objective, but in the direction the preregistered criterion ruled out.'
        : 'The mechanism changed the world but left the objective untouched: within this model it does not control that quantity.',
    };
  }

  return {
    ...belief,
    status: 'UNRESOLVED',
    confidence: 'UNRESOLVED',
    testedAtStrengths,
    observedEffects,
    reason: `The criterion could not be evaluated: ${assessment.message}`,
  };
}

interface Selection {
  readonly hypothesis: MechanisticHypothesis;
  readonly strength: number;
  readonly reason: string;
}

/**
 * Chooses what to test next FROM THE BELIEF STATE — this is the adaptive step.
 *
 * A hypothesis that survived its criterion is not banked; it is re-run at a
 * smaller magnitude, because the dispatcher's SINGLE_INTERVENTION_POINT rule
 * is right that one point is a result and not a response. Only when nothing
 * survives re-testing does the loop move on to an untested mechanism. The
 * selection is deterministic and declared, never scored: this codebase has no
 * methodology that would justify weighting one uncertainty above another
 * numerically, and inventing one here would be the same overclaim it refuses
 * everywhere else.
 */
function selectNext(
  hypotheses: readonly MechanisticHypothesis[],
  beliefs: ReadonlyMap<string, HypothesisBelief>,
  replicationStrength: number,
): Selection | null {
  // 1. Consolidate: a mechanism supported at exactly one magnitude is worth a second.
  for (const hypothesis of hypotheses) {
    const belief = beliefs.get(hypothesis.hypothesisId)!;
    if (belief.status === 'SUPPORTED' && new Set(belief.testedAtStrengths).size === 1) {
      return {
        hypothesis,
        strength: replicationStrength,
        reason: `"${hypothesis.hypothesisId}" survived its criterion at full strength; re-testing at ${replicationStrength}× to see whether the effect is dose-dependent or an artefact of one setting.`,
      };
    }
  }
  // 2. Otherwise explore: the first mechanism nothing has been observed about.
  for (const hypothesis of hypotheses) {
    if (beliefs.get(hypothesis.hypothesisId)!.status === 'UNTESTED') {
      return {
        hypothesis,
        strength: 1,
        reason: `No mechanism is currently supported and awaiting consolidation, so the loop moves to the next untested one: "${hypothesis.hypothesisId}".`,
      };
    }
  }
  return null;
}

/**
 * The live engines behind one run, for a caller that needs to build something
 * FROM the run afterwards (an Evidence Bundle, say) without re-executing it.
 *
 * Not part of `DiscoveryLoopResult` itself: that type is read and serialised
 * everywhere (memory, the UI's machine-readable dump, tests), and a
 * `TemporalEngine` is neither JSON-safe nor meaningful once serialised. This
 * is the escape hatch for the one caller — the memory/evidence integration —
 * that legitimately needs the live world, kept separate so nothing else can
 * accidentally start depending on non-serialisable state.
 */
export interface DiscoveryLoopExecution {
  readonly result: DiscoveryLoopResult;
  readonly registry: TemporalBranchRegistry;
  readonly baseline: TemporalEngine;
  /** The arm of the LAST executed round — the most decisive one this run produced. Null if no round ran. */
  readonly lastArm: TemporalEngine | null;
}

/**
 * Runs the loop and returns the live engines alongside the result.
 * Deterministic: the same world and the same declared hypotheses produce the
 * same rounds, the same beliefs and the same trace.
 */
export function runAutonomousDiscoveryWithEngines(input: DiscoveryLoopInput): DiscoveryLoopExecution {
  const replicationStrength = input.replicationStrength ?? 0.5;
  const world = input.buildWorld();
  const registry = new TemporalBranchRegistry();
  const baseline = new TemporalEngine(world.graph, { registry, label: 'baseline' });
  for (let i = 0; i < input.horizonTick; i++) baseline.advance(input.dt, world.updater);
  let lastArm: TemporalEngine | null = null;

  const beliefs = new Map<string, HypothesisBelief>(
    input.hypotheses.map((h) => [h.hypothesisId, initialBelief(h)]),
  );
  const rounds: DiscoveryRound[] = [];
  const trace: DiscoveryTraceStep[] = [];
  let stopReason: DiscoveryStopReason = 'ROUND_BUDGET_EXHAUSTED';

  for (let round = 1; round <= input.maxRounds; round++) {
    const selection = selectNext(input.hypotheses, beliefs, replicationStrength);
    if (!selection) {
      stopReason = rounds.length === 0 ? 'NO_TESTABLE_HYPOTHESIS' : 'ALL_HYPOTHESES_RESOLVED';
      break;
    }
    const { hypothesis, strength } = selection;

    // --- Experiment: a real fork, a real mutation, a real run ---------------
    const arm = baseline.forkBranch(input.decisionAtTick, `${hypothesis.hypothesisId}@${strength}`, (graph) =>
      hypothesis.apply(graph, strength),
    );
    for (let tick = input.decisionAtTick; tick < input.horizonTick; tick++) arm.advance(input.dt, world.updater);
    lastArm = arm;

    // --- Observation: the declared tools, so capability travels with it -----
    const comparison = compareBranches(registry, baseline.branchId, arm.branchId, input.horizonTick);
    const diff = GENESIS_TOOLS.diffTool.invoke(comparison);
    const reducer = hypothesis.criterion.reducer ?? AT_HORIZON;
    const baselineReduction = reduceObjectiveTrajectory(
      baseline, hypothesis.entityId, hypothesis.criterion.metric, reducer, input.decisionAtTick, input.horizonTick,
    );
    const armReduction = reduceObjectiveTrajectory(
      arm, hypothesis.entityId, hypothesis.criterion.metric, reducer, input.decisionAtTick, input.horizonTick,
    );
    const objectiveBaseline = baselineReduction.value;
    const objectiveObserved = armReduction.value;
    // Only a declared reducer overrides the criterion's own read off the diff.
    // At AT_HORIZON the historical path stays exactly as it was.
    const objectiveOverride: ObjectiveOverride | undefined =
      reducer.kind === 'AT_HORIZON'
        ? undefined
        : { reducerKind: reducer.kind, baseline: objectiveBaseline, intervention: objectiveObserved,
            reason: baselineReduction.reason ?? armReduction.reason };
    const effect =
      objectiveBaseline === null || objectiveObserved === null ? null : objectiveObserved - objectiveBaseline;
    const metricMoved = effect !== null && effect !== 0;

    // --- Falsification against a criterion declared before the run ---------
    const preregistration = preregisterWorldCounterfactual({
      questionId: `${hypothesis.hypothesisId}@${strength}`,
      question: hypothesis.statement,
      worldId: input.worldId,
      entityId: hypothesis.entityId,
      interventionDescription: `${hypothesis.mechanism} at strength ${strength}`,
      criterion: hypothesis.criterion,
      declaredAssumptions: input.declaredAssumptions,
    });
    // The fork's control evidence, from the one shared helper. See `forkedArmControl`
    // for why the empirical check is the wrong instrument on a forked arm.
    const { controlledDifference, interventionFootprint: footprint } = forkedArmControl(
      registry, baseline.branchId, arm.branchId, input.decisionAtTick,
    );

    const assessment = GENESIS_TOOLS.assessTool.invoke({
      preregistration,
      diff,
      controlledDifference,
      // The arm is a deterministic re-run of the baseline's own construction plus
      // one declared mutation, which is what MATCH asserts here.
      replayVerdict: 'MATCH',
      objectiveOverride,
    });

    // --- Belief update from the real observation ---------------------------
    const before = beliefs.get(hypothesis.hypothesisId)!;
    const after = updateBelief(before, round, strength, assessment, effect, metricMoved);
    beliefs.set(hypothesis.hypothesisId, after);

    // --- What next, via the dispatcher -------------------------------------
    const nextAction = worldCounterfactualNextAction({ assessment, diff, domain: input.domainId });

    rounds.push({
      round,
      hypothesisId: hypothesis.hypothesisId,
      strength,
      branchId: arm.branchId,
      objectiveBaseline,
      objectiveObserved,
      effect,
      assessment,
      diff,
      nextAction,
      selectionReason: selection.reason,
    });

    trace.push({
      stepIndex: trace.length,
      round,
      why: selection.reason,
      what: `Test "${hypothesis.statement}" by ${hypothesis.mechanism} at strength ${strength}, then judge the result against the criterion preregistered for it.`,
      tool: WORLD_COUNTERFACTUAL_TOOL,
      input: {
        hypothesisId: hypothesis.hypothesisId,
        mechanism: hypothesis.mechanism,
        strength,
        criterion: hypothesis.criterion,
        decisionAtTick: input.decisionAtTick,
        horizonTick: input.horizonTick,
      },
      output: {
        objectiveBaseline,
        objectiveObserved,
        effect,
        assessment: assessment.assessment,
        statusBefore: before.confidence,
        statusAfter: after.confidence,
        changedEntities: diff.changed.length,
      },
      nextAction: `${nextAction.selectorId}: ${nextAction.action}`,
      hypothesis: { hypothesisId: hypothesis.hypothesisId, statement: hypothesis.statement, strength },
      toolInvoked: `${WORLD_DIFF_TOOL} + ${WORLD_COUNTERFACTUAL_TOOL}`,
      capability: capabilityLabel(GENESIS_TOOLS.assessTool.capability),
      branchId: arm.branchId,
      observation: { effect, objectiveBaseline, objectiveObserved, metricMoved, interventionFootprint: footprint, changedEntityIds: diff.changed.map((c) => c.entityId) },
      falsificationVerdict: {
        assessment: assessment.assessment,
        attribution: assessment.attribution,
        message: assessment.message,
        disclaimer: assessment.disclaimer,
      },
      provenanceEventIds: arm.journal.allEvents().filter((e) => e.timestamp >= input.decisionAtTick).map((e) => e.id),
    });

    const consolidated = [...beliefs.values()].some((b) => b.confidence === 'SUPPORTED_AT_TWO_MAGNITUDES');
    if (consolidated) { stopReason = 'LEADER_CONFIRMED_AT_TWO_MAGNITUDES'; break; }
    if (!selectNext(input.hypotheses, beliefs, replicationStrength)) { stopReason = 'ALL_HYPOTHESES_RESOLVED'; break; }
  }

  const all = [...beliefs.values()];
  const result: DiscoveryLoopResult = {
    contractVersion: DISCOVERY_LOOP_CONTRACT_VERSION,
    question: input.question,
    worldId: input.worldId,
    domainId: input.domainId,
    beliefs: all,
    rounds,
    trace,
    stopReason,
    failedHypotheses: all.filter((b) => b.status === 'REFUTED'),
    bestSupported: all.filter((b) => b.status === 'SUPPORTED'),
    unresolvedQuestions: [
      // The id travels with the sentence: a reader who wants to run the missing
      // experiment needs to know which declared hypothesis it was.
      ...all.filter((b) => b.status === 'UNTESTED').map((b) => `Never tested: ${b.hypothesisId} — ${b.statement}`),
      ...all.filter((b) => b.status === 'UNRESOLVED').map((b) => `Unresolved: ${b.hypothesisId} — ${b.statement} (${b.reason})`),
    ],
    declaredAssumptions: input.declaredAssumptions,
    notModelledFactors: input.notModelledFactors,
  };
  return { result, registry, baseline, lastArm };
}

/** The result alone, for every caller that does not need the live engines. */
export function runAutonomousDiscovery(input: DiscoveryLoopInput): DiscoveryLoopResult {
  return runAutonomousDiscoveryWithEngines(input).result;
}

/**
 * A content fingerprint over what a run actually found, excluding branch ids.
 *
 * `TemporalEngine` names branches from a process-global counter, so the same
 * inputs re-executed in a fresh process assign different branch ids to
 * identical science — the same fact `worldEvidenceBundle.ts` documents as
 * `BRANCH_LABEL_VOLATILITY_LIMITATION`. A caller that wants to know "did this
 * replay produce the SAME FINDING" (memory, replay verification) needs a
 * fingerprint that agrees on two runs with identical physics, so branch ids —
 * and the trace's per-step `branchId` — are left out; everything that was
 * actually measured or concluded is left in.
 */
export function discoveryResultFingerprint(result: DiscoveryLoopResult): string {
  const content = {
    question: result.question,
    worldId: result.worldId,
    domainId: result.domainId,
    stopReason: result.stopReason,
    rounds: result.rounds.map((round) => ({
      hypothesisId: round.hypothesisId,
      strength: round.strength,
      objectiveBaseline: round.objectiveBaseline,
      objectiveObserved: round.objectiveObserved,
      effect: round.effect,
      assessment: round.assessment.assessment,
      attribution: round.assessment.attribution,
      selectionReason: round.selectionReason,
    })),
    beliefs: result.beliefs.map((belief) => ({
      hypothesisId: belief.hypothesisId,
      status: belief.status,
      confidence: belief.confidence,
      reason: belief.reason,
      observedEffects: belief.observedEffects,
    })),
    unresolvedQuestions: result.unresolvedQuestions,
  };
  return `dlf_${fnv1a(canonicalJson(content))}`;
}

/** The capability label carried on every step, read from the tool's own declaration. */
function capabilityLabel(capability: SolverCapability): string {
  switch (capability.capability) {
    case CAPABILITY_CODE.MODELLED:
      return 'MODELLED';
    case CAPABILITY_CODE.PARTIALLY_MODELLED:
      return 'PARTIALLY_MODELLED';
    default:
      return 'NOT_MODELLED';
  }
}

/**
 * Maps a trace step onto the backend's `addAgentStep` input.
 *
 * A rename, not a translation: `DiscoveryTraceStep` was shaped to
 * `agent_run_steps` so that what is stored is what happened, with no lossy
 * step in between.
 */
export function toAgentStepInput(step: DiscoveryTraceStep, agentRunId: string): Record<string, unknown> {
  return {
    agentRunId,
    stepIndex: step.stepIndex,
    hypothesis: step.hypothesis,
    toolInvoked: step.toolInvoked,
    capability: step.capability,
    branchId: step.branchId,
    observation: step.observation,
    falsificationVerdict: step.falsificationVerdict,
    nextAction: { why: step.why, what: step.what, next: step.nextAction, tool: step.tool, input: step.input, output: step.output },
    provenanceEventIds: step.provenanceEventIds,
  };
}
