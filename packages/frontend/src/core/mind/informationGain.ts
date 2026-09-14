import type { PairDiscrimination } from './contracts';

/**
 * EXPECTED DISCRIMINATION GAIN (docs/DECISIONS.md D-060) — the one genuinely
 * absent scientific primitive in this repo.
 *
 * WHY THIS IS NEW, AND NOT A SECOND RANKING ENGINE. Verified by repo-wide
 * grep before writing a line: `informationGain|expectedInformationGain|
 * infoGain|entropyReduction|mutualInformation` matches only
 * `core/agent/cyberTestPlanner.ts` (a cyber-domain test planner, unrelated to
 * scientific experiment choice). `'NO_INFORMATION_GAIN'` in
 * `CampaignStopReason`/`OrchestratorStopReason` is a STRING LABEL, not a
 * computed quantity. This module supplies the missing number, built ON TOP OF
 * the existing σ-unit discriminability convention
 * (`differentiatingExperimentGenerator.ts`, `observationGap.ts`) rather than
 * beside it.
 *
 * It ranks EXPERIMENTS. It never ranks candidates, never produces a verdict,
 * and is never consulted by any adjudication or promotion path.
 */
export const INFORMATION_GAIN_METRIC_DOC = {
  means:
    'the mean absolute predicted separation between competing hypothesis pairs, expressed in pooled-sigma units, for one candidate experiment',
  doesNotMean:
    'expected information gain in bits, entropy reduction, mutual information, Bayesian value-of-information, a probability, or any scientific ranking of candidates',
} as const;

/** Separation between one hypothesis pair in pooled-σ units. Zero σ means the experiment cannot separate them, so the gain is 0 — never Infinity. */
export function sigmaSeparation(pair: PairDiscrimination): number {
  if (!Number.isFinite(pair.pooledSigma) || pair.pooledSigma <= 0) return 0;
  if (!Number.isFinite(pair.predictedDifference)) return 0;
  return Math.abs(pair.predictedDifference) / pair.pooledSigma;
}

/** Mean σ-separation across every competing pair this experiment would test. An experiment with no pairs discriminates nothing: 0. */
export function expectedDiscriminationGain(pairs: readonly PairDiscrimination[]): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((sum, p) => sum + sigmaSeparation(p), 0) / pairs.length;
}

/** Stable descending sort by gain — ties keep their original order, so the ranking is deterministic and replayable. */
export function rankExperimentsByGain<E>(experiments: readonly E[], gainOf: (e: E) => number): readonly E[] {
  return experiments
    .map((experiment, index) => ({ experiment, index, gain: gainOf(experiment) }))
    .sort((a, b) => (b.gain - a.gain) || (a.index - b.index))
    .map((entry) => entry.experiment);
}
