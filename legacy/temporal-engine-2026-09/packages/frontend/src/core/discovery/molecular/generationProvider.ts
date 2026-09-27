import { canonicalJson, fnv1a } from '../../events/hash';
import type { DiscoveryConstraints, MoleculeCandidate } from './types';

/**
 * MOLECULAR GENERATION PROVIDER — a durable contract for where candidates come
 * from, so that the SOURCE of a candidate is part of the record rather than an
 * assumption a reader has to make.
 *
 * The method kinds are deliberately not interchangeable:
 *
 *  - REAL_GENERATIVE_MODEL — a trained generative model with a real inference
 *    path actually ran. Genesis has no such model on this path; see
 *    `generativeProvider.ts`. This kind must never be claimed by an enumerator.
 *  - DETERMINISTIC_ENUMERATOR — a rule-based walk over declared transformations.
 *    Reproducible, explainable, and NOT artificial intelligence. Both the
 *    composition enumerator and the RDKit SMARTS enumerator are this kind.
 *  - EXTERNAL_PROVIDER — candidates supplied by an outside service or dataset.
 *  - NOT_AVAILABLE — no generation path exists in this runtime.
 *
 * Naming discipline: an enumerator is called an enumerator. Describing a
 * deterministic rule walk as a generative model would misrepresent both what
 * ran and how much its output is worth.
 */
export const GENERATION_PROVIDER_CONTRACT_VERSION = '1.0.0';

export type GenerationMethodKind =
  | 'REAL_GENERATIVE_MODEL'
  | 'DETERMINISTIC_ENUMERATOR'
  | 'EXTERNAL_PROVIDER'
  | 'NOT_AVAILABLE';

export interface GenerationCapability {
  kind: GenerationMethodKind;
  /** Stable identifier of the concrete method, e.g. "composition-enumerator@1.0.0". */
  methodId: string;
  /** Human-readable description of what actually runs. No marketing language. */
  description: string;
  /** True only when this provider can produce candidates in THIS runtime right now. */
  available: boolean;
  /** Why it is unavailable, when it is. Empty string when available. */
  reason: string;
  /** True when the same request always yields the same candidates in the same order. */
  deterministic: boolean;
  /** Whether candidates carry a real structure (SMILES) or only a composition. */
  producesStructures: boolean;
}

export interface GenerationRequest {
  /** Starting points. Interpretation is provider-specific (formulas or SMILES). */
  seeds: readonly string[];
  /** Declared transformation ids the provider may apply. */
  transformations: readonly string[];
  /** Rounds of expansion outward from the seeds. */
  depth: number;
  /** Hard ceiling on produced candidates — bounded work, never an open search. */
  maxCandidates: number;
  constraints: DiscoveryConstraints;
}

export interface GenerationOutcome {
  capability: GenerationCapability;
  candidates: readonly MoleculeCandidate[];
  /** Everything rejected before screening, with the reason. Nothing disappears silently. */
  discarded: readonly { formula: string; reason: string }[];
  /** Deterministic digest of method + request + produced candidates. */
  generationFingerprint: string;
  /** Real limits that applied to this run (budget exhausted, engine blocked, ...). */
  notes: readonly string[];
}

export interface MolecularGenerationProvider {
  capabilities(): GenerationCapability;
  generateCandidates(request: GenerationRequest): GenerationOutcome;
  /** Structural validity of one candidate, as far as this provider can really tell. */
  validateCandidate(candidate: MoleculeCandidate): CandidateValidation;
}

export type CandidateValidation =
  | { valid: true; checkedBy: string }
  | { valid: false; checkedBy: string; reason: string }
  | { valid: null; checkedBy: string; reason: string };

/** Deterministic fingerprint over what was asked for and what came back. */
export function generationFingerprint(
  capability: GenerationCapability,
  request: GenerationRequest,
  candidates: readonly MoleculeCandidate[],
): string {
  return fnv1a(canonicalJson({
    v: GENERATION_PROVIDER_CONTRACT_VERSION,
    method: { kind: capability.kind, methodId: capability.methodId },
    request: {
      seeds: [...request.seeds].sort(),
      transformations: [...request.transformations].sort(),
      depth: request.depth,
      maxCandidates: request.maxCandidates,
      constraints: request.constraints,
    },
    candidates: candidates.map((c) => ({ f: c.formula, s: c.structure.canonicalSmiles })),
  }));
}

/**
 * An explicitly empty provider. Returns NOT_AVAILABLE with a real reason and
 * zero candidates — never an empty success that a caller could mistake for
 * "the chemical space contains nothing".
 */
export function unavailableGenerationProvider(methodId: string, reason: string): MolecularGenerationProvider {
  const capability: GenerationCapability = {
    kind: 'NOT_AVAILABLE',
    methodId,
    description: 'No generation path is available in this runtime.',
    available: false,
    reason,
    deterministic: false,
    producesStructures: false,
  };
  return {
    capabilities: () => capability,
    generateCandidates: (request) => ({
      capability,
      candidates: [],
      discarded: [],
      generationFingerprint: generationFingerprint(capability, request, []),
      notes: [`Generation did not run: ${reason}. Zero candidates here means "not attempted", not "none exist".`],
    }),
    validateCandidate: () => ({ valid: null, checkedBy: methodId, reason }),
  };
}
