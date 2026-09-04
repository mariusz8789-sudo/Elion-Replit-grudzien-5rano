import { describe, expect, it } from 'vitest';
import { runDrakeEquationScenario } from '../labs/experiments/civilization-drake-consequence';

describe('bounded Drake equation runner', () => {
  it('delegates deterministic conditional algebra to the shared ModelGraph', () => {
    const result = runDrakeEquationScenario();
    expect(result).toEqual(runDrakeEquationScenario());
    expect(result.assumedLifetimeYears).toBe(10_000);
    expect(result.civilizationCount).toBeCloseTo(13.5, 12);
  });
  it('rejects assumptions outside the declared model bounds', () => {
    expect(() => runDrakeEquationScenario({ fractionIntelligent: 1.1 })).toThrow('fractionIntelligent');
    expect(() => runDrakeEquationScenario({ lifetimeLog10Years: 10 })).toThrow('lifetimeLog10Years');
  });
});
