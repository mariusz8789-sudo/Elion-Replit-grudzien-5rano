import { toParameterRun } from './discoveryStrategies';
import type { InquiryLoopInput, InquiryLoopResult, ParameterHypothesis } from './inquiryLoop';
import { assessModelSufficiency } from './modelSufficiency';

/**
 * PARAMETER-SIDE GENERATION — proposing a value nobody declared, derived from
 * the real numbers that refuted everyone who did.
 *
 * ## The gap this closes
 *
 * Traced and measured in `AUTONOMOUS_DISCOVERY_ROADMAP.md` §10: the MECHANISM
 * path can already invent a new explanation after a falsification —
 * `deriveAlternativeCriteria` turns a refuted lever into a `~RELATION_FLIP`
 * hypothesis that is then really tested, and really supported. The PARAMETER
 * path could not. Across every fixture, including total failure, the set of
 * hypothesis ids that ever appeared was exactly the set declared: zero created.
 * When everything was refuted, `inquiryLoop.ts` said *"the system's real value
 * is not among the values anyone proposed"* — correct, honest, and terminal.
 *
 * This is the PARAMETER analogue, built to the same shape as its MECHANISM
 * sibling: a PURE DERIVATION over a finished run. It executes nothing, runs no
 * solver, and mutates no loop — it returns a candidate, or refuses. Whether to
 * test the candidate is the caller's decision, exactly as
 * `deriveAlternativeCriteria` was a pure function long before P3 gave it a call
 * site.
 *
 * ## It is also the first ACTUATOR on the insufficiency sensor
 *
 * `modelSufficiency.ts` has been computing `DECLARED_SPACE_INSUFFICIENT` —
 * "none of the declared values explains this, a next step must go outside the
 * declared space" — and until now only two things read it: the Matrix
 * projection and the narration. Nothing could act on it. This module is the
 * first thing that does: the verdict is the precondition for deriving at all,
 * so "my declared space is insufficient" finally leads somewhere instead of
 * being announced and dropped.
 *
 * ## How the value is derived — bracketing, and why that is honest
 *
 * At a probe where the measurement came back, every hypothesis has a real
 * prediction from a real solver run. If one hypothesis's prediction sits BELOW
 * the observation and another's sits ABOVE it, the observation lies between
 * their two claimed values' consequences — so a value between those two claims
 * is the candidate the data itself points at. Nothing is fitted, nothing is
 * searched, and nothing is randomised: it is the midpoint of a bracket the
 * measurement drew.
 *
 * Measured on the real protein-folding substrate: a fold at temperature 0.5
 * falsifies all four declared candidates; at 5000 steps the observed
 * acceptance rate 0.2576 sits between `h:cold`'s 0.1728 (T=0.3) and
 * `h:cool`'s 0.3428 (T=0.7); the midpoint is 0.5 — the true hidden value,
 * derived from the failure rather than guessed.
 *
 * **A candidate is not a finding.** The same measurement shows the midpoint
 * landing well away from the truth on other folds, which is exactly why this
 * returns a hypothesis TO BE TESTED and never a conclusion.
 *
 * Bracketing assumes the metric moves monotonically with the parameter between
 * those two claims. That assumption used to be stated here and left unchecked;
 * it is now checked (Refusal 4), because the run's own data can contradict it
 * and on this very solver sometimes does — see `bracketMonotonicity`.
 *
 * ## The four refusals, each a real case
 *
 * 1. **Something survived.** Generation is for an EXHAUSTED space. If any
 *    declared hypothesis is still standing, the honest next step is to test
 *    between the survivors — which the loop already does — not to invent.
 * 2. **Not a single shared scalar parameter.** Bracketing infers ONE unknown
 *    from a scalar observation. Arrhenius hypotheses claim two coupled values
 *    (`activationEnergyKJ` AND `preExponentialLog10`), and a 1-D bracket cannot
 *    locate a point in a 2-D space — famously so, since those pairs sit on a
 *    compensation line by construction. Refused rather than approximated.
 * 3. **No bracket.** When every prediction sits on the same side of the
 *    observation, the data points OUTSIDE the declared range and bracketing
 *    would be extrapolation. Refused — the same discipline that makes
 *    `deriveAlternativeCriteria` return `[]` from a no-effect refutation
 *    instead of inventing something. This is a live case, not a theoretical
 *    one: at 200 steps every candidate predicts the identical 0.13 (a real
 *    algorithmic floor), and nothing can be derived from that round.
 * 4. **The round contradicts monotonicity.** A straddle localises the truth
 *    between two claims only if the metric moves monotonically with the
 *    parameter across them. Also a live case on this same solver: judged by
 *    `bestEnergy` at 1000 steps, temperatures 0.3/0.7/1.2/2.0 predict
 *    -3/-2/-3/-3, so a straddle there would be coincidence, not localisation.
 *    Refused, and an earlier round is tried instead.
 *
 * ## Anti-HARKing, carried in the result rather than trusted to the caller
 *
 * The candidate is derived FROM a specific measurement, so it cannot be judged
 * BY that measurement — confirming it at the probe that produced it would be
 * fitting the hypothesis to the data that generated it, the exact failure P3
 * had to design around on the MECHANISM side (`excludedStrengths`). The probe
 * used to derive is returned as `excludedProbeValues`, so a caller scheduling
 * the test cannot silently reuse it.
 */

/**
 * 1.1.0 added `bracketLowValue`/`bracketHighValue` and `derivedValueStanding`.
 * Additive, and added for a measured reason — see `derivedValueStanding`'s own
 * doc: a surviving derived value was being reported as a bare `true`, which
 * overclaims.
 */
export const PARAMETER_ALTERNATIVE_CONTRACT_VERSION = '1.1.0';

export interface DerivedParameterHypothesis {
  readonly contractVersion: string;
  /** Deterministic and self-describing, the same way `~RELATION_FLIP` ids are. */
  readonly hypothesisId: string;
  readonly parameterId: string;
  readonly value: number;
  /** The round whose measurement drew the bracket. */
  readonly derivedFromRound: number;
  readonly derivedFromProbeValue: number;
  /** The two declared hypotheses whose predictions straddled the observation. */
  readonly bracketLowHypothesisId: string;
  readonly bracketHighHypothesisId: string;
  /**
   * Their two CLAIMED values — the ends of the interval this derivation is
   * actually evidence about. Carried as numbers, not only inside `why`, because
   * `derivedValueStanding` needs the interval and a caller should not have to
   * parse a sentence to get it.
   */
  readonly bracketLowValue: number;
  readonly bracketHighValue: number;
  /**
   * Probes this candidate must NOT be judged at: the one that derived it.
   * See this module's anti-HARKing note.
   */
  readonly excludedProbeValues: readonly number[];
  /**
   * Whether the bracketing round's own predictions actually moved monotonically
   * with the claimed values — the assumption the midpoint rests on, now checked
   * rather than assumed. Never `VIOLATED` here: a violated round is refused, so
   * this records `MONOTONIC` (confirmed on 3+ points) or `TOO_FEW_POINTS` (only
   * two contenders left, so a violation is undetectable rather than absent).
   */
  readonly monotonicity: 'MONOTONIC' | 'TOO_FEW_POINTS';
  readonly why: string;
}

/**
 * Whether this round's own data supports the assumption bracketing rests on.
 *
 * Bracketing says: one claim predicts below the observation, another above, so
 * the truth lies between those two claims. That inference is only valid if the
 * metric moves monotonically with the parameter across them. If it does not,
 * two predictions straddling the observation is a coincidence rather than a
 * localisation, and the midpoint means nothing.
 *
 * The check is free, because the round already ran every candidate through the
 * solver: sort the claims by value and see whether their predictions come out
 * sorted too. Measured on the real HP-lattice solver, this is not hypothetical
 * — with `acceptanceRate` at 5000 steps the predictions rise monotonically with
 * temperature (0.1728, 0.3428, 0.3796, 0.4140) and bracketing is sound, while
 * with `bestEnergy` at 1000 steps the same four temperatures predict -3, -2, -3
 * and -3, which is plainly not monotonic. Same solver, same seed, same
 * temperatures; only the metric differs.
 */
type BracketMonotonicity = 'MONOTONIC' | 'VIOLATED' | 'TOO_FEW_POINTS';

function bracketMonotonicity(
  points: readonly { readonly claimed: number; readonly predicted: number }[],
): BracketMonotonicity {
  // Two points are monotonic by construction, so a violation is undetectable
  // rather than absent. Reported as its own value instead of a false pass.
  if (points.length < 3) return 'TOO_FEW_POINTS';
  const sorted = [...points].sort((a, b) => a.claimed - b.claimed);
  let nonDecreasing = true;
  let nonIncreasing = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.predicted < sorted[i - 1]!.predicted) nonDecreasing = false;
    if (sorted[i]!.predicted > sorted[i - 1]!.predicted) nonIncreasing = false;
  }
  return nonDecreasing || nonIncreasing ? 'MONOTONIC' : 'VIOLATED';
}

/** The single scalar parameter every hypothesis claims, or null when they do not share exactly one. */
function sharedScalarParameter(hypotheses: readonly ParameterHypothesis[]): string | null {
  if (hypotheses.length < 2) return null;
  const keys = Object.keys(hypotheses[0]!.claimedValues);
  if (keys.length !== 1) return null;
  const parameterId = keys[0]!;
  for (const h of hypotheses) {
    const own = Object.keys(h.claimedValues);
    if (own.length !== 1 || own[0] !== parameterId) return null;
    if (!Number.isFinite(h.claimedValues[parameterId])) return null;
  }
  return parameterId;
}

/**
 * Derives one candidate value from a finished inquiry whose declared space was
 * exhausted, or refuses. See this module's doc for the three refusal cases.
 */
export function deriveAlternativeParameterValue(
  result: InquiryLoopResult,
  input: InquiryLoopInput,
): DerivedParameterHypothesis | null {
  // Refusal 1 — the insufficiency sensor is the precondition, not a suggestion.
  if (assessModelSufficiency(toParameterRun(result, input)).status !== 'DECLARED_SPACE_INSUFFICIENT') return null;

  // Refusal 2 — one shared scalar unknown, or nothing to bracket.
  const parameterId = sharedScalarParameter(input.hypotheses);
  if (parameterId === null) return null;

  const claimedById = new Map(input.hypotheses.map((h) => [h.hypothesisId, h.claimedValues[parameterId]!]));

  // The LAST round that brackets wins: it is the measurement taken with the most
  // refined belief state, since every probe after the first was chosen to
  // discriminate. When several rounds bracket, only that one is used — this
  // does not yet intersect their intervals or report a contradiction between
  // them, and says so rather than implying more rigour than it has.
  for (let i = result.rounds.length - 1; i >= 0; i--) {
    const round = result.rounds[i]!;
    if (round.observed === null) continue;
    const observed = round.observed;

    let low: { id: string; predicted: number; claimed: number } | null = null;
    let high: { id: string; predicted: number; claimed: number } | null = null;
    const points: { claimed: number; predicted: number }[] = [];
    for (const outcome of round.outcomes) {
      const claimed = claimedById.get(outcome.hypothesisId);
      if (outcome.predicted === null || claimed === undefined) continue;
      points.push({ claimed, predicted: outcome.predicted });
      if (outcome.predicted < observed && (low === null || outcome.predicted > low.predicted)) {
        low = { id: outcome.hypothesisId, predicted: outcome.predicted, claimed };
      }
      if (outcome.predicted > observed && (high === null || outcome.predicted < high.predicted)) {
        high = { id: outcome.hypothesisId, predicted: outcome.predicted, claimed };
      }
    }
    // Refusal 3 — no bracket at this round; try an earlier one.
    if (low === null || high === null) continue;

    // Refusal 4 — the round's own data contradicts the assumption bracketing
    // rests on. A straddle is only a localisation when the metric moves
    // monotonically with the parameter; where it does not, the midpoint is
    // arithmetic on unrelated numbers. Try an earlier round rather than
    // deriving something this run's own measurements do not support.
    const monotonicity = bracketMonotonicity(points);
    if (monotonicity === 'VIOLATED') continue;

    const value = (low.claimed + high.claimed) / 2;
    return {
      contractVersion: PARAMETER_ALTERNATIVE_CONTRACT_VERSION,
      hypothesisId: `h:derived-${parameterId}-${value}`,
      parameterId,
      value,
      derivedFromRound: round.round,
      derivedFromProbeValue: round.probeValue,
      bracketLowHypothesisId: low.id,
      bracketHighHypothesisId: high.id,
      bracketLowValue: low.claimed,
      bracketHighValue: high.claimed,
      excludedProbeValues: [round.probeValue],
      monotonicity,
      why:
        `Every declared value was refuted, so the answer is outside the declared space. At ` +
        `${input.system.probeParameterId}=${round.probeValue} the measurement was ${observed}, which sits between ` +
        `"${low.id}" (${parameterId}=${low.claimed}, predicted ${low.predicted}) and "${high.id}" ` +
        `(${parameterId}=${high.claimed}, predicted ${high.predicted}). A value between those two claims is what the ` +
        `data points at, so ${parameterId}=${value} is proposed — as a candidate to be tested at a setting other than ` +
        `${round.probeValue}, never confirmed by the measurement that produced it.`,
    };
  }
  return null;
}

/**
 * WHAT A SURVIVING DERIVED VALUE ACTUALLY EARNED — the correction to a bare
 * `survived: true`.
 *
 * ## The overclaim this exists to stop, measured on the real substrate
 *
 * The follow-up investigation was reporting one boolean, and that boolean is
 * not the finding. Measured on the seeded HP-lattice fold, `steps` probe,
 * declared ±15% band, with the true hidden temperature varied and everything
 * else identical:
 *
 *     true T = 0.40  ->  derived 0.5 survives, h:cold and h:cool refuted
 *     true T = 0.50  ->  derived 0.5 survives, h:cold and h:cool refuted
 *     true T = 0.55  ->  derived 0.5 survives, h:cold and h:cool refuted
 *     true T = 0.65  ->  derived 0.5 survives, h:cold and h:cool refuted
 *
 * Four different truths, one identical verdict. At T=0.65 the follow-up ended
 * `NO_CONTENDERS_LEFT` with `openQuestions: []` over a value that is wrong by
 * 23%. Nothing lied: at 5000 steps the derived value predicts 0.2576 against an
 * observation of 0.2772, a 7.1% gap that the declared ±15% band cannot call a
 * refutation. The run is honest round by round and the SUMMARY still overclaims,
 * because "the only survivor" reads as "the answer" when the space it survived
 * was three values Genesis chose itself.
 *
 * ## What the evidence does support
 *
 * Both bracket parents WERE refuted, and that is real: the value is not 0.3 and
 * not 0.7. So the earned finding is the open interval between them — evidence
 * about an INTERVAL, reported as one, with the midpoint named as the point
 * inside it that the derivation proposed rather than as the value that was
 * found. Narrowing that interval is a further experiment, not a further
 * sentence.
 *
 * ## Why this is a reader and not a change to the loop
 *
 * `inquiryLoop.ts` is correct as it stands — it reports per-round verdicts
 * against a declared band and never claims identification. The overclaim was in
 * how a CALLER summarised it. So the fix belongs at the caller, as a pure
 * reading of a finished run, in the same shape as every other reader here.
 */
export type DerivedValueStanding =
  /** The follow-up refuted it: the derived value is out, and that is a real result. */
  | 'REFUTED'
  /**
   * It was not refuted, and both bracket parents were — the interval between
   * them is supported, the point inside it is not identified.
   */
  | 'SUPPORTED_INTERVAL_NOT_IDENTIFIED'
  /**
   * It was not refuted, but neither was at least one bracket parent — so the
   * follow-up did not even narrow to the interval. Weaker still.
   */
  | 'SUPPORTED_NOTHING_NARROWED';

export interface DerivedValueAssessment {
  readonly standing: DerivedValueStanding;
  /** The ends of the interval, ordered. Both were refuted only in the `..._NOT_IDENTIFIED` case. */
  readonly interval: readonly [number, number];
  /** Bracket parents the follow-up actually refuted — what makes the interval earned rather than assumed. */
  readonly refutedBracketEnds: readonly string[];
  /** Plain statement of what was and was not established. Never asserts identification. */
  readonly why: string;
}

/**
 * Reads a finished follow-up and states what the derived value earned.
 *
 * Takes the follow-up's own `InquiryLoopResult` — the run that judged the
 * derived hypothesis — and nothing else, so it cannot consult the answer.
 */
export function derivedValueStanding(
  derived: DerivedParameterHypothesis,
  followUp: InquiryLoopResult,
): DerivedValueAssessment {
  const lo = Math.min(derived.bracketLowValue, derived.bracketHighValue);
  const hi = Math.max(derived.bracketLowValue, derived.bracketHighValue);
  const interval: readonly [number, number] = [lo, hi];
  const ends = [derived.bracketLowHypothesisId, derived.bracketHighHypothesisId];
  const refutedBracketEnds = ends.filter((id) => followUp.falsifiedHypothesisIds.includes(id));

  if (followUp.falsifiedHypothesisIds.includes(derived.hypothesisId)) {
    return {
      standing: 'REFUTED',
      interval,
      refutedBracketEnds,
      why:
        `The derived value ${derived.parameterId}=${derived.value} was refuted by evidence it did not author. ` +
        'That is a real result: the value proposed after the declared space ran out is also out.',
    };
  }

  if (refutedBracketEnds.length === ends.length) {
    return {
      standing: 'SUPPORTED_INTERVAL_NOT_IDENTIFIED',
      interval,
      refutedBracketEnds,
      why:
        `Both bracket ends were refuted, so ${derived.parameterId} lies between ${lo} and ${hi}. That interval is ` +
        `what the evidence supports. ${derived.value} is the point the derivation proposed inside it and was not ` +
        'refuted there — which is not the same as being identified: any value in this interval that predicts within ' +
        'the declared agreement band at the settings actually tried would have survived the same way. Narrowing ' +
        'this is another experiment, not another sentence.',
    };
  }

  return {
    standing: 'SUPPORTED_NOTHING_NARROWED',
    interval,
    refutedBracketEnds,
    why:
      `${derived.parameterId}=${derived.value} was not refuted, but neither was ` +
      `${ends.filter((id) => !refutedBracketEnds.includes(id)).join(' and ')}. The follow-up did not separate the ` +
      'derived value from the claims it was derived between, so nothing was narrowed and no interval was earned.',
  };
}

/** The candidate as a testable hypothesis, ready to be handed to a new inquiry. */
export function asParameterHypothesis(derived: DerivedParameterHypothesis, priorConfidence = 0.5): ParameterHypothesis {
  return {
    hypothesisId: derived.hypothesisId,
    statement: `Derived after every declared value was refuted: ${derived.parameterId} is ${derived.value}, bracketed by "${derived.bracketLowHypothesisId}" and "${derived.bracketHighHypothesisId}".`,
    claimedValues: { [derived.parameterId]: derived.value },
    priorConfidence,
  };
}
