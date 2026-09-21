import { describe, expect, it } from 'vitest';
import { createStandaloneLabRuntime } from './standaloneDeterminism';
import { LabSafetyInterlock } from './labSafetyInterlock';
import { quantity } from './physicalQuantity';
import type { LabDevice } from './devicePorts';
import { ProtocolExecutionSession } from './protocolExecutionEngine';

const device: LabDevice = {
  identity: { deviceId: 'd1' }, kind: 'heater', executionMode: 'LIVE_CONTROLLED', health: { state: 'HEALTHY', diagnosticCodes: [] }, provenance: ['fixture'],
  capabilities: [{ capabilityId: 'set', channelId: 'target', access: 'WRITE', dimension: 'TEMPERATURE', unit: 'K', validRange: { dimension: 'TEMPERATURE', unit: 'K', min: 273, max: 373 } }],
};

describe('D-140 safety and protocol', () => {
  it('requires human approval for live controlled actuation', () => {
    const safety = new LabSafetyInterlock(createStandaloneLabRuntime());
    const decision = safety.evaluate({ device, command: { commandId: 'c1', deviceId: 'd1', channelId: 'target', target: quantity(300, 'K'), protocolId: 'p1' }, protocolValidated: true, humanApproved: false, emergencyStop: false, sensorQuality: 'VALID', calibrationValid: true });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain('HUMAN_APPROVAL_REQUIRED');
  });

  it('audits legal protocol state transitions', () => {
    const session = new ProtocolExecutionSession({ protocolId: 'p1', version: '1', inputs: [], devices: [], steps: [{ stepId: 'stop', type: 'STOP' }], safetyConstraints: [], expectedMeasurements: [], stoppingRules: [] }, createStandaloneLabRuntime());
    session.validate(); session.transition('DRY_RUN', 'ok'); session.transition('READY', 'ok'); session.transition('ARMED', 'ok'); session.transition('RUNNING', 'ok'); session.transition('COMPLETED', 'ok');
    expect(session.state).toBe('COMPLETED');
    expect(session.transitions).toHaveLength(6);
  });
});
