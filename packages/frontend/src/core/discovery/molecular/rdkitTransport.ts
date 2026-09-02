/**
 * RDKIT TRANSPORT — the seam between the discovery loop and the REAL RDKit
 * engine that already exists in this repository
 * (`packages/backend/src/compute/rdkit_worker.py`, reached through
 * `compute/rdkitAdapter.mjs` and the `chem-rdkit-descriptors` compute model).
 *
 * RDKit is NOT duplicated here. This module defines the call shape and nothing
 * else; every number it carries was produced by that worker.
 *
 * Two transports exist because the discovery loop runs in two places:
 *  - in Node (tests, scripts) the worker is invoked directly — see
 *    `rdkitTransport.node.ts`, which is deliberately a separate file so the
 *    browser bundle never pulls in `node:child_process`;
 *  - in the browser the only honest path is the backend API, which is what
 *    `httpRdkitTransport` uses.
 *
 * When neither is reachable the transport reports BLOCKED with the real reason.
 * It never substitutes a value.
 */

/** Descriptor keys the real worker returns. Nothing outside this list is invented. */
export const RDKIT_DESCRIPTOR_KEYS = [
  'molWt', 'exactMolWt', 'crippenLogP', 'hbd', 'hba', 'rotatableBonds',
  'ringCount', 'aromaticRings', 'fractionCsp3', 'tpsa', 'heavyAtomCount',
  'heteroatomCount', 'formalCharge', 'lipinskiViolations',
] as const;

export type RdkitDescriptorKey = (typeof RDKIT_DESCRIPTOR_KEYS)[number];

export interface RdkitDescriptorData {
  canonicalSmiles: string;
  molecularFormula: string;
  /** Numeric descriptors actually returned by the worker for this molecule. */
  values: Readonly<Partial<Record<RdkitDescriptorKey, number>>>;
  /** Real RDKit InChI/InChIKey, when the structure normalises into one — null otherwise, never omitted. */
  inchi: string | null;
  inchiKey: string | null;
}

export type RdkitDetect =
  | { available: true; engine: string; version: string }
  | { available: false; reason: string };

export type RdkitDescribe =
  | { ok: true; data: RdkitDescriptorData; engine: string }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'INVALID_SMILES' | 'EXECUTION_FAILED'; reason: string };

export type RdkitTransform =
  | { ok: true; parentCanonical: string; products: readonly string[]; transformation: string }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'INVALID_SMILES' | 'EXECUTION_FAILED'; reason: string };

export type RdkitTransformations =
  | { ok: true; transformations: readonly string[] }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'EXECUTION_FAILED'; reason: string };

/**
 * Real Tanimoto similarity (Morgan fingerprints) plus a real Bemis-Murcko
 * scaffold comparison between two structures. STRUCTURAL ONLY — see
 * `structuralSimilarity.ts` for the guard that stops this being read as
 * biological similarity.
 */
export type RdkitSimilarity =
  | {
    ok: true;
    tanimoto: number;
    fingerprint: string;
    candidateCanonical: string;
    referenceCanonical: string;
    scaffoldCandidate: string;
    scaffoldReference: string;
    sameScaffold: boolean;
  }
  | { ok: false; error: 'BLOCKED_BY_RUNTIME' | 'INVALID_SMILES' | 'EXECUTION_FAILED'; reason: string };

export interface RdkitTransport {
  transportId: string;
  detect(): RdkitDetect;
  describe(smiles: string): RdkitDescribe;
  /**
   * Applies a declared SMARTS reaction. This is a real structural
   * transformation performed by RDKit, not string surgery on SMILES text.
   */
  transform(smiles: string, transformation: string): RdkitTransform;
  /** Transformation ids the engine really implements. */
  transformations(): RdkitTransformations;
  /** Real structural similarity between `smiles` and `reference`. */
  similarity(smiles: string, reference: string): RdkitSimilarity;
}

/**
 * Narrows an arbitrary worker payload into the descriptor shape. Only finite
 * numbers under known keys survive; anything else is dropped rather than
 * coerced, so a malformed engine reply degrades to "fewer real values", never
 * to a fabricated one.
 */
export function readDescriptorPayload(payload: unknown): RdkitDescriptorData | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const canonicalSmiles = record.canonicalSmiles;
  const molecularFormula = record.molecularFormula;
  if (typeof canonicalSmiles !== 'string' || canonicalSmiles.length === 0) return null;
  if (typeof molecularFormula !== 'string' || molecularFormula.length === 0) return null;

  const values: Partial<Record<RdkitDescriptorKey, number>> = {};
  for (const key of RDKIT_DESCRIPTOR_KEYS) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) values[key] = value;
  }
  const inchi = typeof record.inchi === 'string' && record.inchi.length > 0 ? record.inchi : null;
  const inchiKey = typeof record.inchiKey === 'string' && record.inchiKey.length > 0 ? record.inchiKey : null;
  return { canonicalSmiles, molecularFormula, values, inchi, inchiKey };
}

/**
 * A transport with no engine behind it. Used as the default so that forgetting
 * to wire one up produces an explicit BLOCKED, not a silent absence of data.
 */
const NO_TRANSPORT = 'no RDKit transport configured for this runtime';

export const unavailableRdkitTransport: RdkitTransport = {
  transportId: 'none',
  detect: () => ({ available: false, reason: NO_TRANSPORT }),
  describe: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
  transform: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
  transformations: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
  similarity: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: NO_TRANSPORT }),
};
