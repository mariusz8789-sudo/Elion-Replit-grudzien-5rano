/**
 * Adapter ADMET + Toksyczność (ADMET-AI) — most Node → realny zespół D-MPNN
 * (Chemprop) wytrenowany na benchmarku Therapeutics Data Commons (TDC) ADMET
 * Benchmark Group. Swanson i in. 2024, "ADMET-AI: A machine learning platform
 * to predict ADMET properties" (Bioinformatics), licencja MIT. Wagi modelu są
 * dołączone w zainstalowanym pakiecie (bez sieci przy inferencji).
 *
 * Uruchamiane przez krótkotrwały proces `python3 admet_worker.py`
 * (execFileSync) z twardym limitem czasu. Adapter NIGDY nie zmyśla wyniku:
 * gdy admet-ai nie jest zainstalowany, `detect()` zwraca `available:false`, a
 * zdolność jest BLOCKED_BY_RUNTIME.
 *
 * KAŻDA predykcja to MODEL_ESTIMATE z probabilistycznego modelu ML — nigdy
 * dowód eksperymentalny, nigdy „SAFE"/„NON-TOXIC"/„CLINICALLY SAFE". Każdy
 * endpoint niesie własną, opublikowaną metrykę benchmarku TDC (AUROC/R²), by
 * rozmówca mógł ocenić wiarygodność i domenę stosowalności.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'admet_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 120_000; // pierwsze wywołanie ładuje model (~9 s); kolejne w tym samym procesie są szybsze

let detectCache = null;
let endpointsCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout,
    maxBuffer: 32 * 1024 * 1024, // 52 endpointy × wiele SMILES = spory JSON
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

/** Wykrywanie zdolności runtime. Cache'owane. { available, version?, reason? }. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 30_000);
    detectCache = r.ok
      ? { available: true, version: r.version, engine: `ADMET-AI ${r.version}` }
      : { available: false, reason: r.error || 'admet_ai_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/admet-ai niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

/** Do testów: wyczyść cache detekcji/endpointów. */
export function _resetDetect() {
  detectCache = null;
  endpointsCache = null;
}

/** Metadane wszystkich 52 endpointów (kategoria, typ zadania, jednostki, opublikowana metryka TDC). */
export function listEndpoints() {
  if (endpointsCache) return endpointsCache;
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'endpoints' }, 30_000);
    endpointsCache = r.ok ? { ok: true, endpoints: r.endpoints } : { ok: false, error: r.error };
    return endpointsCache;
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Udokumentowany przypadek referencyjny: aspiryna — wykonanie + determinizm + krzyżowa walidacja fizykochemiczna. */
export function referenceCase() {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference' });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, pass: r.pass, case: r.case, checks: r.checks, nEndpoints: r.nEndpoints, version: r.version, note: r.note };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Realne predykcje ADMET/toksyczności dla jednego lub wielu SMILES (limit 200
 * na wywołanie). Zwraca `{ ok, predictions: { [smiles]: { endpointId: value } } }`.
 * Każda wartość to MODEL_ESTIMATE; klasyfikacje są prawdopodobieństwami [0,1].
 */
export function predict(smilesList) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  const list = Array.isArray(smilesList) ? smilesList : [smilesList];
  if (list.length === 0) return { ok: false, error: 'invalid_input', reason: 'smiles wymagane' };
  if (list.length > 200) return { ok: false, error: 'invalid_input', reason: 'limit 200 SMILES na wywołanie' };
  try {
    const r = invoke({ cmd: 'predict', smiles: list.map(String) });
    return r.ok ? { ok: true, predictions: r.predictions, version: r.version } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
