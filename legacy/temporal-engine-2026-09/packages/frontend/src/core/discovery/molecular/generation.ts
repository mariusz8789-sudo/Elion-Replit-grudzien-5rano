import { degreeOfUnsaturation } from '../../compute/cheminformatics';
import { canonicalJson, fnv1a } from '../../events/hash';
import { experimentalProperties, formulaProperties, unavailableStructuralEngine, validateFormula, type StructuralChemistryEngine } from './chemistry';
import type { DiscoveryConstraints, DiscoveryBatch, MoleculeCandidate } from './types';

/**
 * DETERMINISTIC COMPOSITION ENUMERATOR — named for exactly what it is.
 *
 * This is NOT a generative model and must never be described as one. It walks
 * a declared set of composition transformations (add/remove a small group of
 * atoms) outward from declared seed formulas, validates every product with the
 * REAL formula parser, canonicalises it to Hill notation, and deduplicates on
 * that canonical form. Same seeds + same transformations + same depth always
 * produce the same batch, in the same order.
 *
 * A molecular formula does not determine a structure. Nothing here claims a
 * synthesisable molecule, a structure, or a bioactivity — a candidate here is
 * a composition that satisfies declared composition constraints, and its
 * structural identity is `REQUIRES_EXTERNAL_ENGINE` until a real chemistry
 * engine resolves one.
 *
 * The repository's SMILES-level counterpart (real RDKit SMARTS reactions,
 * `packages/backend/src/campaign/drugAdapter.mjs::generateProposals`) is the
 * structural version of this step and is blocked wherever RDKit is absent.
 */
export const COMPOSITION_ENUMERATOR_VERSION = '1.0.0';

/**
 * Declared composition transformations, as explicit atom-count deltas.
 *
 * These model SUBSTITUTION of a hydrogen (the same operation the repository's
 * real RDKit SMARTS reactions perform, e.g. `[cH:1]>>[c:1]O`), not naive
 * addition — substituting H with OH is a net +O, not +O+H. Getting this wrong
 * produces radicals: `C6H6 + {O,H}` would be C6H7O, a fractional-unsaturation
 * composition that no neutral molecule can have. The plausibility guard below
 * caught exactly that during development.
 *
 * Reference products: benzene C6H6 → toluene C7H8 (add-CH2), phenol C6H6O
 * (add-OH), aniline C6H7N (add-NH2), fluorobenzene C6H5F (add-F).
 */
export const COMPOSITION_TRANSFORMATIONS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'add-CH2': { C: 1, H: 2 },
  'add-OH': { O: 1 },
  'add-NH2': { N: 1, H: 1 },
  'add-F': { F: 1, H: -1 },
  'remove-CH2': { C: -1, H: -2 },
};

export function listCompositionTransformations(): readonly string[] {
  return Object.keys(COMPOSITION_TRANSFORMATIONS).sort();
}

export interface GenerationSpec {
  seedFormulas: readonly string[];
  transformations: readonly string[];
  /** How many transformation rounds to apply outward from the seeds. */
  depth: number;
  /** Hard ceiling so a spike stays CI-sized; enumeration stops deterministically at this count. */
  maxCandidates: number;
}

function applyDelta(counts: Record<string, number>, delta: Readonly<Record<string, number>>): Record<string, number> | null {
  const next: Record<string, number> = { ...counts };
  for (const [element, change] of Object.entries(delta)) {
    const updated = (next[element] ?? 0) + change;
    if (updated < 0) return null; // would remove atoms that are not there
    if (updated === 0) delete next[element];
    else next[element] = updated;
  }
  return Object.keys(next).length === 0 ? null : next;
}

function candidateId(formula: string): string {
  return `cand_${fnv1a(canonicalJson({ v: COMPOSITION_ENUMERATOR_VERSION, formula }))}`;
}

/**
 * Composition-level plausibility. Pure arithmetic on atom counts can produce
 * compositions that are not chemically meaningful, so two real constraints are
 * enforced before a product is admitted:
 *
 *  1. it must still contain carbon — this is declared as an ORGANIC composition
 *     enumerator, and "remove-CH2" applied to CH4 arithmetically yields H2,
 *     which is not the chemical operation the transformation names;
 *  2. its degree of unsaturation must be a non-negative integer — a fractional
 *     or negative DoU (e.g. CH5) cannot correspond to any real molecule.
 *
 * This is a genuine filter, not cosmetics: it was added because the enumerator
 * demonstrably emitted H2 from CH4 before it existed.
 */
function compositionPlausibility(counts: Record<string, number>): { ok: true } | { ok: false; reason: string } {
  if ((counts.C ?? 0) < 1) return { ok: false, reason: 'implausible_composition:no_carbon' };
  const dou = degreeOfUnsaturation(counts);
  if (!Number.isFinite(dou) || dou < 0) return { ok: false, reason: `implausible_composition:negative_unsaturation:${dou}` };
  if (!Number.isInteger(dou)) return { ok: false, reason: `implausible_composition:fractional_unsaturation:${dou}` };
  return { ok: true };
}

function buildCandidate(
  formula: string,
  counts: Record<string, number>,
  parentFormula: string | null,
  transformation: string | null,
  structural: StructuralChemistryEngine,
): MoleculeCandidate {
  return {
    candidateId: candidateId(formula),
    formula,
    structure: structural.structureFor(formula),
    parentFormula,
    transformation,
    properties: [...formulaProperties(counts), ...structural.propertiesFor(formula), ...experimentalProperties()],
    origin: parentFormula === null ? 'SEED' : 'ENUMERATED',
  };
}

/**
 * Enumerates the candidate batch. Every discard is recorded with its reason —
 * invalid formula, duplicate, disallowed element, or over the heavy-atom
 * ceiling — so nothing silently disappears from the record.
 */
export function generateCandidateBatch(
  spec: GenerationSpec,
  constraints: DiscoveryConstraints,
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
): DiscoveryBatch {
  const allowed = new Set(constraints.allowedElements);
  const transformations = [...spec.transformations].sort();
  const candidates: MoleculeCandidate[] = [];
  const discarded: { formula: string; reason: string }[] = [];
  const seen = new Set<string>();

  const admit = (formula: string, counts: Record<string, number>, parentFormula: string | null, transformation: string | null): boolean => {
    const plausible = compositionPlausibility(counts);
    if (!plausible.ok) {
      discarded.push({ formula, reason: plausible.reason });
      return false;
    }
    const disallowed = Object.keys(counts).filter((element) => !allowed.has(element));
    if (disallowed.length > 0) {
      discarded.push({ formula, reason: `disallowed_element:${disallowed.sort().join(',')}` });
      return false;
    }
    const heavy = Object.entries(counts).filter(([element]) => element !== 'H').reduce((sum, [, n]) => sum + n, 0);
    if (heavy > constraints.maxHeavyAtoms) {
      discarded.push({ formula, reason: `heavy_atoms_over_limit:${heavy}>${constraints.maxHeavyAtoms}` });
      return false;
    }
    if (seen.has(formula)) {
      discarded.push({ formula, reason: 'duplicate' });
      return false;
    }
    seen.add(formula);
    candidates.push(buildCandidate(formula, counts, parentFormula, transformation, structural));
    return true;
  };

  // Round 0: declared seeds, validated by the real parser.
  let frontier: { formula: string; counts: Record<string, number> }[] = [];
  for (const seed of spec.seedFormulas) {
    const validation = validateFormula(seed);
    if (!validation.ok || validation.canonical === null) {
      discarded.push({ formula: seed, reason: `invalid_formula:${validation.error ?? 'unknown'}` });
      continue;
    }
    if (admit(validation.canonical, validation.counts, null, null)) {
      frontier.push({ formula: validation.canonical, counts: validation.counts });
    }
  }

  // Rounds 1..depth: apply every declared transformation to every frontier member.
  for (let round = 0; round < spec.depth && candidates.length < spec.maxCandidates; round++) {
    const nextFrontier: { formula: string; counts: Record<string, number> }[] = [];
    for (const parent of frontier) {
      for (const transformation of transformations) {
        if (candidates.length >= spec.maxCandidates) break;
        const delta = COMPOSITION_TRANSFORMATIONS[transformation];
        if (delta === undefined) {
          discarded.push({ formula: parent.formula, reason: `unknown_transformation:${transformation}` });
          continue;
        }
        const productCounts = applyDelta(parent.counts, delta);
        if (productCounts === null) continue; // transformation not applicable to this composition
        const validation = validateFormula(Object.entries(productCounts).map(([element, n]) => `${element}${n}`).join(''));
        if (!validation.ok || validation.canonical === null) {
          discarded.push({ formula: parent.formula, reason: `invalid_product:${validation.error ?? 'unknown'}` });
          continue;
        }
        if (admit(validation.canonical, validation.counts, parent.formula, transformation)) {
          nextFrontier.push({ formula: validation.canonical, counts: validation.counts });
        }
      }
    }
    frontier = nextFrontier;
  }

  const batchFingerprint = fnv1a(canonicalJson({
    v: COMPOSITION_ENUMERATOR_VERSION,
    spec: { ...spec, transformations },
    constraints,
    structuralEngine: structural.engineId,
    candidates: candidates.map((c) => c.formula),
  }));

  return {
    batchId: `batch_${batchFingerprint}`,
    seedFormulas: spec.seedFormulas,
    transformations,
    candidates,
    discarded,
    batchFingerprint,
  };
}
