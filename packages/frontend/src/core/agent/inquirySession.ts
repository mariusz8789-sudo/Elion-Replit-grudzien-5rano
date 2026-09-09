import {
  buildSavedParameterInquiry,
  listParameterInquiriesForSystem,
  replaySavedParameterInquiry,
  saveParameterInquiryToMemory,
  type SavedExperiment,
  type SavedParameterInquiry,
  type SavedParameterInquiryMemoryUse,
  type SavedParameterInquiryReplay,
} from '../scienceMemory';
import { runAutonomousInquiryWithRuns, type InquiryLoopInput, type InquiryLoopResult } from './inquiryLoop';
import {
  asParameterHypothesis,
  deriveAlternativeParameterValue,
  type DerivedParameterHypothesis,
} from './parameterAlternative';

/**
 * THE END-TO-END PATH for the autonomous parameter inquiry:
 *
 *   Science Memory  ->  hypotheses still worth testing
 *                   ->  the inquiry (real solver runs, adaptive probes)
 *                   ->  Science Memory record (with real run provenance)
 *                   ->  Replay (real re-execution, real verdict)
 *                   ->  the experiment it proposes next
 *
 * Every stage is an existing Genesis mechanism called unchanged: `listExperiments`
 * behind `listParameterInquiriesForSystem`, `saveExperiment` behind
 * `saveParameterInquiryToMemory`, and the `ReplayVerdict` vocabulary shared with
 * every other replay in `scienceMemory.ts`. This module is the wiring, not a
 * second engine — the same role `worldDiscoverySession.ts` plays for the
 * world-model loop, and `runInquiry` below is the untouched pure seam for
 * callers (and tests) that want the engine without touching storage.
 *
 * ## What memory is allowed to do here
 *
 * Exactly one thing: drop hypotheses an EARLIER inquiry into the SAME system
 * already falsified, so a second inquiry spends its probes on open questions
 * instead of re-refuting settled ones. It never carries a SUPPORTED verdict
 * forward — under parameter degeneracy agreeing with one measurement settles
 * nothing (see `inquiryLoop.ts`), so an earlier "supported" is not a reason to
 * stop testing, and treating it as one would quietly convert a survivor into a
 * conclusion.
 *
 * "The same system" is `parameterInquirySystemKey`: same sample, same solver,
 * same measured quantity, same agreement band, same probe axis. If any of those
 * differ, an earlier falsification does not transfer and memory correctly
 * declines to apply it.
 */

/** The engine alone: no reads, no writes, no storage. */
export function runInquiry(input: InquiryLoopInput): InquiryLoopResult {
  return runAutonomousInquiryWithRuns(input).result;
}

export interface InquirySessionResult {
  readonly result: InquiryLoopResult;
  /** The input actually executed — narrowed by memory when memory had something to say. */
  readonly executedInput: InquiryLoopInput;
  readonly resumedFromMemory: SavedParameterInquiryMemoryUse | null;
  readonly saved: SavedExperiment;
  readonly savedInquiry: SavedParameterInquiry;
  /** A REAL verdict from a REAL re-execution, not a claim that it would reproduce. */
  readonly replay: SavedParameterInquiryReplay;
}

/**
 * Reads memory for hypotheses this system has already ruled out.
 *
 * Returns `null` — meaning "memory had nothing to contribute" — rather than an
 * empty record, so a caller can tell "no prior inquiry" from "prior inquiries
 * that settled nothing". Refuses to narrow the set to nothing: if every offered
 * hypothesis was already falsified, there is no inquiry left to run and the
 * caller should see that as the result of running it, not as an empty input.
 */
export function memoryNarrowedHypotheses(input: InquiryLoopInput): {
  readonly executedInput: InquiryLoopInput;
  readonly resumedFromMemory: SavedParameterInquiryMemoryUse | null;
} {
  const priors = listParameterInquiriesForSystem(input.system);
  if (priors.length === 0) return { executedInput: input, resumedFromMemory: null };

  const alreadyFalsified = new Set<string>();
  for (const prior of priors) for (const id of prior.result.falsifiedHypothesisIds) alreadyFalsified.add(id);

  const offered = input.hypotheses.map((h) => h.hypothesisId);
  const toSkip = offered.filter((id) => alreadyFalsified.has(id));
  if (toSkip.length === 0) {
    return {
      executedInput: input,
      resumedFromMemory: {
        skippedHypothesisIds: [],
        reason: `${priors.length} wcześniejszych dochodzeń w pamięci dotyczy tego samego układu, ale żadne z nich nie obaliło hipotezy z obecnego zestawu — cały zestaw jest testowany od nowa.`,
      },
    };
  }
  if (toSkip.length === offered.length) {
    return {
      executedInput: input,
      resumedFromMemory: {
        skippedHypothesisIds: [],
        reason: `Pamięć obaliła już wszystkie ${offered.length} zaproponowanych hipotez dla tego układu. Pominięcie ich wszystkich nie zostawiłoby czego badać, więc zestaw jest testowany ponownie w całości, a nie po cichu opróżniany.`,
      },
    };
  }
  return {
    executedInput: { ...input, hypotheses: input.hypotheses.filter((h) => !alreadyFalsified.has(h.hypothesisId)) },
    resumedFromMemory: {
      skippedHypothesisIds: toSkip,
      reason: `Pominięto ${toSkip.length} hipotez obalonych we wcześniejszym dochodzeniu na tym samym układzie (${toSkip.join(', ')}); pozostałe ${offered.length - toSkip.length} zostały przebadane realnymi pomiarami.`,
    },
  };
}

/**
 * The full pipeline. Runs the inquiry, persists it with the real provenance of
 * the last measurement taken, and immediately replays it by re-execution so the
 * caller gets a verdict that was earned rather than asserted.
 */
export function runInquiryAndRemember(input: InquiryLoopInput): InquirySessionResult {
  const { executedInput, resumedFromMemory } = memoryNarrowedHypotheses(input);
  const execution = runAutonomousInquiryWithRuns(executedInput);
  const savedInquiry = buildSavedParameterInquiry({
    input: executedInput,
    result: execution.result,
    resumedFromMemory,
  });
  const lastMeasurement = execution.measurements[execution.measurements.length - 1];
  const saved = saveParameterInquiryToMemory(savedInquiry, lastMeasurement);
  return {
    result: execution.result,
    executedInput,
    resumedFromMemory,
    saved,
    savedInquiry,
    replay: replaySavedParameterInquiry(saved),
  };
}

/**
 * AUTOMATIC CONTINUATION AFTER AN EXHAUSTED SPACE — the call site
 * `parameterAlternative.ts` was built for.
 *
 * `deriveAlternativeParameterValue` proved Genesis CAN derive a value nobody
 * declared. This is what makes it do so without being asked, and it is the same
 * sequencing P3 followed on the MECHANISM side: the pure derivation first, its
 * call site second, once the derivation had been measured on a real fixture.
 *
 * The flow, end to end, all of it existing mechanisms:
 *
 *   declared hypotheses -> inquiry (memory-narrowed, memory-saved)
 *     -> every one falsified -> DECLARED_SPACE_INSUFFICIENT (`modelSufficiency.ts`)
 *     -> derive a bracketed value (`parameterAlternative.ts`)
 *     -> a fresh inquiry (memory-narrowed, memory-saved), opened on a setting
 *        the derivation never saw
 *     -> a real verdict on the derived hypothesis
 *
 * ## Why a FRESH inquiry rather than more rounds of the first one
 *
 * The derived value is a different scientific claim from the ones the first
 * inquiry was given, and it must be judged on evidence that inquiry did not
 * already use. Continuing the original run would mean judging it partly on the
 * measurements that produced it. A second investigation, opened on an untried
 * setting, keeps the two separable — and keeps `inquiryLoop.ts` itself
 * untouched, which is why this is wiring rather than a rewrite.
 *
 * ## Both investigations go through `runInquiryAndRemember`, not the bare engine
 *
 * The first version of this function called `runAutonomousInquiryWithRuns`
 * directly for both runs — real generation and a real second test, but neither
 * one narrowed against prior memory nor left anything behind for the NEXT
 * inquiry into the same system to narrow against. Genesis generated and
 * tested; it did not learn. Routing both calls through the SAME session
 * pipeline `runInquiryAndRemember` already uses — no second memory store, no
 * new persistence logic — closes that: the first inquiry is narrowed by
 * whatever memory already knows and is saved when it finishes; the generated
 * follow-up is narrowed and saved exactly the same way, so a hypothesis
 * Genesis derived and confirmed (or refuted) today is exactly as available to
 * `memoryNarrowedHypotheses` tomorrow as one a human declared.
 *
 * ## Anti-HARKing is ENFORCED here, not merely carried
 *
 * `DerivedParameterHypothesis` reports `excludedProbeValues` so a caller cannot
 * unknowingly reuse the measurement that generated the candidate. This is that
 * caller, and it honours the exclusion by construction: the follow-up opens at
 * the first candidate setting that is BOTH untried in the first inquiry AND not
 * excluded. When no such setting exists it refuses to continue rather than
 * testing the candidate on the data that authored it — an honest stop, and the
 * same shape as every other refusal in this path.
 *
 * ## What it deliberately does not do
 *
 * It does not touch `runDiscovery`'s contract. That returns ONE `StrategyRun`,
 * and reporting "two runs, the second derived from the first" through it is a
 * contract decision worth taking on its own rather than smuggling in here.
 */

/** The second investigation, when one was warranted and possible. */
export interface GeneratedContinuation {
  readonly derived: DerivedParameterHypothesis;
  /** The follow-up actually executed — its opening probe is the enforced-new evidence. */
  readonly followUpInput: InquiryLoopInput;
  readonly followUpResult: InquiryLoopResult;
  /** Did the derived value survive contact with evidence it did not author? */
  readonly survived: boolean;
  /** The follow-up's own memory record — real provenance, real fingerprint, same as any other saved inquiry. */
  readonly followUpSaved: SavedExperiment;
  /** A real re-execution verdict on the saved follow-up, not a claim that it would reproduce. */
  readonly followUpReplay: SavedParameterInquiryReplay;
}

export interface InquiryWithGenerationResult {
  readonly first: InquiryLoopResult;
  readonly executedInput: InquiryLoopInput;
  /** What memory had to say about the FIRST inquiry, narrowing it before it ran. */
  readonly firstResumedFromMemory: SavedParameterInquiryMemoryUse | null;
  readonly firstSaved: SavedExperiment;
  readonly firstReplay: SavedParameterInquiryReplay;
  /** Null whenever nothing was generated — `noGenerationReason` always says why. */
  readonly generated: GeneratedContinuation | null;
  readonly noGenerationReason: string | null;
}

/**
 * Runs the inquiry and, if its declared space turned out to be exhausted,
 * derives a value nobody proposed and tests it in a fresh investigation — both
 * runs narrowed by, and saved to, the same Science Memory every other inquiry
 * uses.
 *
 * Every refusal `deriveAlternativeParameterValue` already makes is preserved
 * untouched — this adds exactly one more, for the case where the candidate
 * exists but no untested setting is left to judge it on.
 */
export function runInquiryWithGeneration(input: InquiryLoopInput): InquiryWithGenerationResult {
  const firstSession = runInquiryAndRemember(input);
  const { result: first, executedInput } = firstSession;
  const firstFields = {
    first,
    executedInput,
    firstResumedFromMemory: firstSession.resumedFromMemory,
    firstSaved: firstSession.saved,
    firstReplay: firstSession.replay,
  };

  // Derived from what was ACTUALLY tested (memory may have narrowed it), never
  // from the caller's original, possibly-wider request.
  const derived = deriveAlternativeParameterValue(first, executedInput);
  if (derived === null) {
    return {
      ...firstFields,
      generated: null,
      noGenerationReason:
        'No alternative was derived: either a declared hypothesis is still standing, the hypotheses do not claim one shared scalar parameter, or no round bracketed the observation. See `parameterAlternative.ts` for which refusals apply.',
    };
  }

  const tried = new Set(first.rounds.map((r) => r.probeValue));
  const excluded = new Set(derived.excludedProbeValues);
  const openingProbeValue = executedInput.system.candidateProbeValues.find((p) => !tried.has(p) && !excluded.has(p));
  if (openingProbeValue === undefined) {
    return {
      ...firstFields,
      generated: null,
      noGenerationReason:
        `A value was derived (${derived.parameterId}=${derived.value}), but every candidate setting of ` +
        `${executedInput.system.probeParameterId} was already used by the inquiry that produced it. Testing it here ` +
        'would mean judging it on the measurements that generated it, so it is reported as an untested proposal instead.',
    };
  }

  // The two claims whose predictions drew the bracket: the most relevant
  // comparison for the value derived between them, and enough contenders for
  // the loop to have something to discriminate. Read off `executedInput`, not
  // the caller's original `input` — a bracket parent can only be one of the
  // hypotheses that actually ran.
  const bracketParents = executedInput.hypotheses.filter(
    (h) => h.hypothesisId === derived.bracketLowHypothesisId || h.hypothesisId === derived.bracketHighHypothesisId,
  );
  const followUpRequest: InquiryLoopInput = {
    question: `Does ${derived.parameterId}=${derived.value}, derived after every declared value was refuted, hold up?`,
    system: executedInput.system,
    hypotheses: [asParameterHypothesis(derived), ...bracketParents],
    openingProbeValue,
    maxRounds: executedInput.maxRounds,
  };
  const followUpSession = runInquiryAndRemember(followUpRequest);
  const followUpResult = followUpSession.result;

  return {
    ...firstFields,
    generated: {
      derived,
      followUpInput: followUpSession.executedInput,
      followUpResult,
      survived: followUpResult.survivingHypothesisIds.includes(derived.hypothesisId),
      followUpSaved: followUpSession.saved,
      followUpReplay: followUpSession.replay,
    },
    noGenerationReason: null,
  };
}
