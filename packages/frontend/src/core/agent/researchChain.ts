import { runDiscovery, type DiscoveryOutcome } from './discoveryOrchestrator';
import type { InquiryLoopInput, InquiryLoopResult } from './inquiryLoop';
import {
  assessNarrowing,
  buildNarrowingInquiry,
  proposeInteriorCandidates,
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
  /** Present only on a narrowing step: what the interval became. */
  readonly narrowing: NarrowingOutcome | null;
}

export interface ResearchChainResult {
  readonly contractVersion: string;
  readonly steps: readonly ResearchStep[];
  /** Steps Genesis chose for itself — every step after the caller's own. */
  readonly selfChosenSteps: number;
  readonly stoppedBecause: string;
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

  for (let step = 1; step <= maxSteps; step++) {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: current });

    // A narrowing step is assessed against the run it actually produced, never
    // against one predicted before it ran.
    const narrowing =
      pending !== null && outcome.status === 'RAN'
        ? assessNarrowing(pending.proposal, pending.input, outcome.run.native as InquiryLoopResult)
        : null;
    steps.push({ step, question: current.question, kind, why, outcome, narrowing });
    // `pending` is consumed above and every path below either breaks out or
    // sets it again for the next iteration, so it is never read stale.

    if (outcome.status !== 'RAN') {
      stoppedBecause = `Step ${step} was refused: ${outcome.admission.why}`;
      break;
    }
    rememberProbes(outcome, triedProbeValues);

    const selection = selectNextResearchQuestion(outcome);
    if (selection.selected === null) {
      stoppedBecause = `Step ${step} settled its question and raised no new one.`;
      break;
    }
    if (selection.nextExecutable === null) {
      stoppedBecause =
        `Step ${step} raised ${selection.candidates.length} question(s), none of which Genesis can run. ` +
        `Highest: ${selection.selected.question}`;
      break;
    }

    const next = selection.nextExecutable;
    if (next.kind !== 'NARROW_A_DERIVED_INTERVAL' || outcome.generated === null) {
      stoppedBecause = `Step ${step} proposed "${next.kind}", which this chain has no actuator for yet: ${next.question}`;
      break;
    }

    const proposal = proposeInteriorCandidates(outcome.generated.derived, outcome.generated.standing);
    if (proposal === null) {
      stoppedBecause = `Step ${step} proposed narrowing, but the interval could not produce interior candidates.`;
      break;
    }
    const narrowingInput = buildNarrowingInquiry(
      current,
      outcome.generated.derived,
      proposal,
      [...triedProbeValues],
    );
    if (narrowingInput === null) {
      stoppedBecause =
        `Step ${step} proposed narrowing, but every candidate setting of ${current.system.probeParameterId} was ` +
        'already used, so the interior candidates could only have been judged on the evidence that produced them.';
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
  };
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
