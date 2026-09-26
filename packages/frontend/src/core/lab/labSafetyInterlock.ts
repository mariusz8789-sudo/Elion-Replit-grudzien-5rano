import type { DeviceCommand, LabDevice } from './devicePorts';
import type { MeasurementQuality } from './sensorIngestEngine';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
import { convertQuantity } from './physicalQuantity';
import { resolveDeviceSafetyMode } from './devicePorts';

export interface SafetyContext {
  readonly device: LabDevice;
  readonly command: DeviceCommand;
  readonly protocolValidated: boolean;
  readonly humanApproved: boolean;
  readonly emergencyStop: boolean;
  readonly sensorQuality: MeasurementQuality;
  readonly calibrationValid: boolean;
}
export interface AuthorizedDeviceCommand { readonly command: DeviceCommand; readonly authorizationFingerprint: string; readonly safetyReasons: readonly string[] }
export interface SafetyDecision { readonly allowed: boolean; readonly reasons: readonly string[]; readonly authorized?: AuthorizedDeviceCommand }

export class LabSafetyInterlock {
  constructor(private readonly runtime: LabRuntime) {}
  evaluate(context: SafetyContext): SafetyDecision {
    const reasons: string[] = [];
    const safetyMode = resolveDeviceSafetyMode(context.device.executionMode);
    const capability = context.device.capabilities.find((c) => c.channelId === context.command.channelId && (c.access === 'WRITE' || c.access === 'READ_WRITE'));
    if (context.emergencyStop) reasons.push('EMERGENCY_STOP_ACTIVE');
    if (context.device.health.state !== 'HEALTHY') reasons.push('DEVICE_NOT_HEALTHY');
    if (!context.protocolValidated) reasons.push('PROTOCOL_NOT_VALIDATED');
    if (!context.calibrationValid) reasons.push('CALIBRATION_INVALID');
    if (context.sensorQuality !== 'VALID') reasons.push(`SENSOR_${context.sensorQuality}`);
    if (capability === undefined) reasons.push('WRITE_CAPABILITY_MISSING');
    else {
      if (capability.dimension !== context.command.target.dimension) reasons.push('UNIT_DIMENSION_MISMATCH');
      if (capability.validRange !== undefined) {
        try {
          const target = convertQuantity(context.command.target, capability.validRange.unit);
          if (target.value < capability.validRange.min || target.value > capability.validRange.max) reasons.push('TARGET_OUT_OF_RANGE');
        } catch { reasons.push('UNIT_DIMENSION_MISMATCH'); }
      }
    }
    if (safetyMode.mode === 'READ_ONLY_TELEMETRY') reasons.push('READ_ONLY_DEVICE');
    if (safetyMode.mode === 'HUMAN_APPROVAL_REQUIRED' && !context.humanApproved) reasons.push('HUMAN_APPROVAL_REQUIRED');
    const allowed = reasons.length === 0;
    const authorized = allowed ? { command: context.command, authorizationFingerprint: this.runtime.deterministic.fingerprint({ command: context.command, mode: safetyMode.mode, protocolValidated: true, humanApproved: context.humanApproved }), safetyReasons: ['ALL_INTERLOCKS_PASS'] as const } : undefined;
    const result: SafetyDecision = authorized === undefined ? { allowed, reasons } : { allowed, reasons, authorized };
    if (!allowed) emitLabEvidence(this.runtime, { type: 'SAFETY_INTERLOCK_TRIGGERED', modelId: 'D140_SAFETY', solverId: 'interlock-v1', input: context, result, epistemicStatus: 'SIMULATION', evidenceClass: 'DERIVED', limitations: ['Safety checks complement, not replace, device-native interlocks and laboratory procedures.'] });
    return result;
  }
}
