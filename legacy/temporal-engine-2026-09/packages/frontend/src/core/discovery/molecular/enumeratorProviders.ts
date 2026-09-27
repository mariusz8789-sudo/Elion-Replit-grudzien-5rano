import { canonicalJson, fnv1a } from '../../events/hash';
import { experimentalProperties, formulaProperties, validateFormula, type StructuralChemistryEngine } from './chemistry';
import { generateCandidateBatch, COMPOSITION_ENUMERATOR_VERSION, type GenerationSpec } from './generation';
import {
  generationFingerprint,
  type CandidateValidation,
  type GenerationCapability,
  type GenerationOutcome,
  type GenerationRequest,
  type MolecularGenerationProvider,
} from './generationProvider';
import { describeSmilesBatch, rdkitStructuralProperties, rdkitStructure } from './rdkitStructuralProvider';
import type { RdkitTransport } from './rdkitTransport';
import { unavailableStructuralEngine } from './chemistry';
import type { MoleculeCandidate } from './types';

/**
 * TWO REAL PROVIDERS — both DETERMINISTIC_ENUMERATOR, neither an AI.
 *
 * 1. Composition enumerator: walks atom-count deltas over molecular formulas.
 *    Always available (pure arithmetic on the real formula parser), but a
 *    formula is not a structure, so it produces no structures.
 *
 * 2. RDKit SMARTS enumerator: applies REAL reaction SMARTS through RDKit to
 *    real SMILES, producing real, RDKit-canonicalised structures with real
 *    descriptors. Available only where RDKit is; otherwise honestly blocked.
 *
 * The second is strictly better science and is preferred when available. The
 * first remains a legal fallback, and is never dressed up as more than it is.
 */

export const COMPOSITION_PROVIDER_ID = `composition-enumerator@${COMPOSITION_ENUMERATOR_VERSION}`;
export const RDKIT_SMARTS_PROVIDER_ID = 'rdkit-smarts-enumerator@1.0.0';

/* ------------------------------------------------------------------ */
/* 1. Composition enumerator (always available, no structures)         */
/* ------------------------------------------------------------------ */

export function compositionEnumeratorProvider(
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
): MolecularGenerationProvider {
  const capability: GenerationCapability = {
    kind: 'DETERMINISTIC_ENUMERATOR',
    methodId: COMPOSITION_PROVIDER_ID,
    description:
      'Rule-based walk over declared atom-count deltas on molecular formulas. Reproducible and explainable; it is not a generative model and does not produce structures.',
    available: true,
    reason: '',
    deterministic: true,
    producesStructures: false,
  };

  return {
    capabilities: () => capability,

    generateCandidates(request: GenerationRequest): GenerationOutcome {
      const spec: GenerationSpec = {
        seedFormulas: request.seeds,
        transformations: request.transformations,
        depth: request.depth,
        maxCandidates: request.maxCandidates,
      };
      const batch = generateCandidateBatch(spec, request.constraints, structural);
      return {
        capability,
        candidates: batch.candidates,
        discarded: batch.discarded,
        generationFingerprint: generationFingerprint(capability, request, batch.candidates),
        notes: batch.candidates.length >= request.maxCandidates
          ? [`Candidate ceiling of ${request.maxCandidates} reached; enumeration stopped deterministically at that point.`]
          : [],
      };
    },

    validateCandidate(candidate: MoleculeCandidate): CandidateValidation {
      const validation = validateFormula(candidate.formula);
      if (!validation.ok) return { valid: false, checkedBy: COMPOSITION_PROVIDER_ID, reason: validation.error ?? 'invalid_formula' };
      // A valid formula says nothing about whether a molecule exists — the
      // honest answer to "is this candidate a real molecule" is unknown here.
      return {
        valid: null,
        checkedBy: COMPOSITION_PROVIDER_ID,
        reason: 'Composition is well-formed, but a formula does not determine a structure; structural validity requires a chemistry engine.',
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. RDKit SMARTS enumerator (real structures, when RDKit is present) */
/* ------------------------------------------------------------------ */

function candidateIdFor(smiles: string): string {
  return `cand_${fnv1a(canonicalJson({ v: RDKIT_SMARTS_PROVIDER_ID, smiles }))}`;
}

/**
 * Builds a candidate from ONE real RDKit descriptor run. Composition
 * properties are recomputed from the formula RDKit itself reported, so both
 * families of values describe the same molecule.
 */
function candidateFromRdkit(
  smiles: string,
  parentSmiles: string | null,
  transformation: string | null,
  batch: ReturnType<typeof describeSmilesBatch>,
): MoleculeCandidate | null {
  const result = batch.bySmiles[smiles];
  if (result === undefined || !result.ok) return null;

  const parsed = validateFormula(result.data.molecularFormula);
  const composition = parsed.ok ? formulaProperties(parsed.counts) : [];

  return {
    candidateId: candidateIdFor(result.data.canonicalSmiles),
    formula: parsed.canonical ?? result.data.molecularFormula,
    structure: rdkitStructure(result),
    parentFormula: parentSmiles,
    transformation,
    properties: [...composition, ...rdkitStructuralProperties(result), ...experimentalProperties()],
    origin: parentSmiles === null ? 'SEED' : 'ENUMERATED',
  };
}

export interface RdkitEnumeratorOptions {
  /** Hard ceiling on descriptor calls for one generation run (ETAP 11 bounds). */
  maxDescriptorCalls?: number;
  /** Products kept per (parent, transformation) pair, deterministically. */
  maxPerTransform?: number;
}

export function rdkitSmartsEnumeratorProvider(
  transport: RdkitTransport,
  options: RdkitEnumeratorOptions = {},
): MolecularGenerationProvider {
  const maxPerTransform = options.maxPerTransform ?? 3;
  const detected = transport.detect();

  const capability: GenerationCapability = {
    kind: 'DETERMINISTIC_ENUMERATOR',
    methodId: RDKIT_SMARTS_PROVIDER_ID,
    description:
      'Applies declared reaction SMARTS to real SMILES through RDKit. Products are canonicalised and described by RDKit itself. Deterministic rule application — not a generative model.',
    available: detected.available,
    reason: detected.available ? '' : detected.reason,
    deterministic: true,
    producesStructures: true,
  };

  return {
    capabilities: () => capability,

    generateCandidates(request: GenerationRequest): GenerationOutcome {
      if (!detected.available) {
        return {
          capability,
          candidates: [],
          discarded: [],
          generationFingerprint: generationFingerprint(capability, request, []),
          notes: [`RDKit is not available in this runtime (${detected.reason}); no structural candidates were generated. Zero here means "not attempted".`],
        };
      }

      const notes: string[] = [];
      const discarded: { formula: string; reason: string }[] = [];
      // Deterministic order: sorted transformations, seeds in declared order.
      const transformations = [...request.transformations].sort();

      // Lineage of every SMILES reached, so a candidate can name its parent.
      const lineage = new Map<string, { parent: string | null; transformation: string | null }>();
      let frontier: string[] = [];

      for (const seed of request.seeds) {
        const canonical = transport.describe(seed);
        if (!canonical.ok) {
          discarded.push({ formula: seed, reason: `seed_rejected_by_rdkit:${canonical.error}` });
          continue;
        }
        const smiles = canonical.data.canonicalSmiles;
        if (!lineage.has(smiles)) {
          lineage.set(smiles, { parent: null, transformation: null });
          frontier.push(smiles);
        }
      }

      for (let round = 0; round < request.depth && lineage.size < request.maxCandidates; round++) {
        const next: string[] = [];
        for (const parent of frontier) {
          for (const transformation of transformations) {
            if (lineage.size >= request.maxCandidates) break;
            const applied = transport.transform(parent, transformation);
            if (!applied.ok) {
              discarded.push({ formula: parent, reason: `transform_failed:${transformation}:${applied.error}` });
              continue;
            }
            const products = [...new Set(applied.products)].sort().slice(0, maxPerTransform);
            for (const product of products) {
              if (lineage.size >= request.maxCandidates) break;
              if (lineage.has(product)) {
                discarded.push({ formula: product, reason: 'duplicate' });
                continue;
              }
              lineage.set(product, { parent, transformation });
              next.push(product);
            }
          }
        }
        frontier = next;
      }

      if (lineage.size >= request.maxCandidates) {
        notes.push(`Candidate ceiling of ${request.maxCandidates} reached; enumeration stopped deterministically at that point.`);
      }

      // One bounded descriptor pass over everything reached.
      const allSmiles = [...lineage.keys()].sort();
      const batch = describeSmilesBatch(transport, allSmiles, { maxCalls: options.maxDescriptorCalls ?? 200 });
      if (batch.skipped.length > 0) {
        notes.push(`${batch.skipped.length} structure(s) exceeded the descriptor call budget and carry no computed properties.`);
      }

      const candidates: MoleculeCandidate[] = [];
      for (const smiles of allSmiles) {
        const origin = lineage.get(smiles)!;
        const candidate = candidateFromRdkit(smiles, origin.parent, origin.transformation, batch);
        if (candidate === null) {
          discarded.push({ formula: smiles, reason: 'no_descriptors_available' });
          continue;
        }
        // Declared constraints apply to real structures too.
        const heavy = candidate.properties.find((p) => p.propertyId === 'heavyAtomCount')?.value;
        if (typeof heavy === 'number' && heavy > request.constraints.maxHeavyAtoms) {
          discarded.push({ formula: candidate.formula, reason: `heavy_atoms_over_limit:${heavy}>${request.constraints.maxHeavyAtoms}` });
          continue;
        }
        candidates.push(candidate);
      }

      return {
        capability,
        candidates,
        discarded,
        generationFingerprint: generationFingerprint(capability, request, candidates),
        notes,
      };
    },

    validateCandidate(candidate: MoleculeCandidate): CandidateValidation {
      if (candidate.structure.canonicalSmiles === null) {
        return { valid: null, checkedBy: RDKIT_SMARTS_PROVIDER_ID, reason: 'Candidate carries no structure to validate.' };
      }
      if (!detected.available) {
        return { valid: null, checkedBy: RDKIT_SMARTS_PROVIDER_ID, reason: detected.reason };
      }
      const result = transport.describe(candidate.structure.canonicalSmiles);
      return result.ok
        ? { valid: true, checkedBy: `RDKit ${detected.version}` }
        : { valid: false, checkedBy: `RDKit ${detected.version}`, reason: result.reason };
    },
  };
}

/**
 * Picks the strongest provider this runtime can actually run: the structural
 * RDKit enumerator when RDKit is present, the composition enumerator otherwise.
 * The chosen capability travels with the result, so a reader always sees which
 * one produced the candidates rather than having to infer it.
 */
export function selectGenerationProvider(
  transport: RdkitTransport,
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
  options: RdkitEnumeratorOptions = {},
): MolecularGenerationProvider {
  const rdkit = rdkitSmartsEnumeratorProvider(transport, options);
  return rdkit.capabilities().available ? rdkit : compositionEnumeratorProvider(structural);
}
