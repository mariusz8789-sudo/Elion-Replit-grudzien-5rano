/**
 * Genesis Local AI-Video — future training-data manifest contract
 * (preparation for STAGE B; NO training is started here or anywhere in
 * this branch).
 *
 * This module defines and validates the shape a future Genesis-owned
 * fine-tuning dataset entry must have. It does not fetch, generate, or
 * curate any training data itself — it is a gate: `validateManifestEntry`
 * rejects any entry missing licensing or provenance, so a dataset can
 * never be silently admitted without both.
 */
import { sha256Hex } from './videoControlContract.mjs';

/** Every field a training-data manifest entry must carry. */
const REQUIRED_FIELDS = Object.freeze([
  'datasetId', 'datasetVersion', 'sourceWorldId', 'sourceScientificStateFingerprint',
  'promptOrShotDescription', 'frameOrVideoReferences', 'cameraMetadata',
  'frameTiming', 'license', 'source', 'consentAndUsageConstraints',
  'classification', 'qualityAnnotations', 'scientificConsistencyAnnotations',
  'split', 'preprocessingVersion', 'checkpointLineage', 'reproducibilitySeed',
]);

/** `classification` must say plainly whether a clip is model-generated or
 *  a real observed recording — a training set can never blur the two. */
export const DATASET_CLASSIFICATION = Object.freeze({
  GENERATED: 'GENERATED',
  OBSERVED: 'OBSERVED',
});

/** The evaluation categories every trained checkpoint must eventually be
 *  scored against (STAGE B). Listed and documented here now so the
 *  manifest schema and the eventual evaluation harness agree from day one. */
export const EVALUATION_CATEGORIES = Object.freeze([
  'TEMPORAL_CONSISTENCY',
  'OBJECT_IDENTITY_STABILITY',
  'CAMERA_ADHERENCE',
  'CONTROL_ADHERENCE',
  'VISUAL_ARTIFACTS',
  'ANATOMY_CONSISTENCY',
  'SCIENTIFIC_STATE_CONSISTENCY',
  'FORBIDDEN_CLAIM_PROMOTION',
  'PROVENANCE_COMPLETENESS',
]);

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validates one manifest entry. Returns `{ ok:true, entry, fingerprint }`
 * or `{ ok:false, error, missingFields }`. An entry missing ANY required
 * field — licensing and provenance chief among them — is rejected, never
 * silently admitted with a placeholder.
 */
export function validateManifestEntry(rawEntry) {
  if (rawEntry === null || typeof rawEntry !== 'object') {
    return { ok: false, error: 'invalid_entry', missingFields: REQUIRED_FIELDS.slice() };
  }
  const missingFields = REQUIRED_FIELDS.filter((f) => rawEntry[f] === undefined || rawEntry[f] === null);
  if (missingFields.length > 0) {
    return { ok: false, error: 'missing_required_fields', missingFields };
  }
  if (!isNonEmptyString(rawEntry.license) || !isNonEmptyString(rawEntry.source)) {
    return { ok: false, error: 'incomplete_licensing_or_provenance', missingFields: ['license', 'source'].filter((f) => !isNonEmptyString(rawEntry[f])) };
  }
  if (rawEntry.classification !== DATASET_CLASSIFICATION.GENERATED && rawEntry.classification !== DATASET_CLASSIFICATION.OBSERVED) {
    return { ok: false, error: 'invalid_classification', missingFields: [] };
  }
  if (!['train', 'validation', 'test'].includes(rawEntry.split)) {
    return { ok: false, error: 'invalid_split', missingFields: [] };
  }

  const entry = Object.freeze({ ...rawEntry });
  const fingerprint = sha256Hex(JSON.stringify({
    datasetId: entry.datasetId, datasetVersion: entry.datasetVersion,
    sourceWorldId: entry.sourceWorldId, sourceScientificStateFingerprint: entry.sourceScientificStateFingerprint,
    checkpointLineage: entry.checkpointLineage, preprocessingVersion: entry.preprocessingVersion,
  }));
  return { ok: true, entry, fingerprint };
}

export function requiredManifestFields() {
  return REQUIRED_FIELDS.slice();
}
