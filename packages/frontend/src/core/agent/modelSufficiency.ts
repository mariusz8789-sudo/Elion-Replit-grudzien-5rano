import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { StrategyRun } from './discoveryStrategy';

/**
 * MODEL SUFFICIENCY — reading, from a finished run, whether the DECLARED search
 * space explained the observation at all.
 *
 * P4. The step from "a hypothesis was falsified" to "none of the mechanisms we
 * were given explains this, and the honest next move is a mechanism — or a
 * model — outside the declared space." Today that state reads as a weak result
 * (everything refuted, `bestSupported` empty) when it is in fact a strong,
 * nameable scientific finding.
 *
 * ## Not a third loop, not a change to any loop
 *
 * This is a PURE READER of `StrategyRun` — the same discipline as
 * `deriveAlternativeCriteria` (reads an assessment) and `genesisMatrix.ts`
 * (reads a run). It executes nothing, runs no experiment, and touches neither
 * `discoveryLoop.ts` nor `inquiryLoop.ts`. It reads only the public contract —
 * `surviving`/`falsified`/`untested` and each round's own `verdicts` — so it
 * works for BOTH substrates without knowing which ran, and never reaches into
 * `native`.
 *
 * ## The one honesty boundary this module exists to hold
 *
 * INSUFFICIENCY IS A STATEMENT ABOUT THE DECLARED SPACE, NOT ABOUT THE MODEL.
 * If a run was handed one lever and it failed, that is "this lever does not
 * explain it", never "the world-model is wrong" — the flood model can absolutely
 * lower flood depth (via infiltration or the outlet), even in a run that only
 * declared the pump and found it useless. So the verdict names the size of the
 * declared space, and its `caveat` states plainly that a mechanism outside that
 * space, or different assumptions, might still explain the observation. Claiming
 * the model itself is insufficient would be exactly the overclaim this codebase
 * refuses everywhere else. Establishing THAT needs the remaining candidate
 * mechanisms declared and also refuted, or a model comparison this run does not
 * perform — which is the P5 step this verdict is the honest input to.
 *
 * ## Reaching the metric vs. being inert — a real distinction, kept
 *
 * A refuted mechanism split two ways, and the split is scientifically load-
 * bearing rather than cosmetic. A mechanism that MOVED the objective in the
 * ruled-out direction (a round assessed `FALSIFIED_WITHIN_PROTOCOL`) reaches the
 * metric — it is a real cause, just the wrong one. A mechanism that never moved
 * the objective at all (its rounds could only be `INCONCLUSIVE`, because a
 * criterion cannot be evaluated against a metric that did not move) is INERT
 * within the model. When EVERY tested mechanism is inert, the finding is
 * stronger still: nothing the declared space can change reaches the objective —
 * carried as `everyTestedMechanismInert` rather than a fourth status word.
 */

export const MODEL_SUFFICIENCY_CONTRACT_VERSION = '1.0.0';

export type ModelSufficiencyStatus =
  /** At least one declared mechanism survived: the declared space is not exhausted-and-empty. */
  | 'SUPPORTED_MECHANISM_FOUND'
  /** Some mechanism was never tested or ended unresolved: the run did not reach a state where sufficiency can be judged. */
  | 'UNSETTLED'
  /** Every declared mechanism was tested and refuted: none in the declared space explains the observation. */
  | 'DECLARED_SPACE_INSUFFICIENT';

export interface ModelSufficiencyVerdict {
  readonly contractVersion: string;
  readonly status: ModelSufficiencyStatus;
  /** The question this run investigated, so a reader knows what remains unexplained. */
  readonly question: string;
  readonly domainId: string;
  /** Distinct hypotheses the run held a belief about — the size of the declared search space it actually covered. */
  readonly declaredMechanismCount: number;
  readonly survivingCount: number;
  readonly falsifiedCount: number;
  readonly untestedCount: number;
  /** Of the falsified, how many moved the objective the wrong way (a real cause, ruled out). */
  readonly reachedMetricCount: number;
  /** Of the falsified, how many never moved the objective at all — inert within the model. */
  readonly inertCount: number;
  /** True only when INSUFFICIENT and every refuted mechanism was inert: nothing declared even reaches the objective. */
  readonly everyTestedMechanismInert: boolean;
  /**
   * What insufficiency implies, named — never an action taken. The bridge to
   * P5 (competing-model generation): a mechanism outside the declared space, or
   * a different model, is what a next step would require. Null unless INSUFFICIENT.
   */
  readonly nextStep: string | null;
  /** The declared-space-not-the-model boundary, verbatim. Null unless INSUFFICIENT. */
  readonly caveat: string | null;
}

const INSUFFICIENCY_CAVEAT =
  'This is insufficiency of the DECLARED search space — the mechanisms this run was given — not proof the model ' +
  'cannot explain the observation with a mechanism that was not declared, or under different assumptions. ' +
  'Establishing that would require declaring the remaining candidate mechanisms and finding them refuted too, or a ' +
  'model comparison this run does not perform.';

/**
 * Whether a hypothesis, across all the rounds that judged it, ever moved the
 * objective — i.e. produced a real `FALSIFIED_WITHIN_PROTOCOL` verdict rather
 * than only `INCONCLUSIVE` ones. A criterion can only be evaluated when the
 * metric moved, so an all-`INCONCLUSIVE` refutation is exactly the inert case.
 */
function reachedTheMetric(run: StrategyRun, hypothesisId: string): boolean {
  for (const round of run.rounds) {
    for (const verdict of round.verdicts) {
      if (verdict.hypothesisId === hypothesisId && verdict.assessment === ('FALSIFIED_WITHIN_PROTOCOL' as HypothesisAssessment)) {
        return true;
      }
    }
  }
  return false;
}

/** Reads a finished run and reports whether its declared space explained the observation. */
export function assessModelSufficiency(run: StrategyRun): ModelSufficiencyVerdict {
  const declaredMechanismCount = new Set([...run.surviving, ...run.falsified, ...run.untested]).size;

  const reached = run.falsified.filter((id) => reachedTheMetric(run, id));
  const reachedMetricCount = reached.length;
  const inertCount = run.falsified.length - reachedMetricCount;

  const status: ModelSufficiencyStatus =
    run.surviving.length > 0
      ? 'SUPPORTED_MECHANISM_FOUND'
      : run.untested.length > 0
        ? 'UNSETTLED'
        : run.falsified.length > 0
          ? 'DECLARED_SPACE_INSUFFICIENT'
          : 'UNSETTLED'; // nothing survived, nothing failed, nothing untested — the run judged nothing

  const insufficient = status === 'DECLARED_SPACE_INSUFFICIENT';
  const everyTestedMechanismInert = insufficient && reachedMetricCount === 0 && inertCount > 0;

  return {
    contractVersion: MODEL_SUFFICIENCY_CONTRACT_VERSION,
    status,
    question: run.question,
    domainId: run.domainId,
    declaredMechanismCount,
    survivingCount: run.surviving.length,
    falsifiedCount: run.falsified.length,
    untestedCount: run.untested.length,
    reachedMetricCount,
    inertCount,
    everyTestedMechanismInert,
    nextStep: insufficient
      ? everyTestedMechanismInert
        ? `None of the ${declaredMechanismCount} declared mechanism(s) moves the objective at all. A next step must declare a mechanism outside this space, or propose a different model, and test it — this run cannot get there from the mechanisms it was given.`
        : `None of the ${declaredMechanismCount} declared mechanism(s) explains the observation. A next step must declare an untried mechanism, or propose a different model, and test it.`
      : null,
    caveat: insufficient ? INSUFFICIENCY_CAVEAT : null,
  };
}
