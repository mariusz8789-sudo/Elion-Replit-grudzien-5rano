import { computedProperty, unavailableProperty, type MoleculeProperty, type MoleculeStructure } from './types';
import { RDKIT_STRUCTURAL_PROPERTY_IDS, type StructuralChemistryEngine } from './chemistry';
import type { RdkitDescribe, RdkitDescriptorKey, RdkitTransport } from './rdkitTransport';

/**
 * REAL RDKIT STRUCTURAL PROVIDER.
 *
 * Turns descriptor output from the repository's actual RDKit worker into
 * discovery properties with status `COMPUTED`. Every value here was computed by
 * RDKit from a real structure; nothing is derived from a molecular formula,
 * because a formula does not determine a structure.
 *
 * The mapping below is the ONLY place a discovery property id is bound to an
 * RDKit descriptor. A property whose descriptor the worker did not return stays
 * `REQUIRES_EXTERNAL_ENGINE` — including when RDKit ran successfully but does
 * not compute that quantity at all.
 */
export const RDKIT_ENGINE_PREFIX = 'rdkit';

/** discovery property id → the RDKit descriptor key that genuinely produces it. */
export const RDKIT_PROPERTY_MAP: Readonly<Record<string, { key: RdkitDescriptorKey; unit: string }>> = {
  logP: { key: 'crippenLogP', unit: '' },
  tpsa: { key: 'tpsa', unit: 'Å²' },
  hbd: { key: 'hbd', unit: '' },
  hba: { key: 'hba', unit: '' },
  rotatableBonds: { key: 'rotatableBonds', unit: '' },
  ringCount: { key: 'ringCount', unit: '' },
  aromaticRings: { key: 'aromaticRings', unit: '' },
  fractionCsp3: { key: 'fractionCsp3', unit: '' },
  formalCharge: { key: 'formalCharge', unit: 'e' },
  heteroatomCount: { key: 'heteroatomCount', unit: 'atoms' },
  lipinskiViolations: { key: 'lipinskiViolations', unit: '' },
  exactMolecularWeight: { key: 'exactMolWt', unit: 'g/mol' },
};

/**
 * Structural properties from ONE real RDKit run.
 *
 * A blocked or failed run yields every property as unavailable with the honest
 * status: a runtime without RDKit is `REQUIRES_EXTERNAL_ENGINE` (connect the
 * engine and the value appears), while a structure RDKit actively rejected or
 * an engine crash is `NOT_AVAILABLE` (the engine was there and produced no
 * value for this input). Collapsing those two into one status would hide which
 * of "no engine" and "engine says no" actually happened.
 */
export function rdkitStructuralProperties(result: RdkitDescribe): MoleculeProperty[] {
  if (!result.ok) {
    const status = result.error === 'BLOCKED_BY_RUNTIME' ? 'REQUIRES_EXTERNAL_ENGINE' : 'NOT_AVAILABLE';
    return RDKIT_STRUCTURAL_PROPERTY_IDS.map((id) => unavailableProperty(id, status, RDKIT_PROPERTY_MAP[id]?.unit ?? ''));
  }
  return RDKIT_STRUCTURAL_PROPERTY_IDS.map((id) => {
    const mapping = RDKIT_PROPERTY_MAP[id];
    const value = mapping === undefined ? undefined : result.data.values[mapping.key];
    return value === undefined || !Number.isFinite(value)
      ? unavailableProperty(id, 'REQUIRES_EXTERNAL_ENGINE', mapping?.unit ?? '')
      : computedProperty(id, value, mapping.unit, result.engine);
  });
}

/** Structure identity from one real RDKit run — canonicalised by RDKit itself. */
export function rdkitStructure(result: RdkitDescribe): MoleculeStructure {
  return result.ok
    ? { status: 'ACTUAL_SOURCE', canonicalSmiles: result.data.canonicalSmiles, engine: result.engine }
    : { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null };
}

export interface RdkitBatchOptions {
  /** Hard ceiling on worker calls for one batch — bounded work, never an open search. */
  maxCalls?: number;
}

export interface RdkitBatchResult {
  engineId: string;
  detected: ReturnType<RdkitTransport['detect']>;
  /** Real results keyed by the INPUT smiles string. */
  bySmiles: Readonly<Record<string, RdkitDescribe>>;
  callCount: number;
  /** Inputs skipped because the call budget ran out — reported, never silently dropped. */
  skipped: readonly string[];
}

/**
 * Runs RDKit over a bounded list of SMILES. Deduplicates inputs and sorts them
 * so the same batch always issues the same calls in the same order — a
 * requirement for the run to be replayable.
 */
export function describeSmilesBatch(
  transport: RdkitTransport,
  smilesList: readonly string[],
  options: RdkitBatchOptions = {},
): RdkitBatchResult {
  const maxCalls = options.maxCalls ?? 200;
  const detected = transport.detect();
  const unique = [...new Set(smilesList.filter((s) => typeof s === 'string' && s.length > 0))].sort();
  const bySmiles: Record<string, RdkitDescribe> = {};
  const skipped: string[] = [];
  let callCount = 0;

  const engineId = detected.available
    ? `${RDKIT_ENGINE_PREFIX}:${detected.version}:${transport.transportId}`
    : `${RDKIT_ENGINE_PREFIX}:unavailable:${transport.transportId}`;

  for (const smiles of unique) {
    if (!detected.available) {
      bySmiles[smiles] = { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      continue;
    }
    if (callCount >= maxCalls) {
      skipped.push(smiles);
      continue;
    }
    bySmiles[smiles] = transport.describe(smiles);
    callCount += 1;
  }

  return { engineId, detected, bySmiles, callCount, skipped };
}

/**
 * A `StructuralChemistryEngine` backed by real RDKit results, for the
 * formula-keyed enumerator path.
 *
 * The caller must supply the formula → SMILES assignment: this module will not
 * pick a structure for a formula, because many structures share one formula and
 * choosing one would be an invention. A formula with no supplied SMILES, or one
 * whose RDKit run did not succeed, stays unavailable.
 */
export function rdkitStructuralEngine(
  batch: RdkitBatchResult,
  smilesByFormula: Readonly<Record<string, string>>,
): StructuralChemistryEngine {
  const resultFor = (formula: string): RdkitDescribe | null => {
    const smiles = smilesByFormula[formula];
    if (smiles === undefined) return null;
    return batch.bySmiles[smiles] ?? null;
  };

  return {
    engineId: batch.engineId,
    structureFor: (formula) => {
      const result = resultFor(formula);
      return result === null
        ? { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null }
        : rdkitStructure(result);
    },
    propertiesFor: (formula) => {
      const result = resultFor(formula);
      return result === null
        ? RDKIT_STRUCTURAL_PROPERTY_IDS.map((id) => unavailableProperty(id, 'REQUIRES_EXTERNAL_ENGINE', RDKIT_PROPERTY_MAP[id]?.unit ?? ''))
        : rdkitStructuralProperties(result);
    },
  };
}
