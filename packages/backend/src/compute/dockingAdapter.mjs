/**
 * Adapter Dokowania Molekularnego (AutoDock Vina + Meeko) — most Node → realny
 * silnik dokowania. Vina (Apache-2.0) i Meeko (LGPL) to dojrzałe, otwarte
 * narzędzia. Uruchamiane przez krótkotrwały proces `python3 dock_worker.py`
 * (execFileSync) z twardym limitem czasu i katalogiem artefaktów.
 *
 * Wynik (score Vina, kcal/mol) to MODEL_ESTIMATE — NIGDY dowód eksperymentalny
 * powinowactwa i NIGDY deklaracja terapeutyczna. Gdy receptor podano jako SMILES,
 * jest to małocząsteczkowy zastępnik do walidacji POTOKU dokowania, nie białko.
 * Kanoniczny benchmark białko-ligand wymaga struktury zewnętrznej (RCSB), która
 * bywa zablokowana przez politykę egress — wtedy stan to BLOCKED_BY_RESOURCES.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dock_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';
const TIMEOUT_MS = 300_000; // dokowanie bywa kosztowne; twardy limit chroni serwer
const ARTIFACT_BASE = process.env.GENESIS_ARTIFACT_DIR ?? path.join(tmpdir(), 'genesis-science');

let detectCache = null;

function invoke(request, timeout = TIMEOUT_MS) {
  const out = execFileSync(PYTHON, [WORKER, JSON.stringify(request)], {
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function artifactDir(prefix) {
  try {
    return mkdtempSync(path.join(ARTIFACT_BASE, `${prefix}-`));
  } catch {
    // ARTIFACT_BASE may not exist yet — create it then retry.
    execFileSync('mkdir', ['-p', ARTIFACT_BASE]);
    return mkdtempSync(path.join(ARTIFACT_BASE, `${prefix}-`));
  }
}

/** Wykrywanie zdolności runtime. Cache'owane. { available, vinaVersion?, meekoVersion?, reason? }. */
export function detect() {
  if (detectCache) return detectCache;
  try {
    const r = invoke({ cmd: 'detect' }, 30_000);
    detectCache = r.ok
      ? { available: true, vinaVersion: r.vinaVersion, meekoVersion: r.meekoVersion, engine: `AutoDock Vina ${r.vinaVersion} + Meeko ${r.meekoVersion}` }
      : { available: false, reason: r.error || 'docking_unavailable' };
  } catch (err) {
    detectCache = { available: false, reason: `python/vina/meeko niedostępne w runtime: ${String(err?.message ?? err).slice(0, 160)}` };
  }
  return detectCache;
}

/** Do testów: wyczyść cache detekcji. */
export function _resetDetect() {
  detectCache = null;
}

/** Udokumentowany przypadek referencyjny (walidacja integracji potoku dokowania). */
export function referenceCase() {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'reference', outDir: artifactDir('dock-ref') });
    if (!r.ok) return { ok: false, error: r.error };
    return {
      ok: true, pass: r.pass, case: r.case, bestAffinityKcalMol: r.bestAffinityKcalMol,
      nPoses: r.nPoses, vinaVersion: r.vinaVersion, meekoVersion: r.meekoVersion,
      receptorKind: r.receptorKind, artifacts: r.artifacts, inputHash: r.inputHash,
    };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Realny dok: ligand (SMILES) → prep Meeko → Vina w zadanym pudełku wokół
 * receptora (PDBQT lub małocząsteczkowy zastępnik SMILES). Zwraca poses/scores +
 * artefakty (ścieżki + sha256). `spec`: { ligandSmiles, receptorSmiles|receptorPdbqt,
 * center?, boxSize?, exhaustiveness?, nPoses?, seed? }.
 */
export function dock(spec) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (!spec || !spec.ligandSmiles) return { ok: false, error: 'invalid_input', reason: 'ligandSmiles wymagane' };
  if (!spec.receptorSmiles && !spec.receptorPdbqt && !spec.receptorPdbqtPath) return { ok: false, error: 'invalid_input', reason: 'receptorSmiles, receptorPdbqt lub receptorPdbqtPath wymagane' };
  try {
    const r = invoke({
      cmd: 'dock',
      ligandSmiles: spec.ligandSmiles,
      receptorSmiles: spec.receptorSmiles,
      receptorPdbqt: spec.receptorPdbqt,
      receptorPdbqtPath: spec.receptorPdbqtPath,
      center: spec.center,
      boxSize: spec.boxSize ?? [22, 22, 22],
      exhaustiveness: spec.exhaustiveness ?? 8,
      nPoses: spec.nPoses ?? 5,
      seed: spec.seed ?? 42,
      outDir: artifactDir('dock'),
    });
    return r.ok ? { ok: true, data: r } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Parse a PDB/mmCIF structure: chains, atom count, hetero residues, and the extracted reference
 * (bound) ligand. Read-only structural analysis — never docks. `format`: 'pdb' | 'mmcif'.
 */
export function parseStructure(structure, format = 'pdb') {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (!structure || typeof structure !== 'string') return { ok: false, error: 'invalid_input', reason: 'structure text wymagany' };
  try {
    const r = invoke({ cmd: 'parse_structure', structure, format }, 60_000);
    return r.ok ? { ok: true, chains: r.chains, nAtoms: r.nAtoms, nProteinResidues: r.nProteinResidues, heteroResidues: r.heteroResidues, referenceLigand: r.referenceLigand } : { ok: false, error: r.error, reason: r.reason };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Full receptor preparation from a raw structure: parse PDB/mmCIF → extract reference ligand →
 * deterministic grid (centre = ligand centroid, box = bbox + 2·padding) → clean protein → real
 * Meeko receptor PDBQT. Returns a prepared-receptor spec + provenance (SHA-256), or fails closed.
 */
export function prepareReceptor(spec) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (!spec || !spec.structure) return { ok: false, error: 'invalid_input', reason: 'structure wymagana' };
  try {
    const r = invoke({ cmd: 'prepare_receptor', structure: spec.structure, format: spec.format ?? 'pdb', padding: spec.padding ?? 5, seed: spec.seed ?? 42, boxCenter: spec.boxCenter, boxSize: spec.boxSize, outDir: artifactDir('recprep') }, TIMEOUT_MS);
    if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
    return {
      ok: true, receptorPdbqtPath: r.receptorPdbqtPath, cleanReceptorPdb: r.cleanReceptorPdb,
      center: r.center, boxSize: r.boxSize, padding: r.padding,
      bindingSite: r.bindingSite, referenceLigand: r.referenceLigand, nProteinAtoms: r.nProteinAtoms, nReceptorPdbqtAtoms: r.nReceptorPdbqtAtoms,
      artifacts: r.artifacts, inputStructureSha256: r.inputStructureSha256,
    };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * Build a VALID synthetic peptide+ligand complex (TEST_FIXTURE) for validating the docking pipeline
 * without an external RCSB structure. Any dock run on it is REAL Vina — only the structure is synthetic.
 */
export function buildReferenceComplex({ sequence, ligandSmiles, seed = 42 } = {}) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd: 'build_reference_complex', sequence, ligandSmiles, seed }, 120_000);
    return r.ok ? { ok: true, format: r.format, structure: r.structure, sha256: r.sha256, note: r.note } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/**
 * End-to-end production pipeline: raw structure → prepared receptor + grid → real Vina dock of one
 * ligand. Returns docking result carrying the prepared-receptor provenance. Fails closed at each
 * stage (never simulates). `spec`: { structure, format?, ligandSmiles, padding?, exhaustiveness?, nPoses?, seed? }.
 */
export function dockPipeline(spec) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  if (!spec || !spec.ligandSmiles || !spec.structure) return { ok: false, error: 'invalid_input', reason: 'structure + ligandSmiles wymagane' };
  const prep = prepareReceptor({ structure: spec.structure, format: spec.format, padding: spec.padding, seed: spec.seed, boxCenter: spec.boxCenter, boxSize: spec.boxSize });
  if (!prep.ok) return { ok: false, error: prep.error, reason: prep.reason, stage: 'prepare_receptor' };
  const docked = dock({ ligandSmiles: spec.ligandSmiles, receptorPdbqtPath: prep.receptorPdbqtPath, center: prep.center, boxSize: prep.boxSize, exhaustiveness: spec.exhaustiveness, nPoses: spec.nPoses, seed: spec.seed });
  if (!docked.ok) return { ok: false, error: docked.error, reason: docked.reason, stage: 'dock', preparedReceptor: prep };
  return { ok: true, preparedReceptor: prep, docking: docked.data, grid: { center: prep.center, boxSize: prep.boxSize }, bindingSite: prep.bindingSite, referenceLigand: prep.referenceLigand };
}
