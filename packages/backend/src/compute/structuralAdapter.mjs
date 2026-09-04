import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'structural_worker.py');
const PYTHON = process.env.GENESIS_BIOPYTHON_PYTHON ?? process.env.GENESIS_RDKIT_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 15_000;

let detectCache = null;

function invoke(request) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout: TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: process.env,
  });
  return JSON.parse(out);
}

/**
 * Detects the real structural-comparison runtime and the manifest PDB artifacts.
 * No local PDB coordinates means unavailable capability, never a synthetic result.
 */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' });
    detectCache = r.ok
      ? { available: true, version: r.version, artifacts: r.artifacts, engine: `Biopython ${r.version}` }
      : { available: false, reason: r.error || 'structural_runtime_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `Biopython/PDB runtime niedostępny: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

export function _resetDetect() {
  detectCache = null;
}

/** Real C-alpha RMSD structural comparison for the fixed public 5GHW↔4G6F pair. */
export function compare10e8Mper(referencePdb, mobilePdb) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'compare10e8Mper', referencePdb, mobilePdb });
    return r.ok
      ? { ok: true, data: r.data, engine: r.engine, provenance: r.provenance }
      : { ok: false, error: r.error || 'comparison_failed' };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
