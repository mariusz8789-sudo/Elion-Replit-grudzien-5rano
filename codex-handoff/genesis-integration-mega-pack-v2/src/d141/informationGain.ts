import type { CapabilityRecord, ExperimentCandidate, RankedExperiment } from './types.js';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('ranking inputs must be finite');
  return Math.max(0, Math.min(1, value));
}

/** Unchanged from V1 (no defects were found here in the audit). */
export function rankExperiments(
  candidates: readonly ExperimentCandidate[],
  capabilities: readonly CapabilityRecord[],
): RankedExperiment[] {
  const capabilityMap = new Map(capabilities.map((capability) => [capability.capabilityId, capability]));
  return candidates
    .map((experiment): RankedExperiment => {
      const blockers = experiment.requiredCapabilities.filter((id) => capabilityMap.get(id)?.availability !== 'AVAILABLE');
      const uncertaintyReduction = clamp01(experiment.expectedUncertaintyReduction);
      const cost = clamp01(experiment.normalizedCost);
      const risk = clamp01(experiment.normalizedRisk);
      const targetBonus = Math.min(0.2, 0.05 * (experiment.targetsGapIds.length + experiment.targetsContradictionIds.length));
      const rawScore = uncertaintyReduction + targetBonus - 0.35 * cost - 0.5 * risk - (blockers.length > 0 ? 1 : 0);
      const score = Math.round(rawScore * 1_000_000) / 1_000_000;
      const rationale = [
        `uncertaintyReduction=${uncertaintyReduction}`,
        `targetBonus=${targetBonus}`,
        `costPenalty=${Math.round(0.35 * cost * 1_000_000) / 1_000_000}`,
        `riskPenalty=${Math.round(0.5 * risk * 1_000_000) / 1_000_000}`,
      ];
      return { experiment, score, blockers, rationale };
    })
    .sort((a, b) => b.score - a.score || a.experiment.experimentId.localeCompare(b.experiment.experimentId));
}
