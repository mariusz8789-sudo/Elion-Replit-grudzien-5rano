import { atomCount, degreeOfUnsaturation, hillFormula, molecularWeight, parseFormula } from '../../compute/cheminformatics';
import { computedProperty, unavailableProperty, type MoleculeProperty, type MoleculeStructure, type PropertyStatus } from './types';

/**
 * CHEMISTRY PROVIDERS.
 *
 * `formulaChemistry` is REAL and always available: it is the existing,
 * deterministic `core/compute/cheminformatics.ts` (IUPAC atomic masses, Hill
 * canonicalisation, degree of unsaturation) — no new chemistry was written
 * here, it is wired into the discovery contract.
 *
 * `structuralChemistry` is the boundary for a REAL structural engine (RDKit,
 * which lives in `packages/backend/src/compute/rdkitAdapter.mjs`). Without an
 * injected engine it returns `REQUIRES_EXTERNAL_ENGINE` for every structural
 * property — it never estimates logP, TPSA, HBD/HBA or fingerprints itself.
 */
export const FORMULA_CHEMISTRY_ENGINE = 'genesis-formula-chemistry@1.0.0';

/** Properties the formula engine can genuinely compute from composition alone. */
export const FORMULA_PROPERTY_IDS = ['molecularWeight', 'heavyAtomCount', 'degreeOfUnsaturation'] as const;

/**
 * Properties that require a real structural engine. A molecular formula does
 * not determine a structure, so these can never be derived from composition.
 */
export const STRUCTURAL_PROPERTY_IDS = ['logP', 'tpsa', 'hbd', 'hba', 'rotatableBonds'] as const;

/**
 * The full set a REAL RDKit run can resolve — every id here is backed by a
 * descriptor `rdkit_worker.py` actually computes (see RDKIT_PROPERTY_MAP in
 * `rdkitStructuralProvider.ts`). It is a superset of STRUCTURAL_PROPERTY_IDS:
 * the extra ids are only reachable with RDKit connected, and are reported
 * unavailable rather than omitted when it is not, so the gap stays visible.
 */
export const RDKIT_STRUCTURAL_PROPERTY_IDS = [
  ...STRUCTURAL_PROPERTY_IDS,
  'ringCount', 'aromaticRings', 'fractionCsp3', 'formalCharge', 'heteroatomCount',
  'lipinskiViolations', 'exactMolecularWeight',
] as const;

/** Properties with no engine at all in this repository for this path. */
export const EXPERIMENTAL_PROPERTY_IDS = ['targetAffinity', 'admetAbsorption', 'toxicity', 'safety'] as const;

export interface FormulaValidation {
  ok: boolean;
  /** Hill-canonical formula; `null` when invalid. */
  canonical: string | null;
  counts: Record<string, number>;
  error?: string;
}

/** Real validation + canonicalisation through the existing formula parser. */
export function validateFormula(formula: string): FormulaValidation {
  const parsed = parseFormula(formula);
  if (!parsed.ok) return { ok: false, canonical: null, counts: {}, error: parsed.error ?? 'invalid_formula' };
  const counts = parsed.counts;
  if (Object.keys(counts).length === 0) return { ok: false, canonical: null, counts: {}, error: 'empty_formula' };
  return { ok: true, canonical: hillFormula(counts), counts };
}

/** Real, computed composition properties. Nothing here is estimated. */
export function formulaProperties(counts: Record<string, number>): MoleculeProperty[] {
  const heavy = atomCount(counts) - (counts.H ?? 0);
  return [
    computedProperty('molecularWeight', Number(molecularWeight(counts).toFixed(3)), 'g/mol', FORMULA_CHEMISTRY_ENGINE),
    computedProperty('heavyAtomCount', heavy, 'atoms', FORMULA_CHEMISTRY_ENGINE),
    computedProperty('degreeOfUnsaturation', degreeOfUnsaturation(counts), '', FORMULA_CHEMISTRY_ENGINE),
  ];
}

/**
 * A real structural engine, when one is actually connected. Implementations
 * must return values ONLY for properties the engine really computed.
 */
export interface StructuralChemistryEngine {
  engineId: string;
  /** Canonical structure for a candidate, when the engine can resolve one. */
  structureFor(formula: string): MoleculeStructure;
  /** Structural properties the engine really computed for that structure. */
  propertiesFor(formula: string): readonly MoleculeProperty[];
}

/**
 * Default structural provider: NO engine. Returns `REQUIRES_EXTERNAL_ENGINE`
 * for every structural property and for the structure itself. This is the
 * honest state of this repository when RDKit is not installed in the runtime.
 */
export const unavailableStructuralEngine: StructuralChemistryEngine = {
  engineId: 'none',
  structureFor: () => ({ status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null }),
  propertiesFor: () => STRUCTURAL_PROPERTY_IDS.map((id) => unavailableProperty(id, 'REQUIRES_EXTERNAL_ENGINE')),
};

/**
 * Real structural descriptors, supplied BY a real engine run.
 *
 * A molecular formula does not determine a structure, so this module can never
 * derive logP/TPSA/HBD/HBA from composition — and it must never pick a
 * structure for a formula on its own. The only honest way to attach structural
 * values is for the caller to bring them from an actual engine run together
 * with the structure they were computed for. That is exactly what this takes:
 * a map keyed by Hill formula, each entry carrying the canonical SMILES the
 * engine canonicalised and the descriptor values it really computed.
 *
 * Any formula not present in the map stays `REQUIRES_EXTERNAL_ENGINE`. Nothing
 * is interpolated, defaulted or guessed.
 */
export interface StructuralEngineRecord {
  canonicalSmiles: string;
  /** Descriptor values the engine actually produced, keyed by property id. */
  descriptors: Readonly<Record<string, number>>;
}

export function structuralEngineFromRecords(
  engineId: string,
  records: Readonly<Record<string, StructuralEngineRecord>>,
  status: Extract<PropertyStatus, 'ACTUAL_SOURCE' | 'USER_SUPPLIED' | 'TEST_FIXTURE'> = 'ACTUAL_SOURCE',
): StructuralChemistryEngine {
  return {
    engineId,
    structureFor: (formula) => {
      const record = records[formula];
      return record === undefined
        ? { status: 'REQUIRES_EXTERNAL_ENGINE', canonicalSmiles: null, engine: null }
        : { status, canonicalSmiles: record.canonicalSmiles, engine: engineId };
    },
    propertiesFor: (formula) => {
      const record = records[formula];
      return STRUCTURAL_PROPERTY_IDS.map((propertyId) => {
        const value = record?.descriptors[propertyId];
        return value === undefined || !Number.isFinite(value)
          ? unavailableProperty(propertyId, 'REQUIRES_EXTERNAL_ENGINE')
          : { propertyId, status, value, unit: '', engine: engineId };
      });
    },
  };
}

/** Properties that need a wet-lab or an external predictive model — never guessed. */
export function experimentalProperties(): MoleculeProperty[] {
  return [
    unavailableProperty('targetAffinity', 'REQUIRES_EXTERNAL_ENGINE', 'kcal/mol'),
    unavailableProperty('admetAbsorption', 'REQUIRES_EXTERNAL_ENGINE', ''),
    unavailableProperty('toxicity', 'REQUIRES_EXTERNAL_ENGINE', ''),
    unavailableProperty('safety', 'REQUIRES_EXPERIMENT', ''),
  ];
}
