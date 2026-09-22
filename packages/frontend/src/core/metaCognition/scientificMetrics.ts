import { expectedDiscriminationGain, sigmaSeparation } from '../mind/informationGain';
import type { PairDiscrimination } from '../mind/contracts';

/**
 * D-141 META-COGNITION METRICS (Work Item 3).
 *
 * Pure functions only — no state, no persistence, no second MetaMemory. Information gain is
 * NOT reimplemented here: `computeInformationGain` calls the repo's one existing
 * discrimination-gain primitive (`core/mind/informationGain.ts::expectedDiscriminationGain`),
 * verified by repo-wide grep before writing this file to be the only such primitive (its own
 * header documents the same check). That module ranks a CANDIDATE experiment's predicted
 * discriminability before it runs; the functions here apply the identical σ-unit metric
 * AFTER an observation exists, to describe what was actually learned — same meaning, no
 * second metric definition.
 */
export const SCIENTIFIC_METRICS_VERSION = '1.0.0';

export interface PredictionErrorInput {
  readonly predicted: number;
  readonly observed: number;
  /** Combined (pooled) uncertainty of the prediction and the observation, same units as both. */
  readonly uncertaintySigma: number;
}

export interface PredictionErrorResult {
  /** |predicted - observed| in the raw measurement unit. NaN if either input is non-finite. */
  readonly absoluteError: number;
  /** |predicted - observed| / uncertaintySigma. 0 when uncertaintySigma is non-finite or <= 0 (matches `sigmaSeparation`'s own convention: an unusable sigma yields no claimed separation, never Infinity). */
  readonly sigmaError: number;
}

export function computePredictionError(input: PredictionErrorInput): PredictionErrorResult {
  const absoluteError = Number.isFinite(input.predicted) && Number.isFinite(input.observed)
    ? Math.abs(input.predicted - input.observed)
    : Number.NaN;
  const sigmaError = sigmaSeparation({
    hypothesisA: 'predicted',
    hypothesisB: 'observed',
    predictedDifference: input.predicted - input.observed,
    pooledSigma: input.uncertaintySigma,
  });
  return { absoluteError, sigmaError };
}

/**
 * Deterministic Gaussian surprisal: `-log p(x)` for a normal residual with the constant term
 * dropped, i.e. `sigmaError² / 2`. This is standard statistics (the quadratic term of a
 * Gaussian negative log-likelihood), not an invented scale — units are relative (comparable
 * across observations from this function), never an absolute probability. Same `sigmaError`
 * always yields the same surprise; there is no hidden randomness or model call in this
 * function.
 */
export function computeSurpriseScore(sigmaError: number): number {
  if (!Number.isFinite(sigmaError)) return 0;
  return (sigmaError * sigmaError) / 2;
}

export interface InformationGainInput {
  readonly hypothesisPairs: readonly PairDiscrimination[];
}

/** Mean σ-separation an observation actually achieved across the hypothesis pairs it was meant to discriminate. Delegates entirely to `expectedDiscriminationGain` — see file header. */
export function computeInformationGain(input: InformationGainInput): number {
  return expectedDiscriminationGain(input.hypothesisPairs);
}

export interface KnowledgeGap {
  readonly hypothesisPairIndex: number;
  readonly hypothesisA: string;
  readonly hypothesisB: string;
  readonly sigmaSeparation: number;
  readonly reason: string;
}

export const DEFAULT_KNOWLEDGE_GAP_THRESHOLD_SIGMA = 1;

/**
 * A hypothesis pair the observation failed to meaningfully separate (below `thresholdSigma`)
 * is a real, disclosed knowledge gap — reported explicitly, never silently dropped from a
 * summary. Deterministic: same pairs and threshold always yield the same gap list, in the
 * pairs' original order.
 */
export function deriveKnowledgeGaps(
  pairs: readonly PairDiscrimination[],
  thresholdSigma: number = DEFAULT_KNOWLEDGE_GAP_THRESHOLD_SIGMA,
): readonly KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];
  pairs.forEach((pair, index) => {
    const sigma = sigmaSeparation(pair);
    if (sigma < thresholdSigma) {
      gaps.push({
        hypothesisPairIndex: index,
        hypothesisA: pair.hypothesisA,
        hypothesisB: pair.hypothesisB,
        sigmaSeparation: sigma,
        reason: `Separacja ${sigma.toFixed(3)}σ jest poniżej progu ${thresholdSigma}σ — hipotezy „${pair.hypothesisA}" i „${pair.hypothesisB}" pozostają nierozróżnione.`,
      });
    }
  });
  return gaps;
}
