import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import { unavailableStructuralEngine, type StructuralChemistryEngine } from './chemistry';
import { runMolecularDiscovery } from './discoveryRun';
import type { GenerationSpec } from './generation';
import { MOLECULAR_DISCOVERY_CONTRACT_VERSION, type DiscoveryQuestion, type DiscoveryResult } from './types';

/**
 * DISCOVERY REPLAY — the same save-inputs / recompute / compare-fingerprint
 * idiom already used by `scenarioMemory`, `scenarioCounterfactual` and
 * `temporalMultiverse`, applied to this domain. `SavedScenarioReplayStatus`
 * (MATCH / DRIFT / BLOCKED) is imported verbatim, never redeclared.
 *
 * Determinism boundary, stated honestly: replay recomputes with the SAME
 * structural engine identity it was saved under. A run saved with no
 * structural engine and replayed against a real one is NOT the same
 * experiment — that is a DRIFT, not a match.
 */
export const DISCOVERY_REPLAY_VERSION = '1.0.0';

export interface SavedDiscoveryRun {
  contractVersion: string;
  question: DiscoveryQuestion;
  generation: GenerationSpec;
  structuralEngineId: string;
  resultFingerprint: string;
}

export function buildSavedDiscoveryRun(
  question: DiscoveryQuestion,
  generation: GenerationSpec,
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
): SavedDiscoveryRun {
  const result = runMolecularDiscovery(question, generation, structural);
  return {
    contractVersion: MOLECULAR_DISCOVERY_CONTRACT_VERSION,
    question,
    generation,
    structuralEngineId: structural.engineId,
    resultFingerprint: result.resultFingerprint,
  };
}

export function isSavedDiscoveryRun(value: unknown): value is SavedDiscoveryRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.contractVersion !== 'string' || saved.contractVersion.trim().length === 0) return false;
  if (typeof saved.resultFingerprint !== 'string' || saved.resultFingerprint.trim().length === 0) return false;
  if (typeof saved.structuralEngineId !== 'string' || saved.structuralEngineId.trim().length === 0) return false;
  const question = saved.question as Record<string, unknown> | undefined;
  const generation = saved.generation as Record<string, unknown> | undefined;
  if (!question || typeof question !== 'object' || typeof question.questionId !== 'string' || question.questionId.trim().length === 0) return false;
  if (!question.constraints || typeof question.constraints !== 'object') return false;
  if (!generation || typeof generation !== 'object' || !Array.isArray(generation.seedFormulas) || !Array.isArray(generation.transformations)) return false;
  return true;
}

export interface DiscoveryReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  /** Recomputed result — present only at MATCH, matching every other Genesis replay gate. */
  result: DiscoveryResult | null;
}

export function replaySavedDiscoveryRun(
  saved: unknown,
  structural: StructuralChemistryEngine = unavailableStructuralEngine,
): DiscoveryReplay {
  if (!isSavedDiscoveryRun(saved)) {
    return { status: 'BLOCKED', reason: 'Saved discovery run is incomplete or corrupted — required identity fields are missing.', result: null };
  }
  if (saved.structuralEngineId !== structural.engineId) {
    return {
      status: 'BLOCKED',
      reason: `Saved under structural engine "${saved.structuralEngineId}" but replayed against "${structural.engineId}" — a different chemistry engine is a different experiment, not a replay.`,
      result: null,
    };
  }
  const recomputed = runMolecularDiscovery(saved.question, saved.generation, structural);
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: 'Recomputing from the saved inputs produced a different result — an input or a rule changed since the run was saved.', result: null };
  }
  return { status: 'MATCH', reason: 'Recomputed from the saved inputs and reproduced an identical result.', result: recomputed };
}
