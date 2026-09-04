import { describe, expect, it } from 'vitest';
import { cameraDecisionFor, ObservationCameraPolicy } from '../core/world/cameraPolicy';
import { DeterministicWorldEventBridge } from '../core/world/worldContracts';

const event = (type: string, id = 'e-1') => ({ contractVersion: '1.0.0', id, type, timestamp: 4, affectedEntities: [], parameters: {} });

describe('ObservationCameraPolicy', () => {
  it('derives a deterministic decision and reason from a real event', () => {
    expect(cameraDecisionFor(event('observation.threshold-crossed'))).toEqual({ mode: 'MACRO', eventId: 'e-1', timestamp: 4, reason: 'Camera response to observation.threshold-crossed (e-1)' });
    expect(cameraDecisionFor(event('timer.tick'))).toBeNull();
  });
  it('forwards observation-driven decisions and stops after disconnect', () => {
    const bridge = new DeterministicWorldEventBridge();
    const decisions: string[] = [];
    const policy = new ObservationCameraPolicy(bridge, (d) => decisions.push(d.eventId));
    policy.connect();
    bridge.publish(event('prediction.divergence', 'e-1'));
    bridge.publish(event('timer.tick', 'ignored'));
    policy.disconnect();
    bridge.publish(event('experiment.complete', 'ignored-2'));
    expect(decisions).toEqual(['e-1']);
    expect(policy.lastDecision?.mode).toBe('SCIENTIFIC');
  });
});
