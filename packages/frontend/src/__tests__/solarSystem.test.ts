import { describe, expect, it } from 'vitest';
import { runSolarSystemScenario } from '../labs/experiments/universe-solar-system';

describe('bounded solar-system Kepler runner', () => {
  it('evaluates the shared NASA-backed eight-planet positions deterministically', () => {
    const first = runSolarSystemScenario({ daysElapsed: 365.256 });
    const second = runSolarSystemScenario({ daysElapsed: 365.256 });

    expect(first).toEqual(second);
    expect(first.planetCount).toBe(8);
    expect(first.earthOrbits).toBeCloseTo(1, 3);
    expect(first.mercuryOrbits).toBeGreaterThan(4);
    expect(first.earthRadiusAu).toBeGreaterThan(0.9);
    expect(first.earthRadiusAu).toBeLessThan(1.1);
    expect(first.positions.map((planet) => planet.name)).toContain('Ziemia');
  });

  it('rejects a time outside the bounded Kepler scenario', () => {
    expect(() => runSolarSystemScenario({ daysElapsed: -1 })).toThrow('daysElapsed');
    expect(() => runSolarSystemScenario({ daysElapsed: 1_000_001 })).toThrow('daysElapsed');
  });
});
