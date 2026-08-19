import { describe, expect, it } from 'vitest';
import { runLightConeScenario } from '../labs/experiments/spacetime-lightcone-3d';

describe('bounded Minkowski light-cone runner', () => {
  it('uses the same Lorentz relation as the 3D scene', () => {
    const result = runLightConeScenario({ v: 0.8, tripYears: 20 });
    expect(result.gamma).toBeCloseTo(1 / Math.sqrt(1 - 0.8 ** 2), 12);
    expect(result.travelerYears).toBeCloseTo(12, 12);
    expect(result.causal).toBe(true);
    expect(runLightConeScenario({ v: 0.8, tripYears: 20 })).toEqual(result);
  });

  it('rejects superluminal and out-of-domain scenarios', () => {
    expect(() => runLightConeScenario({ v: 1 })).toThrow('v');
    expect(() => runLightConeScenario({ tripYears: 61 })).toThrow('tripYears');
  });
});
