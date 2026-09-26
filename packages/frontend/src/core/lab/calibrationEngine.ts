import type { IngestedMeasurement } from './sensorIngestEngine';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
import { quantity } from './physicalQuantity';

export type CalibrationModel =
  | { readonly kind: 'OFFSET'; readonly offset: number }
  | { readonly kind: 'LINEAR'; readonly slope: number; readonly intercept: number }
  | { readonly kind: 'POLYNOMIAL'; readonly coefficients: readonly number[] }
  | { readonly kind: 'PIECEWISE_LINEAR'; readonly points: readonly { readonly x: number; readonly y: number }[] };

export interface CalibrationSpec {
  readonly calibrationId: string;
  readonly calibrationVersion: string;
  readonly model: CalibrationModel;
  readonly rawRange: readonly [number, number];
  readonly standardUncertainty: number;
  readonly provenance: readonly string[];
}

export interface CalibratedMeasurement {
  readonly raw: IngestedMeasurement;
  readonly calibratedQuantity: ReturnType<typeof quantity>;
  readonly calibrationId: string;
  readonly calibrationVersion: string;
  readonly calibrationModel: CalibrationModel;
  readonly uncertainty: number;
  readonly limitations: readonly string[];
  readonly deterministicFingerprint: string;
}

function evaluateModel(model: CalibrationModel, x: number): number {
  switch (model.kind) {
    case 'OFFSET': return x + model.offset;
    case 'LINEAR': return model.slope * x + model.intercept;
    case 'POLYNOMIAL': return model.coefficients.reduce((sum, coefficient, power) => sum + coefficient * x ** power, 0);
    case 'PIECEWISE_LINEAR': {
      const points = [...model.points].sort((a, b) => a.x - b.x);
      if (points.length < 2) throw new Error('Piecewise calibration needs at least two points');
      const first = points[0]; const last = points[points.length - 1];
      if (first === undefined || last === undefined) throw new Error('Invalid piecewise points');
      if (x <= first.x) return first.y;
      if (x >= last.x) return last.y;
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]; const b = points[i];
        if (a !== undefined && b !== undefined && x <= b.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
      }
      return last.y;
    }
  }
}

export class CalibrationEngine {
  constructor(private readonly runtime: LabRuntime) {}
  apply(raw: IngestedMeasurement, spec: CalibrationSpec): CalibratedMeasurement {
    if (raw.quantity.value < spec.rawRange[0] || raw.quantity.value > spec.rawRange[1]) throw new Error('Measurement outside calibration range');
    const calibratedValue = evaluateModel(spec.model, raw.quantity.value);
    const base = {
      raw,
      calibratedQuantity: quantity(calibratedValue, raw.quantity.unit),
      calibrationId: spec.calibrationId,
      calibrationVersion: spec.calibrationVersion,
      calibrationModel: spec.model,
      uncertainty: spec.standardUncertainty,
      limitations: ['Calibration validity is limited to the declared raw range and reference conditions.'] as const,
    };
    const deterministicFingerprint = this.runtime.deterministic.fingerprint(base);
    const result: CalibratedMeasurement = { ...base, deterministicFingerprint };
    emitLabEvidence(this.runtime, {
      type: 'CALIBRATION_APPLIED', modelId: 'D140_CALIBRATION', solverId: 'calibration-v1', input: { raw, spec }, result,
      epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', provenance: [...raw.provenance, ...spec.provenance], limitations: result.limitations,
    });
    return result;
  }
}
