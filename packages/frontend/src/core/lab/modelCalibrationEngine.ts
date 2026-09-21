import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export interface CalibrationObservation { readonly x: number; readonly y: number; readonly standardUncertainty: number }
export interface LinearModelParameters { readonly slope: number; readonly intercept: number }
export interface ModelCalibrationResult {
  readonly modelBefore: LinearModelParameters;
  readonly modelAfter: LinearModelParameters;
  readonly fitResidualRms: number;
  readonly fitQuality: number;
  readonly parameterUncertainty: Readonly<{ slope: number; intercept: number }>;
  readonly limitations: readonly string[];
}

export class ModelCalibrationEngine {
  constructor(private readonly runtime: LabRuntime) {}
  calibrateLinear(modelBefore: LinearModelParameters, observations: readonly CalibrationObservation[]): ModelCalibrationResult {
    if (observations.length < 2) throw new Error('At least two observations required');
    const weights = observations.map((o) => 1 / Math.max(o.standardUncertainty ** 2, 1e-18));
    const sw = weights.reduce((a, b) => a + b, 0);
    const sx = observations.reduce((s, o, i) => s + o.x * (weights[i] ?? 0), 0);
    const sy = observations.reduce((s, o, i) => s + o.y * (weights[i] ?? 0), 0);
    const sxx = observations.reduce((s, o, i) => s + o.x * o.x * (weights[i] ?? 0), 0);
    const sxy = observations.reduce((s, o, i) => s + o.x * o.y * (weights[i] ?? 0), 0);
    const determinant = sw * sxx - sx * sx;
    if (Math.abs(determinant) < 1e-18) throw new Error('Singular calibration design');
    const slope = (sw * sxy - sx * sy) / determinant;
    const intercept = (sxx * sy - sx * sxy) / determinant;
    const residuals = observations.map((o) => o.y - (slope * o.x + intercept));
    const rms = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);
    const scale = Math.max(1e-12, Math.sqrt(observations.reduce((s, o) => s + o.y * o.y, 0) / observations.length));
    const result: ModelCalibrationResult = {
      modelBefore,
      modelAfter: { slope, intercept },
      fitResidualRms: rms,
      fitQuality: 1 / (1 + rms / scale),
      parameterUncertainty: { slope: Math.sqrt(sw / determinant), intercept: Math.sqrt(sxx / determinant) },
      limitations: ['Weighted linear calibration assumes independent observations and a linear response in the fitted domain.'],
    };
    emitLabEvidence(this.runtime, { type: 'MODEL_CALIBRATED', modelId: 'D140_MODEL_CALIBRATION', solverId: 'weighted-linear-regression-v1', input: { modelBefore, observations }, result, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', limitations: result.limitations });
    return result;
  }
}
