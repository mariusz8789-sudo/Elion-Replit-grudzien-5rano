import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { assessCompetingModels } from './competingModels';
import { MECHANISM_STRATEGY_ID, toMechanismRun } from './discoveryStrategies';
import { DISCOVERY_STRATEGY_CONTRACT_VERSION, type StrategyRun } from './discoveryStrategy';
import {
  runAutonomousDiscoveryWithEngines,
  type DiscoveryLoopExecution,
  type DiscoveryLoopInput,
  type DiscoveryLoopResult,
  type MechanisticHypothesis,
} from './discoveryLoop';
import {
  assessJointIntervention,
  runJointIntervention,
  type JointInterventionAssessment,
} from './mechanismInteraction';

/**
 * MECHANISM-SIDE GENERATION — proposing a mechanism nobody declared, and
 * testing it.
 *
 * ## The gap this closes, stated precisely
 *
 * The MECHANISM loop already generates: a clean falsification derives a
 * `~RELATION_FLIP` or `~TOLERANCE_WIDENED` hypothesis, which is pushed into the
 * active set and really re-tested in a later round. That is genuine, automatic
 * generate-and-retest, and it has been there since P3.
 *
 * But look at what it varies. `deriveAlternativeCriteria` reuses
 * `hypothesis.apply` UNCHANGED — it revises the CRITERION, the claim about what
 * the lever does, never the lever. Its own doc says so plainly: it "does not
 * pretend to invent a hypothesis about a DIFFERENT metric or entity than the
 * one just tested". So across every fixture, the set of MECHANISMS Genesis can
 * test is exactly the set of `apply` functions the catalog declared. It can
 * change its mind about a lever. It cannot reach for a different one.
 *
 * This module is the first thing that produces a genuinely new `apply`: the
 * COMBINATION of two declared levers, pulled together in one arm.
 *
 * ## Why a combination is a real mechanism and not a trick
 *
 * "Do both" is not a rewording of "do A" and "do B". It is a distinct
 * intervention with a distinct, unpredictable outcome, and this codebase has
 * already MEASURED that it is unpredictable: on `genesis-backup-generator`,
 * fuel-efficiency and load-shedding add 22.92 L and 29.33 L separately at
 * strength 0.5, and a caller assuming independence would predict 92.25 L for
 * both. The real joint arm reads 87.67 L — 5.0% below, because
 * `fuelRateLPerHr = loadKw x specificFuelConsumptionLPerKwh` multiplies the two
 * factors (`mechanismInteraction.ts`). If combinations were additive this
 * module would be arithmetic. They are not, so it is an experiment.
 *
 * It also needs no domain knowledge Genesis does not have: both `apply`
 * functions were declared by the catalog, and combining them invents no new
 * physics. That is exactly the bar `deriveAlternativeCriteria` said it could
 * not clear alone, cleared by composing declared levers rather than imagining
 * an undeclared one.
 *
 * ## The trigger, and why it is the honest one
 *
 * `COMPETING_MODELS_UNRESOLVED` — two or more mechanisms survived. On the
 * PARAMETER side the analogous trigger is an EXHAUSTED space, because parameter
 * claims are rivals and exactly one can be right. Mechanisms are not rivals:
 * two levers can both really work, and `competingModels.ts` says so, naming its
 * own inability to separate them. What it cannot say is what to do about it,
 * because for independent findings "separate them" is the wrong question. The
 * informative question is whether they COMPOSE — which is this.
 *
 * This trigger became reachable in the same change that removed the loop's
 * greedy stop. While the loop quit at the first mechanism confirmed at two
 * magnitudes, a second survivor could not appear on the generator fixture at
 * all: it stopped after 2 rounds of a 12-round budget with three levers
 * untested. Now it tests all four and two survive, so there is something to
 * combine.
 *
 * ## Not a third loop
 *
 * `runAutonomousDiscoveryWithEngines` runs unchanged; the joint arm reuses
 * `runJointIntervention`, which itself reuses the `forkBranch` /
 * `reduceObjectiveTrajectory` primitives the round loop already uses. The
 * classification is the pure `assessJointIntervention`. This file is wiring and
 * a gate, the same role `inquirySession.ts::runInquiryWithGeneration` plays on
 * the PARAMETER side.
 */

export const MECHANISM_GENERATION_CONTRACT_VERSION = '1.0.0';

/** The mechanism nobody declared: two declared levers applied together. */
export interface DerivedJointMechanism {
  readonly contractVersion: string;
  /** Deterministic and self-describing, the same way `~RELATION_FLIP` ids are. */
  readonly hypothesisId: string;
  readonly parentHypothesisIds: readonly [string, string];
  /** The magnitude both parents were measured at, and the one the joint arm uses. */
  readonly strength: number;
  readonly metric: string;
  readonly entityId: string;
  readonly statement: string;
  readonly why: string;
}

export interface JointMechanismContinuation {
  readonly derived: DerivedJointMechanism;
  /** The real joint arm, judged against the naive additive prediction. Never assumed. */
  readonly assessment: JointInterventionAssessment;
  /**
   * Does doing BOTH actually beat doing the better one alone, in the direction
   * the objective is being moved? The decision-relevant question, answered from
   * the measurement rather than inferred from the two effects.
   */
  readonly betterThanBestSingle: boolean;
}

export interface MechanismWithGenerationResult {
  readonly first: DiscoveryLoopResult;
  /**
   * The full execution behind `first` — registry, baseline and last-arm world
   * state, not only its lean `.result`. Carried so a caller building a real
   * Evidence Bundle (`buildWorldDiscoveryEvidenceBundle` in `scienceMemory.ts`,
   * the same function `worldDiscoverySession.ts::runWorldDiscoveryAndRemember`
   * already uses) never has to re-run the investigation to get it — the WorldGraph
   * state is real branch/journal data, not something a fingerprint can stand in for.
   */
  readonly firstExecution: DiscoveryLoopExecution;
  /** Null whenever nothing was generated — `noGenerationReason` always says why. */
  readonly generated: JointMechanismContinuation | null;
  readonly noGenerationReason: string | null;
}

/**
 * The joint arm as a `StrategyRun`, so the front door can report it as a SECOND
 * run beside the first exactly as the PARAMETER path already does.
 *
 * ## Why this maps onto the shared contract without straining it
 *
 * A `StrategyRound` is "what was done, what was predicted, what was observed,
 * and the verdict". The joint arm has all four, and they are not manufactured:
 *
 *   what      — apply both declared levers in one fork, at one strength
 *   predicted — `naiveAdditivePrediction`, the composed hypothesis's OWN claim
 *   observed  — the real reading off the joint branch
 *   reference — the shared baseline, exactly as `mechanismRounds` carries it
 *
 * `predicted` being non-null is the one place this differs from an ordinary
 * MECHANISM round, and the difference is real rather than a liberty: a normal
 * MECHANISM hypothesis asserts a DIRECTION against a control and predicts no
 * value (see `StrategyRound.predicted`'s own note), while a composed hypothesis
 * asserts that the two effects SUM — which is a number, and the number the
 * verdict is decided against.
 *
 * The verdict uses the shared vocabulary with no new word: additive within the
 * declared band is `SUPPORTED_WITHIN_PROTOCOL`, sub- or super-additive is
 * `FALSIFIED_WITHIN_PROTOCOL`, and a case with no combined effect to judge is
 * `INCONCLUSIVE`.
 */
export function toJointMechanismRun(
  first: DiscoveryLoopResult,
  continuation: JointMechanismContinuation,
): StrategyRun {
  const { derived, assessment } = continuation;
  const verdict: HypothesisAssessment =
    assessment.interaction === 'ADDITIVE'
      ? 'SUPPORTED_WITHIN_PROTOCOL'
      : assessment.interaction === 'INCONCLUSIVE'
        ? 'INCONCLUSIVE'
        : 'FALSIFIED_WITHIN_PROTOCOL';

  return {
    contractVersion: DISCOVERY_STRATEGY_CONTRACT_VERSION,
    strategyId: MECHANISM_STRATEGY_ID,
    shape: 'MECHANISM',
    question: derived.statement,
    domainId: first.domainId,
    rounds: [
      {
        round: 1,
        what: `apply ${derived.parentHypothesisIds.join(' and ')} together at strength ${derived.strength}`,
        why: derived.why,
        observed: assessment.jointObserved,
        reference: assessment.baseline,
        verdicts: [
          {
            hypothesisId: derived.hypothesisId,
            assessment: verdict,
            predicted: assessment.naiveAdditivePrediction,
          },
        ],
      },
    ],
    surviving: verdict === 'SUPPORTED_WITHIN_PROTOCOL' ? [derived.hypothesisId] : [],
    falsified: verdict === 'FALSIFIED_WITHIN_PROTOCOL' ? [derived.hypothesisId] : [],
    untested: [],
    stopReason: 'JOINT_ARM_MEASURED',
    // One arm settles the additivity question it was run to settle; proposing a
    // further experiment here would be a decision this module did not take.
    nextExperiment: null,
    openQuestions:
      verdict === 'FALSIFIED_WITHIN_PROTOCOL'
        ? [
            `The two mechanisms do not compose independently (${assessment.interaction}). By how much the ` +
              'interaction varies with strength is not settled: this was measured at one magnitude.',
          ]
        : [],
    limitations: [...first.declaredAssumptions, ...first.notModelledFactors],
    // The joint arm is a WorldGraph fork like any other, so it carries the same
    // provenance the first run does rather than a second, separately-derived one.
    dataProvenance: toMechanismRun(first).dataProvenance,
    // The joint arm's own numbers, so a reader can recompute the verdict rather
    // than trust it.
    resultFingerprint: `joint_${derived.hypothesisId}@${derived.strength}_${assessment.jointObserved}`,
    native: continuation,
  };
}

/** The measured effect of one hypothesis at one strength, off the run's own rounds. */
interface MeasuredArm {
  readonly hypothesis: MechanisticHypothesis;
  readonly baseline: number;
  readonly observed: number;
  readonly effect: number;
}

/**
 * Finds a strength BOTH hypotheses were really measured at, with a usable
 * objective on each side. Prefers the largest such magnitude: the joint arm is
 * most informative where the individual effects are biggest.
 */
function commonMeasuredArms(
  result: DiscoveryLoopResult,
  a: MechanisticHypothesis,
  b: MechanisticHypothesis,
): { readonly a: MeasuredArm; readonly b: MeasuredArm } | null {
  const armsFor = (h: MechanisticHypothesis) =>
    new Map(
      result.rounds
        .filter(
          (r) =>
            r.hypothesisId === h.hypothesisId &&
            r.objectiveBaseline !== null &&
            r.objectiveObserved !== null &&
            r.effect !== null,
        )
        .map((r) => [
          r.strength,
          { hypothesis: h, baseline: r.objectiveBaseline!, observed: r.objectiveObserved!, effect: r.effect! },
        ]),
    );

  const armsA = armsFor(a);
  const armsB = armsFor(b);
  const shared = [...armsA.keys()].filter((s) => armsB.has(s)).sort((x, y) => y - x);
  const strength = shared[0];
  if (strength === undefined) return null;
  return { a: armsA.get(strength)!, b: armsB.get(strength)! };
}

/**
 * Runs the MECHANISM investigation and, when it ends with rival survivors,
 * proposes and really tests the one mechanism nobody declared: both of them at
 * once.
 *
 * `tolerance` is the declared additivity band, playing the same role
 * `agreementTolerance` plays throughout this codebase — a declared band, not a
 * statistical test this repository has no methodology to justify.
 */
export function runDiscoveryWithJointGeneration(
  input: DiscoveryLoopInput,
  options: { readonly tolerance?: number } = {},
): MechanismWithGenerationResult {
  const tolerance = options.tolerance ?? 0.02;
  const firstExecution = runAutonomousDiscoveryWithEngines(input);
  const first = firstExecution.result;

  // Refusal 1 — nothing to combine. One survivor is an answer, zero is
  // `modelSufficiency.ts`'s finding to report, not this module's.
  const competing = assessCompetingModels(toMechanismRun(first));
  if (competing.status !== 'COMPETING_MODELS_UNRESOLVED') {
    return {
      first,
      firstExecution,
      generated: null,
      noGenerationReason:
        `No joint mechanism was proposed: the run ended ${competing.status}, and combining requires two or more ` +
        'mechanisms that each independently survived. With one survivor there is nothing to add to it, and with ' +
        'none there is nothing that works to combine.',
    };
  }

  const byId = new Map(first.beliefs.map((b) => [b.hypothesisId, b]));
  const survivors = competing.competingHypothesisIds
    .map((id) => ({ id, hypothesis: [...input.hypotheses].find((h) => h.hypothesisId === id) }))
    .filter((s): s is { id: string; hypothesis: MechanisticHypothesis } => s.hypothesis !== undefined);

  // Only DECLARED hypotheses carry an `apply` this module may combine. A
  // survivor that was itself derived (`~RELATION_FLIP`) reuses its parent's
  // `apply`, so combining it would silently re-apply the same lever twice.
  if (survivors.length < 2) {
    return {
      first,
      firstExecution,
      generated: null,
      noGenerationReason:
        `${competing.competingHypothesisIds.length} hypotheses survived, but fewer than two of them are declared ` +
        'mechanisms with their own intervention. A derived hypothesis reuses its parent\'s intervention, so ' +
        'combining it would apply the same lever twice rather than two different ones.',
    };
  }

  const [first_, second_] = survivors;
  const a = first_!.hypothesis;
  const b = second_!.hypothesis;

  // Refusal 2 — no single objective to read a joint arm against.
  if (a.entityId !== b.entityId || a.criterion.metric !== b.criterion.metric) {
    return {
      first,
      firstExecution,
      generated: null,
      noGenerationReason:
        `"${a.hypothesisId}" and "${b.hypothesisId}" are judged on different objectives ` +
        `(${a.entityId}.${a.criterion.metric} vs ${b.entityId}.${b.criterion.metric}). A joint arm produces one ` +
        'trajectory, so there is no single number that would mean the same thing for both.',
    };
  }

  // Refusal 3 — no magnitude both were really measured at.
  const arms = commonMeasuredArms(first, a, b);
  if (arms === null) {
    return {
      first,
      firstExecution,
      generated: null,
      noGenerationReason:
        `"${a.hypothesisId}" and "${b.hypothesisId}" were never both measured at the same magnitude with a usable ` +
        'objective, so their separate effects cannot be compared against a joint arm run at one strength.',
    };
  }

  const strength = first.rounds.find(
    (r) => r.hypothesisId === a.hypothesisId && r.objectiveObserved === arms.a.observed,
  )!.strength;

  const joint = runJointIntervention({
    buildWorld: input.buildWorld,
    decisionAtTick: input.decisionAtTick,
    horizonTick: input.horizonTick,
    dt: input.dt,
    entityId: a.entityId,
    metric: a.criterion.metric,
    reducer: a.criterion.reducer,
    applyA: a.apply,
    applyB: b.apply,
    strength,
  });

  if (joint.baseline === null || joint.jointObserved === null) {
    return {
      first,
      firstExecution,
      generated: null,
      noGenerationReason:
        'The joint arm ran but produced no readable objective, so there is nothing to judge additivity against.',
    };
  }

  const assessment = assessJointIntervention({
    baseline: joint.baseline,
    effectA: arms.a.effect,
    effectB: arms.b.effect,
    jointObserved: joint.jointObserved,
    tolerance,
  });

  // "Better" is direction-aware: the criterion says which way the objective is
  // being moved, so this reads the declared relation rather than assuming
  // bigger is better.
  const bestSingleObserved =
    arms.a.effect >= arms.b.effect ? arms.a.observed : arms.b.observed;
  const movingUp = arms.a.effect + arms.b.effect >= 0;
  const betterThanBestSingle = movingUp
    ? joint.jointObserved > bestSingleObserved
    : joint.jointObserved < bestSingleObserved;

  const derived: DerivedJointMechanism = {
    contractVersion: MECHANISM_GENERATION_CONTRACT_VERSION,
    hypothesisId: `${a.hypothesisId}+${b.hypothesisId}`,
    parentHypothesisIds: [a.hypothesisId, b.hypothesisId],
    strength,
    metric: a.criterion.metric,
    entityId: a.entityId,
    // The TESTABLE claim, stated as what the joint arm actually judges: that
    // the two mechanisms compose independently. `naiveAdditivePrediction` is
    // its prediction and the joint arm is the measurement, so this hypothesis
    // is refuted exactly when the interaction is not additive. Stating it any
    // more loosely ("moves the metric differently from either alone") would not
    // be decidable by the measurement that is actually taken.
    statement:
      `Applying "${a.mechanism}" and "${b.mechanism}" together at strength ${strength} moves ` +
      `${a.entityId}.${a.criterion.metric} by the SUM of their separate effects — they compose independently.`,
    why:
      `Both "${a.hypothesisId}" (${byId.get(a.hypothesisId)?.confidence ?? 'supported'}) and "${b.hypothesisId}" ` +
      `(${byId.get(b.hypothesisId)?.confidence ?? 'supported'}) survived independently, so the run could not settle ` +
      'on one explanation — and it should not, because these are not rivals: both levers really work. The ' +
      'informative next experiment is therefore not which one is right but whether they compose, which cannot be ' +
      'answered by arithmetic over their separate effects and has to be run.',
  };

  return { first, firstExecution, generated: { derived, assessment, betterThanBestSingle }, noGenerationReason: null };
}
