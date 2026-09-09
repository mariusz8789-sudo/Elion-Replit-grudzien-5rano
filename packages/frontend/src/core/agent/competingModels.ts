import type { StrategyRun } from './discoveryStrategy';

/**
 * COMPETING MODELS — reading, from a finished run, whether the evidence
 * settled on ONE explanation or still supports SEVERAL.
 *
 * Roadmap P6 ("Model-class proposal + a discriminating experiment between
 * models" — `AUTONOMOUS_DISCOVERY_ROADMAP.md` §7, capability 5 of
 * `GENESIS_NORTH_STAR.md`). This is the first, honest increment of it, not
 * the whole thing: a run that ends with `surviving.length > 1` already
 * IS competing models, in every substrate this repository has. Nothing here
 * generates a new hypothesis or proposes a new model class — that remains
 * future work, named in §6 below. This module's job is narrower and already
 * real: stop that state from being invisible.
 *
 * ## The gap this closes, found by reading, not guessing
 *
 * `inquiryLoop.ts` already recognises this exact state and says so in prose:
 * when a run ends with `survivingHypothesisIds.length > 1`, it appends
 * `"N hypotheses are still consistent with every measurement taken... The
 * inquiry did not separate them."` to `openQuestions` (see the degenerate
 * kinetic-compensation-point fixture in `inquiryLoop.test.ts`, four real
 * hypotheses genuinely indistinguishable at the only probe offered — this is
 * not a hypothetical state). But that sentence is buried in a free-text list,
 * `modelSufficiency.ts` reports the SAME run as `SUPPORTED_MECHANISM_FOUND`
 * with no distinction from a run that ended with exactly one clean survivor,
 * and MECHANISM/CALIBRATION runs get no such sentence at all — the state is
 * structurally reachable there too (`bestSupported`/`survivingHypothesisIds`
 * are plain arrays with no length constraint) but nothing names it. A reader
 * of the Matrix today cannot tell "Genesis found the answer" from "Genesis
 * still has two rival answers standing" without parsing prose.
 *
 * ## Not a third loop, not a change to any loop
 *
 * A PURE READER of `StrategyRun`, the same discipline as `modelSufficiency.ts`
 * and `deriveAlternativeCriteria`. It executes nothing, runs no experiment,
 * and reads only the shared contract — `surviving` and `stopReason` — so it
 * works across all three `QuestionShape`s without knowing which ran, and
 * never reaches into `native`.
 *
 * ## Orthogonal to model sufficiency, not a replacement for it
 *
 * `modelSufficiency.ts` answers "did the declared space explain the
 * observation AT ALL" (zero survivors vs. at least one). This module answers
 * a different question, only meaningful once that first one is "yes": "did
 * it explain it with exactly ONE mechanism, or does the evidence still
 * support several at once". A run with zero survivors is `modelSufficiency`'s
 * finding to report, not this module's — `NOT_APPLICABLE` here says so rather
 * than inventing a second opinion on the same empty set.
 *
 * ## Why `stopReason` is carried verbatim rather than interpreted
 *
 * The three loops reach "several still survive" for different reasons, and
 * this module does not have standing to claim which one happened for a shape
 * it does not execute. `PARAMETER`/`CALIBRATION` share a vocabulary
 * (`NO_DISCRIMINATING_PROBE` means "checked, no declared setting separates
 * them"; `ROUND_BUDGET_EXHAUSTED` means "ran out of rounds, discrimination
 * was not exhausted"). `MECHANISM`'s `ALL_HYPOTHESES_RESOLVED` means
 * something different again: the loop greedily stops the instant ANY one
 * hypothesis reaches `SUPPORTED_AT_TWO_MAGNITUDES`
 * (`LEADER_CONFIRMED_AT_TWO_MAGNITUDES`), so two survivors under
 * `ALL_HYPOTHESES_RESOLVED` means each was independently tested and each
 * individually held up, not that a search for a discriminating strength was
 * attempted and failed. Collapsing these into one message would assert a
 * claim this reader cannot verify. Carrying `run.stopReason` untouched lets a
 * caller who knows the shape's own vocabulary — or a future planner reading
 * this verdict — draw the distinction correctly instead of trusting a
 * generalisation.
 *
 * ## §6 — what this deliberately does NOT do yet
 *
 * It does not propose a new hypothesis, a new model class, or a discriminating
 * experiment between the named survivors. `inquiryLoop.ts` already does the
 * discriminating-experiment part LIVE, mid-run, for the top two contenders
 * (`checkDiscriminability`, `DISCRIMINATES_TOP_TWO`) — this module's
 * `COMPETING_MODELS_UNRESOLVED` fires only for what survives AFTER that
 * mechanism already failed to separate them (or was never attempted, for
 * MECHANISM). Designing what comes after — a NEW probe/strength/tick outside
 * what the run already tried, specifically chosen to separate the named
 * survivors — is real, harder work and is the next increment, not this one.
 */

export const COMPETING_MODELS_CONTRACT_VERSION = '1.0.0';

export type CompetingModelsStatus =
  /** Exactly one hypothesis survived: nothing left to discriminate between. */
  | 'SINGLE_EXPLANATION'
  /** Two or more hypotheses survived: the evidence has not settled on one. */
  | 'COMPETING_MODELS_UNRESOLVED'
  /** Zero survived — `modelSufficiency.ts`'s finding to report, not this module's. */
  | 'NOT_APPLICABLE';

export interface CompetingModelsVerdict {
  readonly contractVersion: string;
  readonly status: CompetingModelsStatus;
  readonly question: string;
  readonly domainId: string;
  /** The rival hypothesis ids, in the order the run reported them. Empty unless UNRESOLVED. */
  readonly competingHypothesisIds: readonly string[];
  /** `run.stopReason`, verbatim — see this module's own doc on why it is not interpreted here. */
  readonly stopReason: string;
  /** Named only when UNRESOLVED. Never invents what a next experiment would be — see §6. */
  readonly nextStep: string | null;
}

/** Reads a finished run and reports whether it settled on one explanation or still has rivals. */
export function assessCompetingModels(run: StrategyRun): CompetingModelsVerdict {
  const count = run.surviving.length;
  const status: CompetingModelsStatus = count === 1 ? 'SINGLE_EXPLANATION' : count === 0 ? 'NOT_APPLICABLE' : 'COMPETING_MODELS_UNRESOLVED';
  const unresolved = status === 'COMPETING_MODELS_UNRESOLVED';

  return {
    contractVersion: COMPETING_MODELS_CONTRACT_VERSION,
    status,
    question: run.question,
    domainId: run.domainId,
    competingHypothesisIds: unresolved ? run.surviving : [],
    stopReason: run.stopReason,
    nextStep: unresolved
      ? `${count} hypotheses remain consistent with every observation this run made: ${run.surviving.join(', ')}. ` +
        `This run stopped with "${run.stopReason}" before separating them. ` +
        (run.nextExperiment?.status === 'READY_TO_RUN'
          ? 'A next step is already proposed for this run — see nextExperiment.'
          : 'This run proposed no next step; a new experiment designed to discriminate specifically between these hypotheses is unresolved.')
      : null,
  };
}
