/**
 * Runtime scientific-environment audit (Priority 1) — Node side.
 *
 * Runs the real `env_probe.py` (import/version/binary probes, never inferred from
 * names) and returns { runtime, engines }. Persist via store.saveEnvAudit. The
 * probe itself is proof of process-execution support.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env_probe.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';

let cache = null;

/** Executes the runtime probe. Cached per process (probing spawns subprocesses). */
export function probeEnvironment({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  try {
    const out = execFileSync(PYTHON, [PROBE], {
      timeout: 60_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const r = JSON.parse(out);
    cache = r.ok ? { ok: true, runtime: r.runtime, engines: r.engines } : { ok: false, error: r.error ?? 'probe_failed' };
  } catch (err) {
    cache = { ok: false, error: `env_probe_unavailable: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return cache;
}

export function _resetProbe() { cache = null; }
