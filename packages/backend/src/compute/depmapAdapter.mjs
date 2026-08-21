/**
 * Adapter DepMap 24Q2: Node → read-only worker na wersjonowanych danych CRISPR.
 *
 * Runtime jest AVAILABLE wyłącznie, gdy `GENESIS_DEPMAP_24Q2_DATA_DIR` wskazuje
 * kompletny zestaw plików o oczekiwanych SHA-256. Brak, podmiana lub niepełne dane
 * dają DATA_REQUIRED; adapter nigdy nie podstawia wyniku referencyjnego.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'depmap_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 60_000;

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const output = execFileSync(PYTHON, [WORKER], {
    input: JSON.stringify(request),
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  return JSON.parse(output);
}

/** Returns DATA_REQUIRED unless all source artefacts are present and hash-verified. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const result = invoke({ cmd: 'detect' }, 60_000);
    detectCache = result.ok
      ? { available: true, version: result.version, engine: result.engine, datasetDoi: result.datasetDoi }
      : { available: false, reason: result.error ?? 'depmap_data_unavailable' };
  } catch (error) {
    detectCache = {
      available: false,
      reason: `DepMap data runtime unavailable: ${String(error?.message ?? error).slice(0, 180)}`,
    };
  }
  return detectCache;
}

/** Test helper / runtime refresh. */
export function _resetDetect() {
  detectCache = null;
}

/** Executes the one declared, read-only real-data panel; does not accept arbitrary paths or gene lists. */
export function senescenceCellCyclePanel() {
  const runtime = detect();
  if (!runtime.available) return { ok: false, error: 'DATA_REQUIRED', reason: runtime.reason };
  try {
    const result = invoke({ cmd: 'senescence_panel' });
    return result.ok
      ? { ok: true, data: result.data, version: runtime.version, engine: runtime.engine }
      : { ok: false, error: result.error ?? 'depmap_execution_failed', reason: result.reason };
  } catch (error) {
    return { ok: false, error: 'execution_failed', reason: String(error?.message ?? error).slice(0, 180) };
  }
}
