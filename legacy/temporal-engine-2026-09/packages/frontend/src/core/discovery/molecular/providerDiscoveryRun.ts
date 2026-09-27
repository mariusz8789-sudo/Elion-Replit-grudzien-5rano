import { canonicalJson, fnv1a } from '../../events/hash';
import type { GenerationRequest, GenerationCapability, MolecularGenerationProvider } from './generationProvider';
import { collectCapabilityGaps, decideBatch, rankRetained, screenBatch } from './screening';
import {
  MOLECULAR_DISCOVERY_CONTRACT_VERSION,
  type DiscoveryBatch,
  type DiscoveryQuestion,
  type DiscoveryResult,
  type PropertyStatus,
} from './types';

/**
 * ETAP 4 — THE SCIENTIFIC LOOP, DRIVEN BY A DECLARED PROVIDER.
 *
 * QUESTION → CONSTRAINTS → GENERATION → STRUCTURAL VALIDATION → SCREENING →
 * RANKING → FALSIFICATION, with the generation METHOD carried in the record.
 *
 * This does not replace `runMolecularDiscovery`: that entry point stays the
 * composition path. This one accepts any `MolecularGenerationProvider`, so the
 * same screening, falsification, evidence, RO-Crate and replay machinery runs
 * unchanged over candidates that came from real RDKit structures.
 *
 * Every stage keeps its provenance. Nothing here decides a molecule is "good";
 * the decision vocabulary is only ever retained / rejected / not-resolved,
 * against criteria declared before the run.
 */
export const PROVIDER_DISCOVERY_RUN_VERSION = '1.0.0';

export interface ProviderDiscoveryResult extends DiscoveryResult {
  /** How the candidates were actually produced — part of the record, not an assumption. */
  generationCapability: GenerationCapability;
  /** Real limits that applied (budget exhausted, engine blocked, ceiling hit). */
  generationNotes: readonly string[];
  generationFingerprint: string;
  /**
   * Structural validation performed by the provider itself, per candidate.
   * `null` means the provider genuinely could not tell — never a silent pass.
   */
  structuralValidation: readonly { candidateId: string; valid: boolean | null; checkedBy: string; reason: string }[];
}

export interface ProviderDiscoveryOptions {
  /**
   * Validate each retained/enumerated candidate through the provider. Costs one
   * engine call per candidate, so it is bounded and opt-in.
   */
  validateCandidates?: boolean;
  /** Ceiling on validation calls when enabled. */
  maxValidations?: number;
}

export function runProviderMolecularDiscovery(
  question: DiscoveryQuestion,
  provider: MolecularGenerationProvider,
  request: GenerationRequest,
  options: ProviderDiscoveryOptions = {},
): ProviderDiscoveryResult {
  const capability = provider.capabilities();
  const generated = provider.generateCandidates(request);

  // The batch shape the rest of the pipeline already consumes. Nothing is
  // recomputed here: these are the provider's own candidates and discards.
  const batchFingerprint = fnv1a(canonicalJson({
    v: PROVIDER_DISCOVERY_RUN_VERSION,
    method: capability.methodId,
    generationFingerprint: generated.generationFingerprint,
  }));

  const batch: DiscoveryBatch = {
    batchId: `batch_${batchFingerprint}`,
    seedFormulas: request.seeds,
    transformations: [...request.transformations].sort(),
    candidates: generated.candidates,
    discarded: generated.discarded,
    batchFingerprint,
  };

  const assessments = screenBatch(batch, question.constraints);
  const ranking = rankRetained(assessments);
  const decision = decideBatch(assessments);
  const capabilityGaps = collectCapabilityGaps(assessments) as readonly { propertyId: string; status: PropertyStatus; detail: string }[];

  const structuralValidation: { candidateId: string; valid: boolean | null; checkedBy: string; reason: string }[] = [];
  if (options.validateCandidates === true) {
    const budget = options.maxValidations ?? 50;
    for (const candidate of generated.candidates.slice(0, budget)) {
      const validation = provider.validateCandidate(candidate);
      structuralValidation.push({
        candidateId: candidate.candidateId,
        valid: validation.valid,
        checkedBy: validation.checkedBy,
        reason: validation.valid === true ? '' : validation.reason,
      });
    }
  }

  const resultFingerprint = fnv1a(canonicalJson({
    v: PROVIDER_DISCOVERY_RUN_VERSION,
    question,
    request: {
      seeds: [...request.seeds].sort(),
      transformations: [...request.transformations].sort(),
      depth: request.depth,
      maxCandidates: request.maxCandidates,
    },
    // The generation METHOD is part of the identity of the run: the same
    // candidates produced by a different method are a different experiment.
    method: { kind: capability.kind, methodId: capability.methodId },
    batchFingerprint,
    assessments,
    decision,
  }));

  return {
    contractVersion: MOLECULAR_DISCOVERY_CONTRACT_VERSION,
    question,
    batch,
    assessments,
    ranking,
    decision,
    capabilityGaps,
    resultFingerprint,
    generationCapability: capability,
    generationNotes: generated.notes,
    generationFingerprint: generated.generationFingerprint,
    structuralValidation,
  };
}

/**
 * The honest one-line summary of a provider-driven run, for reports and UI.
 * It names the method and refuses to imply more than the run supports.
 */
export function describeProviderRun(result: ProviderDiscoveryResult): string {
  const method = result.generationCapability.kind === 'REAL_GENERATIVE_MODEL'
    ? `generative model ${result.generationCapability.methodId}`
    : result.generationCapability.kind === 'DETERMINISTIC_ENUMERATOR'
      ? `deterministic enumerator ${result.generationCapability.methodId}`
      : `${result.generationCapability.kind} (${result.generationCapability.methodId})`;

  return [
    `${result.batch.candidates.length} candidate(s) from ${method}`,
    `${result.decision.retainedCount} retained, ${result.decision.rejectedCount} rejected on real values, ${result.decision.notResolvedCount} not evaluable`,
    `verdict ${result.decision.verdict}`,
  ].join('; ');
}
