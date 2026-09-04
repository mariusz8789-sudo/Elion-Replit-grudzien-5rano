import { describe, expect, it } from 'vitest';
import { projectEpidemicScreenState } from '../core/world/epidemicVirtualLabAdapter';
import type { WorldStateView } from '../core/simulation/worldEngineContract';

const view = {
  contractVersion: '1.0.0', clock: { day: 3, population: 1 }, epidemic: {}, hospital: {}, mobility: {},
  routing: { mapId: 'm', mapVersion: '1', mapFingerprint: 'f', routeSegments: [], providedFields: ['Route.segments', 'Route.segmentType'] },
  agents: [{ id: 1, x: 2, y: 3, vx: 0, vy: 0, health: 'I', isolated: false, hospitalized: false, behavior: 'moving' }],
  locations: [], hotspots: [], transmissions: [{ from: 1, to: 2, x: 2, y: 3 }], transmissionGraph: [], clusters: { household: [], location: [] }, households: { calibration: '', provenanceNote: '', households: [], meanSize: 0 }, world: { width: 10, height: 10 }, notModeled: ['weather'],
} as unknown as WorldStateView;

describe('epidemic Virtual Lab adapter', () => {
  it('maps the existing read-only screen projection to canonical state', () => {
    const state = projectEpidemicScreenState(view);
    expect(state.domainId).toBe('EPIDEMIOLOGY');
    expect(state.entities.find((e) => e.ref.id === '1')?.properties.find((p) => p.key === 'health')?.value).toBe('I');
    expect(state.events[0]?.type).toBe('infection.transmission');
    expect(state.notModeled).toContain('weather');
  });
});
