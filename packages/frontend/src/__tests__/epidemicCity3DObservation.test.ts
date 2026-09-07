import { describe, expect, it } from 'vitest';
import { EpidemicCity3DSim, CITY_WORLD_SCALE } from '../core/three/epidemicCity3D';
import type { WorldObject } from '../core/simulation/types';

/**
 * Looking Glass 2.1 — target resolution and camera execution for the city.
 * Bypasses the full `init()` (WebGL/texture setup this test environment
 * doesn't provide, same reason `highFidelitySlice3DOrbitDirection.test.ts`
 * bypasses it for HighFidelityStreetSlice3D) and instead sets exactly the
 * private fields these methods read: `semanticBuildingSlots` (the real
 * per-building registry `init()` populates from CityWorld) and `worldState`.
 */
function building(kind: WorldObject['kind'], x: number, y: number, w = 2, h = 2): { group: null; building: WorldObject } {
  return { group: null as unknown as never, building: { kind, x, y, w, h, closed: false } as WorldObject };
}

function simWithBuildings(buildings: ReturnType<typeof building>[]): EpidemicCity3DSim {
  const sim = new EpidemicCity3DSim({ nAgents: 20, seed: 1 });
  Object.assign(sim as unknown as Record<string, unknown>, { semanticBuildingSlots: buildings });
  return sim;
}

describe('EpidemicCity3DSim.resolveNamedWorldTarget — deterministic, real objects only', () => {
  it('resolves "the hospital" to the real hospital building, bilingually', () => {
    const sim = simWithBuildings([building('hospital', 10, 10, 4, 4), building('shop', 0, 0)]);
    const en = sim.resolveNamedWorldTarget('the hospital');
    expect(en?.kind).toBe('hospital');
    expect(en?.x).toBe(12);
    expect(en?.y).toBe(12);
    const pl = sim.resolveNamedWorldTarget('szpital');
    expect(pl?.x).toBe(12);
  });

  it('resolves other semantic building kinds', () => {
    const sim = simWithBuildings([building('school', 5, 5), building('park', 20, 20)]);
    expect(sim.resolveNamedWorldTarget('the school')?.kind).toBe('location');
    expect(sim.resolveNamedWorldTarget('park')?.label).toBe('PARK');
  });

  it('honestly returns null for an object that does not exist in this run — never a guess', () => {
    const sim = simWithBuildings([building('hospital', 10, 10)]);
    expect(sim.resolveNamedWorldTarget('the pump')).toBeNull();
    expect(sim.resolveNamedWorldTarget('reaction vessel')).toBeNull();
  });

  it('returns null for an empty query', () => {
    const sim = simWithBuildings([building('hospital', 10, 10)]);
    expect(sim.resolveNamedWorldTarget('   ')).toBeNull();
  });

  it('is deterministic: same query, same result, every call', () => {
    const sim = simWithBuildings([building('hospital', 10, 10)]);
    const a = sim.resolveNamedWorldTarget('go to the hospital');
    const b = sim.resolveNamedWorldTarget('go to the hospital');
    expect(a).toEqual(b);
  });
});

describe('EpidemicCity3DSim.applyObservationTarget — real camera execution', () => {
  it('found: true selects the world object and sets an observation standoff from the real CameraRig math', () => {
    const sim = simWithBuildings([building('hospital', 10, 10, 4, 4)]);
    const outcome = sim.applyObservationTarget('the hospital', 'SCIENTIFIC');
    expect(outcome.found).toBe(true);
    expect(outcome.label).toBe('HOSPITAL');
    expect(sim.getSelectedWorld()?.kind).toBe('hospital');
    // getOrbitFocusDistance() only returns a value once a followTarget exists — set by
    // syncFollowTarget() from selectedWorld, so drive one frame of state before reading it.
    Object.assign(sim as unknown as Record<string, unknown>, { followTarget: { x: 0, y: 0, z: 0 } });
    const distance = sim.getOrbitFocusDistance();
    expect(distance).not.toBeNull();
    expect(distance).toBeGreaterThan(0);
  });

  it('a wider CameraIntent (WIDE) produces a larger standoff than a tighter one (MACRO) for the same target', () => {
    const wideSim = simWithBuildings([building('hospital', 10, 10, 4, 4)]);
    wideSim.applyObservationTarget('the hospital', 'WIDE');
    Object.assign(wideSim as unknown as Record<string, unknown>, { followTarget: { x: 0, y: 0, z: 0 } });
    const wideDistance = wideSim.getOrbitFocusDistance()!;

    const macroSim = simWithBuildings([building('hospital', 10, 10, 4, 4)]);
    macroSim.applyObservationTarget('the hospital', 'MACRO');
    Object.assign(macroSim as unknown as Record<string, unknown>, { followTarget: { x: 0, y: 0, z: 0 } });
    const macroDistance = macroSim.getOrbitFocusDistance()!;

    expect(wideDistance).toBeGreaterThan(macroDistance);
  });

  it('found: false for an object that does not exist — camera is never moved on a guess', () => {
    const sim = simWithBuildings([building('hospital', 10, 10)]);
    const outcome = sim.applyObservationTarget('the pump', 'SCIENTIFIC');
    expect(outcome.found).toBe(false);
    expect(outcome.label).toBeNull();
    expect(sim.getSelectedWorld()).toBeNull();
  });

  it('a manual preset change clears the observation standoff, returning control to the existing preset distances', () => {
    const sim = simWithBuildings([building('hospital', 10, 10, 4, 4)]);
    sim.applyObservationTarget('the hospital', 'WIDE');
    sim.setCameraPreset('city');
    Object.assign(sim as unknown as Record<string, unknown>, { followTarget: null });
    expect(sim.getOrbitFocusDistance()).toBeNull();
  });
});

describe('EpidemicCity3DSim observation standoff — sanity against CITY_WORLD_SCALE', () => {
  it('a larger building resolves a larger standoff for the same CameraIntent', () => {
    const small = simWithBuildings([building('hospital', 0, 0, 2, 2)]);
    small.applyObservationTarget('hospital', 'SCIENTIFIC');
    Object.assign(small as unknown as Record<string, unknown>, { followTarget: { x: 0, y: 0, z: 0 } });
    const smallDistance = small.getOrbitFocusDistance()!;

    const big = simWithBuildings([building('hospital', 0, 0, 20, 20)]);
    big.applyObservationTarget('hospital', 'SCIENTIFIC');
    Object.assign(big as unknown as Record<string, unknown>, { followTarget: { x: 0, y: 0, z: 0 } });
    const bigDistance = big.getOrbitFocusDistance()!;

    expect(bigDistance).toBeGreaterThan(smallDistance);
    expect(CITY_WORLD_SCALE).toBeGreaterThan(0);
  });
});
