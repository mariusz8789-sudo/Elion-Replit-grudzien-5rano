import { canonicalJson, fnv1a } from '../events/hash';
import { evaluateTwoArmRelation, type TwoArmRelationOutcome } from '../experimentFabric/falsificationRelation';
import type { FalsificationCriterion, HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { ExperimentRun } from '../experimentFabric/types';

/**
 * PREDICTION vs REAL MEASUREMENT — the "Comparison" stage of the Real
 * Experiment bridge (`docs/MASTER_PRIORITY_GENESIS.md`):
 *
 *   Simulation -> Prediction -> RealExperimentRequest -> REAL_EXPERIMENTAL data
 *   -> Comparison -> Evidence -> Scientific Memory -> Replay
 *
 * This module decides ONLY the Comparison step, and decides it with the same
 * primitive already shared by `worldCounterfactual.ts` and
 * `discovery/discoveryConclusion.ts` — `evaluateTwoArmRelation`. No new
 * statistics, no invented tolerance: a criterion is judged only against
 * whatever `FalsificationCriterion` its own hypothesis already preregistered
 * (its `equal-within-tolerance` relation requires an explicit, predeclared
 * `tolerance` — never a fabricated universal threshold).
 *
 * Nothing here executes anything, mutates `predictedValue`, or touches
 * `realRun` — both are read exactly once, as already-produced numbers.
 */

export const PREDICTION_VERIFICATION_CONTRACT_VERSION = '1.0.0';

export interface PredictionVerificationInput {
  /** A WorldGraph discovery round's own `objectiveObserved` — already computed, never recomputed here. */
  readonly predictedValue: number;
  /** The ORIGINAL hypothesis's own preregistered criterion — never a new one invented for this comparison. */
  readonly criterion: FalsificationCriterion;
  /** The real, physical measurement — must already carry `provenance.dataProvenance === 'REAL_EXPERIMENTAL'`. */
  readonly realRun: ExperimentRun;
}

export interface PredictionVerification {
  readonly contractVersion: string;
  readonly predictedValue: number;
  readonly observedValue: number | null;
  readonly criterion: FalsificationCriterion;
  readonly outcome: TwoArmRelationOutcome | null;
  /** Reuses the codebase's existing four-value vocabulary — no fifth verdict word. */
  readonly assessment: HypothesisAssessment;
  readonly message: string;
}

/**
 * Judges a real, physical measurement against a WorldGraph prediction.
 *
 * Refuses to compare when `realRun` is not honestly tagged
 * `REAL_EXPERIMENTAL` — this function exists specifically so a prediction is
 * never silently checked against a re-simulated number instead of a real one.
 */
export function verifyPredictionAgainstRealExperiment(input: PredictionVerificationInput): PredictionVerification {
  const { predictedValue, criterion, realRun } = input;
  const base = { contractVersion: PREDICTION_VERIFICATION_CONTRACT_VERSION, predictedValue, criterion };

  if (realRun.provenance.dataProvenance !== 'REAL_EXPERIMENTAL') {
    return {
      ...base,
      observedValue: null,
      outcome: null,
      assessment: 'INCONCLUSIVE',
      message: `Run "${realRun.runId}" is not tagged REAL_EXPERIMENTAL (got "${realRun.provenance.dataProvenance ?? 'undefined'}") — refusing to compare a prediction against it as if it were a real measurement.`,
    };
  }

  const observed = realRun.result.outputs[criterion.metric];
  if (typeof observed !== 'number' || !Number.isFinite(observed)) {
    return {
      ...base,
      observedValue: null,
      outcome: null,
      assessment: 'INCONCLUSIVE',
      message: `The real experiment run carries no finite numeric value for "${criterion.metric}" — nothing to judge the preregistered criterion against.`,
    };
  }

  const outcome = evaluateTwoArmRelation(criterion, predictedValue, observed);
  const assessment: HypothesisAssessment = !outcome.applicable
    ? 'INCONCLUSIVE'
    : outcome.met
      ? 'SUPPORTED_WITHIN_PROTOCOL'
      : 'FALSIFIED_WITHIN_PROTOCOL';

  return {
    ...base,
    observedValue: observed,
    outcome,
    assessment,
    message: !outcome.applicable
      ? outcome.explanation
      : `${outcome.met ? 'The predicted value held against the real measurement' : 'The predicted value did NOT hold against the real measurement'}, within the preregistered criterion. ${outcome.explanation}`,
  };
}

/** Deterministic identity for a verdict — used both to persist and to detect drift on replay. */
export function predictionVerificationFingerprint(
  verification: Pick<PredictionVerification, 'predictedValue' | 'observedValue' | 'criterion' | 'assessment'>,
): string {
  return `prediction-verification_${fnv1a(canonicalJson(verification))}`;
}
