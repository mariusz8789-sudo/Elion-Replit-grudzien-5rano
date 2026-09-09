import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { MeasurementProvenanceSummary } from '../measurementProvenance';
import type { NextAction } from './nextAction';

/**
 * ONE SHAPE FOR "GENESIS INVESTIGATED SOMETHING", ACROSS SUBSTRATES.
 *
 * Genesis has three real, genuinely different investigation loops, and this
 * module is the contract that lets a caller drive any of them without knowing
 * which:
 *
 *   `agent/discoveryLoop.ts`  — MECHANISM: "does lever X move metric M?"
 *                               Forks a live `WorldGraph`, advances two arms,
 *                               compares them.
 *   `agent/inquiryLoop.ts`    — PARAMETER: "which value does this system have?"
 *                               Runs the Experiment Fabric solver at each
 *                               hypothesis's claimed values and at the system's
 *                               real ones, and picks the probe that separates
 *                               the survivors.
 *   `agent/worldParameterCalibration.ts` — CALIBRATION: "which value does
 *                               THIS WorldGraph world have?" Builds one
 *                               independent world per hypothesis from tick
 *                               zero, and picks which TICK to read that
 *                               separates the survivors — see
 *                               `TWO_AUTONOMOUS_LOOPS_DECISION.md` §11-§12
 *                               for why this is a genuinely third shape, not
 *                               PARAMETER run on a different substrate with
 *                               the same reasoning.
 *
 * ## Why this is a contract and not a fourth loop
 *
 * The three differ in how they OBTAIN numbers, not in how they REASON about
 * them. All three already share the reasoning primitives —
 * `falsificationRelation.ts` decides a criterion against two numbers for all
 * three, and `scientificDiscovery.ts` supplies the verdict vocabulary for all
 * three. Merging their loop bodies would mean a substrate `if` in every step:
 * fork/compare needs a mutable branching world, predict/discriminate-by-setting
 * needs a solver you can evaluate at values the system does not have,
 * predict/discriminate-by-tick needs N independent worlds advanced over time.
 * That is a domain hack wearing a uniform, so the loops stay separate and only
 * their REPORTING is unified here.
 *
 * ## Every field below is something at least one loop already produces
 *
 * This is the test this contract had to pass to exist at all: nothing here was
 * invented so the shapes would match. Checked against the real
 * `DiscoveryLoopResult`, `InquiryLoopResult` and `WorldParameterCalibrationResult`
 * field by field. Where a loop genuinely does not produce something, the field
 * is nullable and the adapter leaves it null rather than deriving a value the
 * loop never decided — the same discipline `nextAction.ts` already established
 * for its own selectors.
 *
 * `native` carries each loop's own untouched result, so normalisation is purely
 * additive and an adapter can be proven equivalent to a direct call rather than
 * trusted to be.
 */

/**
 * 1.1.0 added `StrategyRound.reference` and the per-verdict `predicted`.
 * Additive for a consumer — a reader of 1.0.0 data simply had less — and the
 * two fields exist because a bare `observed` is not interpretable without what
 * it was judged against.
 *
 * 1.2.0 added the `CALIBRATION` shape. Also additive: every existing field
 * keeps its meaning for MECHANISM and PARAMETER runs exactly as before, and a
 * reader that only knew 1.1.0's two shapes simply never sees the third.
 */
/**
 * 1.3.0 added `StrategyRun.measurementProvenance`. Required rather than
 * optional: an optional provenance field is one every adapter is free to
 * forget, which is how the axis was lost at this hop in the first place.
 */
export const DISCOVERY_STRATEGY_CONTRACT_VERSION = '1.3.0';

/**
 * The shape of the question, which is what decides the strategy — NOT the
 * scientific domain. Chemistry can be asked any of the three: "does heating
 * reduce the remaining fraction" is MECHANISM, "which activation energy does
 * THIS Fabric sample have" is PARAMETER, "which infectious period does THIS
 * WorldGraph outbreak have" is CALIBRATION.
 *
 * Deliberately held to exactly the number of real loops that exist — this
 * type's own history is the enforcement: it stayed at two values for as long
 * as two loops existed, and did not gain a third until
 * `worldParameterCalibration.ts` was audited into existence as a genuine
 * third composition (`TWO_AUTONOMOUS_LOOPS_DECISION.md` §11-§12) rather than
 * added to make some domain fit. A future value needs the same standing: a
 * real capability behind it, checked, not a label added so a question has
 * somewhere to go.
 *
 * - `MECHANISM`   — `discoveryLoop.ts`. WorldGraph, forks one world at a
 *   decision tick, compares an intervention arm against a shared baseline.
 * - `PARAMETER`   — `inquiryLoop.ts`. Experiment Fabric, holds the model
 *   fixed and varies a SETTING to probe it — one call per measurement, no
 *   time evolution.
 * - `CALIBRATION` — `worldParameterCalibration.ts`. WorldGraph, no
 *   intervention and no shared baseline: each hypothesis gets its OWN world
 *   built from tick zero with its own claimed value for an unknown solver
 *   constant, and the probe is WHICH TICK to read a trajectory at, not a
 *   setting to vary.
 */
export type QuestionShape = 'MECHANISM' | 'PARAMETER' | 'CALIBRATION';

/**
 * Whether Genesis can answer at all, and on what standing.
 *
 * Uses the honesty vocabulary the repository already commits to rather than a
 * new one: REAL and APPROXIMATION correspond to `solverCapability.ts`'s
 * MODELLED and PARTIALLY_MODELLED, and NOT_MODELLED is that registry's own
 * word. BLOCKED is separate on purpose: "no model exists" and "a model exists
 * but this runtime cannot execute it" are different facts that call for
 * different fixes, and collapsing them would hide which one happened.
 */
export type AdmissionStatus = 'REAL' | 'APPROXIMATION' | 'NOT_MODELLED' | 'BLOCKED';

export interface Admission {
  readonly status: AdmissionStatus;
  /** Why this standing, in the underlying registry's own words where it has them. */
  readonly why: string;
  /**
   * What Genesis would concretely need. Non-empty whenever the status is
   * NOT_MODELLED or BLOCKED — an admission that refuses without naming what is
   * missing tells the user nothing they can act on.
   */
  readonly missing: readonly string[];
  /** The caveat a PARTIALLY_MODELLED capability carries, verbatim. Null when there is none. */
  readonly caveat: string | null;
}

/** One round of investigation, in the terms both loops genuinely report. */
export interface StrategyRound {
  readonly round: number;
  /** What was actually done this round, in the loop's own words. */
  readonly what: string;
  /** Why this and not something else — decided before the round ran. */
  readonly why: string;
  /** The objective reading this round produced. Null when the round produced no usable number. */
  readonly observed: number | null;
  /**
   * What `observed` was judged AGAINST, when the round has one shared reference.
   *
   * An observation with nothing to compare it to is not interpretable: "28.5"
   * says nothing until a reader knows the control read 10194.5. The MECHANISM
   * loop has exactly one such number per round — the baseline arm's objective —
   * so it is carried here.
   *
   * The PARAMETER loop has none, and this is null there rather than invented:
   * that loop judges the observation against EACH hypothesis's own prediction,
   * so its reference is per-hypothesis and lives on the verdict below. Forcing
   * both substrates onto one field would have to drop one of the two, which is
   * the same reason `surviving` carries ids rather than belief objects.
   * CALIBRATION has the identical shape for the identical reason — each
   * hypothesis is judged against its OWN independently-built world's reading,
   * never a shared baseline — so it is null there too.
   */
  readonly reference: number | null;
  readonly verdicts: readonly {
    readonly hypothesisId: string;
    readonly assessment: HypothesisAssessment;
    /**
     * What THIS hypothesis predicted for this round, when it predicted anything.
     *
     * Real on the PARAMETER path: the hypothesis's own claimed values are run
     * through the same model, under the same code path as the measurement they
     * are judged against, so this is a solver output and not arithmetic done here.
     * Real on the CALIBRATION path for the same reason: the hypothesis's own
     * claimed value built an independent world, and the reading at this round's
     * probe tick came off that world's own trajectory.
     *
     * Null on the MECHANISM path, and deliberately so. That loop's hypotheses
     * assert a DIRECTION relative to a control ("this lever lowers the peak"),
     * never a value, so there is no prediction to report and manufacturing one
     * would be inventing a claim the hypothesis never made.
     */
    readonly predicted: number | null;
  }[];
}

/**
 * The result of one investigation, whichever loop ran it.
 *
 * `surviving`/`falsified`/`untested` are hypothesis IDS rather than belief
 * objects on purpose: the two loops represent belief differently on purpose
 * (an ordinal ladder that records WHY something was refuted and at how many
 * magnitudes it replicated, versus a numeric confidence with a full update
 * trajectory), and each carries something the other does not. Projecting both
 * onto a single belief type would lose information in both directions, so this
 * contract reports only the partition every loop agrees on and leaves the
 * belief representation in `native`.
 */
export interface StrategyRun {
  readonly contractVersion: string;
  readonly strategyId: string;
  readonly shape: QuestionShape;
  readonly question: string;
  readonly domainId: string;
  readonly rounds: readonly StrategyRound[];
  readonly surviving: readonly string[];
  readonly falsified: readonly string[];
  readonly untested: readonly string[];
  readonly stopReason: string;
  /**
   * What to run next. Null when the loop reached a stop that proposes nothing —
   * never synthesised, because a proposal the loop did not make is a decision
   * nobody took.
   */
  readonly nextExperiment: NextAction | null;
  /** What the run could not settle, named rather than implied. */
  readonly openQuestions: readonly string[];
  /** Assumptions declared before the run plus what it did not model, as the loop stated them. */
  readonly limitations: readonly string[];
  /**
   * WHERE THIS RUN'S NUMBERS CAME FROM — computed, looked up, or measured.
   *
   * This hop is where the axis used to disappear. `ExperimentRun.provenance`
   * survives Fabric → Run → Evidence, and then `StrategyRun` carried nothing:
   * every consumer downstream of a strategy — Science Memory, replay, the
   * Matrix, narration — saw findings with no record of what produced them, and
   * a real laboratory result arriving later would have been indistinguishable
   * from a simulation the moment it reached this contract.
   *
   * Derived by each adapter from what its loop actually did, never asserted
   * here. See `measurementProvenance.ts` for why this is a different question
   * from `resultOrigin`, `ConfirmationLevel`, `GroundingLevel` and
   * `HonestyLevel`, all of which already exist and none of which answers it.
   */
  readonly measurementProvenance: MeasurementProvenanceSummary;
  /** Content fingerprint from the loop's own fingerprint function — never recomputed here. */
  readonly resultFingerprint: string;
  /** The loop's own result, untouched. */
  readonly native: unknown;
}

/**
 * A real investigation capability. Implemented by a thin adapter per loop; the
 * loops themselves neither implement nor import this.
 */
export interface DiscoveryStrategy<TInput> {
  readonly id: string;
  readonly handles: QuestionShape;
  /** Can this run at all, and on what standing. Consulted BEFORE `run`. */
  admit(input: TInput): Admission;
  run(input: TInput): StrategyRun;
}
