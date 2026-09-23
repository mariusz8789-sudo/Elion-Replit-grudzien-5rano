/**
 * Genesis Local AI-Video — control contract (STAGE A).
 *
 * This module owns the ONE vocabulary a caller uses to ask for a generated
 * video/image-to-video/enhancement result from the local-first AI-video
 * subsystem, and the ONE fingerprinting scheme its provenance relies on.
 *
 * ===================== ARCHITECTURAL BOUNDARY ==========================
 *
 *   SCIENTIFIC STATE  !=  GENERATED VISUALIZATION
 *
 * Everything this subsystem produces is GENERATED_MEDIA, scoped
 * VISUALIZATION_ONLY. It can never become Evidence, a solver result, a
 * replay truth, a candidate identity, a ScienceRun result, a campaign
 * result, a wet-lab/clinical classification, or WorldGraph state — by
 * construction, not by convention: `evidenceEligible` and
 * `scientificStateMutation` are hardcoded `false` on every record this
 * module builds, and `assertNoScientificStatePromotion` throws on any
 * caller attempt to smuggle a promotion field into a control input.
 *
 * This module is intentionally self-contained (no imports from
 * campaign/*, knowledgeApi.mjs, or any shared registry) so it stays
 * additive and independently cherry-pickable.
 */
import { createHash } from 'node:crypto';

/** Canonical capability identifiers. No competing vocabulary is introduced. */
export const CAPABILITY = Object.freeze({
  TEXT_TO_VIDEO: 'TEXT_TO_VIDEO',
  IMAGE_TO_VIDEO: 'IMAGE_TO_VIDEO',
  VIDEO_TO_VIDEO: 'VIDEO_TO_VIDEO',
  FRAME_ENHANCEMENT: 'FRAME_ENHANCEMENT',
  TEMPORAL_UPSCALE: 'TEMPORAL_UPSCALE',
});
const ALLOWED_CAPABILITIES = new Set(Object.values(CAPABILITY));

/** Canonical execution statuses. Blocked and failed are never collapsed:
 *  a blocked run never attempted the model; a failed run did, and the
 *  model/runtime genuinely errored. */
export const STATUS = Object.freeze({
  READY: 'READY',
  GENERATED: 'GENERATED',
  BLOCKED_MODEL_UNAVAILABLE: 'BLOCKED_MODEL_UNAVAILABLE',
  BLOCKED_GPU_UNAVAILABLE: 'BLOCKED_GPU_UNAVAILABLE',
  BLOCKED_RUNTIME: 'BLOCKED_RUNTIME',
  BLOCKED_UNSUPPORTED_CAPABILITY: 'BLOCKED_UNSUPPORTED_CAPABILITY',
  FAILED_GENERATION: 'FAILED_GENERATION',
});

/** Every result this subsystem ever produces carries exactly these two
 *  classification tags — see the module header's architectural boundary. */
export const MEDIA_CLASS = 'GENERATED_MEDIA';
export const MEDIA_SCOPE = 'VISUALIZATION_ONLY';

/** Fields a caller must NEVER be able to set — any of these present on a
 *  raw control-input payload is treated as a scientific-state-promotion
 *  attempt and rejected outright, before anything else is validated. */
const FORBIDDEN_PROMOTION_FIELDS = Object.freeze([
  'evidenceEligible', 'scientificStateMutation', 'promoteToEvidence', 'evidenceProposal',
  'replayTruth', 'candidateIdentity', 'scienceRunResult', 'campaignResult',
  'wetLabClassification', 'clinicalClassification', 'worldGraphState', 'evidenceClass',
]);

export class ScientificStatePromotionRejected extends Error {
  constructor(field) {
    super(`Genesis Local AI-Video: control input attempted to set forbidden field "${field}" — generated media can never promote or mutate scientific state.`);
    this.name = 'ScientificStatePromotionRejected';
    this.field = field;
  }
}

/** Throws if the raw input attempts to smuggle in any scientific-state
 *  promotion. Call this BEFORE any other validation. */
export function assertNoScientificStatePromotion(rawInput) {
  if (rawInput === null || typeof rawInput !== 'object') return;
  for (const field of FORBIDDEN_PROMOTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawInput, field)) throw new ScientificStatePromotionRejected(field);
  }
}

/** Full SHA-256 hex digest (64 chars) — provenance-grade, never truncated. */
export function sha256Hex(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  return createHash('sha256').update(buf).digest('hex');
}

/** Deterministic key ordering so two structurally-equal inputs always
 *  fingerprint identically regardless of property insertion order. */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

/** SHA-256 of the canonicalized JSON form of a control input — the ONE
 *  "control-package fingerprint" every downstream provenance record uses.
 *  Equivalent inputs (same values, any key order) always produce the same
 *  fingerprint (test #16). */
export function computeControlFingerprint(controlInput) {
  return sha256Hex(JSON.stringify(canonicalize(controlInput)));
}

/** Optional reference fields. Absence is explicit: every one of these is
 *  always present on a normalized control input, as `null` when the
 *  caller did not supply it — never silently omitted, never manufactured. */
const OPTIONAL_REFERENCE_FIELDS = Object.freeze([
  'referenceImage', 'referenceVideo', 'depthReference', 'normalsReference',
  'segmentationReference', 'sourceRenderHash', 'deterministicSeed', 'cameraTrajectory',
  'cameraMetadata', 'entityIds', 'promptOrShotDescription', 'timingFps', 'durationSeconds',
  'modelConfiguration', 'outputLocation', 'controlPackageFingerprint',
]);

/**
 * Normalizes a raw control-input payload into the frozen, provider/model-
 * agnostic contract shape. Throws `ScientificStatePromotionRejected` first;
 * then validates required fields; then fills every optional reference
 * field explicitly (`null` when absent) — never manufactures a reference
 * the caller did not supply.
 */
export function normalizeControlInput(rawInput) {
  assertNoScientificStatePromotion(rawInput);
  if (rawInput === null || typeof rawInput !== 'object') {
    return { ok: false, error: 'invalid_input', reason: 'control input must be an object' };
  }
  const { capability, worldId, scenarioId, sourceScientificStateFingerprint } = rawInput;
  if (typeof capability !== 'string' || !ALLOWED_CAPABILITIES.has(capability)) {
    return { ok: false, error: 'unknown_capability', status: STATUS.BLOCKED_UNSUPPORTED_CAPABILITY, reason: `"${capability}" is not one of ${Object.values(CAPABILITY).join(', ')}` };
  }
  if (typeof worldId !== 'string' || worldId.trim().length === 0) {
    return { ok: false, error: 'world_id_required', reason: 'control input requires a real worldId' };
  }
  if (typeof sourceScientificStateFingerprint !== 'string' || sourceScientificStateFingerprint.trim().length === 0) {
    return { ok: false, error: 'source_scientific_state_fingerprint_required', reason: 'control input requires the canonical scientific-state fingerprint it visualizes' };
  }

  const normalized = {
    capability,
    worldId: worldId.trim(),
    scenarioId: typeof scenarioId === 'string' && scenarioId.trim() ? scenarioId.trim() : null,
    sourceScientificStateFingerprint: sourceScientificStateFingerprint.trim(),
  };
  for (const field of OPTIONAL_REFERENCE_FIELDS) {
    normalized[field] = field in rawInput && rawInput[field] !== undefined ? rawInput[field] : null;
  }
  normalized.controlPackageFingerprint = computeControlFingerprint({
    capability: normalized.capability,
    worldId: normalized.worldId,
    scenarioId: normalized.scenarioId,
    sourceScientificStateFingerprint: normalized.sourceScientificStateFingerprint,
    ...Object.fromEntries(OPTIONAL_REFERENCE_FIELDS.filter((f) => f !== 'controlPackageFingerprint').map((f) => [f, normalized[f]])),
  });
  return { ok: true, input: Object.freeze(normalized) };
}

export function isKnownCapability(capability) {
  return ALLOWED_CAPABILITIES.has(capability);
}

export function listSupportedCapabilities() {
  return Object.values(CAPABILITY);
}
