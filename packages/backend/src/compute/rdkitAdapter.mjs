/**
 * Adapter RDKit (Priority A/D) — most Node → prawdziwy silnik cheminformatyczny.
 *
 * RDKit to dojrzałe, walidowane oprogramowanie open-source. Uruchamiamy je przez
 * krótkotrwały proces `python3 rdkit_worker.py` (execFileSync), z twardym
 * limitem czasu i rozmiaru wejścia. Adapter NIGDY nie zmyśla wyniku: jeśli RDKit
 * nie jest zainstalowany w środowisku uruchomieniowym, `detect()` zwraca
 * `available:false`, a modele/przepływy oznaczają zdolność jako niedostępną.
 *
 * Uwaga wdrożeniowa: RDKit jest OPCJONALNĄ zależnością runtime (nie npm).
 * Zainstaluj: `pip install rdkit` (patrz requirements-compute.txt). Bez tego
 * podstawowa cheminformatyka (masa molowa ze wzoru) działa dalej; deskryptory
 * strukturalne z SMILES są wtedy niedostępne — jawnie, nie po cichu.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rdkit_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 10_000;

let detectCache = null;

/** Wywołuje worker z jednym poleceniem JSON; zwraca sparsowany wynik lub rzuca. */
function invoke(request) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

/**
 * Wykrywanie zdolności runtime. Cache'owane (proces detekcji jest kosztowny).
 * Zwraca { available, version?, reason? }. `reason` mówi DOKŁADNIE, czego brakuje.
 */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' });
    detectCache = r.ok
      ? { available: true, version: r.version, engine: `RDKit ${r.version}` }
      : { available: false, reason: r.error || 'rdkit_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/rdkit niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

/** Do testów: wyczyść cache detekcji. */
export function _resetDetect() {
  detectCache = null;
}

/**
 * Realne deskryptory molekularne z SMILES. Zwraca:
 *   { ok:true, data, engine }  — sukces,
 *   { ok:false, error }        — nieprawidłowy SMILES lub brak RDKit (BLOCKED_BY_RUNTIME).
 * Nie rzuca dla oczekiwanych błędów — zwraca jawny status.
 */
export function descriptors(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'descriptors', smiles: String(smiles ?? '') });
    return r.ok ? { ok: true, data: r.data, engine: r.engine } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Walidacja struktury SMILES przez RDKit (kanonizacja). */
export function validate(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'validate', smiles: String(smiles ?? '') });
    return r.ok ? { ok: true, canonicalSmiles: r.canonicalSmiles } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
