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

/**
 * Deterministyczna transformacja molekuły REAKCJĄ SMARTS (nie mutacja tekstu).
 * Zwraca kanoniczne SMILES produktów (unikalne, zwalidowane przez RDKit).
 */
export function transform(smiles, transformation) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'transform', smiles: String(smiles ?? ''), transformation });
    return r.ok
      ? { ok: true, parentCanonical: r.parentCanonical, products: r.products, transformation: r.transformation }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Realna geometria 3D z SMILES (dodanie H, osadzenie ETKDG deterministyczne,
 * optymalizacja MMFF/UFF). Zwraca atomy w Angstremach — wejście dla chemii
 * kwantowej. `{ ok, atoms:[{element,x,y,z}], forceField, charge, nAtoms }`.
 */
export function embed3d(smiles, seed = 42) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'embed3d', smiles: String(smiles ?? ''), seed }, 20_000);
    return r.ok
      ? { ok: true, atoms: r.atoms, forceField: r.forceField, charge: r.charge, nAtoms: r.nAtoms, canonicalSmiles: r.canonicalSmiles }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Lista dostępnych transformacji (id). */
export function listTransformations() {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'transformations' });
    return r.ok ? { ok: true, transformations: r.transformations } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Średni dystans Tanimoto (1−podobieństwo) na odciskach Morgana — miara różnorodności populacji. */
export function diversity(smilesList) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'diversity', smiles: Array.isArray(smilesList) ? smilesList.map(String) : [] });
    return r.ok ? { ok: true, meanPairwiseDistance: r.meanPairwiseDistance, n: r.n } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Synthetic accessibility (Ertl & Schuffenhauer 2009, RDKit Contrib SA_Score). */
export function saScore(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'sascore', smiles: String(smiles ?? '') });
    return r.ok ? { ok: true, saScore: r.saScore, engine: r.engine } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Structural alerts via RDKit FilterCatalog (PAINS + BRENK). Real SMARTS matching. */
export function structuralAlerts(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'alerts', smiles: String(smiles ?? '') });
    return r.ok ? { ok: true, alerts: r.alerts, nAlerts: r.nAlerts, engine: r.engine } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * REAL de novo molecular design via RDKit BRICS (fragment decomposition + recombination) and Murcko
 * scaffolds. mode: 'brics_build' (fragment growing/linking), 'scaffold_hop' (novel scaffolds only),
 * 'decompose', 'murcko'. Deterministic. Returns generated valid canonical SMILES + scaffolds.
 */
export function denovo(spec) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'denovo', mode: spec?.mode ?? 'brics_build', seeds: Array.isArray(spec?.seeds) ? spec.seeds.map(String) : [], count: spec?.count ?? 50, maxDepth: spec?.maxDepth ?? 3 }, 60_000);
    return r.ok ? { ok: true, mode: r.mode, generated: r.generated, fragments: r.fragments, scaffolds: r.scaffolds, nSeeds: r.nSeeds, nScaffolds: r.nScaffolds, engine: r.engine } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Max Tanimoto vs a reference set. maxTanimoto=null / nReference=0 → NOT ASSESSED. */
export function novelty(smiles, reference = []) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'novelty', smiles: String(smiles ?? ''), reference: Array.isArray(reference) ? reference.map(String) : [] });
    return r.ok ? { ok: true, maxTanimoto: r.maxTanimoto, nReference: r.nReference } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
