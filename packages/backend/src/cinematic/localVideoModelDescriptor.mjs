/**
 * Genesis Local AI-Video — Stage-B model descriptor (Claude Stage-B branch).
 *
 * ONE shared, explicit description of a real local model, used to build
 * BOTH:
 *   - the entry you pass to the EXISTING, unmodified
 *     `createModelRegistry().registerLocalModel(...)` (genesisVideoEngine.mjs)
 *   - the config you pass to THIS branch's
 *     `createLocalWorkerAdapter(...)` (localVideoWorkerAdapter.mjs)
 *
 * so the two never drift out of sync (same modelId, same
 * checkpointFingerprint, same device/capability requirements) even though
 * they are configured in two different places by design (the registry
 * answers "does this model exist for planning purposes"; the adapter
 * answers "how do I actually run it").
 *
 * `validateModelDescriptor` never admits a model whose checkpoint is not
 * physically present and verified — an absent or unverifiable checkpoint
 * fails validation outright, so nothing downstream can ever register or
 * run against it.
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const REQUIRED_FIELDS = Object.freeze([
  'capability', 'modelId', 'version', 'checkpointFingerprint', 'checkpointPath',
  'requiresDevice', 'requiresPython', 'requiresPackages', 'requiredAccelerator',
  'supportedResolutions', 'supportedDurationSeconds', 'supportedFps',
  'vramRequirementMb', 'limitations',
]);
/** `requiredAccelerator: null` is a legitimate value — it means "no
 *  specific accelerator required" (mirrors createModelRegistry's own
 *  default). Every other required field treats `null` as absent. */
const NULLABLE_FIELDS = Object.freeze(new Set(['requiredAccelerator']));

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Validates a raw descriptor AND verifies its checkpoint is physically
 * present and matches the declared fingerprint. Returns
 * `{ ok:true, descriptor }` or `{ ok:false, error, missingFields?, reason? }`.
 * `checkpointRoot`, when given, additionally refuses a checkpointPath that
 * resolves outside it (the same approved-root discipline the adapter itself
 * enforces at generation time).
 */
export function validateModelDescriptor(raw, { checkpointRoot = null, verifyHash = true } = {}) {
  if (raw === null || typeof raw !== 'object') return { ok: false, error: 'invalid_descriptor' };
  const missingFields = REQUIRED_FIELDS.filter((f) => {
    if (!(f in raw) || raw[f] === undefined) return true;
    return raw[f] === null && !NULLABLE_FIELDS.has(f);
  });
  if (missingFields.length > 0) return { ok: false, error: 'missing_required_fields', missingFields };

  if (!/^[a-f0-9]{64}$/i.test(raw.checkpointFingerprint)) {
    return { ok: false, error: 'invalid_checkpoint_fingerprint', reason: 'checkpointFingerprint must be a 64-hex-char SHA-256 digest' };
  }

  if (checkpointRoot !== null) {
    const resolvedRoot = path.resolve(checkpointRoot);
    const resolvedCheckpoint = path.resolve(resolvedRoot, path.isAbsolute(raw.checkpointPath) ? path.relative(resolvedRoot, raw.checkpointPath) : raw.checkpointPath);
    if (!resolvedCheckpoint.startsWith(resolvedRoot + path.sep)) {
      return { ok: false, error: 'checkpoint_outside_approved_root', reason: `"${raw.checkpointPath}" does not resolve inside "${checkpointRoot}"` };
    }
  }

  if (!existsSync(raw.checkpointPath) || !statSync(raw.checkpointPath).isFile()) {
    return { ok: false, error: 'checkpoint_not_present', reason: `no real checkpoint file at "${raw.checkpointPath}" — a model cannot be admitted without a physically present checkpoint` };
  }

  if (verifyHash) {
    const actual = sha256File(raw.checkpointPath);
    if (actual.toLowerCase() !== raw.checkpointFingerprint.toLowerCase()) {
      return { ok: false, error: 'checkpoint_hash_mismatch', reason: `expected ${raw.checkpointFingerprint}, got ${actual}` };
    }
  }

  return { ok: true, descriptor: Object.freeze({ ...raw }) };
}

/** Projects a validated descriptor onto exactly the fields
 *  `createModelRegistry().registerLocalModel(...)` accepts — nothing more,
 *  nothing invented. */
export function toRegistryDescriptor(descriptor) {
  const { capability, modelId, version, checkpointFingerprint, requiresPython, requiresDevice, requiresPackages, requiredAccelerator } = descriptor;
  return { capability, modelId, version, checkpointFingerprint, requiresPython, requiresDevice, requiresPackages, requiredAccelerator };
}

/** Projects a validated descriptor onto exactly the fields
 *  `createLocalWorkerAdapter(...)` needs, plus the caller-supplied
 *  operational config (roots, worker script, timeout) it cannot know on
 *  its own. */
export function toAdapterConfig(descriptor, { approvedModelsRoot, outputRoot, workerScript, pythonExecutable, timeoutMs, device } = {}) {
  return {
    modelId: descriptor.modelId,
    checkpointPath: descriptor.checkpointPath,
    checkpointFingerprint: descriptor.checkpointFingerprint,
    approvedModelsRoot,
    outputRoot,
    workerScript,
    pythonExecutable,
    timeoutMs,
    device: device ?? (descriptor.requiresDevice === 'gpu' ? 'auto' : 'cpu'),
  };
}

export function requiredDescriptorFields() {
  return REQUIRED_FIELDS.slice();
}
