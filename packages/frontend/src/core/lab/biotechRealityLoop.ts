import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
export interface BiotechObservation { readonly endpointId: string; readonly simulated: number; readonly measured: number; readonly standardUncertainty: number }
export interface BiotechRealityResult { readonly endpointResiduals: Readonly<Record<string, number>>; readonly status: 'SUPPORTED_WITHIN_MODEL' | 'NEEDS_REFINEMENT' }
export function evaluateBiotechReality(runtime: LabRuntime, observations: readonly BiotechObservation[], provenance: readonly string[]): BiotechRealityResult {
  if (observations.length === 0) throw new Error('Observations required');
  const endpointResiduals = Object.fromEntries(observations.map((o) => [o.endpointId, o.measured - o.simulated]));
  const worst = Math.max(...observations.map((o) => Math.abs(o.measured - o.simulated) / Math.max(o.standardUncertainty, 1e-12)));
  const result = { endpointResiduals, status: worst <= 2 ? 'SUPPORTED_WITHIN_MODEL' : 'NEEDS_REFINEMENT' } as const;
  emitLabEvidence(runtime, { type: 'BIOTECH_REALITY_LOOP_COMPLETED', modelId: 'D140_BIOTECH_REALITY', solverId: 'endpoint-residual-v1', input: observations, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', provenance, limitations: ['This result is a laboratory/model comparison and is not clinical evidence.'] });
  return result;
}
