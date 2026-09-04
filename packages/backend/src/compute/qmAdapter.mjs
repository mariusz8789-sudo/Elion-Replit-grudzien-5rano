/**
 * Adapter Chemii Kwantowej (PySCF) — most Node → realny silnik ab initio / DFT.
 *
 * PySCF to dojrzałe, otwarte oprogramowanie (Apache-2.0). Uruchamiamy je przez
 * krótkotrwały proces `qm_worker.py` (execFileSync) z twardym limitem czasu.
 * Ustaw `GENESIS_PYSCF_PYTHON` na odizolowany interpreter PySCF; historyczny
 * `GENESIS_PYTHON` pozostaje wyłącznie kompatybilnym fallbackiem. Adapter NIGDY
 * nie zmyśla wyniku: gdy PySCF nie jest zainstalowany,
 * `detect()` zwraca `available:false`, a zdolność jest BLOCKED_BY_RUNTIME.
 *
 * Kontrakt zweryfikowanego adaptera: DETECT → VERSION → VALIDATE_INPUT →
 * VALIDATE_DOMAIN → EXECUTE → CAPTURE_RAW → PARSE → NORMALIZE_UNITS →
 * (hash/provenance liczone wyżej) → VALIDATE_REFERENCE_CASE → REGISTER.
 *
 * Wynik to MODEL_ESTIMATE, nie dowód eksperymentalny. Wyniki semiempiryczne /
 * małobazowe NIE są równoważne wysokopoziomowym ab initio — metoda i baza są
 * zawsze raportowane.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'qm_worker.py');
const PYTHON = process.env.GENESIS_PYSCF_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 120_000; // QM bywa kosztowne; twardy limit chroni serwer

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

/** Wykrywanie zdolności runtime. Cache'owane. { available, version?, reason? }. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 30_000);
    detectCache = r.ok
      ? { available: true, version: r.version, engine: `PySCF ${r.version}` }
      : { available: false, reason: r.error || 'pyscf_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/pyscf niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

/** Do testów: wyczyść cache detekcji. */
export function _resetDetect() {
  detectCache = null;
}

/** Wykonuje udokumentowany przypadek referencyjny (H2 RHF/STO-3G). */
export function referenceCase() {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference' }, 30_000);
    if (!r.ok) return { ok: false, error: r.error };
    const pass = r.converged && Math.abs(r.energyHartree - r.expected) <= r.tol;
    return { ok: true, pass, case: r.case, energyHartree: r.energyHartree, expected: r.expected, tol: r.tol, version: r.version };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Realne obliczenie single-point (energia, HOMO/LUMO, dipol) dla geometrii 3D.
 * `spec`: { atoms:[{element,x,y,z}], charge?, spin?, basis?, method?, xc? }.
 * Geometria w Angstremach. Zwraca { ok, data, meta } lub jawny błąd.
 */
export function singlePoint(spec) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (!spec || !Array.isArray(spec.atoms) || spec.atoms.length === 0) {
    return { ok: false, error: 'invalid_input', reason: 'atoms[] wymagane (geometria 3D w Å)' };
  }
  try {
    const r = invoke({
      cmd: 'singlepoint',
      atoms: spec.atoms,
      charge: spec.charge ?? 0,
      spin: spec.spin ?? 0,
      basis: spec.basis ?? 'sto-3g',
      method: spec.method ?? 'RHF',
      xc: spec.xc ?? 'b3lyp',
    });
    return r.ok ? { ok: true, data: r.data, meta: r.meta } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
