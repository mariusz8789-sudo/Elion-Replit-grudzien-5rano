/**
 * Adapter CMS Open Data — Z→μμ 2011 (rekord 5208, CC0).
 *
 * Wyłącznie read-only. Oblicza statystyki opisowe masy niezmienniczej dimuon
 * z oficjalnego, checksumowo zweryfikowanego CSV. Nie symuluje detektora,
 * nie rekonstruuje zdarzeń i nie generuje syntetycznych wyników.
 *
 * Dataset: https://opendata.cern.ch/record/5208
 * Licencja: CC0 1.0 Universal
 * SHA-256: 7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cms_zmumu_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 60_000;

// Config default only — never touches the science worker or its logic.
// The real, checksum-pinned CSV is already committed at this exact path
// (see docs/DECISIONS.md D-051). If the operator has set
// GENESIS_CERN_OPEN_DATA_DIR explicitly, that value always wins; this only
// fills the gap so a fresh deployment does not have to be told where its
// own committed data lives. `detect()` still verifies the SHA-256 before
// ever calling this "available" — a wrong or tampered path fails honestly.
if (!process.env.GENESIS_CERN_OPEN_DATA_DIR || process.env.GENESIS_CERN_OPEN_DATA_DIR.trim() === '') {
  process.env.GENESIS_CERN_OPEN_DATA_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/cms-zmumu';
}

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

/**
 * Returns AVAILABLE only when the CSV file is present and SHA-256 matches.
 * DATA_REQUIRED otherwise — never substitutes a synthetic result.
 */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const result = invoke({ cmd: 'detect' }, 30_000);
    detectCache = result.ok
      ? { available: true, version: result.version, engine: result.engine, doi: result.doi }
      : { available: false, reason: result.error ?? 'cms_zmumu_data_unavailable' };
  } catch (error) {
    detectCache = {
      available: false,
      reason: `CMS Z→μμ runtime unavailable: ${String(error?.message ?? error).slice(0, 180)}`,
    };
  }
  return detectCache;
}

export function _resetDetect() {
  detectCache = null;
}

/**
 * Read-only descriptive statistics of the invariant-mass distribution.
 * The selection bias (Z-enriched, 60–120 GeV) is preserved in provenance.
 */
export function zMuMuInvariantMassStats() {
  const runtime = detect();
  if (!runtime.available) return { ok: false, error: 'DATA_REQUIRED', reason: runtime.reason };
  try {
    const result = invoke({ cmd: 'zmumu_stats' });
    return result.ok
      ? { ok: true, data: result.data, version: runtime.version, engine: runtime.engine }
      : { ok: false, error: result.error ?? 'cms_zmumu_execution_failed', reason: result.reason };
  } catch (error) {
    return { ok: false, error: 'execution_failed', reason: String(error?.message ?? error).slice(0, 180) };
  }
}
