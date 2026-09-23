/**
 * Genesis Local AI-Video — engine (STAGE A + preparation for STAGE B).
 *
 * A thin, provider/model-agnostic execution pipeline over a local-first
 * AI-video generation adapter. This module does NOT contain a model, a
 * GPU kernel, or a network client for a paid provider — it defines the
 * CONTRACT a real local adapter (OpenSora, AnimateDiff, SVD, ComfyUI
 * workflow, whatever ships in STAGE B) must satisfy, validates a request
 * against it, and turns a real result into immutable, hashed provenance.
 *
 * Pipeline (PRE-EXECUTION):
 *   1. reject any scientific-state-promotion attempt + validate the
 *      control contract          -> videoControlContract.mjs
 *   2. validate the capability    -> videoControlContract.mjs
 *   3. discover runtime           -> localVideoRuntime.mjs
 *   4. verify the selected model exists locally -> injected modelRegistry
 *   5. verify required device/runtime support
 *   6. verify required input references are present
 *
 * Pipeline (POST-EXECUTION):
 *   1. confirm the output file genuinely exists
 *   2. compute its real SHA-256
 *   3. capture model/runtime metadata
 *   4. build an immutable provenance record
 *   5. preserve source/control fingerprints
 *   6. the record is structurally incapable of mutating scientific state
 *      (evidenceEligible/scientificStateMutation are hardcoded false)
 *
 * The low-level generation call is dependency-injected (`runner.generate`)
 * so a real local model adapter can be attached later without touching
 * this file. Nothing here ever fabricates a GENERATED result: every
 * BLOCKED_* / FAILED_GENERATION path is reached honestly, and GENERATED
 * is only ever returned once a real output file has been hashed.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  CAPABILITY, STATUS, MEDIA_CLASS, MEDIA_SCOPE,
  normalizeControlInput, isKnownCapability, sha256Hex,
  ScientificStatePromotionRejected,
} from './videoControlContract.mjs';
import { detectRuntime } from './localVideoRuntime.mjs';

export { CAPABILITY, STATUS, MEDIA_CLASS, MEDIA_SCOPE };

/** Which optional reference field(s) a capability requires at least one
 *  of. `TEXT_TO_VIDEO` requires only a shot description; the others need
 *  a real reference input a caller supplied — never manufactured. */
const REQUIRED_REFERENCES_BY_CAPABILITY = Object.freeze({
  [CAPABILITY.TEXT_TO_VIDEO]: [['promptOrShotDescription']],
  [CAPABILITY.IMAGE_TO_VIDEO]: [['referenceImage']],
  [CAPABILITY.VIDEO_TO_VIDEO]: [['referenceVideo']],
  [CAPABILITY.FRAME_ENHANCEMENT]: [['referenceImage', 'referenceVideo']],
  [CAPABILITY.TEMPORAL_UPSCALE]: [['referenceVideo']],
});

function missingRequiredReference(normalizedInput) {
  const groups = REQUIRED_REFERENCES_BY_CAPABILITY[normalizedInput.capability] ?? [];
  for (const anyOf of groups) {
    if (!anyOf.some((field) => normalizedInput[field] !== null && normalizedInput[field] !== undefined)) {
      return `capability "${normalizedInput.capability}" requires at least one of: ${anyOf.join(', ')}`;
    }
  }
  return null;
}

/**
 * IN-MEMORY MODEL REGISTRY — provider/model-agnostic. Empty by default:
 * with nothing registered, every plan honestly resolves to
 * BLOCKED_MODEL_UNAVAILABLE, exactly as this STAGE A branch requires (no
 * model is downloaded or bundled here). A future local adapter registers
 * itself with `registerLocalModel`; Codex/STAGE B wires the real one.
 */
export function createModelRegistry() {
  const models = new Map();
  const key = (capability, modelId) => `${capability}::${modelId ?? '*'}`;
  return {
    registerLocalModel({ capability, modelId, version = null, checkpointFingerprint = null, requiresPython = true, requiresDevice = 'gpu' }) {
      if (!isKnownCapability(capability)) throw new Error(`cannot register a model for unknown capability "${capability}"`);
      models.set(key(capability, modelId), { capability, modelId, version, checkpointFingerprint, requiresPython, requiresDevice });
      // Also index under the capability wildcard so a caller who did not
      // request a specific modelId can still resolve the registered one.
      if (!models.has(key(capability, undefined))) models.set(key(capability, undefined), { capability, modelId, version, checkpointFingerprint, requiresPython, requiresDevice });
    },
    resolveModel({ capability, modelId }) {
      const exact = models.get(key(capability, modelId));
      if (exact) return { exists: true, ...exact };
      const wildcard = modelId ? null : models.get(key(capability, undefined));
      if (wildcard) return { exists: true, ...wildcard };
      return { exists: false };
    },
    listRegistered() { return [...models.values()]; },
  };
}

/** Shared empty registry for callers who do not inject their own — every
 *  capability is honestly BLOCKED_MODEL_UNAVAILABLE against it. */
const DEFAULT_EMPTY_REGISTRY = createModelRegistry();

/**
 * PRE-EXECUTION validation + planning. Never calls a model. Returns
 * `{ ok:true, status: 'READY', input, runtime, model }` or
 * `{ ok:false, status, reason }` / `{ ok:false, error, reason }`.
 */
export function planGeneration(rawInput, { runtime = null, modelRegistry = DEFAULT_EMPTY_REGISTRY } = {}) {
  let normalized;
  try {
    const n = normalizeControlInput(rawInput);
    if (!n.ok) {
      return n.status
        ? { ok: false, status: n.status, error: n.error, reason: n.reason }
        : { ok: false, error: n.error, reason: n.reason };
    }
    normalized = n.input;
  } catch (err) {
    if (err instanceof ScientificStatePromotionRejected) {
      return { ok: false, error: 'scientific_state_promotion_rejected', reason: err.message };
    }
    throw err;
  }

  if (!isKnownCapability(normalized.capability)) {
    return { ok: false, status: STATUS.BLOCKED_UNSUPPORTED_CAPABILITY, reason: `"${normalized.capability}" is not a supported capability` };
  }

  const missingRef = missingRequiredReference(normalized);
  if (missingRef !== null) {
    return { ok: false, error: 'missing_required_reference', reason: missingRef };
  }

  const detectedRuntime = runtime ?? detectRuntime();

  const modelId = normalized.modelConfiguration?.modelId ?? null;
  const model = modelRegistry.resolveModel({ capability: normalized.capability, modelId });
  if (!model.exists) {
    return {
      ok: false, status: STATUS.BLOCKED_MODEL_UNAVAILABLE,
      reason: `no local model is registered for capability "${normalized.capability}"${modelId ? ` / modelId "${modelId}"` : ''} — no model was downloaded or bundled by this branch`,
    };
  }

  const requestedDevice = normalized.modelConfiguration?.device ?? model.requiresDevice ?? 'gpu';
  if (requestedDevice === 'gpu' && detectedRuntime.gpu?.available !== true) {
    return { ok: false, status: STATUS.BLOCKED_GPU_UNAVAILABLE, reason: 'the selected model requires a GPU device, and this runtime honestly reports none available' };
  }

  if (model.requiresPython !== false && detectedRuntime.python?.available !== true) {
    return { ok: false, status: STATUS.BLOCKED_RUNTIME, reason: 'the selected model requires a local Python runtime, and this runtime honestly reports none available' };
  }

  return { ok: true, status: STATUS.READY, input: normalized, runtime: detectedRuntime, model };
}

function referenceHashes(normalizedInput) {
  const out = {};
  for (const field of ['referenceImage', 'referenceVideo', 'depthReference', 'normalsReference', 'segmentationReference', 'sourceRenderHash']) {
    const value = normalizedInput[field];
    out[field] = typeof value === 'string' && value.length > 0 ? sha256Hex(value) : null;
  }
  return out;
}

function baseRecord({ input, model, runtime, status, reason = null, durationMs = 0, testOnly = false }) {
  return {
    executionId: randomUUID(),
    createdAt: new Date().toISOString(),
    capability: input?.capability ?? null,
    modelId: model?.modelId ?? null,
    modelVersion: model?.version ?? null,
    modelCheckpointFingerprint: model?.checkpointFingerprint ?? null,
    runtimeDevice: runtime?.gpu?.available ? 'gpu' : 'cpu',
    seed: input?.deterministicSeed ?? null,
    generationConfiguration: input?.modelConfiguration ?? null,
    sourceScientificStateFingerprint: input?.sourceScientificStateFingerprint ?? null,
    controlPackageFingerprint: input?.controlPackageFingerprint ?? null,
    inputReferenceHashes: input ? referenceHashes(input) : {},
    outputPath: null,
    outputSha256: null,
    status,
    reason,
    limitations: [],
    durationMs,
    mediaClass: MEDIA_CLASS,
    mediaScope: MEDIA_SCOPE,
    evidenceEligible: false,
    scientificStateMutation: false,
    testOnly,
  };
}

function blockedOrFailedResult(plan, status, reason, durationMs = 0, testOnly = false) {
  return { ok: false, record: baseRecord({ input: plan.input ?? null, model: plan.model ?? null, runtime: plan.runtime ?? null, status, reason, durationMs, testOnly }) };
}

/**
 * FULL EXECUTION: plan -> (if READY) invoke the injected runner -> verify
 * the real output file -> hash it -> return immutable provenance.
 *
 * `runner` must expose `generate({ capability, controlInput, model, runtime })`
 * returning (sync or async) `{ ok: true, outputPath, testOnly? }` or
 * `{ ok: false, reason }`. No runner is attached by default: without one,
 * a READY plan honestly resolves to BLOCKED_RUNTIME rather than a
 * fabricated result.
 */
export async function executeGeneration(rawInput, { runner = null, runtime = null, modelRegistry = DEFAULT_EMPTY_REGISTRY } = {}) {
  const plan = planGeneration(rawInput, { runtime, modelRegistry });
  if (!plan.ok) {
    if (plan.status) return blockedOrFailedResult(plan, plan.status, plan.reason);
    return { ok: false, record: null, error: plan.error, reason: plan.reason };
  }

  if (runner === null || typeof runner.generate !== 'function') {
    return blockedOrFailedResult(plan, STATUS.BLOCKED_RUNTIME, 'no generation runner is attached in this branch — Stage A ships the contract only, never a fabricated result');
  }

  const t0 = Date.now();
  let raw;
  try {
    raw = await runner.generate({ capability: plan.input.capability, controlInput: plan.input, model: plan.model, runtime: plan.runtime });
  } catch (err) {
    return blockedOrFailedResult(plan, STATUS.FAILED_GENERATION, `runner threw: ${String(err?.message ?? err).slice(0, 200)}`, Date.now() - t0);
  }
  const durationMs = Date.now() - t0;

  if (!raw || raw.ok !== true) {
    return blockedOrFailedResult(plan, STATUS.FAILED_GENERATION, raw?.reason ?? 'generation failed for an unspecified reason', durationMs, raw?.testOnly === true);
  }

  if (typeof raw.outputPath !== 'string' || !existsSync(raw.outputPath)) {
    return blockedOrFailedResult(plan, STATUS.FAILED_GENERATION, 'runner reported success but no output file exists at the declared path — never trusted without verification', durationMs, raw.testOnly === true);
  }
  const stat = statSync(raw.outputPath);
  if (stat.size === 0) {
    return blockedOrFailedResult(plan, STATUS.FAILED_GENERATION, 'output file exists but is empty', durationMs, raw.testOnly === true);
  }

  const outputSha256 = sha256Hex(readFileSync(raw.outputPath));
  const record = baseRecord({ input: plan.input, model: plan.model, runtime: plan.runtime, status: STATUS.GENERATED, durationMs, testOnly: raw.testOnly === true });
  record.outputPath = raw.outputPath;
  record.outputSha256 = outputSha256;
  record.limitations = Array.isArray(raw.limitations) ? raw.limitations.slice(0, 50) : [];
  if (raw.testOnly === true) record.limitations = [...record.limitations, 'This result was produced by a TEST-ONLY injected runner, never a real local AI-video model. It must never be reported as real generation.'];

  return { ok: true, record };
}

/**
 * TEST-ONLY injected runner. Writes a tiny REAL file to disk (so the
 * "confirm the output file exists" + hashing steps are genuinely
 * exercised) and marks every result `testOnly: true`. Never call this
 * from anything other than this module's own test suite — a caller must
 * never present its output as real AI-video generation.
 */
export function createTestOnlyRunner({ behavior = 'succeed', writeFile } = {}) {
  return {
    testOnly: true,
    async generate({ capability }) {
      if (behavior === 'fail') return { ok: false, reason: `test-only runner: forced failure for capability "${capability}"`, testOnly: true };
      if (behavior === 'no-output') return { ok: true, outputPath: '/nonexistent/genesis-test-only-output.mp4', testOnly: true };
      const outputPath = writeFile();
      return { ok: true, outputPath, testOnly: true, limitations: ['test-only deterministic stub output, not a real video model result'] };
    },
  };
}
