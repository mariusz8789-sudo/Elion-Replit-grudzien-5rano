import type { CausalFitResult, ParallelTrendsTestResult } from './causalInference';

/**
 * Causal Ladder (Phase G, Proof Ladder P9 — "Causal/Mechanistic Support").
 *
 * REUSE, NOT DUPLICATION (confirmed by audit before writing a line): the
 * causal-inference METHODS this ladder gates already exist and are real —
 * `causalInference.ts` implements two-way fixed-effects DiD, interrupted
 * time series, and synthetic control, with cluster-robust/permutation
 * standard errors and placebo/parallel-trends diagnostics. What did NOT
 * exist anywhere in the repo is the ORDERED VOCABULARY this file adds: an
 * enum separating a bare correlation from a claim allowed to use the word
 * "causal", and a gate that refuses `CAUSAL_CLAIM` unless the underlying
 * `CausalFitResult` actually clears its own diagnostics (a statistically
 * indistinguishable-from-zero effect, or a DiD whose parallel-trends
 * assumption failed its own pre-test, caps the claim at
 * `MECHANISTIC_SUPPORT` — one rung short of "causal" — however strong the
 * point estimate looks).
 *
 * THE RULE THIS ENFORCES: "causal" is a WORD, not a stronger flavor of
 * `predictionStrength`. Nothing in this codebase (or Genesis's own
 * `DiscoveryStatus`) may promote a claim to `CAUSAL_CLAIM` by predicting well
 * — `hasPrediction: true` alone caps at `PREDICTION`; `mechanismDeclared`
 * alone caps at `MECHANISTIC_SUPPORT`. Reaching `CAUSAL_CLAIM` requires an
 * actual `CausalFitResult`, actual declared identification assumptions, and
 * that result's own diagnostics agreeing the effect is real.
 */

export const CAUSAL_LADDER_CONTRACT_VERSION = '1.0.0';

export const CAUSAL_LEVELS = [
  'OBSERVATION', 'CORRELATION', 'ASSOCIATION', 'PREDICTION', 'MECHANISTIC_SUPPORT', 'CAUSAL_CLAIM',
] as const;
export type CausalLevel = (typeof CAUSAL_LEVELS)[number];

export interface CausalGateInput {
  /** A real `CausalFitResult` computed by `causalInference.ts` for this specific claim. `null` = no causal estimate was ever computed. */
  readonly fit: CausalFitResult | null;
  /** Named identification assumptions this estimator relies on (e.g. "parallel trends", "no anticipation"). Empty = not declared. */
  readonly identificationAssumptions: readonly string[];
  /** For `two-way-fe-did` specifically — the design's own pre-test of its identifying assumption. `null` if not run (or not applicable to this estimator). */
  readonly parallelTrends: ParallelTrendsTestResult | null;
  /** Whether at least one confounder was explicitly checked and ruled out (distinguishes a bare correlation from an association). */
  readonly confoundersChecked: boolean;
  /** Whether an out-of-sample prediction was checked against real, not-yet-seen data. */
  readonly hasConfirmedPrediction: boolean;
  /** Whether a mechanism (a causal story, not just a number) has been articulated for why the association would hold. */
  readonly mechanismDeclared: boolean;
}

export interface CausalGateResult {
  readonly level: CausalLevel;
  readonly reasons: readonly string[];
}

export function classifyCausalLevel(input: CausalGateInput): CausalGateResult {
  const reasons: string[] = [];

  if (!input.confoundersChecked) {
    reasons.push('No confounder was checked — capped at CORRELATION.');
    return { level: 'CORRELATION', reasons };
  }
  if (!input.hasConfirmedPrediction) {
    reasons.push('Confounders checked, but no out-of-sample prediction was confirmed — capped at ASSOCIATION.');
    return { level: 'ASSOCIATION', reasons };
  }
  if (!input.mechanismDeclared) {
    reasons.push('An out-of-sample prediction was confirmed, but no mechanism was articulated — capped at PREDICTION. Predicting well is not the same claim as explaining why.');
    return { level: 'PREDICTION', reasons };
  }
  if (input.fit === null) {
    reasons.push('A mechanism was declared, but no causal-inference estimate (DiD/ITS/synthetic control) was ever computed for this claim — capped at MECHANISTIC_SUPPORT.');
    return { level: 'MECHANISTIC_SUPPORT', reasons };
  }
  if (input.identificationAssumptions.length === 0) {
    reasons.push('A causal-inference estimate exists, but no identification assumptions were declared for it — capped at MECHANISTIC_SUPPORT. An undeclared assumption is an unexamined one.');
    return { level: 'MECHANISTIC_SUPPORT', reasons };
  }
  const [lo, hi] = input.fit.effect.ci95;
  if (lo <= 0 && hi >= 0) {
    reasons.push(`The estimated effect's 95% CI [${lo.toFixed(4)}, ${hi.toFixed(4)}] includes zero — statistically indistinguishable from no effect. Capped at MECHANISTIC_SUPPORT regardless of the point estimate.`);
    return { level: 'MECHANISTIC_SUPPORT', reasons };
  }
  if (input.fit.estimator === 'two-way-fe-did') {
    if (input.parallelTrends === null) {
      reasons.push('Estimator is two-way-fe-did, but its own parallel-trends pre-test was never run — the identifying assumption is unchecked. Capped at MECHANISTIC_SUPPORT.');
      return { level: 'MECHANISTIC_SUPPORT', reasons };
    }
    if (!input.parallelTrends.parallelTrendsHold) {
      reasons.push('The parallel-trends pre-test FAILED — the DiD design\'s own identifying assumption does not hold on this data. Capped at MECHANISTIC_SUPPORT; the estimate cannot be trusted as causal.');
      return { level: 'MECHANISTIC_SUPPORT', reasons };
    }
  }

  reasons.push(`Confounders checked, prediction confirmed, mechanism declared, and a ${input.fit.estimator} estimate with a CI excluding zero and its own identifying assumptions holding — CAUSAL_CLAIM.`);
  return { level: 'CAUSAL_CLAIM', reasons };
}
