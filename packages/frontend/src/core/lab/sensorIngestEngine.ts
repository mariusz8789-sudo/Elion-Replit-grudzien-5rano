import type { DeviceMeasurement } from './devicePorts';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export type MeasurementQuality = 'VALID' | 'STALE' | 'MISSING' | 'OUT_OF_RANGE' | 'CALIBRATION_EXPIRED' | 'SUSPECT' | 'REJECTED';

export interface IngestPolicy {
  readonly currentSequence: number;
  readonly maxSequenceAge: number;
  readonly calibrationValid: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface IngestedMeasurement extends DeviceMeasurement {
  readonly quality: MeasurementQuality;
  readonly qualityReasons: readonly string[];
  readonly ingestFingerprint: string;
}

export class SensorIngestEngine {
  constructor(private readonly runtime: LabRuntime) {}

  ingest(measurement: DeviceMeasurement, policy: IngestPolicy): IngestedMeasurement {
    const reasons: string[] = [];
    let quality: MeasurementQuality = 'VALID';
    if (!Number.isFinite(measurement.quantity.value)) { quality = 'REJECTED'; reasons.push('NON_FINITE_VALUE'); }
    else if (!policy.calibrationValid) { quality = 'CALIBRATION_EXPIRED'; reasons.push('CALIBRATION_INVALID'); }
    else if (policy.currentSequence - measurement.ingestSequence > policy.maxSequenceAge) { quality = 'STALE'; reasons.push('SEQUENCE_AGE_EXCEEDED'); }
    else if ((policy.min !== undefined && measurement.quantity.value < policy.min) || (policy.max !== undefined && measurement.quantity.value > policy.max)) {
      quality = 'OUT_OF_RANGE'; reasons.push('VALID_RANGE_EXCEEDED');
    }
    const base = { ...measurement, quality, qualityReasons: reasons };
    const ingestFingerprint = this.runtime.deterministic.fingerprint(base);
    const result: IngestedMeasurement = { ...base, ingestFingerprint };
    emitLabEvidence(this.runtime, {
      type: 'MEASUREMENT_INGESTED', modelId: 'D140_SENSOR_INGEST', solverId: 'ingest-v1', input: { measurement, policy }, result,
      epistemicStatus: 'MEASURED', evidenceClass: 'MEASUREMENT', provenance: measurement.provenance,
    });
    return result;
  }
}
