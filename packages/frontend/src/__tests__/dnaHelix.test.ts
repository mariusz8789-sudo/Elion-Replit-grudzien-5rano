import { describe, expect, it } from 'vitest';
import { runDnaHelixScenario } from '../labs/experiments/biology-dnahelix';

describe('bounded DNA helix runner', () => {
  it('uses shared B-DNA geometry and Wallace melting observables deterministically', () => {
    const gc = runDnaHelixScenario({ sequence: 'gcRich', temperatureC: 37 });
    const at = runDnaHelixScenario({ sequence: 'atRich', temperatureC: 37 });
    expect(gc).toEqual(runDnaHelixScenario({ sequence: 'gcRich', temperatureC: 37 }));
    expect(gc.basePairs).toBe(20);
    expect(gc.tmC).toBeGreaterThan(at.tmC);
    expect(gc.radiusNm).toBe(1);
    expect(gc.risePerBasePairNm).toBe(0.34);
  });
  it('rejects unknown presets and temperature outside the bounded model', () => {
    expect(() => runDnaHelixScenario({ sequence: 'unknown' })).toThrow('Unknown DNA sequence preset');
    expect(() => runDnaHelixScenario({ temperatureC: 101 })).toThrow('temperatureC');
  });
});
