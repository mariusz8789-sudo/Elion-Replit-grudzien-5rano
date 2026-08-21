import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'openmm_worker.py');
const PYTHON = process.env.GENESIS_OPENMM_PYTHON ?? 'python3';
const TIMEOUT_MS = 180_000;
let detectCache = null;

function invoke(request) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout: TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    // One CPU thread is part of the verified reproducibility contract.
    env: { ...process.env, OPENMM_CPU_THREADS: '1' },
  });
  return JSON.parse(out);
}

export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' });
    detectCache = r.ok
      ? { available: true, version: r.version, platforms: r.platforms, pdbSha256: r.pdbSha256, engine: `OpenMM ${r.version} CPU` }
      : { available: false, reason: r.error || 'openmm_runtime_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `OpenMM runtime niedostępny: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

export function _resetDetect() {
  detectCache = null;
}

/** Real bounded OpenMM CPU reference MD run for public protein PDB 1VII. */
export function referenceBenchmark(steps) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference', steps });
    return r.ok ? { ok: true, data: r.data, engine: r.engine, provenance: r.provenance } : { ok: false, error: r.error || 'openmm_reference_failed' };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
