import { describe, expect, it } from 'vitest';
import { runTokamakLawsonScenario } from '../labs/experiments/nuclear-tokamak';

describe('bounded tokamak Lawson runner', () => {
  it('computes the shared 0D Lawson ratio deterministically', () => {
    const below = runTokamakLawsonScenario({ densityExponent: 20, temperatureKeV: 15, confinementSeconds: 1.5 });
    const above = runTokamakLawsonScenario({ densityExponent: 21, temperatureKeV: 30, confinementSeconds: 4 });

    expect(below).toEqual(runTokamakLawsonScenario({ densityExponent: 20, temperatureKeV: 15, confinementSeconds: 1.5 }));
    expect(below.lawsonRatio).toBeCloseTo(0.75, 12);
    expect(below.ignitionCriterionMet).toBe(false);
    expect(above.ignitionCriterionMet).toBe(true);
  });

  it('rejects a parameter outside the bounded 0D scenario', () => {
    expect(() => runTokamakLawsonScenario({ densityExponent: 18.9 })).toThrow('densityExponent');
    expect(() => runTokamakLawsonScenario({ temperatureKeV: 41 })).toThrow('temperatureKeV');
    expect(() => runTokamakLawsonScenario({ confinementSeconds: 0 })).toThrow('confinementSeconds');
  });
});
