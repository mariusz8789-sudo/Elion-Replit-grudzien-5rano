import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
export interface MaterialProperty { readonly propertyId: string; readonly predicted: number; readonly measured: number; readonly standardUncertainty: number }
export interface MaterialRealityResult { readonly candidateId: string; readonly residuals: Readonly<Record<string, number>>; readonly rmsResidual: number; readonly nextAction: 'REFINE_MODEL' | 'RETEST' | 'ADVANCE_CANDIDATE' }
export function evaluateMaterialReality(runtime: LabRuntime, candidateId: string, properties: readonly MaterialProperty[], provenance: readonly string[]): MaterialRealityResult {
  if (properties.length === 0) throw new Error('Properties required');
  const residuals = Object.fromEntries(properties.map((p) => [p.propertyId, p.measured - p.predicted]));
  const rmsResidual = Math.sqrt(properties.reduce((s, p) => s + (p.measured - p.predicted) ** 2, 0) / properties.length);
  const normalizedMax = Math.max(...properties.map((p) => Math.abs(p.measured - p.predicted) / Math.max(p.standardUncertainty, 1e-12)));
  const nextAction = normalizedMax <= 2 ? 'ADVANCE_CANDIDATE' : normalizedMax <= 5 ? 'RETEST' : 'REFINE_MODEL';
  const result = { candidateId, residuals, rmsResidual, nextAction } as const;
  emitLabEvidence(runtime, { type: 'MATERIAL_REALITY_LOOP_COMPLETED', modelId: 'D140_MATERIAL_REALITY', solverId: 'residual-gate-v1', input: { candidateId, properties }, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', provenance });
  return result;
}
