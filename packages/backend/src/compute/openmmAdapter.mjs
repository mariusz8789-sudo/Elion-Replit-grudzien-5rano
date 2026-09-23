import { detectOpenMmRuntime, invokeOpenMm, resetOpenMmRuntimeDetection } from './openmmRuntime.mjs';
const WORKER = 'openmm_worker.py';

export function detect() {
  return detectOpenMmRuntime(WORKER);
}

export function _resetDetect() {
  resetOpenMmRuntimeDetection(WORKER);
}

/** Real bounded OpenMM CPU reference MD run for public protein PDB 1VII. */
export function referenceBenchmark(steps) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invokeOpenMm(WORKER, { cmd: 'reference', steps });
    return r.ok ? { ok: true, data: r.data, engine: r.engine, provenance: r.provenance } : { ok: false, error: r.error || 'openmm_reference_failed' };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
