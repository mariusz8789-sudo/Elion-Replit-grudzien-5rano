/**
 * Adapter Dynamiki Molekularnej (OpenMM) — most Node → realny silnik MD.
 *
 * OpenMM to dojrzałe, otwarte oprogramowanie (MIT/LGPL). Uruchamiamy je przez
 * krótkotrwały proces `python3 md_worker.py` (execFileSync) z twardym limitem
 * czasu. Adapter NIGDY nie zmyśla wyniku: gdy OpenMM nie jest zainstalowany,
 * `detect()` zwraca `available:false`, a zdolność jest BLOCKED_BY_RUNTIME.
 *
 * Krótka trajektoria walidacyjna NIE mówi nic o stabilności biologicznej — to
 * walidacja integracji oprogramowania. Wynik to MODEL_ESTIMATE.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'md_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 180_000; // MD bywa kosztowne; twardy limit chroni serwer

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

/** Wykrywanie zdolności runtime. Cache'owane. { available, version?, platforms?, reason? }. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 30_000);
    detectCache = r.ok
      ? { available: true, version: r.version, platforms: r.platforms, engine: `OpenMM ${r.version}` }
      : { available: false, reason: r.error || 'openmm_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/openmm niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

/** Do testów: wyczyść cache detekcji. */
export function _resetDetect() {
  detectCache = null;
}

/**
 * Udokumentowany przypadek referencyjny: pudełko wody TIP3P, minimalizacja +
 * krótkie NVT. Zwraca realne energie i temperaturę + flagę pass (spadek energii
 * na minimalizacji i T w zakresie 150-450 K). `steps` opcjonalne (100-5000).
 */
export function referenceCase({ steps = 300 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference', steps });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, pass: r.pass, case: r.case, data: r.data, platform: r.platform, version: r.version, expectation: r.expectation };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * NVE (Verlet, no thermostat) total-energy-conservation check — the standard
 * MD-engine QA test. Ground truth is a physical law (energy conservation in
 * an isolated Hamiltonian system), not a recalled literature number.
 * Returns real drift; `pass` is true when relative drift < 2%.
 */
export function energyConservationCase({ steps = 1000 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'energy_conservation', steps }, TIMEOUT_MS);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, pass: r.pass, case: r.case, data: r.data, platform: r.platform, version: r.version, law: r.law };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Force-field evaluation determinism: identical input configuration must
 * yield the same potential energy within a tight relative tolerance
 * (bit-exactness is not guaranteed by PME/FFT implementations even
 * single-threaded — a measured, documented limitation, not an engine bug).
 */
export function forceFieldDeterminismCase({ boxNm = 2.2 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'force_field_determinism', boxNm }, 60_000);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, pass: r.pass, case: r.case, data: r.data, version: r.version, law: r.law };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
