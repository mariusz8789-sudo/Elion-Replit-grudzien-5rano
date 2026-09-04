import { describe, expect, it } from 'vitest';
import { buildWorldState } from '../core/world/scientificWorldState';
import { passiveScienceDirector } from '../core/world/scienceDirector';

const state = buildWorldState({ worldId: 'w', domainId: 'physics', tick: 0, entities: [], relations: [], observations: [], events: [], experiment: { experimentId: 'x', status: 'RUNNING', runs: [] }, epistemic: null, evidence: [], replay: null, notModeled: [] });

describe('ScienceDirector extension point', () => {
  it('returns only explicitly requested presentation focus and no invented narration', () => {
    expect(passiveScienceDirector.decide({ state, events: [], investigation: { selectedEntityId: 'instrument:1', priority: 'HIGH' } })).toEqual({ focusEntityId: 'instrument:1', observationIds: [] });
    expect(passiveScienceDirector.decide({ state, events: [], investigation: {} })).toEqual({ observationIds: [] });
  });
});
