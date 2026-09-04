import { describe, expect, it } from 'vitest';
import { runMinkowskiScenario } from '../labs/experiments/spacetime-minkowski';

describe('bounded Minkowski 1+1D runner', () => {
  it('uses the shared Lorentz transformation and exposes the spacelike event ordering', () => {
    const rest = runMinkowskiScenario({ beta: 0 });
    const moving = runMinkowskiScenario({ beta: 0.5 });

    expect(rest.gamma).toBeCloseTo(1, 12);
    expect(rest.ordering).toBe('a-before-b');
    expect(rest.intervalSquared).toBeLessThan(0);
    expect(moving.gamma).toBeCloseTo(1 / Math.sqrt(1 - 0.5 ** 2), 12);
    expect(moving.ordering).toBe('b-before-a');
    expect(runMinkowskiScenario({ beta: 0.5 })).toEqual(moving);
  });

  it('rejects β outside the Canvas model domain', () => {
    expect(() => runMinkowskiScenario({ beta: 0.91 })).toThrow('beta');
    expect(() => runMinkowskiScenario({ beta: -0.91 })).toThrow('beta');
  });
});
