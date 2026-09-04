import { describe, expect, it } from 'vitest';
import { DeterministicWorldEventBridge, dispatchWorldInteraction, type WorldInteraction } from '../core/world/worldContracts';

const ref = { kind: 'instrument', id: 'main' };
const request = (overrides: Partial<WorldInteraction> = {}): WorldInteraction => ({
  interactionId: 'i-1', entity: ref, action: 'INSPECT', ...overrides,
});

describe('World contracts', () => {
  it('bridges canonical events and unsubscribes deterministically', () => {
    const bridge = new DeterministicWorldEventBridge();
    const received: string[] = [];
    const unsubscribe = bridge.subscribe((event) => received.push(event.id));
    const event = { contractVersion: '1.0.0', id: 'e-1', type: 'lab.observation', timestamp: 1, affectedEntities: [], parameters: {} };
    bridge.publish(event);
    unsubscribe();
    bridge.publish({ ...event, id: 'e-2' });
    expect(received).toEqual(['e-1']);
  });

  it('rejects undeclared parameter changes before reaching scientific handler', () => {
    let called = false;
    const result = dispatchWorldInteraction(request({ action: 'CHANGE_PARAMETER' }), () => { called = true; return { accepted: true }; });
    expect(result).toEqual({ accepted: false, reason: 'CHANGE_PARAMETER requires declared parameters' });
    expect(called).toBe(false);
  });

  it('delegates valid interactions and preserves handler result', () => {
    const result = dispatchWorldInteraction(request({ action: 'CHANGE_PARAMETER', parameters: { mobility: 0.5 } }), (received) => ({ accepted: received.action === 'CHANGE_PARAMETER' }));
    expect(result).toEqual({ accepted: true });
  });
});
