import { assessCompetingModels } from './competingModels';
import type { DiscoveryOutcome } from './discoveryOrchestrator';
import { assessModelSufficiency } from './modelSufficiency';

/**
 * QUESTION SELECTION — "now that we answered this, what should we ask next?"
 *
 * ## The distinction this module exists to make
 *
 * Genesis already has five next-EXPERIMENT selectors (`hypothesisLoop`,
 * `experimentGraph`, `discoveryFollowUp`, `whyNextExperiment`,
 * `worldCounterfactual`), plus the probe choosers inside `inquiryLoop.ts` and
 * `worldParameterCalibration.ts`. Every one of them answers the same question:
 * GIVEN this investigation, what is the best next measurement WITHIN it.
 *
 * None of them ever asks whether this investigation is still the right one to
 * be running. That is a different question, and conflating the two is how a
 * discovery engine ends up as one large `selectNext()`: an agent that is
 * excellent at finishing whatever it was pointed at and incapable of noticing
 * it should be pointed somewhere else.
 *
 *   EXPERIMENT SELECTION — "how do I best answer THIS question?"   (exists)
 *   QUESTION SELECTION   — "what should I be asking at all?"       (this)
 *
 * ## What it is allowed to propose, and what it may never invent
 *
 * Only questions the finished run ITSELF raised. Every candidate is derived
 * from a fact the run established — an untested hypothesis it named, survivors
 * it could not separate, an interval it left unnarrowed, an apparatus that
 * failed. Nothing here reads a catalog, guesses a domain, or proposes a
 * research direction from nothing: there is no methodology in this repository
 * that would justify inventing a scientific question, and pretending otherwise
 * would be the exact overclaim the rest of this codebase refuses.
 *
 * So this is a genuine but BOUNDED step toward open-ended research. It closes
 * "the run ended and nobody decided what to do with that". It does not close
 * "choose a new field to work in", and says so rather than implying otherwise.
 *
 * ## Ranking is a declared cascade, never a score
 *
 * The same discipline every other selector here follows
 * (`worldCounterfactual.ts`: "lexicographic priority cascades over declared
 * uncertainty kinds, none of them scoring"). Weighting one kind of uncertainty
 * against another numerically would need a methodology this codebase does not
 * have, so the order is declared, deterministic, and justified in
 * `QUESTION_PRIORITY` below.
 *
 * ## Two answers, because they are two different facts
 *
 * `selected` is the most important question, and `nextExecutable` is the most
 * important one Genesis can actually run right now. They differ exactly when
 * the science says one thing and the machinery cannot do it — and that gap is
 * the thing worth reporting, not smoothing over. A caller wanting autonomy
 * follows `nextExecutable`; a caller wanting the truth about where the loop is
 * blocked reads both.
 */

export const NEXT_QUESTION_CONTRACT_VERSION = '1.0.0';

export type ResearchQuestionKind =
  /** The instrument did not return a measurement. Nothing downstream is trustworthy until that is settled. */
  | 'RESOLVE_APPARATUS_FAILURE'
  /** The run named hypotheses it never tested. The cheapest real reduction in uncertainty, and already runnable. */
  | 'TEST_UNTESTED_HYPOTHESIS'
  /** Several rival claims survived and the run could not separate them. */
  | 'SEPARATE_SURVIVORS'
  /** Several MECHANISMS survived. They are not rivals, so the informative question is whether they compose. */
  | 'TEST_WHETHER_MECHANISMS_COMPOSE'
  /** A derived value survived without being identified: the interval is known, the point is not. */
  | 'NARROW_A_DERIVED_INTERVAL'
  /** Everything declared was refuted and nothing could be derived: the answer is outside what anyone proposed. */
  | 'GO_OUTSIDE_THE_DECLARED_SPACE'
  /** Genesis could not take the question at all. The next question is about capability, not about the subject. */
  | 'ACQUIRE_A_MISSING_CAPABILITY';

/**
 * The declared order, most important first, with the reason each sits where it
 * does. This is the whole ranking model — there is no second, numeric one.
 *
 * 1. APPARATUS first, because every other question presupposes a working
 *    instrument. Asking "which value is it?" of a run that took no measurement
 *    is asking a question the evidence cannot touch.
 * 2. UNTESTED next, because a hypothesis someone declared and nobody ran is
 *    uncertainty the run created and can remove immediately, with machinery
 *    that already exists and at the cost of one measurement.
 * 3. SEPARATE / COMPOSE next: real, live uncertainty about the subject, but it
 *    needs a discriminating experiment that may not exist.
 * 4. NARROW an interval after that: something IS established (the interval);
 *    this is refinement, not resolution, so it yields to open contradictions.
 * 5. OUTSIDE the declared space last among subject questions: the honest but
 *    most expensive move, requiring a claim nobody has made yet.
 * 6. CAPABILITY sits at the end because it is not a question about the world
 *    at all — it is a question about Genesis.
 */
const QUESTION_PRIORITY: readonly ResearchQuestionKind[] = [
  'RESOLVE_APPARATUS_FAILURE',
  'TEST_UNTESTED_HYPOTHESIS',
  'SEPARATE_SURVIVORS',
  'TEST_WHETHER_MECHANISMS_COMPOSE',
  'NARROW_A_DERIVED_INTERVAL',
  'GO_OUTSIDE_THE_DECLARED_SPACE',
  'ACQUIRE_A_MISSING_CAPABILITY',
];

export interface CandidateResearchQuestion {
  readonly kind: ResearchQuestionKind;
  readonly question: string;
  /** The exact facts from the run this question is derived from — ids, values, stop reasons. Never prose alone. */
  readonly groundedIn: readonly string[];
  /**
   * Whether Genesis has a mechanism that answers this KIND of question at all.
   * False is not a defect — it is the honest report that a real question has no
   * runnable form yet, and `why` says what is missing.
   *
   * True is a statement about capability, not a guarantee of success: a
   * mechanism may still refuse on the specifics (no untried setting left, say).
   * Those refusals are the mechanism's own to make and to explain.
   */
  readonly answerableNow: boolean;
  readonly why: string;
}

export interface NextQuestionSelection {
  readonly contractVersion: string;
  /** Every question this run raised, in declared priority order. */
  readonly candidates: readonly CandidateResearchQuestion[];
  /** The most important one. Null only when the run raised no open question at all. */
  readonly selected: CandidateResearchQuestion | null;
  /** The most important one Genesis can actually run now. Null when none can be. */
  readonly nextExecutable: CandidateResearchQuestion | null;
  /** True when a question remains but none of them is runnable: the loop genuinely waits on a person here. */
  readonly blockedOnHuman: boolean;
  readonly why: string;
}

/** Reads a finished investigation and reports what it left worth asking. */
export function selectNextResearchQuestion(outcome: DiscoveryOutcome): NextQuestionSelection {
  const candidates: CandidateResearchQuestion[] = [];

  if (outcome.status === 'REFUSED') {
    candidates.push({
      kind: 'ACQUIRE_A_MISSING_CAPABILITY',
      question: `What would Genesis need in order to take this question at all? Missing: ${outcome.admission.missing.join('; ')}.`,
      groundedIn: [`refused at ${outcome.stage}`, `admission ${outcome.admission.status}`, ...outcome.admission.missing],
      // The admission names what is missing precisely, and nothing in this
      // repository acquires a capability on its own.
      answerableNow: false,
      why: `${outcome.admission.why} This is a question about what Genesis can do, not about the subject, and no code here can answer it.`,
    });
    return finish(candidates);
  }

  const { run, generated } = outcome;

  if (run.stopReason === 'MEASUREMENT_FAILED') {
    candidates.push({
      kind: 'RESOLVE_APPARATUS_FAILURE',
      question: 'Why did the measurement return nothing, and at what settings can this system be measured at all?',
      groundedIn: [`stopReason ${run.stopReason}`, ...run.openQuestions.filter((q) => q.includes('no usable'))],
      // The run establishes THAT it failed and nothing about why. Choosing a
      // different setting is a judgement about the instrument's valid range,
      // which no reader here holds.
      answerableNow: false,
      why: 'The run established that the instrument returned nothing, and nothing about why. Deciding whether the setting was out of range, or the model unavailable, is not something this run settled.',
    });
  }

  if (run.untested.length > 0) {
    candidates.push({
      kind: 'TEST_UNTESTED_HYPOTHESIS',
      question: `Do the hypotheses this run never tested hold? Untested: ${run.untested.join(', ')}.`,
      groundedIn: run.untested.map((id) => `untested ${id}`),
      // Genuinely runnable: the same investigation, over the hypotheses left
      // open. `memoryNarrowedHypotheses` already does exactly this narrowing.
      answerableNow: true,
      why: `${run.untested.length} declared hypothes(es) were never measured. Re-running this same investigation over them needs no new capability and no new claim.`,
    });
  }

  const competing = assessCompetingModels(run);
  if (competing.status === 'COMPETING_MODELS_UNRESOLVED') {
    if (run.shape === 'MECHANISM') {
      candidates.push({
        kind: 'TEST_WHETHER_MECHANISMS_COMPOSE',
        question: `Do "${run.surviving.join('" and "')}" compose, or does applying them together behave differently from the sum of each alone?`,
        groundedIn: run.surviving.map((id) => `survived ${id}`),
        // `mechanismGeneration.ts` runs exactly this, on the real solver.
        answerableNow: true,
        why: 'Two mechanisms surviving is not a tie to be broken — both levers really work. Whether they compose cannot be computed from their separate effects (measured sub-additive on the generator fixture), so it has to be run, and mechanismGeneration.ts runs it.',
      });
    } else {
      const discriminable = run.nextExperiment?.status === 'READY_TO_RUN';
      candidates.push({
        kind: 'SEPARATE_SURVIVORS',
        question: `Which of ${run.surviving.join(', ')} is right? The run could not separate them.`,
        groundedIn: [...run.surviving.map((id) => `survived ${id}`), `stopReason ${run.stopReason}`],
        answerableNow: discriminable,
        why: discriminable
          ? 'The run left a discriminating measurement proposed and ready to run.'
          : 'No untried setting separates them, so answering this needs a probe outside the declared candidates — which nothing here proposes.',
      });
    }
  }

  if (generated !== null && generated.standing.standing === 'SUPPORTED_INTERVAL_NOT_IDENTIFIED') {
    const [lo, hi] = generated.standing.interval;
    candidates.push({
      kind: 'NARROW_A_DERIVED_INTERVAL',
      question: `Where in [${lo}, ${hi}] does ${generated.derived.parameterId} actually lie? ${generated.derived.value} survived, but so would other values in that interval.`,
      groundedIn: [
        `derived ${generated.derived.hypothesisId}`,
        `interval [${lo}, ${hi}]`,
        `refuted ends ${generated.standing.refutedBracketEnds.join(', ')}`,
      ],
      // `intervalNarrowing.ts` exists precisely because this question came back
      // unanswerable when this module first ran: generation is gated on an
      // EXHAUSTED space and this space has a survivor, so nothing could propose
      // a second value. Narrowing is the mechanism for the surviving state.
      answerableNow: true,
      why:
        `Both ends of [${lo}, ${hi}] were really refuted, so the interval is earned and candidates inside it are ` +
        'the obvious experiment. `intervalNarrowing.ts` proposes them and runs the investigation. It can still ' +
        'refuse for want of an untried setting to judge them on, which is a fact about this system\'s remaining ' +
        'probes rather than about whether the question can be posed.',
    });
  }

  const sufficiency = assessModelSufficiency(run);
  if (sufficiency.status === 'DECLARED_SPACE_INSUFFICIENT' && generated === null) {
    candidates.push({
      kind: 'GO_OUTSIDE_THE_DECLARED_SPACE',
      question: `Everything declared was refuted and nothing could be derived. What explanation outside the declared ${sufficiency.declaredMechanismCount} was never considered?`,
      groundedIn: [`sufficiency ${sufficiency.status}`, ...run.falsified.map((id) => `refuted ${id}`)],
      answerableNow: false,
      why: `${sufficiency.nextStep ?? ''} ${outcome.noGenerationReason ?? ''}`.trim(),
    });
  }

  return finish(candidates);
}

function finish(candidates: readonly CandidateResearchQuestion[]): NextQuestionSelection {
  const ordered = [...candidates].sort(
    (a, b) => QUESTION_PRIORITY.indexOf(a.kind) - QUESTION_PRIORITY.indexOf(b.kind),
  );
  const selected = ordered[0] ?? null;
  const nextExecutable = ordered.find((c) => c.answerableNow) ?? null;
  const blockedOnHuman = selected !== null && nextExecutable === null;

  return {
    contractVersion: NEXT_QUESTION_CONTRACT_VERSION,
    candidates: ordered,
    selected,
    nextExecutable,
    blockedOnHuman,
    why:
      selected === null
        ? 'This run left no open question: nothing was untested, nothing was unseparated, and nothing failed.'
        : blockedOnHuman
          ? `${ordered.length} question(s) remain and none can be run with what Genesis has. The most important is: ${selected.question}`
          : nextExecutable === selected
            ? `The most important open question is also runnable now: ${selected.question}`
            : `The most important open question is "${selected.question}", which Genesis cannot run (${selected.why}). The most important one it CAN run is: ${nextExecutable!.question}`,
  };
}
