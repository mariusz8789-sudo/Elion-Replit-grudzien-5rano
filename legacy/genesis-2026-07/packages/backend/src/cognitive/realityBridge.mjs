/**
 * Reality Bridge Foundation (Phase 3K — ZEFIR).
 *
 * The architecture for future experimental feedback. NO laboratory is connected.
 * An experimental result may only enter through a STRUCTURED import contract with an
 * artifact reference — a manually typed sentence like "candidate works" can NEVER
 * become verified experimental evidence. Records prediction-vs-measurement so the
 * Meta-Orchestrator can eventually score prediction-vs-reality. No medical/clinical
 * automation.
 */
import * as store from '../store.mjs';

export const EXPERIMENT_RESULT_CLASS = Object.freeze({
  BINDING_ASSAY: 'BINDING_ASSAY', FUNCTIONAL_ASSAY: 'FUNCTIONAL_ASSAY', CELL_VIABILITY: 'CELL_VIABILITY',
  SELECTIVITY_PANEL: 'SELECTIVITY_PANEL', ADME_MEASUREMENT: 'ADME_MEASUREMENT', TOXICITY_MEASUREMENT: 'TOXICITY_MEASUREMENT',
  STRUCTURAL_RESULT: 'STRUCTURAL_RESULT', OTHER_VALIDATED_EXPERIMENT: 'OTHER_VALIDATED_EXPERIMENT',
});
export const IMPORT_STATUS = Object.freeze({ IMPORTED: 'IMPORTED', REJECTED: 'REJECTED' });

/**
 * Import a structured experimental result. Requires: externalId, lab identity,
 * protocol reference, candidate id, measurement type + class, units, a NUMERIC
 * result, and an artifact reference + hash. Missing structure / a free-text claim
 * → REJECTED (never IMPORTED). Reviewer status starts PENDING (a human must review).
 */
export function importExperimentalResult(db, r = {}) {
  const required = ['externalId', 'labIdentity', 'protocolRef', 'candidateId', 'measurementType', 'resultClass'];
  const missing = required.filter((k) => !r[k]);
  if (!Object.values(EXPERIMENT_RESULT_CLASS).includes(r.resultClass)) missing.push('resultClass(valid)');
  if (typeof r.resultValue !== 'number' || !Number.isFinite(r.resultValue)) missing.push('resultValue(numeric)');
  if (!r.artifactRef || !r.artifactHash) missing.push('artifactRef+artifactHash');
  if (missing.length) {
    return { ok: false, status: IMPORT_STATUS.REJECTED, reason: `structured experimental result required; missing/invalid: ${missing.join(', ')}. A typed claim is not evidence.` };
  }
  const rec = store.saveExperimentalResult(db, { ...r, importStatus: IMPORT_STATUS.IMPORTED, reviewerStatus: 'PENDING' });
  return { ok: true, result: rec };
}

/** Record a prediction-vs-measurement error (foundation for prediction-vs-reality scoring). */
export function recordPredictionError(db, { candidateId, measurementType, predicted, measured, strategyKey = null }) {
  if (typeof predicted !== 'number' || typeof measured !== 'number') throw new Error('predicted and measured must be numeric');
  return store.savePredictionError(db, { candidateId, measurementType, predicted, measured, absError: Math.abs(predicted - measured), strategyKey });
}

/** Aggregate prediction-vs-reality performance for a strategy (mean absolute error). */
export function predictionPerformance(db, strategyKey = null) {
  const errs = store.listPredictionErrors(db, strategyKey);
  if (errs.length === 0) return { n: 0, meanAbsError: null };
  return { n: errs.length, meanAbsError: errs.reduce((s, e) => s + (e.absError ?? 0), 0) / errs.length };
}
