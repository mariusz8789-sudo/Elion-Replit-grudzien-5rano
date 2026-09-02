import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ReceptorRelevance, ReceptorStructure } from './targetHypothesis';

/**
 * RECEPTOR PREPARATION (Node-only, like the other engine transports).
 *
 * Turns a real PDB structure into the rigid PDBQT receptor AutoDock Vina
 * needs, using the REAL Meeko pipeline (`mk_prepare_receptor.py`) and gemmi
 * for cleanup and box geometry. No structure is synthesised here: the input
 * must be an actual structure file on disk.
 *
 * The docking box centre is computed from the structure's own coordinates
 * rather than typed in, so it is reproducible and cannot silently drift from
 * the protein it claims to describe.
 *
 * IMPORTANT: preparing a receptor says nothing about whether that receptor is
 * the RIGHT one. Relevance is supplied by the caller and defaults to
 * STRUCTURAL_PROXY, because a structure that happens to be available is
 * almost never the mechanistically implicated target.
 */
export const RECEPTOR_PREPARATION_VERSION = '1.0.0';

export type ReceptorPreparation =
  | { ok: true; receptor: ReceptorStructure; engine: string }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'STRUCTURE_NOT_FOUND' | 'PREPARATION_FAILED'; reason: string };

function python(): string {
  return process.env.GENESIS_DOCKING_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
}

/** Is the real Meeko receptor pipeline present in this runtime? */
export function detectReceptorPreparation(): { available: boolean; reason: string } {
  try {
    execFileSync(python(), ['-c', 'import meeko, gemmi, prody'], {
      timeout: 120_000, stdio: ['ignore', 'ignore', 'ignore'],
    });
    return { available: true, reason: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { available: false, reason: `receptor preparation needs meeko, gemmi and prody: ${message.slice(0, 140)}` };
  }
}

export interface PrepareReceptorOptions {
  structureId: string;
  pdbPath: string;
  /** How this structure relates to the hypothesised target. Defaults to proxy. */
  relevance?: ReceptorRelevance;
  provenance: string;
  /** Required when relevance is STRUCTURAL_PROXY. */
  proxyCaveat?: string;
  /** Box padding around the structure, in Angstrom. */
  boxPadding?: number;
}

/**
 * Prepares a receptor from a real PDB file.
 *
 * A STRUCTURAL_PROXY without a caveat is rejected: the whole point of the
 * proxy label is that the caveat travels with the data, so omitting it would
 * defeat it.
 */
export function prepareReceptor(options: PrepareReceptorOptions): ReceptorPreparation {
  const relevance = options.relevance ?? 'STRUCTURAL_PROXY';
  if (relevance === 'STRUCTURAL_PROXY' && (options.proxyCaveat ?? '').trim().length === 0) {
    return {
      ok: false,
      error: 'PREPARATION_FAILED',
      reason: 'A STRUCTURAL_PROXY receptor must carry a proxyCaveat stating what the structure is and is not.',
    };
  }
  if (!existsSync(options.pdbPath)) {
    return { ok: false, error: 'STRUCTURE_NOT_FOUND', reason: `No structure file at ${options.pdbPath}` };
  }
  const detected = detectReceptorPreparation();
  if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };

  const workDir = mkdtempSync(path.join(tmpdir(), 'genesis-receptor-'));
  const cleanPath = path.join(workDir, 'clean.pdb');
  const outPrefix = path.join(workDir, 'receptor');

  try {
    // Clean + centre, using gemmi. Ligands, waters and hydrogens are removed
    // so the box describes the protein itself.
    const geometry = execFileSync(python(), ['-c', `
import gemmi, json, sys
st = gemmi.read_structure(sys.argv[1])
st.setup_entities(); st.remove_ligands_and_waters(); st.remove_hydrogens()
xs=[];ys=[];zs=[]
for model in st:
    for chain in model:
        for res in chain:
            for atom in res:
                xs.append(atom.pos.x); ys.append(atom.pos.y); zs.append(atom.pos.z)
    break
if not xs:
    raise SystemExit('no_atoms')
st.write_pdb(sys.argv[2])
print(json.dumps({
  "center":[sum(xs)/len(xs), sum(ys)/len(ys), sum(zs)/len(zs)],
  "extent":[max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)],
  "atoms": len(xs),
}))
`, options.pdbPath, cleanPath], { timeout: 180_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

    const parsed = JSON.parse(geometry) as { center: number[]; extent: number[]; atoms: number };

    execFileSync(python(), [
      // Invoke the installed Meeko CLI through its own interpreter so the
      // runtime that has meeko is the one that runs it.
      '-c', 'import sys, runpy; sys.argv = ["mk_prepare_receptor.py"] + sys.argv[1:]; runpy.run_path(__import__("shutil").which("mk_prepare_receptor.py"), run_name="__main__")',
      '-i', cleanPath, '-o', outPrefix, '-p',
    ], { timeout: 300_000, stdio: ['ignore', 'ignore', 'ignore'] });

    const pdbqtPath = `${outPrefix}.pdbqt`;
    if (!existsSync(pdbqtPath)) {
      return { ok: false, error: 'PREPARATION_FAILED', reason: 'Meeko produced no receptor PDBQT.' };
    }
    const pdbqt = readFileSync(pdbqtPath, 'utf8');
    const padding = options.boxPadding ?? 6;
    const boxSize: [number, number, number] = [
      Math.min(Math.round(parsed.extent[0]! + padding), 40),
      Math.min(Math.round(parsed.extent[1]! + padding), 40),
      Math.min(Math.round(parsed.extent[2]! + padding), 40),
    ];

    return {
      ok: true,
      engine: 'Meeko mk_prepare_receptor + gemmi',
      receptor: {
        structureId: options.structureId,
        pdbqt,
        center: [
          Number(parsed.center[0]!.toFixed(3)),
          Number(parsed.center[1]!.toFixed(3)),
          Number(parsed.center[2]!.toFixed(3)),
        ],
        boxSize,
        relevance,
        provenance: `${options.provenance} (${parsed.atoms} heavy atoms; box centred on the structure's own centroid)`,
        proxyCaveat: relevance === 'STRUCTURAL_PROXY' ? options.proxyCaveat! : null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return { ok: false, error: 'PREPARATION_FAILED', reason: message.slice(0, 200) };
  }
}

/**
 * The one real protein structure committed to this repository
 * (`docs/evidence/openmm/1VII.pdb`, villin headpiece subdomain HP36).
 *
 * It is used as a STRUCTURAL PROXY: it makes the docking path genuinely
 * executable end to end, and it is not the mechanistic target of any compound
 * this engine is likely to be asked about. That is stated in the caveat so it
 * cannot be lost downstream.
 */
export function repositoryProxyReceptor(repoRoot: string): ReceptorPreparation {
  return prepareReceptor({
    structureId: 'PDB:1VII',
    pdbPath: path.join(repoRoot, 'docs/evidence/openmm/1VII.pdb'),
    relevance: 'STRUCTURAL_PROXY',
    provenance: 'PDB 1VII, chicken villin headpiece subdomain (HP36), NMR minimised average structure, committed in this repository.',
    proxyCaveat:
      'PDB 1VII is an actin-binding villin headpiece subdomain. It is a REAL protein and the docking against it is a real computation, but it is NOT the mechanistic target of the compounds this engine is asked about. Scores against it demonstrate that the docking pipeline runs; they are not evidence about any hypothesised mechanism.',
  });
}
