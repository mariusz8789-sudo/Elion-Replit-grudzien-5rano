import type { InquiryLoopInput, InquiryLoopResult, ParameterHypothesis } from './inquiryLoop';
import type { DerivedParameterHypothesis, DerivedValueAssessment } from './parameterAlternative';

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
 * ## The narrowed interval is read the same way the first one was
 *
 * `narrowedInterval` is bounded by the nearest REFUTED value on each side of
 * whatever survived — exactly the bracketing rule that produced the first
 * interval, applied to the new evidence. When nothing new is refuted, the
 * interval is returned UNCHANGED and `narrowed` is false, rather than reported
 * as progress that did not happen.
 */

export const INTERVAL_NARROWING_CONTRACT_VERSION = '1.0.0';

export interface InteriorProposal {
  readonly parameterId: string;
  /** The two interior candidates, ordered. Both strictly inside the interval. */
  readonly values: readonly number[];
  /** The interval they are meant to shrink. */
  readonly interval: readonly [number, number];
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
  const [lo, hi] = standing.interval;
  const v = derived.value;
  if (!(lo < v && v < hi)) return null;

  const low = (lo + v) / 2;
  const high = (v + hi) / 2;
  // Strictness matters: a candidate equal to an interval end is a claim the
  // follow-up already refuted, and one equal to `v` adds no contender.
  const values = [low, high].filter((x) => x > lo && x < hi && x !== v);
  if (values.length < 2) return null;

  return {
    parameterId: derived.parameterId,
    values,
    interval: [lo, hi],
    why:
      `Both ends of [${lo}, ${hi}] were refuted, so ${derived.parameterId} lies inside it, but ${v} survived only in ` +
      `the sense that nothing separated it from its neighbours. Testing ${values.join(' and ')} — one either side of ` +
      `${v} — is the smallest experiment that can shrink the interval from both ends at once.`,
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
  derived: DerivedParameterHypothesis,
  proposal: InteriorProposal,
  alreadyTriedProbeValues: readonly number[],
): InquiryLoopInput | null {
  const spent = new Set([...alreadyTriedProbeValues, ...derived.excludedProbeValues]);
  const openingProbeValue = original.system.candidateProbeValues.find((p) => !spent.has(p));
  if (openingProbeValue === undefined) return null;

  return {
    question:
      `Where in [${proposal.interval[0]}, ${proposal.interval[1]}] does ${proposal.parameterId} lie? ` +
      `${derived.value} survived, but so would its neighbours.`,
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
      { ...interiorHypothesis(proposal.parameterId, derived.value), hypothesisId: derived.hypothesisId },
      interiorHypothesis(proposal.parameterId, proposal.values[1]!),
    ],
    openingProbeValue,
    maxRounds: original.maxRounds,
  };
}

export interface NarrowingOutcome {
  readonly contractVersion: string;
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
