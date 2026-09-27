import { hashBytes } from '../evidenceConnectors/hashing';
import dockingSource from '../../../../backend/src/compute/targets/abl1-1iep/SOURCE.json';
import retroEvidence from '../../../../../docs/evidence/imatinib-retrosynthesis-2026-09-27.json';

/**
 * REVIEWER DRUG EVIDENCE — the imatinib pipeline, as committed evidence a
 * reviewer can check in their own browser.
 *
 * Two real records, both committed to this repository:
 *   - `backend/src/compute/targets/abl1-1iep/SOURCE.json`: the 1IEP docking
 *     inputs (receptor + crystal ligand), with the SHA-256 of each file and
 *     the public upstream URL it came from. `verifyDockingInputs()` re-hashes
 *     the committed files in the browser, so a reviewer can compare three
 *     values themselves: the manifest, their browser, and a download from the
 *     upstream URL.
 *   - `docs/evidence/imatinib-retrosynthesis-2026-09-27.json`: the resume
 *     record of the real AiZynthFinder 4.4.1 run (2026-09-27), with model
 *     checksums, input/output/environment hashes and the replay verdict.
 *
 * WHAT THIS IS NOT. Imatinib is an approved drug and 1IEP is its published
 * crystal structure: the docking redock and the retrosynthesis are
 * BENCHMARKS that show the pipeline reproduces known science, not a new
 * discovery. The retrosynthesis evidence class is MODEL_ESTIMATE — no
 * compound was made in a laboratory.
 */

interface SourceFile { readonly sha256: string; readonly url: string; readonly content: string }

export const DOCKING_SOURCE = dockingSource as unknown as {
  readonly pdbId: string;
  readonly protein: string;
  readonly referenceLigand: { readonly name: string };
  readonly citation: string;
  readonly files: Readonly<Record<string, SourceFile>>;
  readonly retrieved: string;
};

export interface RetroStep { readonly step: number; readonly reactionSmiles: string; readonly policyProbability: number; readonly policy: string }
export interface RetroEvidence {
  readonly status: string;
  readonly finishedAt: string;
  readonly replayVerdict: string;
  readonly protocolFingerprint: string;
  readonly handoff: { readonly canonicalSmiles: string };
  readonly reference: { readonly case: string; readonly pass: boolean; readonly steps: number };
  readonly run: { readonly id: string; readonly inputHash: string; readonly outputHash: string; readonly environmentHash: string; readonly engineVersion: string };
  readonly models: readonly { readonly role: string; readonly filename: string; readonly bytes: number; readonly sha256: string }[];
  readonly synthesis: {
    readonly engine: string;
    readonly evidenceClass: string;
    readonly citation: string;
    readonly topRoute: {
      readonly steps: number;
      readonly reactionsForward: readonly RetroStep[];
      readonly startingMaterials: readonly { readonly smiles: string; readonly inStock: boolean }[];
      readonly allStartingMaterialsInStock: boolean;
    };
  };
}

export const RETRO_EVIDENCE = retroEvidence as unknown as RetroEvidence;

const loaders: Readonly<Record<string, () => Promise<{ default: string }>>> = {
  '1iep_receptorH.pdb': () => import('../../../../backend/src/compute/targets/abl1-1iep/1iep_receptorH.pdb?raw'),
  '1iep_ligand.sdf': () => import('../../../../backend/src/compute/targets/abl1-1iep/1iep_ligand.sdf?raw'),
};

export interface FileCheck {
  readonly file: string;
  readonly expected: string;
  readonly computed: string;
  readonly bytes: number;
  readonly upstreamUrl: string;
  readonly match: boolean;
}

/** Re-hash the committed docking inputs in this browser and compare with the manifest. */
export async function verifyDockingInputs(): Promise<readonly FileCheck[]> {
  const out: FileCheck[] = [];
  for (const [file, meta] of Object.entries(DOCKING_SOURCE.files)) {
    const load = loaders[file];
    if (load === undefined) throw new Error(`reviewer: no loader for committed docking file ${file}`);
    const bytes = new TextEncoder().encode((await load()).default);
    const computed = await hashBytes(bytes, 'sha256');
    out.push({ file, expected: meta.sha256, computed, bytes: bytes.length, upstreamUrl: meta.url, match: computed === meta.sha256 });
  }
  return out;
}
