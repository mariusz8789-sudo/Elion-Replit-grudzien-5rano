/**
 * ZEFIR Bio Foundation (Phase 3D).
 *
 * Chemistry alone does not explain disease. This is the first machine-readable
 * biological layer: entities (DISEASE→…→TARGET, OBSERVATION, CONTRADICTION, UNKNOWN)
 * and typed relations, each carrying an explicit biological evidence class. Plus the
 * NEXT-BEST-EXPERIMENT primitive: its objective is NOT to maximise fake AI confidence
 * but to select the next AVAILABLE experiment expected to best DISCRIMINATE between
 * competing mechanistic hypotheses, using an explicit information-gain proxy.
 *
 * Honesty: real biological facts require real sources. If a real dataset is not
 * available, callers get BLOCKED_BY_RESOURCES. Synthetic biological facts are
 * permitted ONLY in tests and must be labelled SYNTHETIC_TEST_FIXTURE (source).
 */
import * as store from '../store.mjs';

export const BIO_ENTITY_TYPE = Object.freeze({
  DISEASE: 'DISEASE', PHENOTYPE: 'PHENOTYPE', CELL_TYPE: 'CELL_TYPE', BIOLOGICAL_PROCESS: 'BIOLOGICAL_PROCESS',
  PATHWAY: 'PATHWAY', GENE: 'GENE', PROTEIN: 'PROTEIN', TARGET: 'TARGET', OBSERVATION: 'OBSERVATION',
  CONTRADICTION: 'CONTRADICTION', UNKNOWN: 'UNKNOWN',
});
export const BIO_EVIDENCE_CLASS = Object.freeze({
  KNOWN_FROM_SOURCE: 'KNOWN_FROM_SOURCE', OBSERVED_DATA: 'OBSERVED_DATA', COMPUTED_RESULT: 'COMPUTED_RESULT',
  MODEL_ESTIMATE: 'MODEL_ESTIMATE', SUPPORTED_HYPOTHESIS: 'SUPPORTED_HYPOTHESIS', WEAK_HYPOTHESIS: 'WEAK_HYPOTHESIS',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE', UNKNOWN: 'UNKNOWN',
});
const ENTITY_SET = new Set(Object.values(BIO_ENTITY_TYPE));
const CLASS_SET = new Set(Object.values(BIO_EVIDENCE_CLASS));

export function addEntity(db, { missionId = null, entityType, name, identifier = null, evidenceClass, source = null, meta = {} }) {
  if (!ENTITY_SET.has(entityType)) throw new Error(`invalid bio entity type: ${entityType}`);
  if (!CLASS_SET.has(evidenceClass)) throw new Error(`invalid bio evidence class: ${evidenceClass}`);
  if (!source && evidenceClass === BIO_EVIDENCE_CLASS.KNOWN_FROM_SOURCE) throw new Error('KNOWN_FROM_SOURCE requires a source (no unsourced "facts")');
  return store.saveBioEntity(db, { missionId, entityType, name, identifier, evidenceClass, source, meta });
}
export function addRelation(db, { missionId = null, fromEntity, toEntity, relationType, evidenceClass, detail = {} }) {
  if (!CLASS_SET.has(evidenceClass)) throw new Error(`invalid bio evidence class: ${evidenceClass}`);
  if (!store.getBioEntity(db, fromEntity) || !store.getBioEntity(db, toEntity)) throw new Error('relation endpoints must be existing entities');
  return store.saveBioRelation(db, { missionId, fromEntity, toEntity, relationType, evidenceClass, detail });
}
export function listEntities(db, missionId, opts) { return store.listBioEntities(db, missionId, opts); }
export function listRelations(db, missionId) { return store.listBioRelations(db, missionId); }

/**
 * NEXT-BEST-EXPERIMENT. Given competing hypotheses (each with the set of observations
 * it predicts) and available experiments (each measuring an observation), choose the
 * experiment whose measured observation best DISCRIMINATES — i.e. is predicted by
 * some hypotheses and not others (maximal split). Information-gain proxy = balance of
 * the predicted/not-predicted split (closest to 50/50 is most discriminating).
 *
 * Limitations (documented): this is a structural discrimination proxy, NOT a true
 * information-theoretic expected information gain, and it assumes each experiment is
 * genuinely available. If `availableExperiments` is empty → BLOCKED_BY_RESOURCES.
 */
export function nextBestExperiment({ hypotheses, availableExperiments }) {
  if (!Array.isArray(availableExperiments) || availableExperiments.length === 0) {
    return { ok: false, status: 'BLOCKED_BY_RESOURCES', reason: 'no available experiment/data resource to run' };
  }
  const H = hypotheses ?? [];
  if (H.length < 2) return { ok: true, recommendation: availableExperiments[0], reason: 'fewer than two competing hypotheses; no discrimination needed', discriminationProxy: 0 };
  const scored = availableExperiments.map((exp) => {
    const predictBy = H.filter((h) => (h.predictedObservations ?? []).includes(exp.observation)).length;
    const notBy = H.length - predictBy;
    // most discriminating when the split is most balanced
    const balance = 1 - Math.abs(predictBy - notBy) / H.length; // 1 = perfect split, 0 = no discrimination
    return { experiment: exp, predictBy, notBy, discriminationProxy: +balance.toFixed(4) };
  }).sort((a, b) => b.discriminationProxy - a.discriminationProxy);
  const best = scored[0];
  return {
    ok: true, recommendation: best.experiment, discriminationProxy: best.discriminationProxy,
    reason: `experiment measuring "${best.experiment.observation}" splits ${best.predictBy}/${best.notBy} of competing hypotheses (most discriminating available)`,
    ranking: scored,
  };
}
