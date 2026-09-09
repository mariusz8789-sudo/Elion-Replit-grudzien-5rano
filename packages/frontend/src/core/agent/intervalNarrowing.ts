import type { InquiryLoopInput, InquiryLoopResult, ParameterHypothesis } from './inquiryLoop';
import { sharedScalarParameter, type DerivedParameterHypothesis, type DerivedValueAssessment } from './parameterAlternative';

/**
 * NARROWING AN INTERVAL GENESIS ALREADY EARNED.
 *
 * ## The gap this closes, and how it was found
 *
 * `nextQuestion.ts` was built to report what a finished investigation leaves
 * worth asking. Run against the fold at temperature 0.5 it produced an
 * uncomfortable answer: every declared value refuted, 0.5 derived, 0.5
 * survives — and the single most important remaining question, "where in
 * [0.3, 0.7] does the temperature actually lie?", came back
 * `answerableNow: false`, `blockedOnHuman: true`. Genesis had just succeeded at
 * inventing a hypothesis and had nowhere to go with it.
 *
 * The reason was structural. `parameterAlternative.ts` fires only on an
 * EXHAUSTED space — every declared value refuted — because that is when
 * bracketing is licensed. After a successful generation the space is not
 * exhausted: the derived value survived. So the one mechanism that can propose
 * a value nobody declared could never propose a second one.
 *
 * ## What licenses narrowing, precisely
 *
 * Not "the derived value is probably about right". The follow-up REFUTED both
 * bracket ends, and that is a real result: the answer is not 0.3 and not 0.7.
 * `derivedValueStanding` already names this state
 * (`SUPPORTED_INTERVAL_NOT_IDENTIFIED`) and its whole point is that the
 * interval is earned while the point inside it is not. Narrowing is therefore
 * the obvious experiment: put candidates INSIDE the interval and see which
 * survive.
 *
 * ## Why the quarter points, and not a search
 *
 * Two interior candidates, one either side of the surviving value, at the
 * midpoints of each half. Together with the survivor that is three contenders
 * spanning the interval, which is the smallest set that can shrink it from
 * BOTH ends in one investigation. Nothing is fitted and nothing is optimised —
 * the same discipline as the original bracket midpoint, one level down.
 *
 * ## The narrowed range, and what it may be READ as
 *
 * `narrowedInterval` is bounded by the nearest REFUTED value on each side of
 * whatever survived. When nothing new is refuted the range is returned
 * UNCHANGED and `narrowed` is false, rather than reported as progress that did
 * not happen.
 *
 * What that range MEANS depends entirely on `basis`, and the two meanings are
 * not interchangeable — see `IntervalBasis`. Shrinking an interval the
 * generation bracketed is a localisation. Bounding survivors by their refuted
 * neighbours is a search region and can exclude the truth; that is measured,
 * not feared. Every consumer is handed `basis` for exactly this reason.
 */

/**
 * 1.1.0 added `supportedIntervalOf`, which reads the same interval from ANY
 * finished parameter inquiry rather than only from a generation follow-up. That
 * is what makes narrowing recursive: a narrowing run leaves exactly the same
 * shape of evidence it consumed — one survivor with refutations either side —
 * so the next question after narrowing is another narrowing, until the settings
 * run out or nothing new is refuted.
 */
export const INTERVAL_NARROWING_CONTRACT_VERSION = '1.1.0';

/**
 * WHERE AN INTERVAL COMES FROM, because the two provenances are worth very
 * different things and conflating them produces a false claim.
 *
 * `BRACKETED_PREDICTIONS` — two PREDICTIONS straddle one observation, so under a
 *   checked monotonicity assumption the truth lies between the two claims that
 *   produced them. This is a localisation, and it survives the soundness sweep:
 *   across every hidden value tested, the truth is inside.
 *
 * `SURVIVOR_NEIGHBOURS` — a value survived and other values either side were
 *   refuted. This looks like the same thing and is NOT. Refuting a value says
 *   the system does not have THAT value; it says nothing about which side of it
 *   the truth lies on. Measured counterexample on the real solver: at a true
 *   temperature of 0.45 with nine observation lengths declared, 0.5 is refuted
 *   while 0.7 and 0.95 both survive — the instrument saturates at long runs, so
 *   distant claims agree with each other while a nearer one does not. Reading
 *   the survivors' refuted neighbours as bounds gives [0.5, 1.2], which
 *   EXCLUDES the truth.
 *
 * So a `SURVIVOR_NEIGHBOURS` region is a place to look next, never a statement
 * about where the answer is, and everything downstream is required to keep that
 * distinction.
 */
export type IntervalBasis = 'BRACKETED_PREDICTIONS' | 'SURVIVOR_NEIGHBOURS';

/** A region a finished inquiry points at, and what survived inside it. */
export interface SupportedInterval {
  readonly parameterId: string;
  /** Bounded by the nearest REFUTED claim either side of the surviving set. */
  readonly interval: readonly [number, number];
  readonly survivingValues: readonly number[];
  /** Always `SURVIVOR_NEIGHBOURS` here — see `IntervalBasis` for why that matters. */
  readonly basis: IntervalBasis;
}

/**
 * Reads the interval a finished inquiry supports, or refuses.
 *
 * ## Why this generalises the first bracket rather than repeating it
 *
 * `parameterAlternative.ts` draws its bracket from PREDICTIONS straddling one
 * observation. This reads something weaker and differently shaped: the refuted
 * claims either side of whatever survived. It looks like the same inference and
 * is not — refuting a value says the system does not have THAT value, never
 * which side of it the answer lies on. It earns its place because it gives the
 * chain a next experiment to design from a run that generated nothing, not
 * because it localises anything.
 *
 * `alsoRefutedHypothesisIds` carries refutations that are real but not in THIS
 * run — the ones memory skipped re-testing. See the note at the call site
 * below: leaving them out made a remembered run raise fewer questions than the
 * same run with no memory at all.
 *
 * Refuses when there is no survivor (nothing to bound), when the hypotheses do
 * not share one scalar parameter (nothing to bound it IN), or when either side
 * is unbounded — a region open at one end gives no next experiment to design.
 *
 * What it returns is `SURVIVOR_NEIGHBOURS`: a search region, NOT a localisation.
 * See `IntervalBasis` for the measured counterexample that forced that
 * distinction.
 */
export function supportedIntervalOf(
  result: InquiryLoopResult,
  input: InquiryLoopInput,
  alsoRefutedHypothesisIds: readonly string[] = [],
): SupportedInterval | null {
  const parameterId = sharedScalarParameter(input.hypotheses);
  if (parameterId === null) return null;

  const valueById = new Map(input.hypotheses.map((h) => [h.hypothesisId, h.claimedValues[parameterId]!]));
  const valuesOf = (ids: readonly string[]) =>
    ids.map((id) => valueById.get(id)).filter((v): v is number => v !== undefined);

  const survivingValues = valuesOf(result.survivingHypothesisIds).sort((a, b) => a - b);
  // Refutations this run made, PLUS refutations memory already held. A
  // hypothesis memory skipped was refuted by a real earlier measurement on this
  // same system; it simply is not in THIS run's falsified list because it was
  // never re-tested. Without it, remembering makes Genesis reason worse: the
  // run looks like it refuted nothing, so no region is bounded and the question
  // this evidence supports disappears.
  const refutedValues = valuesOf([...result.falsifiedHypothesisIds, ...alsoRefutedHypothesisIds]);
  if (survivingValues.length === 0) return null;

  const below = refutedValues.filter((v) => v < survivingValues[0]!);
  const above = refutedValues.filter((v) => v > survivingValues[survivingValues.length - 1]!);
  if (below.length === 0 || above.length === 0) return null;

  return {
    parameterId,
    interval: [Math.max(...below), Math.min(...above)],
    survivingValues,
    basis: 'SURVIVOR_NEIGHBOURS',
  };
}

export interface InteriorProposal {
  readonly parameterId: string;
  /** The two interior candidates, ordered. Both strictly inside the interval. */
  readonly values: readonly number[];
  /** The interval they are meant to shrink. */
  readonly interval: readonly [number, number];
  /** Where that interval came from — and therefore what shrinking it can claim. */
  readonly basis: IntervalBasis;
  readonly why: string;
}

/**
 * Proposes the interior candidates, or refuses.
 *
 * Refuses when the interval is degenerate, or when a proposed point is not
 * strictly between the interval's ends and the surviving value — a collapsed
 * interval cannot be narrowed, and proposing its own endpoint again would be
 * re-testing a claim already refuted.
 */
export function proposeInteriorCandidates(
  derived: DerivedParameterHypothesis,
  standing: DerivedValueAssessment,
): InteriorProposal | null {
  if (standing.standing !== 'SUPPORTED_INTERVAL_NOT_IDENTIFIED') return null;
  // The generation's interval came from predictions straddling an observation,
  // with monotonicity checked at derivation time — a real localisation.
  return proposeAround(derived.parameterId, standing.interval, derived.value, 'BRACKETED_PREDICTIONS');
}

/**
 * The same proposal from a `SupportedInterval` — the reading that applies from
 * the second investigation onward, once something has survived.
 *
 * Refuses on more than one survivor rather than guessing: two survivors inside
 * one interval is a different experimental design (which of them, and where
 * between them?), and quartering around a set is not that design. Saying so is
 * better than producing candidates whose relationship to the survivors nobody
 * could state.
 */
export function proposeInteriorCandidatesFrom(supported: SupportedInterval): InteriorProposal | null {
  if (supported.survivingValues.length !== 1) return null;
  return proposeAround(supported.parameterId, supported.interval, supported.survivingValues[0]!, supported.basis);
}

function proposeAround(
  parameterId: string,
  interval: readonly [number, number],
  incumbent: number,
  basis: IntervalBasis,
): InteriorProposal | null {
  const [lo, hi] = interval;
  if (!(lo < incumbent && incumbent < hi)) return null;

  const low = (lo + incumbent) / 2;
  const high = (incumbent + hi) / 2;
  // Strictness matters: a candidate equal to an interval end is a claim already
  // refuted, and one equal to the incumbent adds no contender.
  const values = [low, high].filter((x) => x > lo && x < hi && x !== incumbent);
  if (values.length < 2) return null;

  return {
    parameterId,
    values,
    interval: [lo, hi],
    basis,
    why:
      `Both ends of [${lo}, ${hi}] were refuted, so ${parameterId} lies inside it, but ${incumbent} survived only in ` +
      `the sense that nothing separated it from its neighbours. Testing ${values.join(' and ')} — one either side of ` +
      `${incumbent} — is the smallest experiment that can shrink the interval from both ends at once.`,
  };
}

/** A hypothesis for one interior candidate, in the shape the loop already accepts. */
function interiorHypothesis(parameterId: string, value: number): ParameterHypothesis {
  return {
    hypothesisId: `h:narrow-${parameterId}-${value}`,
    statement: `Proposed while narrowing an earned interval: ${parameterId} is ${value}.`,
    claimedValues: { [parameterId]: value },
    priorConfidence: 0.5,
  };
}

/**
 * Builds the narrowing investigation, or refuses when no untried setting is
 * left to judge it on.
 *
 * The anti-HARKing rule that governs the first generation governs this one too:
 * candidates derived from earlier measurements must face evidence those
 * measurements did not supply, so the opening probe must be one no earlier
 * investigation in this chain has used.
 */
export function buildNarrowingInquiry(
  original: InquiryLoopInput,
  incumbent: { readonly hypothesisId: string; readonly value: number; readonly excludedProbeValues: readonly number[] },
  proposal: InteriorProposal,
  alreadyTriedProbeValues: readonly number[],
): InquiryLoopInput | null {
  const spent = new Set([...alreadyTriedProbeValues, ...incumbent.excludedProbeValues]);
  const openingProbeValue = original.system.candidateProbeValues.find((p) => !spent.has(p));
  if (openingProbeValue === undefined) return null;

  return {
    question:
      `Where in [${proposal.interval[0]}, ${proposal.interval[1]}] does ${proposal.parameterId} lie? ` +
      `${incumbent.value} survived, but so would its neighbours.`,
    // Every spent setting is removed from the candidate list, not merely
    // avoided when picking the opening probe. The interval these candidates sit
    // inside was drawn by those earlier measurements, so judging the candidates
    // on the same measurements would fold the evidence back on itself. Picking
    // an honest opening and then leaving the rest available is not enough — the
    // loop's own probe selector will reach for them (see the note in
    // `inquirySession.ts::runInquiryWithGeneration`, where exactly that happened).
    system: {
      ...original.system,
      candidateProbeValues: original.system.candidateProbeValues.filter((p) => !spent.has(p)),
    },
    hypotheses: [
      interiorHypothesis(proposal.parameterId, proposal.values[0]!),
      // The incumbent stays in contention: narrowing must be able to refute it
      // rather than only refine around it.
      { ...interiorHypothesis(proposal.parameterId, incumbent.value), hypothesisId: incumbent.hypothesisId },
      interiorHypothesis(proposal.parameterId, proposal.values[1]!),
    ],
    openingProbeValue,
    maxRounds: original.maxRounds,
  };
}

export interface NarrowingOutcome {
  readonly contractVersion: string;
  /**
   * What the narrowed range may be read as. `BRACKETED_PREDICTIONS` is a
   * localisation and the truth is inside it; `SURVIVOR_NEIGHBOURS` is a search
   * region only, and a measured counterexample shows it CAN exclude the truth.
   * Carried so no consumer can read the second as the first.
   */
  readonly basis: IntervalBasis;
  /** The interval before this investigation. */
  readonly priorInterval: readonly [number, number];
  /** After it. Identical to `priorInterval` when nothing new was refuted. */
  readonly narrowedInterval: readonly [number, number];
  readonly narrowed: boolean;
  readonly survivingValues: readonly number[];
  readonly refutedValues: readonly number[];
  readonly why: string;
}

/**
 * Reads the narrowing investigation and reports the interval it earned.
 *
 * The rule is the one that produced the first interval: the supported range is
 * bounded by the nearest REFUTED claim on each side of whatever survived.
 * Values are recovered from the hypotheses that were actually run, so nothing
 * is re-derived from an id.
 */
export function assessNarrowing(
  proposal: InteriorProposal,
  narrowingInput: InquiryLoopInput,
  result: InquiryLoopResult,
): NarrowingOutcome {
  const valueById = new Map(
    narrowingInput.hypotheses.map((h) => [h.hypothesisId, h.claimedValues[proposal.parameterId]!]),
  );
  const survivingValues = result.survivingHypothesisIds
    .map((id) => valueById.get(id))
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);
  const refutedValues = result.falsifiedHypothesisIds
    .map((id) => valueById.get(id))
    .filter((v): v is number => v !== undefined)
    .sort((a, b) => a - b);

  const [priorLo, priorHi] = proposal.interval;
  if (survivingValues.length === 0) {
    return {
      contractVersion: INTERVAL_NARROWING_CONTRACT_VERSION,
      basis: proposal.basis,
      priorInterval: [priorLo, priorHi],
      narrowedInterval: [priorLo, priorHi],
      narrowed: false,
      survivingValues,
      refutedValues,
      why:
        `Every interior candidate was refuted, including ${refutedValues.join(', ')}. That is a real result about ` +
        'those values and not a narrower interval: the answer is still somewhere in the original range, now with ' +
        'more of it ruled out pointwise than any interval can express.',
    };
  }

  const lowestSurvivor = survivingValues[0]!;
  const highestSurvivor = survivingValues[survivingValues.length - 1]!;
  const lo = Math.max(priorLo, ...refutedValues.filter((v) => v < lowestSurvivor));
  const hi = Math.min(priorHi, ...refutedValues.filter((v) => v > highestSurvivor));
  const narrowed = lo > priorLo || hi < priorHi;

  // A refuted value BETWEEN two survivors is a real and separate finding: the
  // supported set is not connected, so no interval describes it honestly.
  // Measured on the fold at 0.55, where the narrowing step refutes the derived
  // 0.5 while 0.4 and 0.6 both survive. Saying "nothing was refuted" there —
  // which an interval-only reading amounts to — would drop the one thing this
  // experiment actually established.
  const refutedBetweenSurvivors = refutedValues.filter((v) => v > lowestSurvivor && v < highestSurvivor);

  return {
    contractVersion: INTERVAL_NARROWING_CONTRACT_VERSION,
    basis: proposal.basis,
    priorInterval: [priorLo, priorHi],
    narrowedInterval: [lo, hi],
    narrowed,
    survivingValues,
    refutedValues,
    why: narrowed
      ? `${refutedValues.join(', ')} were refuted on evidence the earlier investigations did not supply, so the ` +
        `supported range shrinks from [${priorLo}, ${priorHi}] to [${lo}, ${hi}]. What survives inside it ` +
        `(${survivingValues.join(', ')}) is still not identified — the same limit as before, on a smaller interval.`
      : refutedBetweenSurvivors.length > 0
        ? `${refutedBetweenSurvivors.join(', ')} was refuted while ${survivingValues.join(' and ')} both survived, ` +
          `so what this experiment supports is NOT an interval: the refuted value sits between the survivors and ` +
          `the supported set is disconnected. The range stays [${priorLo}, ${priorHi}] because no interval can ` +
          'describe that shape, and reporting a narrower one would hide the hole in the middle of it.'
        : `Nothing new was refuted: ${survivingValues.join(', ')} all remained consistent at the settings tried, so ` +
          `the interval stays [${priorLo}, ${priorHi}]. Reporting a narrower one would claim a separation this ` +
          'experiment did not achieve.',
  };
}
