import type { PhysicalQuantity } from './physicalQuantity';

export type ProtocolStepType = 'MEASURE' | 'WAIT' | 'SET_TARGET' | 'MOVE' | 'MIX' | 'HEAT' | 'COOL' | 'SAMPLE' | 'IMAGE' | 'ANALYZE' | 'BRANCH' | 'STOP';
export interface ProtocolStep {
  readonly stepId: string;
  readonly type: ProtocolStepType;
  readonly deviceId?: string;
  readonly channelId?: string;
  readonly target?: PhysicalQuantity;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}
export interface ExperimentProtocol {
  readonly protocolId: string;
  readonly version: string;
  readonly inputs: readonly string[];
  readonly devices: readonly string[];
  readonly steps: readonly ProtocolStep[];
  readonly safetyConstraints: readonly string[];
  readonly expectedMeasurements: readonly string[];
  readonly stoppingRules: readonly string[];
}

export interface ProtocolValidation { readonly valid: boolean; readonly errors: readonly string[] }
export function validateProtocol(protocol: ExperimentProtocol): ProtocolValidation {
  const errors: string[] = [];
  const stepIds = new Set<string>();
  for (const step of protocol.steps) {
    if (stepIds.has(step.stepId)) errors.push(`DUPLICATE_STEP:${step.stepId}`); else stepIds.add(step.stepId);
    if ((step.type === 'SET_TARGET' || step.type === 'HEAT' || step.type === 'COOL') && (step.deviceId === undefined || step.channelId === undefined || step.target === undefined)) {
      errors.push(`ACTUATION_STEP_INCOMPLETE:${step.stepId}`);
    }
    if (step.deviceId !== undefined && !protocol.devices.includes(step.deviceId)) errors.push(`UNDECLARED_DEVICE:${step.stepId}:${step.deviceId}`);
  }
  if (protocol.steps.length === 0) errors.push('EMPTY_PROTOCOL');
  return { valid: errors.length === 0, errors };
}
