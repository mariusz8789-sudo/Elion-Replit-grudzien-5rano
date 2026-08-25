import { describe, expect, it } from 'vitest';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { projectWorldState } from '../core/simulation/worldEngineContract';

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
});
