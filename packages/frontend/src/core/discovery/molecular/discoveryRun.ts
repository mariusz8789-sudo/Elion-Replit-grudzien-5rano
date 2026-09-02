import { canonicalJson, fnv1a } from '../../events/hash';
import { unavailableStructuralEngine, type StructuralChemistryEngine } from './chemistry';
import { generateCandidateBatch, type GenerationSpec } from './generation';
import { collectCapabilityGaps, decideBatch, rankRetained, screenBatch } from './screening';
import { MOLECULAR_DISCOVERY_CONTRACT_VERSION, type DiscoveryQuestion, type DiscoveryResult, type PropertyStatus } from './types';

/**
 * ONE DISCOVERY RUN: question + constraints → enumerated batch → screening →
 * ranking → falsification decision. Pure and deterministic; the only chemistry
 * it performs is delegated to the providers in `chemistry.ts`.
 */
export const DISCOVERY_RUN_VERSION = '1.0.0';

export function runMolecularDiscovery(
  question: DiscoveryQuestion,
  generation: GenerationSpec,
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
): DiscoveryResult {
  const batch = generateCandidateBatch(generation, question.constraints, structural);
  const assessments = screenBatch(batch, question.constraints);
  const ranking = rankRetained(assessments);
  const decision = decideBatch(assessments);
  const capabilityGaps = collectCapabilityGaps(assessments) as readonly { propertyId: string; status: PropertyStatus; detail: string }[];

  const resultFingerprint = fnv1a(canonicalJson({
    v: DISCOVERY_RUN_VERSION,
    question,
    generation,
    structuralEngine: structural.engineId,
    batchFingerprint: batch.batchFingerprint,
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
  };
}
