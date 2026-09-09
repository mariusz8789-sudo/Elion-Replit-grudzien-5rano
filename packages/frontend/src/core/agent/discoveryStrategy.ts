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

export const DISCOVERY_STRATEGY_CONTRACT_VERSION = '1.0.0';

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

/**
 * One hypothesis's verdict within a round, plus the two numbers it was judged on — both real,
 * already-computed values from the loop that ran this round, never derived here.
 *
 * `reference` and `predicted` are declared PER VERDICT, not per round: the PARAMETER loop can judge
 * several hypotheses in the same round, each against its OWN predicted value (a different number per
 * hypothesis, since each ran the real solver at its own claimed parameters) — a single round-level
 * number would silently pick one and hide the rest. The MECHANISM loop tests exactly one hypothesis
 * per round, so its round always carries exactly one verdict; the fields are just as real there, only
 * less numerous.
 */
export interface StrategyVerdict {
  readonly hypothesisId: string;
  readonly assessment: HypothesisAssessment;
  /**
   * The world's own reading BEFORE this round's action — the MECHANISM loop's real
   * `objectiveBaseline` (a counterfactual arm with no intervention). Null for the PARAMETER loop,
   * which probes one system rather than comparing two arms and so has no "before" reading to report —
   * left null rather than invented.
   */
  readonly reference: number | null;
  /**
   * What this hypothesis predicted BEFORE the observation: the MECHANISM loop's own preregistered
   * criterion value (`WorldCounterfactualAssessment.reference` — literally the value the outcome was
   * declared to be judged against before the round ran), or the PARAMETER loop's own real predicted
   * reading (`HypothesisOutcome.predicted`, from actually running the solver at this hypothesis's
   * claimed values). Null only when the loop itself could not produce a prediction.
   */
  readonly predicted: number | null;
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
  readonly verdicts: readonly StrategyVerdict[];
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
