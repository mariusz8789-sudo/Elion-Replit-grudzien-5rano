import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export type TwinSyncStatus = 'SYNCHRONIZED' | 'DRIFTING' | 'OUT_OF_MODEL' | 'STALE' | 'UNOBSERVED';
export interface TwinScalarState { readonly value: number; readonly standardUncertainty: number; readonly sequence: number }
export interface TwinSyncResult {
  readonly predictedState: TwinScalarState;
  readonly measuredState: TwinScalarState;
  readonly residual: number;
  readonly combinedUncertainty: number;
  readonly normalizedResidual: number;
  readonly confidence: number;
  readonly lastMeasurementSequence: number;
  readonly syncStatus: TwinSyncStatus;
  readonly deterministicFingerprint: string;
}

export class DigitalTwinSynchronizer {
  constructor(private readonly runtime: LabRuntime) {}
  synchronize(predicted: TwinScalarState, measured: TwinScalarState, currentSequence: number, staleAfter = 5): TwinSyncResult {
    const residual = measured.value - predicted.value;
    const combinedUncertainty = Math.sqrt(predicted.standardUncertainty ** 2 + measured.standardUncertainty ** 2);
    const normalizedResidual = combinedUncertainty === 0 ? (residual === 0 ? 0 : Number.POSITIVE_INFINITY) : Math.abs(residual) / combinedUncertainty;
    let syncStatus: TwinSyncStatus;
    if (currentSequence - measured.sequence > staleAfter) syncStatus = 'STALE';
    else if (!Number.isFinite(normalizedResidual) || normalizedResidual > 5) syncStatus = 'OUT_OF_MODEL';
    else if (normalizedResidual > 2) syncStatus = 'DRIFTING';
    else syncStatus = 'SYNCHRONIZED';
    const confidence = Number.isFinite(normalizedResidual) ? 1 / (1 + normalizedResidual) : 0;
    const base = { predictedState: predicted, measuredState: measured, residual, combinedUncertainty, normalizedResidual, confidence, lastMeasurementSequence: measured.sequence, syncStatus };
    const deterministicFingerprint = this.runtime.deterministic.fingerprint(base);
    const result = { ...base, deterministicFingerprint };
    emitLabEvidence(this.runtime, { type: 'DIGITAL_TWIN_SYNCHRONIZED', modelId: 'D140_TWIN_SYNC', solverId: 'residual-v1', input: { predicted, measured, currentSequence, staleAfter }, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED' });
    return result;
  }
}
