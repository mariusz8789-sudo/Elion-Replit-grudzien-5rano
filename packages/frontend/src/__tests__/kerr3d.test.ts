import { describe, expect, it } from 'vitest';
import { runKerrScenario } from '../labs/experiments/einstein-kerr3d';

describe('bounded Kerr equatorial runner', () => {
  it('uses the shared analytic horizon and photon-orbit relations', () => {
    const schwarzschild = runKerrScenario({ spin: 0 });
    const rotating = runKerrScenario({ spin: 0.7 });

    expect(schwarzschild.rPlus).toBeCloseTo(2, 12);
    expect(schwarzschild.rPro).toBeCloseTo(3, 12);
    expect(schwarzschild.rRetro).toBeCloseTo(3, 12);
    expect(rotating.rPro).toBeLessThan(rotating.rRetro);
    expect(rotating.frameDraggingGap).toBeGreaterThan(0);
    expect(runKerrScenario({ spin: 0.7 })).toEqual(rotating);
  });

  it('rejects spin outside the bounded visual-model domain', () => {
    expect(() => runKerrScenario({ spin: -0.01 })).toThrow('spin');
    expect(() => runKerrScenario({ spin: 0.98 })).toThrow('spin');
  });
});
