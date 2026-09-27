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
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePythonExecutable } from './pythonRuntime.mjs';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dock_worker.py');
const PYTHON = resolvePythonExecutable('GENESIS_DOCKING_PYTHON');
const TIMEOUT_MS = 300_000; // dokowanie bywa kosztowne; twardy limit chroni serwer
const ARTIFACT_BASE = process.env.GENESIS_ARTIFACT_DIR ?? path.join(tmpdir(), 'genesis-science');
const ARTIFACT_DURABILITY = process.env.GENESIS_ARTIFACT_DIR ? 'CONFIGURED_DURABLE_PATH' : 'EPHEMERAL_TEMP';

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
  if (!spec.receptorSmiles && !spec.receptorPdbqt && !spec.receptorPdbqtPath) return { ok: false, error: 'invalid_input', reason: 'receptorSmiles lub receptorPdbqt wymagane' };
  try {
    const outDir = artifactDir('dock');
    const receptorPdbqtPath = spec.receptorPdbqt && spec.receptorPdbqt.length > 32_000
      ? path.join(outDir, 'input-receptor.pdbqt')
      : undefined;
    if (receptorPdbqtPath) writeFileSync(receptorPdbqtPath, spec.receptorPdbqt, 'utf8');
    const r = invoke({
      cmd: 'dock',
      ligandSmiles: spec.ligandSmiles,
      // Internal callers only (prepared-target and prepared-ligand files); never taken from the API.
      ligandPdbqtPath: spec.ligandPdbqtPath,
      receptorSmiles: receptorPdbqtPath || spec.receptorPdbqtPath ? undefined : spec.receptorSmiles,
      receptorPdbqt: receptorPdbqtPath || spec.receptorPdbqtPath ? undefined : spec.receptorPdbqt,
      receptorPdbqtPath: spec.receptorPdbqtPath ?? receptorPdbqtPath,
      center: spec.center,
      boxSize: spec.boxSize ?? [22, 22, 22],
      exhaustiveness: spec.exhaustiveness ?? 8,
      nPoses: spec.nPoses ?? 5,
      seed: spec.seed ?? 42,
      outDir,
    });
    return r.ok ? { ok: true, data: { ...r, artifactDurability: ARTIFACT_DURABILITY } } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

function step(cmd, request, prefix, timeout = TIMEOUT_MS) {
  const d = detect();
  if (!d.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: d.reason };
  try {
    const r = invoke({ cmd, ...request, outDir: artifactDir(prefix) }, timeout);
    return r.ok ? { ok: true, data: { ...r, artifactDurability: ARTIFACT_DURABILITY } } : { ok: false, error: r.error };
  } catch (err) {
    return { ok: false, error: 'execution_failed', reason: String(err?.message ?? err).slice(0, 160) };
  }
}

/** Deterministic Meeko preparation of a vetted receptor PDB file (path from the target registry only). */
export function prepareReceptor({ pdbPath, center, boxSize }) {
  return step('prepare_receptor', { pdbPath, center, boxSize }, 'dock-receptor');
}

/** Deterministic ligand preparation (RDKit ETKDGv3 seed + MMFF → Meeko PDBQT) — the same routine `dock` uses. */
export function prepareLigand({ ligandSmiles, seed = 42 }) {
  if (!ligandSmiles) return { ok: false, error: 'invalid_input', reason: 'ligandSmiles wymagane' };
  return step('prepare_ligand', { ligandSmiles, seed }, 'dock-ligand');
}

/** Crystal-ligand redocking benchmark: top-pose heavy-atom RMSD against the crystal pose (in the crystal frame). */
export function redock({ pdbPath, ligandSdfPath, center, boxSize, exhaustiveness = 8, seed = 42 }) {
  return step('redock', { pdbPath, ligandSdfPath, center, boxSize, exhaustiveness, seed }, 'dock-redock');
}
