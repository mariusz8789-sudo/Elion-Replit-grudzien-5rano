/**
 * Vetted protein docking targets. A target is a real, documented PDB structure shipped with the
 * backend together with its provenance (SOURCE.json: PDB ID, chain, pocket, licences, sha256 of every
 * file). The API may only name a target by id — never a path — and a file whose sha256 differs from
 * the recorded one is refused, so the receptor the engine sees is exactly the documented one.
 *
 * Preparation is deterministic (stable residue ordering → Meeko mk_prepare_receptor) and is repeated
 * per process, so every run records the same receptor PDBQT hash it actually docked against.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as docking from './dockingAdapter.mjs';

const TARGET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'targets');

const TARGETS = {
  ABL1_1IEP: { dir: 'abl1-1iep', receptorFile: '1iep_receptorH.pdb', ligandFile: '1iep_ligand.sdf' },
};

export const DEFAULT_DOCKING_TARGET = 'ABL1_1IEP';

export function listDockingTargets() {
  return Object.keys(TARGETS);
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Registry entry + provenance, with every shipped file checked against its recorded sha256. */
export function getDockingTarget(targetId) {
  const entry = TARGETS[targetId];
  if (!entry) return { ok: false, error: 'unknown_target' };
  const dir = path.join(TARGET_DIR, entry.dir);
  const source = JSON.parse(readFileSync(path.join(dir, 'SOURCE.json'), 'utf8'));
  const pdbPath = path.join(dir, entry.receptorFile);
  const ligandSdfPath = path.join(dir, entry.ligandFile);
  for (const [name, file] of [[entry.receptorFile, pdbPath], [entry.ligandFile, ligandSdfPath]]) {
    const actual = sha256File(file);
    if (actual !== source.files?.[name]?.sha256) return { ok: false, error: 'target_file_hash_mismatch', file: name };
  }
  return {
    ok: true,
    targetId,
    pdbId: source.pdbId,
    chain: source.chain,
    protein: source.protein,
    referenceLigand: source.referenceLigand,
    citation: source.citation,
    licenses: source.licenses,
    pocket: source.pocket,
    files: source.files,
    pdbPath,
    ligandSdfPath,
  };
}

const prepared = new Map();

/** Prepares (once per process) and returns the receptor PDBQT + everything Evidence must record. */
export function prepareDockingTarget(targetId) {
  if (prepared.has(targetId)) return prepared.get(targetId);
  const target = getDockingTarget(targetId);
  if (!target.ok) return target;
  const r = docking.prepareReceptor({ pdbPath: target.pdbPath, center: target.pocket.center, boxSize: target.pocket.boxSize });
  if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
  const out = {
    ok: true,
    targetId,
    pdbId: target.pdbId,
    chain: target.chain,
    protein: target.protein,
    referenceLigand: target.referenceLigand,
    sourceFile: target.files[Object.keys(target.files)[0]],
    sourceSha256: r.data.sourceSha256,
    receptorPdbqtPath: r.data.receptorPdbqtPath,
    receptorPdbqtSha256: r.data.receptorPdbqtSha256,
    receptorAtoms: r.data.receptorAtoms,
    meekoVersion: r.data.meekoVersion,
    preparation: r.data.preparation,
    center: r.data.center,
    boxSize: r.data.boxSize,
    pocketSource: target.pocket.source,
  };
  prepared.set(targetId, out);
  return out;
}

/** Test hook. */
export function _resetPreparedTargets() {
  prepared.clear();
}
