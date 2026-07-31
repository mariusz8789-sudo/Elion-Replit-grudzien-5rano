/**
 * Adapter Struktury Białka (Biopython) — most Node → realny parser PDB.
 *
 * Biopython (BSD) to dojrzała biblioteka bioinformatyczna. Uruchamiana przez
 * krótkotrwały proces `python3 protein_worker.py` (execFileSync). NIGDY nie
 * modyfikuje struktury po cichu: gdy potrzebne są decyzje przygotowawcze
 * (brakujące atomy, altloc, wiele modeli, heteroatomy), zwraca status
 * ADDITIONAL_INPUT_REQUIRED, aby użytkownik/kampania zatwierdzili strategię.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'protein_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 30_000;

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 15_000);
    detectCache = r.ok
      ? { available: true, version: r.version, engine: `Biopython ${r.version}` }
      : { available: false, reason: r.error || 'biopython_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/biopython niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

export function _resetDetect() { detectCache = null; }

/** Udokumentowany przypadek referencyjny (ingestia PDB 2×ALA). */
export function referenceCase() {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference' });
    return r.ok ? { ok: true, pass: r.pass, case: r.case, report: r.report, version: r.version } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Realna walidacja struktury z tekstu PDB. Zwraca raport (chains/residues/hetero/…). */
export function validatePdb(pdbText) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (typeof pdbText !== 'string' || pdbText.length < 20) return { ok: false, error: 'invalid_input', reason: 'tekst PDB wymagany' };
  try {
    const r = invoke({ cmd: 'validate', pdb: pdbText });
    return r.ok ? { ok: true, report: r.report, version: r.version } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
