import { describe, expect, it } from 'vitest';
import { C_VACUUM_MS } from '../core/modelGraph/lightSpeedGraph';
import { runLightSpeedScenario } from '../labs/experiments/spacetime-cslider';

describe('bounded c-Slider runner', () => {
  it('delegates observables to the existing special-relativity graph deterministically', () => {
    const input = { velocityMs: 0.8 * C_VACUUM_MS, lightSpeedMs: C_VACUUM_MS, distanceKm: 299_792.458 };
    const first = runLightSpeedScenario(input);
    const repeated = runLightSpeedScenario(input);

    expect(first).toEqual(repeated);
    expect(first.betaFraction).toBeCloseTo(0.8, 12);
    expect(first.lorentzGammaFactor).toBeCloseTo(1 / Math.sqrt(1 - 0.8 ** 2), 12);
    expect(first.secondsPerProperSecond).toBeCloseTo(first.lorentzGammaFactor, 12);
    expect(first.lightTravelTimeSeconds).toBeCloseTo(1, 12);
  });

  it('rejects input outside the special-relativity domain instead of emitting undefined observables', () => {
    expect(() => runLightSpeedScenario({ velocityMs: C_VACUUM_MS, lightSpeedMs: C_VACUUM_MS })).toThrow('β ≥ 1');
    expect(() => runLightSpeedScenario({ lightSpeedMs: 0 })).toThrow('positive');
  });
});
