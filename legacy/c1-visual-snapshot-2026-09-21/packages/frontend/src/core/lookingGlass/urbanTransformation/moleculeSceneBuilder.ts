import { parseSmiles, describeLigand, type LigandDescriptors } from '@genesis/core/chemistry/chemistrySMILES.js';
import { fnv1a, canonicalJson } from '../../events/hash';

/**
 * MOLECULE SCENE BUILDER — the MOLECULE domain of the generic scene pipeline.
 * Calls the EXISTING, real chemistry engine (`chemistrySMILES.ts::parseSmiles`
 * + `describeLigand`, the same functions D-137's docking pipeline uses) —
 * builds no second chemistry parser. `NAMED_MOLECULES` is a small, disclosed
 * lookup from a common name to a real SMILES string (not a claim that the
 * name-to-structure mapping itself is exhaustive or verified against a
 * database — the descriptors computed FROM that SMILES are real).
 */
const NAMED_MOLECULES: Readonly<Record<string, string>> = {
  water: 'O',
  ethanol: 'CCO',
  benzene: 'c1ccccc1',
  caffeine: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
  aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
  glucose: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
};

/** Only ever an explicit named-molecule lookup — never guesses a SMILES string out of free text. */
export function resolveNamedMoleculeSmiles(prompt: string): { readonly name: string; readonly smiles: string } | null {
  const lowered = prompt.toLowerCase();
  for (const [name, smiles] of Object.entries(NAMED_MOLECULES)) {
    if (lowered.includes(name)) return { name, smiles };
  }
  return null;
}

export interface MoleculeSceneResult {
  readonly status: 'COMPLETED' | 'BLOCKED';
  readonly moleculeName: string | null;
  readonly smiles: string | null;
  readonly descriptors: LigandDescriptors | null;
  readonly unresolved: readonly string[];
  readonly fingerprint: string;
}

export function buildMoleculeScene(prompt: string): MoleculeSceneResult {
  const resolved = resolveNamedMoleculeSmiles(prompt);
  if (!resolved) {
    return {
      status: 'BLOCKED', moleculeName: null, smiles: null, descriptors: null,
      unresolved: [`no known molecule name recognised in the prompt (known: ${Object.keys(NAMED_MOLECULES).join(', ')})`],
      fingerprint: fnv1a(canonicalJson({ prompt, domain: 'MOLECULE', blocked: true })),
    };
  }
  const mol = parseSmiles(resolved.smiles);
  const descriptors = describeLigand(mol);
  return {
    status: 'COMPLETED', moleculeName: resolved.name, smiles: resolved.smiles, descriptors, unresolved: [],
    fingerprint: fnv1a(canonicalJson({ prompt: resolved.name, domain: 'MOLECULE', descriptors })),
  };
}
