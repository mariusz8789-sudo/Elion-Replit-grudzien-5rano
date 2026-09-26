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
    const simulated = measurement.sourceKind === 'SIMULATED_DEVICE';
    const replayed = measurement.sourceKind === 'RECORDED_MEASUREMENT';
    const live = measurement.sourceKind === 'REAL_INSTRUMENT';
    const modeMatches = simulated ? measurement.sourceMode === 'SIMULATED'
      : replayed ? measurement.sourceMode === 'REPLAY'
        : ['LIVE_READ_ONLY', 'HARDWARE_IN_LOOP', 'LIVE_CONTROLLED'].includes(measurement.sourceMode);
    const rawRequired = replayed || live;
    if (!modeMatches) { quality = 'REJECTED'; reasons.push('SOURCE_MODE_MISMATCH'); }
    else if (rawRequired && measurement.rawPayload === undefined) { quality = 'REJECTED'; reasons.push('RAW_PAYLOAD_REQUIRED'); }
    else if (rawRequired && !measurement.configurationFingerprint) { quality = 'REJECTED'; reasons.push('CONFIGURATION_FINGERPRINT_REQUIRED'); }
    else if (rawRequired && !measurement.calibrationId) { quality = 'REJECTED'; reasons.push('CALIBRATION_REFERENCE_REQUIRED'); }
    else if (rawRequired && !Number.isFinite(Date.parse(measurement.sourceTimestamp))) { quality = 'REJECTED'; reasons.push('SOURCE_TIMESTAMP_REQUIRED'); }
    else if (rawRequired && measurement.provenance.length === 0) { quality = 'REJECTED'; reasons.push('SOURCE_PROVENANCE_REQUIRED'); }
    else if (!Number.isFinite(measurement.quantity.value)) { quality = 'REJECTED'; reasons.push('NON_FINITE_VALUE'); }
    else if (!policy.calibrationValid) { quality = 'CALIBRATION_EXPIRED'; reasons.push('CALIBRATION_INVALID'); }
    else if (policy.currentSequence - measurement.ingestSequence > policy.maxSequenceAge) { quality = 'STALE'; reasons.push('SEQUENCE_AGE_EXCEEDED'); }
    else if ((policy.min !== undefined && measurement.quantity.value < policy.min) || (policy.max !== undefined && measurement.quantity.value > policy.max)) {
      quality = 'OUT_OF_RANGE'; reasons.push('VALID_RANGE_EXCEEDED');
    }
    const base = { ...measurement, quality, qualityReasons: reasons };
    const ingestFingerprint = this.runtime.deterministic.fingerprint(base);
    const result: IngestedMeasurement = { ...base, ingestFingerprint };
    const accepted = quality === 'VALID';
    const epistemicStatus = !accepted ? 'HYBRID_DERIVED' : simulated ? 'SIMULATION' : replayed ? 'REPLAY' : 'MEASURED';
    const evidenceClass = !accepted ? 'DERIVED' : simulated ? 'MODEL' : 'MEASUREMENT';
    emitLabEvidence(this.runtime, {
      type: 'MEASUREMENT_INGESTED', modelId: 'D140_SENSOR_INGEST', solverId: 'ingest-v1', input: { measurement, policy }, result,
      epistemicStatus, evidenceClass, provenance: measurement.provenance,
      limitations: !accepted
        ? ['The ingest decision is a derived validation result; the rejected payload is not admitted as a measurement.']
        : simulated ? ['Simulated-device output is model data, not a physical observation.'] : [],
    });
    return result;
  }
}
