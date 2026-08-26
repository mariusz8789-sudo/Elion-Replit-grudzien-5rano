import { describe, expect, it } from 'vitest';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { projectWorldState } from '../core/simulation/worldEngineContract';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';

describe('City3D WorldState boundary', () => {
  it('accepts the authoritative projection without changing the simulation state', () => {
    const renderer = new EpidemicCity3DSim({ nAgents: 260, seed: 917 });
    const before = renderer.getSim().stats();
    const world = projectWorldState(renderer.getSim());

    renderer.setWorldState(world);

    expect(renderer.getSim().stats()).toMatchObject(before);
    expect(renderer.getSelectedWorld()).toBeNull();
    expect(world.hotspots.reduce((sum, hotspot) => sum + hotspot.infectious, 0)).toBeLessThanOrEqual(before.I);
  });

  it('sets and clears a gate-approved Earthquake scenario overlay without changing epidemic stats or WorldState', async () => {
    const renderer = new EpidemicCity3DSim({ nAgents: 260, seed: 917 });
    const beforeStats = renderer.getSim().stats();
    const beforeWorld = projectWorldState(renderer.getSim());
    const earthquake = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'renderer-boundary-fixture', magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store: new InMemoryHazardProvenanceStore(), commitHash: 'test-commit' });

    expect(earthquake.overlay).not.toBeNull();
    renderer.setEarthquakeScenarioOverlay(earthquake.overlay);
    renderer.setEarthquakeScenarioOverlay(null);

    expect(renderer.getSim().stats()).toEqual(beforeStats);
    expect(projectWorldState(renderer.getSim())).toEqual(beforeWorld);
  });
});
