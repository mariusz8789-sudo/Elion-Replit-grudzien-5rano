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
 * Skonfiguruj `GENESIS_RDKIT_PYTHON` do odizolowanego interpretera z RDKit
 * (np. Conda `genesis-rdkit`). Bez tego
 * podstawowa cheminformatyka (masa molowa ze wzoru) działa dalej; deskryptory
 * strukturalne z SMILES są wtedy niedostępne — jawnie, nie po cichu.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rdkit_worker.py');
const PYTHON = process.env.GENESIS_RDKIT_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
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

/**
 * REALNY panel liability/drug-likeness z RDKit (D-074): QED, alerty
 * strukturalne PAINS/BRENK/NIH (FilterCatalog), reguły Lipinskiego i Vebera.
 *
 * To NIE jest predykcja ADMET/toksyczności i nie zastępuje `admetAdapter.mjs`
 * — to opublikowane, deterministyczne reguły strukturalne liczone przez sam
 * RDKit. Ten sam silnik co `descriptors()`, nowa komenda workera, zero nowych
 * zależności i zero zmyślonej biologii.
 */
export function liabilities(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'liabilities', smiles: String(smiles ?? '') });
    return r.ok
      ? { ok: true, data: r.data, engine: r.engine, catalogs: r.catalogs, canonicalSmiles: r.canonicalSmiles }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Podobieństwo strukturalne Tanimoto (Morgan r=2, 2048 bitów) + porównanie
 * szkieletu Murcko (D-075).
 *
 * KOMENDA `similarity` ISTNIAŁA W WORKERZE OD POCZĄTKU i nie miała po stronie
 * Node ŻADNEGO eksportu — potwierdzone grepem: żaden `.mjs` nie wywoływał
 * `cmd: 'similarity'`. To jedyna brakująca część: silnik liczył, tylko nikt
 * nie mógł go zawołać. Nie dodajemy tu nowej chemii ani drugiej implementacji
 * (frontendowy `core/discovery/molecular/structuralSimilarity.ts` robi to samo
 * po swojej stronie) — wystawiamy istniejącą zdolność.
 *
 * Zwracany kształt jest DOKŁADNIE tym, co worker już drukuje (pola na
 * najwyższym poziomie, nie pod `data`).
 */
export function similarity(smiles, reference) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'similarity', smiles: String(smiles ?? ''), reference: String(reference ?? '') });
    return r.ok
      ? {
          ok: true,
          tanimoto: r.tanimoto,
          fingerprint: r.fingerprint,
          sameScaffold: r.sameScaffold,
          candidateCanonical: r.candidateCanonical,
          referenceCanonical: r.referenceCanonical,
          scaffoldCandidate: r.scaffoldCandidate,
          scaffoldReference: r.scaffoldReference,
          engine: d.engine,
        }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Dense Morgan fingerprint (r=2, 512 bits) for ONE molecule, plus its Murcko
 * scaffold (D-076/077 — the GLP-1R QSAR seam).
 *
 * This is a NEW worker command (`fingerprint`), additive next to the
 * pre-existing pairwise `similarity` command above — confirmed by grep before
 * writing it: no command in `rdkit_worker.py` returned a per-molecule bit
 * vector, only a pairwise Tanimoto number. 512 bits, not `similarity`'s 2048:
 * a QSAR ridge model needs one coefficient per bit, and a human-activity pin
 * in the low hundreds of rows cannot support 2048+1 of them even regularised.
 *
 * `bits` is the RDKit bit vector as an array of 512 zeros/ones (not the
 * sparse index list some callers may prefer — callers reduce it themselves).
 */
export function fingerprint(smiles) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'fingerprint', smiles: String(smiles ?? '') });
    return r.ok
      ? { ok: true, bits: r.bits, nBits: r.nBits, fingerprint: r.fingerprint, scaffold: r.scaffold, canonicalSmiles: r.canonicalSmiles }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * BATCH fingerprinting (D-078): many molecules, ONE python process.
 *
 * Same chemistry as `fingerprint()` above — identical Morgan r=2/512 and
 * Murcko calls, in input order — but the RDKit import and process startup are
 * paid once for the whole list instead of once per molecule. Measured here on
 * the 287-row GLP-1R pin: ~97 s spawn-per-call versus ~4.6 s batched, a 21x
 * saving that is pure overhead removal and changes no result. A test asserts
 * batch output is byte-identical to the per-molecule path.
 *
 * Returns `{ ok, results, n, engine }` where `results[i]` corresponds to
 * `smilesList[i]` — an unparseable molecule yields `{ ok: false }` IN ITS OWN
 * SLOT, so indices never shift and a bad row is never silently dropped.
 *
 * `invoke`'s default 4 MB maxBuffer is not enough: 512 bits serialize to ~1 kB
 * of JSON per molecule, so a few thousand molecules would overflow it and
 * `execFileSync` would throw ENOBUFS mid-batch. This call raises the ceiling
 * and chunks, so a large population degrades into several batched processes
 * rather than one failure.
 */
export function fingerprintBatch(smilesList, { chunkSize = 500 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  const list = Array.isArray(smilesList) ? smilesList.map((s) => String(s ?? '')) : [];
  if (list.length === 0) return { ok: true, results: [], n: 0, engine: d.engine };
  const results = [];
  try {
    for (let offset = 0; offset < list.length; offset += chunkSize) {
      const chunk = list.slice(offset, offset + chunkSize);
      const out = execFileSync(PYTHON, [WORKER, JSON.stringify({ cmd: 'batch_fingerprint', smilesList: chunk })], {
        timeout: Math.max(TIMEOUT_MS, 1_000 * chunk.length),
        maxBuffer: 256 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const r = JSON.parse(out);
      if (!r.ok) return { ok: false, error: r.error };
      if (!Array.isArray(r.results) || r.results.length !== chunk.length) {
        return { ok: false, error: 'BATCH_LENGTH_MISMATCH', reason: `worker returned ${r.results?.length} results for ${chunk.length} inputs` };
      }
      results.push(...r.results);
    }
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
  return { ok: true, results, n: results.length, engine: d.engine };
}

/**
 * Batched descriptors (D-079) — one process for the whole list, identical
 * per-molecule output to `descriptors()`. Returns `{ ok, results, n }` with
 * `results[i]` aligned to `smilesList[i]`; an unparseable molecule is
 * `{ ok: false }` in its own slot.
 */
export function descriptorsBatch(smilesList, { chunkSize = 500 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  const list = Array.isArray(smilesList) ? smilesList.map((s) => String(s ?? '')) : [];
  if (list.length === 0) return { ok: true, results: [], n: 0, engine: d.engine };
  const results = [];
  try {
    for (let offset = 0; offset < list.length; offset += chunkSize) {
      const chunk = list.slice(offset, offset + chunkSize);
      const out = execFileSync(PYTHON, [WORKER, JSON.stringify({ cmd: 'batch_descriptors', smilesList: chunk })], {
        timeout: Math.max(TIMEOUT_MS, 1_000 * chunk.length),
        maxBuffer: 256 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const r = JSON.parse(out);
      if (!r.ok) return { ok: false, error: r.error };
      if (!Array.isArray(r.results) || r.results.length !== chunk.length) {
        return { ok: false, error: 'BATCH_LENGTH_MISMATCH' };
      }
      results.push(...r.results);
    }
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
  return { ok: true, results, n: results.length, engine: d.engine };
}

/**
 * D-082 — batched peptide parse. Same one-process-per-chunk contract as
 * `descriptorsBatch`/`fingerprintBatch` (D-078/D-079): results are aligned by
 * index and a molecule RDKit cannot parse fails in its own slot.
 *
 * This is the AUTHORITATIVE peptide-bond count. The string-based
 * `glp1rQsarV2.mjs::countAmideBonds` double counts ureas and remains only as
 * a no-subprocess fallback; where both are available this one wins, because
 * it distinguishes a peptide bond from a urea, a biuret and a carbamate.
 */
export function peptideParseBatch(smilesList, { chunkSize = 500 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  const list = Array.isArray(smilesList) ? smilesList.map((s) => String(s ?? '')) : [];
  if (list.length === 0) return { ok: true, results: [], n: 0, engine: d.engine };
  const results = [];
  try {
    for (let offset = 0; offset < list.length; offset += chunkSize) {
      const chunk = list.slice(offset, offset + chunkSize);
      const out = execFileSync(PYTHON, [WORKER, JSON.stringify({ cmd: 'batch_peptide_parse', smilesList: chunk })], {
        timeout: Math.max(TIMEOUT_MS, 1_000 * chunk.length),
        maxBuffer: 256 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const r = JSON.parse(out);
      if (!r.ok) return { ok: false, error: r.error };
      if (!Array.isArray(r.results) || r.results.length !== chunk.length) {
        return { ok: false, error: 'BATCH_LENGTH_MISMATCH' };
      }
      results.push(...r.results);
    }
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
  return { ok: true, results, n: results.length, engine: d.engine };
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
      ? { ok: true, atoms: r.atoms, bonds: r.bonds ?? [], forceField: r.forceField, charge: r.charge, nAtoms: r.nAtoms, nBonds: r.nBonds ?? (r.bonds?.length ?? 0), canonicalSmiles: r.canonicalSmiles }
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

/**
 * Rekombinacja fragmentów BRICS — kandydaci, których żadna pojedyncza
 * transformacja z `listTransformations()` nie jest w stanie osiągnąć.
 *
 * Reguły BRICS (Degen i in. 2008) rozkładają rodziców na fragmenty po
 * wiązaniach syntetycznie dostępnych i łączą je z powrotem tylko tam, gdzie
 * typy punktów przyłączenia do siebie pasują. Dla DWÓCH rodziców daje to
 * produkty hybrydowe — realną chemię, nie sklejanie napisów.
 *
 * Deterministyczne (`scrambleReagents=False`) i twardo ograniczone liczbą
 * produktów oraz głębokością składania, bo generator BRICSBuild jest dla
 * większych pul praktycznie nieskończony.
 *
 * To NIE jest generatywne projektowanie de novo — nie ma tu modelu
 * proponującego nowe rusztowania. Przeszukiwanie jest szersze niż lista
 * transformacji, ale nadal kombinatoryczne i ograniczone do fragmentów
 * obecnych w rodzicach.
 */
export function bricsRecombine(smilesList, { maxProducts = 8, maxDepth = 2 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({
      cmd: 'brics',
      smiles: Array.isArray(smilesList) ? smilesList.map(String) : [],
      maxProducts,
      maxDepth,
    });
    return r.ok
      ? { ok: true, products: r.products, fragmentsByParent: r.fragmentsByParent, reason: r.reason ?? null, engine: r.engine }
      : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}
