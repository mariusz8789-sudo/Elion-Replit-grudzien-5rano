/**
 * Shared provenance primitives for the Scientific Reproducibility milestone
 * (Priority B). One canonical hashing implementation, reused everywhere a
 * Scientific Run needs an input/output/environment fingerprint — replacing
 * the ad hoc `sha16` copies that had drifted across campaign/multiFidelity.mjs,
 * campaign/orchestrator.mjs, and the docking worker.
 *
 * `sha256Hex16` is BYTE-IDENTICAL to the pre-existing local implementations
 * (sha256 of plain JSON.stringify, truncated to 16 hex chars) so centralizing
 * it does not change any previously-computed hash. `canonicalHash` is a NEW,
 * stricter primitive (full sha256, keys sorted recursively so hash stability
 * does not depend on object-construction order) for new provenance records
 * (environment snapshots, verification reports) that have no legacy hashes
 * to preserve.
 */
import { createHash } from 'node:crypto';
import { probeEnvironment } from './compute/scienceEnv.mjs';

/** Recursively sorts object keys so JSON.stringify is stable regardless of construction order. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

/** Pre-existing hash primitive (sha256 of plain JSON.stringify, first 16 hex chars). Unchanged output. */
export function sha256Hex16(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
}

/** Full sha256 hex over a key-sorted canonical JSON serialization. For new provenance records. */
export function canonicalHash(obj) {
  return createHash('sha256').update(JSON.stringify(sortKeys(obj))).digest('hex');
}

/**
 * Largest relative difference between shared numeric leaves of two objects
 * (recursing into nested plain objects; arrays and non-numeric leaves are
 * ignored). Returns 0 for identical numbers, Infinity if no numeric leaf is
 * shared (nothing comparable). Used by replay verification to distinguish
 * genuine numerical drift from floating-point noise that is a MEASURED,
 * documented property of a real engine (e.g. batch-composition sensitivity
 * in neural-network inference — see campaign/verify.mjs) — never used to
 * paper over an actually-different result.
 */
export function maxRelativeDiff(a, b) {
  let max = -1;
  let compared = 0;
  function walk(x, y) {
    if (typeof x === 'number' && typeof y === 'number') {
      compared += 1;
      const denom = Math.abs(x) > 1e-9 ? Math.abs(x) : 1;
      const rel = Math.abs(x - y) / denom;
      if (rel > max) max = rel;
      return;
    }
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x) && !Array.isArray(y)) {
      for (const k of Object.keys(x)) if (k in y) walk(x[k], y[k]);
    }
  }
  walk(a, b);
  return compared === 0 ? Infinity : max;
}

/**
 * Environment fingerprint for a Scientific Run: the same real runtime probe
 * used by the toolchain registry (cached per process — probing spawns
 * subprocesses), reduced to a canonical hash. Two runs on an unchanged
 * runtime hash identically; a hash change is real evidence the environment
 * (engine versions, Python, OS) changed between runs.
 */
export function snapshotEnvironment() {
  const probe = probeEnvironment();
  if (!probe.ok) return { ok: false, error: probe.error };
  const snapshot = { runtime: probe.runtime, engines: probe.engines };
  return { ok: true, snapshot, hash: canonicalHash(snapshot) };
}
