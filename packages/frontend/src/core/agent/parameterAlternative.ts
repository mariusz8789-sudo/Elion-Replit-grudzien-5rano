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
 * returns a hypothesis TO BE TESTED and never a conclusion. Bracketing assumes
 * the metric moves monotonically with the parameter between those two claims;
 * that assumption is not verified here and does not need to be, because the
 * candidate faces a real experiment before it is believed.
 *
 * ## The three refusals, each a real case
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

export const PARAMETER_ALTERNATIVE_CONTRACT_VERSION = '1.0.0';

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
   * Probes this candidate must NOT be judged at: the one that derived it.
   * See this module's anti-HARKing note.
   */
  readonly excludedProbeValues: readonly number[];
  readonly why: string;
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
    for (const outcome of round.outcomes) {
      const claimed = claimedById.get(outcome.hypothesisId);
      if (outcome.predicted === null || claimed === undefined) continue;
      if (outcome.predicted < observed && (low === null || outcome.predicted > low.predicted)) {
        low = { id: outcome.hypothesisId, predicted: outcome.predicted, claimed };
      }
      if (outcome.predicted > observed && (high === null || outcome.predicted < high.predicted)) {
        high = { id: outcome.hypothesisId, predicted: outcome.predicted, claimed };
      }
    }
    // Refusal 3 — no bracket at this round; try an earlier one.
    if (low === null || high === null) continue;

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
      excludedProbeValues: [round.probeValue],
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

/** The candidate as a testable hypothesis, ready to be handed to a new inquiry. */
export function asParameterHypothesis(derived: DerivedParameterHypothesis, priorConfidence = 0.5): ParameterHypothesis {
  return {
    hypothesisId: derived.hypothesisId,
    statement: `Derived after every declared value was refuted: ${derived.parameterId} is ${derived.value}, bracketed by "${derived.bracketLowHypothesisId}" and "${derived.bracketHighHypothesisId}".`,
    claimedValues: { [derived.parameterId]: derived.value },
    priorConfidence,
  };
}
