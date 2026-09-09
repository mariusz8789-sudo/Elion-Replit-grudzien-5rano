import {
  buildSavedParameterInquiry,
  listParameterInquiriesForSystem,
  replaySavedParameterInquiry,
  saveParameterInquiryToMemory,
  type SavedExperiment,
  type SavedParameterInquiry,
  type ParameterSkipGrounds,
  type SavedParameterInquiryMemoryUse,
  type SavedParameterInquiryReplay,
} from '../scienceMemory';
import {
  runAutonomousInquiryWithRuns,
  type InquiryExecution,
  type InquiryLoopInput,
  type InquiryLoopResult,
} from './inquiryLoop';
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
    // The grounds matter MORE here, not less: this is the branch that refuses
    // to narrow to nothing and re-runs everything, so a reader is owed the
    // evidence that made the whole declared set look exhausted.
    const allGrounds = skipGrounds(priors, toSkip);
    return {
      executedInput: input,
      resumedFromMemory: {
        skippedHypothesisIds: [],
        reason:
          `Pamięć obaliła już wszystkie ${offered.length} zaproponowanych hipotez dla tego układu. Pominięcie ich ` +
          'wszystkich nie zostawiłoby czego badać, więc zestaw jest testowany ponownie w całości, a nie po cichu ' +
          'opróżniany. ' +
          (allGrounds.length > 0
            ? `Podstawy z zapamiętanych pomiarów: ${allGrounds
                .map((g) => `${g.hypothesisId} przewidywało ${g.predicted} przy ${g.probeValue}, zmierzono ${g.observed}`)
                .join('; ')}.`
            : 'Zapamiętane rekordy nie niosą pojedynczego pomiaru obalającego dla żadnej z nich.'),
        grounds: allGrounds,
      },
    };
  }
  const grounds = skipGrounds(priors, toSkip);
  return {
    executedInput: { ...input, hypotheses: input.hypotheses.filter((h) => !alreadyFalsified.has(h.hypothesisId)) },
    resumedFromMemory: {
      skippedHypothesisIds: toSkip,
      reason:
        `Pominięto ${toSkip.length} hipotez obalonych we wcześniejszym dochodzeniu na tym samym układzie ` +
        `(${toSkip.join(', ')}); pozostałe ${offered.length - toSkip.length} zostały przebadane realnymi pomiarami. ` +
        (grounds.length > 0
          ? `Podstawy z zapamiętanych pomiarów: ${grounds
              .map((g) => `${g.hypothesisId} przewidywało ${g.predicted} przy ${g.probeValue}, zmierzono ${g.observed}`)
              .join('; ')}.`
          : 'Zapamiętane rekordy nie niosą pojedynczego pomiaru obalającego dla żadnej z nich.'),
      grounds,
    },
  };
}

/**
 * Recovers, for each skipped hypothesis, the measurement that actually refuted
 * it — from the stored inquiry, never restated.
 *
 * Takes the FIRST refuting round found, which is the earliest evidence against
 * that hypothesis in this system's history. Where a hypothesis was refuted in
 * more than one prior inquiry this reports one of them rather than summarising
 * across them, and says so here rather than implying it weighed them.
 */
function skipGrounds(
  priors: readonly SavedParameterInquiry[],
  skipped: readonly string[],
): readonly ParameterSkipGrounds[] {
  const grounds: ParameterSkipGrounds[] = [];
  for (const id of skipped) {
    for (const prior of priors) {
      const round = prior.result.rounds.find((r) =>
        r.outcomes.some((o) => o.hypothesisId === id && o.assessment === 'FALSIFIED_WITHIN_PROTOCOL'),
      );
      if (round === undefined) continue;
      const outcome = round.outcomes.find((o) => o.hypothesisId === id)!;
      grounds.push({
        hypothesisId: id,
        probeValue: round.probeValue,
        predicted: outcome.predicted,
        observed: round.observed,
        reason: outcome.reason,
      });
      break;
    }
  }
  return grounds;
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
 *   declared hypotheses -> inquiry -> every one falsified
 *     -> DECLARED_SPACE_INSUFFICIENT (`modelSufficiency.ts`)
 *     -> derive a bracketed value (`parameterAlternative.ts`)
 *     -> a fresh inquiry, opened at a setting the derivation never saw
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
 * ## Anti-HARKing is ENFORCED here, not merely carried
 *
 * `DerivedParameterHypothesis` reports `excludedProbeValues` so a caller cannot
 * unknowingly reuse the measurement that generated the candidate. This is that
 * caller, and it enforces the exclusion two ways, because one was not enough:
 * the follow-up OPENS at a setting that is both untried and not excluded, and
 * the excluded settings are REMOVED from the candidate list it runs against.
 *
 * The second half was missing at first, and the gap was real rather than
 * theoretical. Guarding only the opening probe left `selectNextProbe` free to
 * choose an excluded setting on a later round, and it did: on the fold at 0.5
 * the follow-up opened at steps=1000 and then measured at steps=5000 — the
 * exact round the value was bracketed from — recording the derived hypothesis
 * as SUPPORTED there. Since bracketing picks a midpoint precisely because it
 * sits between two predictions straddling that observation, confirming it at
 * that setting is close to circular.
 *
 * When no admissible setting exists it refuses to continue rather than testing
 * the candidate on the data that authored it — an honest stop, and the same
 * shape as every other refusal in this path.
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
  /**
   * The follow-up's own solver runs, carried so this can be PERSISTED with the
   * same real provenance any other remembered inquiry has. Without it a caller
   * wanting to bank the derived hypothesis's verdict would have to re-execute
   * the follow-up to obtain a measurement, and a second execution is a second
   * result — not the one being recorded.
   */
  readonly followUpMeasurements: InquiryExecution['measurements'];
  /** Did the derived value survive contact with evidence it did not author? */
  readonly survived: boolean;
}

export interface InquiryWithGenerationResult {
  readonly first: InquiryLoopResult;
  readonly executedInput: InquiryLoopInput;
  /** The first investigation's own solver runs, carried for the same reason as `followUpMeasurements`. */
  readonly firstMeasurements: InquiryExecution['measurements'];
  /** Null whenever nothing was generated — `noGenerationReason` always says why. */
  readonly generated: GeneratedContinuation | null;
  readonly noGenerationReason: string | null;
}

/**
 * Runs the inquiry and, if its declared space turned out to be exhausted,
 * derives a value nobody proposed and tests it in a fresh investigation.
 *
 * Every refusal `deriveAlternativeParameterValue` already makes is preserved
 * untouched — this adds exactly one more, for the case where the candidate
 * exists but no untested setting is left to judge it on.
 */
export function runInquiryWithGeneration(input: InquiryLoopInput): InquiryWithGenerationResult {
  const firstExecution = runAutonomousInquiryWithRuns(input);
  const first = firstExecution.result;
  const firstMeasurements = firstExecution.measurements;

  const derived = deriveAlternativeParameterValue(first, input);
  if (derived === null) {
    return {
      first,
      executedInput: input,
      firstMeasurements,
      generated: null,
      noGenerationReason:
        'No alternative was derived: either a declared hypothesis is still standing, the hypotheses do not claim one shared scalar parameter, or no round bracketed the observation. See `parameterAlternative.ts` for which refusals apply.',
    };
  }

  const tried = new Set(first.rounds.map((r) => r.probeValue));
  const excluded = new Set(derived.excludedProbeValues);
  const openingProbeValue = input.system.candidateProbeValues.find((p) => !tried.has(p) && !excluded.has(p));
  if (openingProbeValue === undefined) {
    return {
      first,
      executedInput: input,
      firstMeasurements,
      generated: null,
      noGenerationReason:
        `A value was derived (${derived.parameterId}=${derived.value}), but every candidate setting of ` +
        `${input.system.probeParameterId} was already used by the inquiry that produced it. Testing it here would ` +
        'mean judging it on the measurements that generated it, so it is reported as an untested proposal instead.',
    };
  }

  // The two claims whose predictions drew the bracket: the most relevant
  // comparison for the value derived between them, and enough contenders for
  // the loop to have something to discriminate.
  const bracketParents = input.hypotheses.filter(
    (h) => h.hypothesisId === derived.bracketLowHypothesisId || h.hypothesisId === derived.bracketHighHypothesisId,
  );
  const followUpInput: InquiryLoopInput = {
    question: `Does ${derived.parameterId}=${derived.value}, derived after every declared value was refuted, hold up?`,
    // THE EXCLUSION HAS TO BIND THE WHOLE RUN, not just its first round.
    // Choosing an honest opening probe and then handing the loop the full
    // candidate list let `selectNextProbe` pick the deriving probe again on a
    // later round — and it did: measured on the fold at 0.5, the follow-up
    // opened at steps=1000 and its SECOND round ran at steps=5000, the exact
    // measurement the value was derived from, where the derived hypothesis was
    // recorded SUPPORTED. Bracketing guarantees the midpoint predicts close to
    // the observation at that setting, so confirming it there is very nearly
    // circular. Removing the excluded settings from the candidate list is the
    // whole fix: the loop cannot select what it is not offered.
    system: {
      ...input.system,
      candidateProbeValues: input.system.candidateProbeValues.filter((p) => !excluded.has(p)),
    },
    hypotheses: [asParameterHypothesis(derived), ...bracketParents],
    openingProbeValue,
    maxRounds: input.maxRounds,
  };
  const followUpExecution = runAutonomousInquiryWithRuns(followUpInput);
  const followUpResult = followUpExecution.result;

  return {
    first,
    executedInput: input,
    firstMeasurements,
    generated: {
      derived,
      followUpInput,
      followUpResult,
      followUpMeasurements: followUpExecution.measurements,
      survived: followUpResult.survivingHypothesisIds.includes(derived.hypothesisId),
    },
    noGenerationReason: null,
  };
}

/**
 * GENERATION THAT REACHES MEMORY — the step that makes a derived hypothesis
 * part of what Genesis knows, rather than a fact that existed only inside one
 * call and was lost when it returned.
 *
 * `runInquiryWithGeneration` proved Genesis can derive a value nobody declared
 * and test it. Until this, that verdict went nowhere: the derived hypothesis
 * was assessed and then dropped, so the NEXT investigation of the same system
 * started from the same declared set as if the generation had never happened.
 * A discovery engine that forgets what it just discovered is not accumulating
 * knowledge — it is repeating itself.
 *
 * ## Two records, because there were two investigations
 *
 * Both are persisted through `saveParameterInquiryToMemory` with their OWN real
 * last measurement, exactly as `runInquiryAndRemember` persists one. They are
 * not merged into a single record: they asked different questions, over
 * different hypothesis sets, at different settings, and collapsing them would
 * make the derived hypothesis look like it had been declared up front — which
 * is precisely the provenance that must not be lost, since a derived value's
 * standing depends on it having faced evidence it did not author.
 *
 * ## What this buys the NEXT run
 *
 * `memoryNarrowedHypotheses` reads `falsifiedHypothesisIds` from every prior
 * inquiry into the same system. Once the follow-up is banked, a derived value
 * that was REFUTED is skipped by the next investigation of that system the same
 * way any declared refutation is — so generation feeds selection through the
 * existing memory path, with no second store and no special case for derived
 * ids. That chain is what `Memory -> Selection -> Generation` means concretely,
 * and it is testable rather than asserted.
 */
export interface GenerationSessionResult {
  readonly generation: InquiryWithGenerationResult;
  /** The first investigation's memory record. */
  readonly savedFirst: SavedExperiment;
  /** The follow-up's own record. Null exactly when nothing was generated. */
  readonly savedFollowUp: SavedExperiment | null;
}

/**
 * Runs the generating inquiry and banks BOTH investigations in Science Memory.
 *
 * Memory narrowing runs first, exactly as `runInquiryAndRemember` does it —
 * same function, same rules — so this composes with what memory already knows
 * instead of re-deriving a narrowing of its own.
 */
export function runInquiryWithGenerationAndRemember(input: InquiryLoopInput): GenerationSessionResult {
  const { executedInput, resumedFromMemory } = memoryNarrowedHypotheses(input);
  const generation = runInquiryWithGeneration(executedInput);

  const savedFirst = saveParameterInquiryToMemory(
    buildSavedParameterInquiry({ input: executedInput, result: generation.first, resumedFromMemory }),
    generation.firstMeasurements[generation.firstMeasurements.length - 1],
  );
  if (generation.generated === null) return { generation, savedFirst, savedFollowUp: null };

  const { followUpInput, followUpResult, followUpMeasurements } = generation.generated;
  const savedFollowUp = saveParameterInquiryToMemory(
    buildSavedParameterInquiry({
      input: followUpInput,
      result: followUpResult,
      // Not `resumedFromMemory`: this investigation was not narrowed by memory,
      // it was CREATED by the first one's failure. Reusing the first run's
      // narrowing note here would attribute the follow-up's hypothesis set to
      // memory rather than to the derivation that actually produced it.
      resumedFromMemory: {
        skippedHypothesisIds: [],
        reason: generation.generated.derived.why,
      },
    }),
    followUpMeasurements[followUpMeasurements.length - 1],
  );
  return { generation, savedFirst, savedFollowUp };
}
