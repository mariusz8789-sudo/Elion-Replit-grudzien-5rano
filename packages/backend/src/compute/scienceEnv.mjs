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
import { resolvePythonExecutable } from './pythonRuntime.mjs';
import { redact } from '../redact.mjs';

const PROBE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env_probe.py');
const PYTHON = resolvePythonExecutable();

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
    // The failure text comes from a live spawn, so it carries the interpreter path and the probe
    // script path verbatim ("Command failed: /opt/…/python3 /app/…/env_probe.py"). It is returned
    // by the UNAUTHENTICATED GET /api/compute/environment, so it is path-redacted at the source —
    // the same rule campaign/toolchain.mjs already applies to its own adapter failure text.
    cache = { ok: false, error: redact(`env_probe_unavailable: ${String(err?.message ?? err).slice(0, 160)}`) };
  }
  return cache;
}

export function _resetProbe() { cache = null; }
