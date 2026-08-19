import { describe, expect, it } from 'vitest';
import { runPointLensScenario } from '../labs/experiments/einstein-lensing';

describe('bounded point-lens runner', () => {
  it('uses shared point-lens observables and resolves the Einstein-ring limit', () => {
    const aligned = runPointLensScenario({ beta: 0 });
    const offset = runPointLensScenario({ beta: 0.8 });
    expect(aligned.einsteinRing).toBe(true);
    expect(aligned.totalMagnification).toBeGreaterThan(offset.totalMagnification);
    expect(offset.thetaPlus).toBeGreaterThan(0);
    expect(offset.thetaMinus).toBeLessThan(0);
    expect(runPointLensScenario({ beta: 0.8 })).toEqual(offset);
  });

  it('rejects source offsets outside the existing Canvas domain', () => {
    expect(() => runPointLensScenario({ beta: -0.1 })).toThrow('beta');
    expect(() => runPointLensScenario({ beta: 1.7 })).toThrow('beta');
  });
});
