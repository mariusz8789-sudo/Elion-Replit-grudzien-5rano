import { describe, expect, it } from 'vitest';
import { buildWorldState } from '../core/world/scientificWorldState';
import { createVirtualLabIntegration } from '../core/world/virtualLabIntegration';
import type { WorldScene } from '../core/world/worldRuntime';

const scene: WorldScene = { createEntity() {}, updateEntity() {}, removeEntity() {}, reset() {}, dispose() {} };
const state = buildWorldState({ worldId: 'lab', domainId: 'physics', tick: 1, entities: [], relations: [], observations: [], events: [{ contractVersion: '1.0.0', id: 'e-1', type: 'observation.anomaly', timestamp: 1, affectedEntities: [], parameters: {} }], experiment: { experimentId: 'r', status: 'RUNNING', runs: [] }, epistemic: null, evidence: [], replay: null, notModeled: [] });

describe('Virtual Lab integration', () => {
  it('connects canonical state to runtime and event-driven camera', () => {
    const decisions: string[] = [];
    const integration = createVirtualLabIntegration(scene, (decision) => decisions.push(`${decision.mode}:${decision.eventId}`));
    expect(integration.load(state).fingerprint).toBe(state.fingerprint);
    expect(decisions).toEqual(['SCIENTIFIC:e-1']);
    integration.dispose();
    expect(integration.runtime.lifecycle).toBe('DISPOSED');
  });
});
