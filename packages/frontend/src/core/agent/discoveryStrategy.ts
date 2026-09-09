import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { NextAction } from './nextAction';

/**
 * ONE SHAPE FOR "GENESIS INVESTIGATED SOMETHING", ACROSS SUBSTRATES.
 *
 * Genesis has two real, genuinely different investigation loops, and this
 * module is the contract that lets a caller drive either without knowing which:
 *
 *   `agent/discoveryLoop.ts`  — MECHANISM: "does lever X move metric M?"
 *                               Forks a live `WorldGraph`, advances two arms,
 *                               compares them.
 *   `agent/inquiryLoop.ts`    — PARAMETER: "which value does this system have?"
 *                               Runs the Experiment Fabric solver at each
 *                               hypothesis's claimed values and at the system's
 *                               real ones, and picks the probe that separates
 *                               the survivors.
 *
 * ## Why this is a contract and not a third loop
 *
 * The two differ in how they OBTAIN numbers, not in how they REASON about them.
 * Both already share the reasoning primitives — `falsificationRelation.ts`
 * decides a criterion against two numbers for both, and
 * `scientificDiscovery.ts` supplies the verdict vocabulary for both. Merging
 * their loop bodies would mean a substrate `if` in every step: fork/compare
 * needs a mutable branching world, predict/discriminate needs a solver you can
 * evaluate at values the system does not have. That is a domain hack wearing a
 * uniform, so the loops stay separate and only their REPORTING is unified here.
 *
 * ## Every field below is something both loops already produce
 *
 * This is the test this contract had to pass to exist at all: nothing here was
 * invented so the shapes would match. Checked against the real
 * `DiscoveryLoopResult` and `InquiryLoopResult` field by field. Where one loop
 * genuinely does not produce something, the field is nullable and the adapter
 * leaves it null rather than deriving a value the loop never decided — the same
 * discipline `nextAction.ts` already established for its own six selectors.
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
 */
export const DISCOVERY_STRATEGY_CONTRACT_VERSION = '1.1.0';

/**
 * The shape of the question, which is what decides the strategy — NOT the
 * scientific domain. Chemistry can be asked either kind: "does heating reduce
 * the remaining fraction" is MECHANISM, "which activation energy does this
 * sample have" is PARAMETER.
 *
 * Deliberately only two values, because exactly two real loops exist. A third
 * shape must arrive with a third real loop that answers it — adding a value
 * here to make a domain fit would put a question in a loop that cannot answer
 * it, which is worse than admitting the gap.
 */
export type QuestionShape = 'MECHANISM' | 'PARAMETER';

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
