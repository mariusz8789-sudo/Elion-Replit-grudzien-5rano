import {
  buildSavedParameterInquiry,
  saveParameterInquiryToMemory,
  type SavedExperiment,
} from '../scienceMemory';
import {
  runDiscovery,
  runMechanismDiscoveryAndRemember,
  type DiscoveryOutcome,
  type MechanismDiscoveryRemembered,
  type MechanismRequest,
} from './discoveryOrchestrator';
import type { InquiryLoopInput, InquiryLoopResult } from './inquiryLoop';
import {
  assessNarrowing,
  buildNarrowingInquiry,
  proposeInteriorCandidates,
  proposeInteriorCandidatesFrom,
  supportedIntervalOf,
  type InteriorProposal,
  type NarrowingOutcome,
} from './intervalNarrowing';
import { selectNextResearchQuestion, type ResearchQuestionKind } from './nextQuestion';

/**
 * THE LOOP CLOSED: Genesis choosing its own next question, more than once.
 *
 * Every piece here already existed. What did not exist was anything that ASKED
 * `nextQuestion.ts` what to do and then did it. Without that, question
 * selection was a reader nobody read — the same shape as
 * `DECLARED_SPACE_INSUFFICIENT` before `parameterAlternative.ts` gave it an
 * actuator, and the same fix.
 *
 * The chain, on the real HP-lattice fold at temperature 0.5:
 *
 *   1. Ask the declared question. All four declared temperatures refuted, so
 *      the front door derives 0.5 and tests it; it survives.
 *   2. `nextQuestion` reads that run and ranks what is open. Highest: "where in
 *      [0.3, 0.7] does temperature lie?" — because the interval was earned (both
 *      ends really refuted) while the point inside it was not. Runnable, so
 *      Genesis runs it, on a setting no earlier step used.
 *   3. `nextQuestion` reads THAT run and reports what is left.
 *
 * Nobody chooses steps 2 and 3. There is no human between them and no hardcoded
 * "then narrow" — the step is whatever the question selector ranked highest
 * among the questions the previous run itself raised. Change what the run
 * leaves open and the chain does something else.
 *
 * ## What this is not
 *
 * It is not open-ended research. The chain can only run question kinds it has
 * an actuator for, and when the selector names one it cannot run it stops and
 * SAYS WHICH — that name is the next thing worth building, which is more useful
 * than a silent no-op. It never changes domain, never invents a subject, and
 * never proposes a question the previous run did not raise. "Genesis picks its
 * next experiment, and its next question, inside one line of inquiry" is real
 * and was previously absent; "Genesis decides what to study" is not implied.
 *
 * ## Termination
 *
 * Four ways, all reported: nothing left open, nothing RUNNABLE left, a runnable
 * kind with no actuator here, or the step budget. `maxSteps` is a budget and
 * not a target — a chain that stops after one step because that step settled
 * everything is a correct chain.
 */

export const RESEARCH_CHAIN_CONTRACT_VERSION = '1.0.0';

export interface ResearchStep {
  readonly step: number;
  /** The question this step actually investigated. */
  readonly question: string;
  /** Which kind of open question this step was chosen to answer. `INITIAL` is the caller's own. */
  readonly kind: ResearchQuestionKind | 'INITIAL';
  /** Why this step, decided BEFORE it ran, by the question selector. */
  readonly why: string;
  readonly outcome: DiscoveryOutcome;
  /**
   * The input this step actually executed. Step 1's is the caller's; every
   * later one was built by the chain, so a reader that wants to re-derive what
   * the selector saw — or re-execute the step — would otherwise have to
   * reconstruct an input Genesis wrote itself.
   */
  readonly executedInput: InquiryLoopInput;
  /** Present only on a narrowing step: what the interval became. */
  readonly narrowing: NarrowingOutcome | null;
  /**
   * This step's Science Memory records — the first investigation, plus the
   * generation follow-up when there was one. Empty on a refused step.
   *
   * Persisting HERE rather than leaving it to the caller is what makes the
   * chain's own steps available to whatever runs next: a chain that reasons its
   * way to a second and third question and then forgets all of it has not
   * accumulated anything.
   */
  readonly remembered: readonly SavedExperiment[];
}

/**
 * THE HONEST CATEGORY THE CHAIN STOPPED IN — four facts that must never be
 * collapsed into one another, because they call for different next actions
 * from whoever reads this result.
 *
 *   SETTLED       — nothing is left open. The investigation is DONE.
 *   OPEN          — a runnable next question exists; the chain simply ran out
 *                   of `maxSteps` before taking it. More autonomous work is
 *                   available right now, on demand.
 *   INCONCLUSIVE  — a real open question exists and the EVIDENCE ITSELF does
 *                   not decide it: no untried setting separates real rivals,
 *                   an interaction settled nothing (both effects were zero),
 *                   or a value could not be derived from what was measured.
 *                   More data of a kind Genesis already knows how to gather
 *                   would resolve this — none is left to gather.
 *   BLOCKED       — a real open question exists and Genesis has no MECHANISM
 *                   for it at all: no capability to run the investigation, no
 *                   actuator this chain implements yet, or the apparatus
 *                   itself failed and nothing here can diagnose why.
 *
 * `INCONCLUSIVE` and `BLOCKED` are kept apart on purpose. Conflating "the data
 * doesn't decide this" with "Genesis cannot even try" would hide exactly the
 * distinction a reader deciding what to build or measure next needs.
 */
export type ResearchChainTerminalStatus = 'SETTLED' | 'OPEN' | 'INCONCLUSIVE' | 'BLOCKED';

export interface ResearchChainResult {
  readonly contractVersion: string;
  readonly steps: readonly ResearchStep[];
  /** Steps Genesis chose for itself — every step after the caller's own. */
  readonly selfChosenSteps: number;
  readonly stoppedBecause: string;
  /** The honest category `stoppedBecause` falls into — see `ResearchChainTerminalStatus`. */
  readonly terminalStatus: ResearchChainTerminalStatus;
}

/** What a proposed narrowing step needs to carry into the iteration that runs it. */
interface PendingNarrowing {
  readonly proposal: InteriorProposal;
  readonly input: InquiryLoopInput;
}

/**
 * Runs a PARAMETER investigation and keeps going for as long as the question
 * selector names a question this chain can actually run.
 */
export function runResearchChain(input: InquiryLoopInput, maxSteps = 4): ResearchChainResult {
  const steps: ResearchStep[] = [];
  const triedProbeValues = new Set<number>();

  let current: InquiryLoopInput = input;
  let kind: ResearchQuestionKind | 'INITIAL' = 'INITIAL';
  let why = 'The question the caller asked.';
  let pending: PendingNarrowing | null = null;
  let stoppedBecause = `Step budget of ${maxSteps} reached.`;
  // Running out of budget while still producing runnable steps is OPEN, not
  // stuck: the default matches what the loop is actually doing when it exits
  // for this reason alone.
  let terminalStatus: ResearchChainTerminalStatus = 'OPEN';

  for (let step = 1; step <= maxSteps; step++) {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: current });

    // A narrowing step is assessed against the run it actually produced, never
    // against one predicted before it ran.
    const narrowing =
      pending !== null && outcome.status === 'RAN'
        ? assessNarrowing(pending.proposal, pending.input, outcome.run.native as InquiryLoopResult)
        : null;
    steps.push({
      step,
      question: current.question,
      kind,
      why,
      outcome,
      executedInput: current,
      narrowing,
      remembered: remember(outcome, current),
    });
    // `pending` is consumed above and every path below either breaks out or
    // sets it again for the next iteration, so it is never read stale.

    if (outcome.status !== 'RAN') {
      stoppedBecause = `Step ${step} was refused: ${outcome.admission.why}`;
      // No capability behind the question at all — the definition of BLOCKED.
      terminalStatus = 'BLOCKED';
      break;
    }
    rememberProbes(outcome, triedProbeValues);

    const selection = selectNextResearchQuestion(outcome, current);
    if (selection.selected === null) {
      stoppedBecause = `Step ${step} settled its question and raised no new one.`;
      terminalStatus = 'SETTLED';
      break;
    }
    if (selection.nextExecutable === null) {
      stoppedBecause =
        `Step ${step} raised ${selection.candidates.length} question(s), none of which Genesis can run. ` +
        `Highest: ${selection.selected.question}`;
      // SEPARATE_SURVIVORS / GO_OUTSIDE_THE_DECLARED_SPACE here mean the
      // EVIDENCE does not decide (no untried setting separates real rivals, or
      // nothing could be derived from what was measured) — INCONCLUSIVE.
      // RESOLVE_APPARATUS_FAILURE and anything this reader does not recognise
      // mean Genesis has no mechanism for the question at all — BLOCKED, the
      // conservative default for an unclassified kind.
      terminalStatus =
        selection.selected.kind === 'SEPARATE_SURVIVORS' || selection.selected.kind === 'GO_OUTSIDE_THE_DECLARED_SPACE'
          ? 'INCONCLUSIVE'
          : 'BLOCKED';
      break;
    }

    const next = selection.nextExecutable;

    // SEPARATE_SURVIVORS has an actuator that takes no new decision: the run
    // ITSELF proposed a discriminating setting and then ran out of rounds. This
    // simply runs it, over the hypotheses that are still standing. Nothing here
    // chooses the probe — `selectNextProbe` already did, from the beliefs the
    // last observation wrote.
    if (next.kind === 'SEPARATE_SURVIVORS') {
      const native = outcome.run.native as InquiryLoopResult;
      const proposed = native.nextExperiment.probeValue;
      if (proposed === null || triedProbeValues.has(proposed)) {
        stoppedBecause =
          `Step ${step} proposed separating ${outcome.run.surviving.join(' and ')}, but the setting its own ` +
          'selector named is either absent or already spent, so there is no untried measurement to run.';
        // Real rivals, and no evidence left that would tell them apart — the
        // data does not decide, not a capability gap.
        terminalStatus = 'INCONCLUSIVE';
        break;
      }
      const survivors = current.hypotheses.filter((h) => outcome.run.surviving.includes(h.hypothesisId));
      if (survivors.length < 2) {
        stoppedBecause = `Step ${step} proposed separating survivors, but fewer than two of them are declared hypotheses.`;
        // A derived (not declared) survivor cannot be re-tested this way — an
        // actuator limitation of this chain, not a fact about the evidence.
        terminalStatus = 'BLOCKED';
        break;
      }
      pending = null;
      current = {
        question: `Which of ${outcome.run.surviving.join(', ')} is right? The previous run ran out of rounds before separating them.`,
        system: current.system,
        hypotheses: survivors,
        openingProbeValue: proposed,
        maxRounds: current.maxRounds,
      };
      kind = next.kind;
      why = selection.why;
      continue;
    }

    if (next.kind !== 'NARROW_A_DERIVED_INTERVAL') {
      stoppedBecause = `Step ${step} proposed "${next.kind}", which this chain has no actuator for yet: ${next.question}`;
      // A real open question, and this chain literally does not implement it —
      // an architecture gap, not an evidence one.
      terminalStatus = 'BLOCKED';
      break;
    }

    // The interval comes from the generation when there was one, and from the
    // run's own surviving/refuted split when there was not. The second case is
    // what a NARROWING step leaves behind, and reading it is what lets the chain
    // narrow more than once.
    const generatedValue =
      outcome.generated !== null && outcome.generated.kind === 'DERIVED_PARAMETER_VALUE'
        ? outcome.generated
        : null;
    const supported = supportedIntervalOf(outcome.run.native as InquiryLoopResult, current);
    const proposal =
      generatedValue !== null
        ? proposeInteriorCandidates(generatedValue.derived, generatedValue.standing)
        : supported === null
          ? null
          : proposeInteriorCandidatesFrom(supported);
    if (proposal === null) {
      stoppedBecause = `Step ${step} proposed narrowing, but the interval could not produce interior candidates.`;
      // The interval's own shape (degenerate, or the incumbent not strictly
      // inside it) refuses to propose — a fact about this evidence.
      terminalStatus = 'INCONCLUSIVE';
      break;
    }

    const incumbent =
      generatedValue !== null
        ? {
            hypothesisId: generatedValue.derived.hypothesisId,
            value: generatedValue.derived.value,
            excludedProbeValues: generatedValue.derived.excludedProbeValues,
          }
        : {
            hypothesisId: outcome.run.surviving[0]!,
            value: supported!.survivingValues[0]!,
            // Every setting spent so far is already excluded via triedProbeValues.
            excludedProbeValues: [] as readonly number[],
          };

    const narrowingInput = buildNarrowingInquiry(current, incumbent, proposal, [...triedProbeValues]);
    if (narrowingInput === null) {
      stoppedBecause =
        `Step ${step} proposed narrowing, but every candidate setting of ${current.system.probeParameterId} was ` +
        'already used, so the interior candidates could only have been judged on the evidence that produced them.';
      // Out of untried settings, not out of capability — more measurements of
      // a kind Genesis already knows how to take would resolve this.
      terminalStatus = 'INCONCLUSIVE';
      break;
    }

    pending = { proposal, input: narrowingInput };
    current = narrowingInput;
    kind = next.kind;
    why = selection.why;
  }

  return {
    contractVersion: RESEARCH_CHAIN_CONTRACT_VERSION,
    steps,
    selfChosenSteps: Math.max(0, steps.length - 1),
    stoppedBecause,
    terminalStatus,
  };
}

// ---------------------------------------------------------------------------
// MECHANISM — the same actuator/termination contract as the PARAMETER chain
// above, over a genuinely different execution shape.
// ---------------------------------------------------------------------------

export interface MechanismResearchStep {
  readonly step: number;
  /** The goal text this step investigated. MECHANISM's whole "executed input" under `MechanismRequest`'s thin (goal, catalog) shape. */
  readonly question: string;
  readonly kind: ResearchQuestionKind | 'INITIAL';
  readonly why: string;
  readonly outcome: DiscoveryOutcome;
  /** This step's Science Memory records — the base investigation, plus the composed-mechanism follow-up when there was one. */
  readonly remembered: MechanismDiscoveryRemembered;
}

export interface MechanismResearchChainResult {
  readonly contractVersion: string;
  readonly steps: readonly MechanismResearchStep[];
  readonly selfChosenSteps: number;
  readonly stoppedBecause: string;
  readonly terminalStatus: ResearchChainTerminalStatus;
}

/**
 * THE LAST ASYMMETRY, CLOSED: `TEST_WHETHER_MECHANISMS_COMPOSE` reaches a real
 * chain, the same way `SEPARATE_SURVIVORS`/`NARROW_A_DERIVED_INTERVAL` already
 * do for PARAMETER — not by making it runnable (it never can be: see
 * `nextQuestion.ts`'s own doc on this candidate, `mechanismGeneration.ts` has
 * no mechanism to retry a joint arm at a different magnitude), but by giving
 * it the SAME quality of explicit, correct termination handling those two
 * already get, instead of falling into the generic "unrecognised kind"
 * default.
 *
 * `runMechanismDiscoveryAndRemember` already runs admission → plan →
 * memory-narrow → run → composed-mechanism generation → save → replay in ONE
 * call (`discoveryOrchestrator.ts`), so this loop's only job is to read what
 * that call left open and decide whether to stop — there is no second engine,
 * no second replay mechanism, and no narrowing concept for MECHANISM to
 * reimplement here.
 *
 * ## `TEST_UNTESTED_HYPOTHESIS` DOES have a real actuator: re-issue the SAME request
 *
 * Every step already runs `prepareMechanismInvestigation`'s own
 * `priorRefutedHypothesisIds` narrowing, which excludes whatever an earlier
 * step on this exact (catalog, objective) REFUTED — not merely left
 * untested. So when a step's round budget is spent before every declared
 * lever gets a turn, re-issuing the IDENTICAL `MechanismRequest` is not a
 * no-op replay: memory now excludes what just got refuted, which frees the
 * SAME declared budget to reach a lever it could not afford before. That is
 * real, evidence-driven progress on a genuinely different question ("does
 * the lever nobody had budget for hold?"), through the existing narrowing
 * seam, never a second mechanism.
 *
 * This is not guaranteed to make progress — if a step refutes NOTHING
 * (everything left standing either survived or was never reached), memory
 * excludes nothing new and a retry reproduces the identical state. That
 * case is detected (the untested count stops shrinking) and reported as
 * `BLOCKED`, honestly: this thin (goal, catalog) request has no way to ask
 * for a larger round budget, and this file will not parse and rewrite the
 * goal's own declared text to manufacture one.
 */
export function runMechanismResearchChain(request: MechanismRequest, maxSteps = 4): MechanismResearchChainResult {
  const steps: MechanismResearchStep[] = [];

  // `INITIAL` for the caller's own question; `TEST_UNTESTED_HYPOTHESIS` for
  // every self-chosen retry after it — the only MECHANISM candidate with a
  // real actuator here (see above).
  let kind: ResearchQuestionKind | 'INITIAL' = 'INITIAL';
  let why = 'The question the caller asked.';
  let stoppedBecause = `Step budget of ${maxSteps} reached.`;
  let terminalStatus: ResearchChainTerminalStatus = 'OPEN';
  // Set the first time a retry is considered; compared against the NEXT
  // step's own untested count to detect whether the retry actually shrank
  // the untested set, rather than merely repeating the same stuck state.
  let untestedBeforeRetry: number | null = null;

  for (let step = 1; step <= maxSteps; step++) {
    const remembered = runMechanismDiscoveryAndRemember(request);
    const outcome = remembered.outcome;
    steps.push({ step, question: request.goal, kind, why, outcome, remembered });

    if (outcome.status !== 'RAN') {
      stoppedBecause = `Step ${step} was refused: ${outcome.admission.why}`;
      terminalStatus = 'BLOCKED';
      break;
    }

    if (untestedBeforeRetry !== null && outcome.run.untested.length >= untestedBeforeRetry) {
      stoppedBecause =
        `Step ${step} still leaves ${outcome.run.untested.length} hypothes(es) untested (${outcome.run.untested.join(', ')}), ` +
        'no fewer than before this retry: nothing new was refuted for memory to exclude, so this request\'s declared ' +
        'experiment budget cannot reach them, and this chain has no way to ask for a larger one.';
      terminalStatus = 'BLOCKED';
      break;
    }

    const selection = selectNextResearchQuestion(outcome);
    if (selection.selected === null) {
      stoppedBecause = `Step ${step} settled its question and raised no new one.`;
      terminalStatus = 'SETTLED';
      break;
    }
    if (selection.nextExecutable === null) {
      stoppedBecause =
        `Step ${step} raised ${selection.candidates.length} question(s), none of which Genesis can run. ` +
        `Highest: ${selection.selected.question}`;
      // `TEST_WHETHER_MECHANISMS_COMPOSE` splits on whether composition
      // actually ran this step: `outcome.generated` present means the joint
      // arm was really measured and settled nothing (INCONCLUSIVE — the
      // evidence itself does not decide, not a capability gap); absent means
      // composition was never attempted for an architectural reason (fewer
      // than two declared survivors, mismatched objectives) — BLOCKED. The
      // same split `nextQuestion.ts`'s own two MECHANISM branches already
      // draw, read here rather than re-derived.
      terminalStatus =
        selection.selected.kind === 'GO_OUTSIDE_THE_DECLARED_SPACE'
          ? 'INCONCLUSIVE'
          : selection.selected.kind === 'TEST_WHETHER_MECHANISMS_COMPOSE'
            ? (outcome.generated !== null ? 'INCONCLUSIVE' : 'BLOCKED')
            : 'BLOCKED';
      break;
    }

    const next = selection.nextExecutable;
    if (next.kind === 'TEST_UNTESTED_HYPOTHESIS') {
      untestedBeforeRetry = outcome.run.untested.length;
      kind = next.kind;
      why = selection.why;
      continue;
    }

    // No actuator for any OTHER MECHANISM candidate yet.
    stoppedBecause = `Step ${step} proposed "${next.kind}", which this chain has no actuator for yet: ${next.question}`;
    terminalStatus = 'BLOCKED';
    break;
  }

  return {
    contractVersion: RESEARCH_CHAIN_CONTRACT_VERSION,
    steps,
    selfChosenSteps: Math.max(0, steps.length - 1),
    stoppedBecause,
    terminalStatus,
  };
}

/**
 * Banks this step in Science Memory, through the same functions every other
 * remembered inquiry uses.
 *
 * ## The provenance this deliberately does not claim
 *
 * `saveParameterInquiryToMemory` takes an optional last `ExperimentRun`, and
 * records the engine's own run id and fingerprint when it gets one. It is not
 * passed here, because `runDiscovery` returns findings and not solver payloads
 * — `StrategyRun` is explicitly a reporting contract, not an execution one. So
 * these records carry the complete input, result and result fingerprint (and
 * therefore replay by RE-EXECUTION still works, which is what
 * `replaySavedParameterInquiry` does), but not the original run's engine
 * provenance. `runInquiryWithGenerationAndRemember` does carry it, for a caller
 * that needs it. Recording the weaker thing and saying so beats attaching a
 * provenance this path never saw.
 */
function remember(outcome: DiscoveryOutcome, input: InquiryLoopInput): readonly SavedExperiment[] {
  if (outcome.status !== 'RAN') return [];
  const saved: SavedExperiment[] = [
    saveParameterInquiryToMemory(
      buildSavedParameterInquiry({
        input,
        result: outcome.run.native as InquiryLoopResult,
        resumedFromMemory: outcome.priorInvestigation
          ? {
              skippedHypothesisIds: outcome.priorInvestigation.skippedHypothesisIds,
              reason: outcome.priorInvestigation.reason,
            }
          : null,
      }),
    ),
  ];
  if (outcome.generated !== null && outcome.generated.kind === 'DERIVED_PARAMETER_VALUE') {
    saved.push(
      saveParameterInquiryToMemory(
        buildSavedParameterInquiry({
          input: outcome.generated.input,
          result: outcome.generated.run.native as InquiryLoopResult,
          resumedFromMemory: { skippedHypothesisIds: [], reason: outcome.generated.derived.why },
        }),
      ),
    );
  }
  return saved;
}

/** Every setting this outcome measured at, so a later step cannot reuse one. */
function rememberProbes(outcome: DiscoveryOutcome, into: Set<number>): void {
  if (outcome.status !== 'RAN') return;
  const runs = outcome.generated === null ? [outcome.run] : [outcome.run, outcome.generated.run];
  for (const run of runs) {
    const native = run.native as InquiryLoopResult;
    for (const round of native.rounds) into.add(round.probeValue);
  }
}
