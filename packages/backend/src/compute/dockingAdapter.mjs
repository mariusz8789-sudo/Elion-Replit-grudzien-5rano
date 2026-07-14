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
  if (!spec.receptorSmiles && !spec.receptorPdbqt) return { ok: false, error: 'invalid_input', reason: 'receptorSmiles lub receptorPdbqt wymagane' };
  try {
    const r = invoke({
      cmd: 'dock',
      ligandSmiles: spec.ligandSmiles,
      receptorSmiles: spec.receptorSmiles,
      receptorPdbqt: spec.receptorPdbqt,
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
