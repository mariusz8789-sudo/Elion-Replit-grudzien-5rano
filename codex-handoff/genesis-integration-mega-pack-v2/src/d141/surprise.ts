import { fingerprint } from './hash.js';
import type { ObservationRecord, PredictionRecord, SurpriseRecord } from './types.js';
import type { HashPort } from '../hashReplay/hashPort.js';

/** Unchanged logic from V1; accepts an optional HashPort (fix area 4). */
export function evaluateSurprise(prediction: PredictionRecord, observation: ObservationRecord, hashPort?: HashPort): SurpriseRecord {
  const surpriseId = `surprise:${fingerprint({ predictionId: prediction.predictionId, observationId: observation.observationId }, hashPort)}`;
  if (prediction.target !== observation.target) {
    return { surpriseId, predictionId: prediction.predictionId, observationId: observation.observationId, kind: 'NOT_COMPARABLE', explanation: 'Prediction and observation target different quantities.' };
  }

  if (typeof prediction.expected === 'number' && typeof observation.observed === 'number') {
    const tolerance = prediction.tolerance;
    if (tolerance === undefined || !Number.isFinite(tolerance) || tolerance <= 0) {
      return { surpriseId, predictionId: prediction.predictionId, observationId: observation.observationId, kind: 'NOT_COMPARABLE', explanation: 'Numeric comparison requires a positive caller-supplied tolerance.' };
    }
    const normalizedError = Math.abs(observation.observed - prediction.expected) / tolerance;
    return {
      surpriseId,
      predictionId: prediction.predictionId,
      observationId: observation.observationId,
      kind: normalizedError <= 1 ? 'WITHIN_EXPECTATION' : 'UNEXPECTED',
      normalizedError,
      explanation: normalizedError <= 1 ? 'Observed value is within supplied tolerance.' : 'Observed value exceeds supplied tolerance.',
    };
  }

  if (typeof prediction.expected === typeof observation.observed) {
    const match = Object.is(prediction.expected, observation.observed);
    return {
      surpriseId,
      predictionId: prediction.predictionId,
      observationId: observation.observationId,
      kind: match ? 'WITHIN_EXPECTATION' : 'UNEXPECTED',
      explanation: match ? 'Observed categorical value matches prediction.' : 'Observed categorical value differs from prediction.',
    };
  }

  return { surpriseId, predictionId: prediction.predictionId, observationId: observation.observationId, kind: 'NOT_COMPARABLE', explanation: 'Prediction and observation types are not comparable.' };
}
