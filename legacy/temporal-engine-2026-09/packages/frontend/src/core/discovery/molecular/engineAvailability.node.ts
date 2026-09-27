import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { EngineAvailability, EngineAvailabilityMap, EngineId } from './engineRouter';

/**
 * REAL ENGINE AVAILABILITY PROBE (Node-only, see `rdkitTransport.node.ts` for
 * why this is a separate file).
 *
 * Availability is read from the repository's OWN adapters — the same
 * `detect()` functions `compute/capabilities.mjs` uses to decide whether a
 * capability is AVAILABLE or BLOCKED_BY_RUNTIME. Nothing here re-implements
 * detection, and nothing assumes an engine is present because it is mentioned
 * somewhere: an engine counts as available only when its own detector says so.
 */
const ADAPTERS: Readonly<Record<EngineId, string>> = {
  rdkit: 'rdkitAdapter.mjs',
  'admet-ai': 'admetAdapter.mjs',
  'autodock-vina': 'dockingAdapter.mjs',
  pyscf: 'qmAdapter.mjs',
  openmm: 'openmmAdapter.mjs',
  biopython: 'proteinAdapter.mjs',
};

function backendComputeDir(): string {
  return path.resolve(__dirname, '../../../../../backend/src/compute');
}

/**
 * Runs every adapter's real detect() in one short-lived Node process. Doing it
 * out-of-process keeps a failing or slow adapter from taking the caller down
 * with it, and mirrors how the backend itself probes optional runtimes.
 */
export function probeEngineAvailability(timeoutMs = 30_000): EngineAvailabilityMap {
  const entries = Object.entries(ADAPTERS) as [EngineId, string][];
  const script = `
    const out = {};
    for (const [id, file] of ${JSON.stringify(entries)}) {
      try {
        const mod = await import('./' + file);
        const d = mod.detect();
        out[id] = {
          engine: id,
          available: d.available === true,
          reason: d.available === true ? '' : String(d.reason ?? 'unavailable'),
          version: typeof d.version === 'string' ? d.version : null,
        };
      } catch (err) {
        out[id] = { engine: id, available: false, reason: 'adapter_load_failed: ' + String(err && err.message).slice(0, 120), version: null };
      }
    }
    process.stdout.write(JSON.stringify(out));
  `;

  try {
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: backendComputeDir(),
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(stdout) as Record<string, EngineAvailability>;
    return parsed;
  } catch (error) {
    // A probe that cannot run reports every engine unavailable WITH the real
    // reason — never an empty map that a caller might read as "all fine".
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    const fallback: Partial<Record<EngineId, EngineAvailability>> = {};
    for (const [id] of entries) {
      fallback[id] = { engine: id, available: false, reason: `engine probe failed: ${message.slice(0, 140)}`, version: null };
    }
    return fallback;
  }
}
