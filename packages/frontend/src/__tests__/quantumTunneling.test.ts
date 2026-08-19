import { describe, expect, it } from 'vitest';
import { runTunnelingScenario } from '../labs/experiments/quantum-tunneling';

describe('bounded 1D split-step tunneling runner', () => {
  it('uses the same deterministic split-step solver as the Canvas and returns bounded probabilities', () => {
    const input = { energy: 0.55, barrier: 1, width: 3, frames: 240 };
    const first = runTunnelingScenario(input);
    const repeated = runTunnelingScenario(input);

    expect(repeated).toEqual(first);
    expect(first.transmission).toBeGreaterThanOrEqual(0);
    expect(first.transmission).toBeLessThanOrEqual(1);
    expect(first.reflection).toBeGreaterThanOrEqual(0);
    expect(first.reflection).toBeLessThanOrEqual(1);
    expect(first.remainingProbability).toBeGreaterThanOrEqual(0);
    expect(first.transmission + first.reflection + first.remainingProbability).toBeCloseTo(1, 10);
  });

  it('rejects parameters outside the bounded existing Canvas domain', () => {
    expect(() => runTunnelingScenario({ energy: 0.1 })).toThrow('energy');
    expect(() => runTunnelingScenario({ barrier: 3 })).toThrow('barrier');
    expect(() => runTunnelingScenario({ width: 9 })).toThrow('width');
    expect(() => runTunnelingScenario({ frames: 0 })).toThrow('frames');
  });
});
