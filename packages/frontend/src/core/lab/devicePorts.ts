import type { PhysicalDimension, PhysicalQuantity, SupportedUnit } from './physicalQuantity';

export type DeviceExecutionMode = 'SIMULATED' | 'REPLAY' | 'HARDWARE_IN_LOOP' | 'LIVE_READ_ONLY' | 'LIVE_CONTROLLED';
export type DeviceSafetyMode = 'SIMULATION' | 'REHEARSAL' | 'READ_ONLY_TELEMETRY' | 'SHADOW' | 'HUMAN_APPROVAL_REQUIRED' | 'DEVICE_ACTUATION_BLOCKED';
export type DeviceHealthState = 'HEALTHY' | 'DEGRADED' | 'FAULT' | 'OFFLINE';
export type CapabilityAccess = 'READ' | 'WRITE' | 'READ_WRITE';

export interface DeviceIdentity {
  readonly deviceId: string;
  readonly manufacturer?: string;
  readonly model?: string;
  readonly serialIdentity?: string;
}

export interface DeviceRange {
  readonly dimension: PhysicalDimension;
  readonly unit: SupportedUnit;
  readonly min: number;
  readonly max: number;
}

export interface DeviceCapability {
  readonly capabilityId: string;
  readonly channelId: string;
  readonly access: CapabilityAccess;
  readonly dimension: PhysicalDimension;
  readonly unit: SupportedUnit;
  readonly validRange?: DeviceRange;
}

export interface DeviceCalibrationRef {
  readonly calibrationId: string;
  readonly version: string;
  readonly validThroughSequence?: number;
}

export interface DeviceHealth {
  readonly state: DeviceHealthState;
  readonly diagnosticCodes: readonly string[];
}

export interface LabDevice {
  readonly identity: DeviceIdentity;
  readonly kind: string;
  readonly capabilities: readonly DeviceCapability[];
  readonly executionMode: DeviceExecutionMode;
  readonly health: DeviceHealth;
  readonly calibration?: DeviceCalibrationRef;
  readonly provenance: readonly string[];
}

export interface LabSensor extends LabDevice {
  readonly sensorChannels: readonly string[];
}

export interface LabActuator extends LabDevice {
  readonly actuatorChannels: readonly string[];
}

export interface DeviceMeasurement {
  readonly measurementId: string;
  readonly deviceId: string;
  readonly channelId: string;
  readonly quantity: PhysicalQuantity;
  readonly sourceTimestamp: string;
  readonly ingestSequence: number;
  readonly sourceKind: 'SIMULATED_DEVICE' | 'RECORDED_MEASUREMENT' | 'REAL_INSTRUMENT';
  readonly sourceMode: DeviceExecutionMode;
  readonly calibrationId?: string;
  readonly uncertainty?: number;
  readonly provenance: readonly string[];
  /** Optional immutable raw payload supplied by a real adapter; never fabricated by the ingest layer. */
  readonly rawPayload?: string | readonly number[];
  /** Hash of the exact device configuration active for this reading, when the adapter can provide it. */
  readonly configurationFingerprint?: string;
}

export interface DeviceCommand {
  readonly commandId: string;
  readonly deviceId: string;
  readonly channelId: string;
  readonly target: PhysicalQuantity;
  readonly protocolId: string;
}

export interface DeviceAdapter {
  readonly device: LabDevice;
  read(channelId: string, sequence: number): DeviceMeasurement;
  execute(command: DeviceCommand): void;
}

export interface DeviceSafetyResolution {
  readonly legacyMode: DeviceExecutionMode;
  readonly mode: DeviceSafetyMode;
  readonly requiresHumanReview: boolean;
  readonly permitsGenericRealActuation: false;
}

/** Compatibility adapter: actuation-capable legacy modes remain explicitly approval-gated. */
export function resolveDeviceSafetyMode(legacyMode: DeviceExecutionMode): DeviceSafetyResolution {
  switch (legacyMode) {
    case 'SIMULATED': return { legacyMode, mode: 'SIMULATION', requiresHumanReview: false, permitsGenericRealActuation: false };
    case 'REPLAY': return { legacyMode, mode: 'REHEARSAL', requiresHumanReview: false, permitsGenericRealActuation: false };
    case 'LIVE_READ_ONLY': return { legacyMode, mode: 'READ_ONLY_TELEMETRY', requiresHumanReview: false, permitsGenericRealActuation: false };
    case 'HARDWARE_IN_LOOP':
    case 'LIVE_CONTROLLED': return { legacyMode, mode: 'HUMAN_APPROVAL_REQUIRED', requiresHumanReview: true, permitsGenericRealActuation: false };
  }
}
