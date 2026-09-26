import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export type ModelValidationClassification = 'SUPPORTED_WITHIN_UNCERTAINTY' | 'PARTIALLY_SUPPORTED' | 'INCONCLUSIVE' | 'CONTRADICTED' | 'OUTSIDE_MODEL_DOMAIN';
export interface ValidationPair { readonly predicted: number; readonly predictedUncertainty: number; readonly measured: number; readonly measuredUncertainty: number; readonly inModelDomain: boolean }
export interface ModelValidationResult { readonly classification: ModelValidationClassification; readonly normalizedResiduals: readonly number[]; readonly maxNormalizedResidual: number }

export class ModelValidationEngine {
  constructor(private readonly runtime: LabRuntime) {}
  validate(pairs: readonly ValidationPair[]): ModelValidationResult {
    if (pairs.length === 0) throw new Error('Validation requires observations');
    if (pairs.some((p) => !p.inModelDomain)) {
      const result = { classification: 'OUTSIDE_MODEL_DOMAIN' as const, normalizedResiduals: [] as number[], maxNormalizedResidual: Number.POSITIVE_INFINITY };
      emitLabEvidence(this.runtime, { type: 'MODEL_VALIDATED', modelId: 'D140_MODEL_VALIDATION', solverId: 'uncertainty-comparison-v1', input: pairs, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED' }); return result;
    }
    const z = pairs.map((p) => {
      const sigma = Math.sqrt(p.predictedUncertainty ** 2 + p.measuredUncertainty ** 2);
      return sigma === 0 ? (p.predicted === p.measured ? 0 : Number.POSITIVE_INFINITY) : Math.abs(p.measured - p.predicted) / sigma;
    });
    const max = Math.max(...z);
    const classification: ModelValidationClassification = max <= 1 ? 'SUPPORTED_WITHIN_UNCERTAINTY' : max <= 2 ? 'PARTIALLY_SUPPORTED' : max <= 5 ? 'INCONCLUSIVE' : 'CONTRADICTED';
    const result = { classification, normalizedResiduals: z, maxNormalizedResidual: max };
    emitLabEvidence(this.runtime, { type: 'MODEL_VALIDATED', modelId: 'D140_MODEL_VALIDATION', solverId: 'uncertainty-comparison-v1', input: pairs, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED' });
    return result;
  }
}
