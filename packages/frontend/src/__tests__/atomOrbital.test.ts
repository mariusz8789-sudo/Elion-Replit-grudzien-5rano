import { describe, expect, it } from 'vitest';
import { runHydrogenOrbitalScenario } from '../labs/experiments/atom-orbital-3d';

describe('bounded hydrogen orbital runner', () => {
  it('evaluates the existing analytic 2pz orbital without renderer sampling', () => {
    const axis = runHydrogenOrbitalScenario({ orbital: '2pz', x: 0, y: 0, z: 1 });
    const node = runHydrogenOrbitalScenario({ orbital: '2pz', x: 1, y: 0, z: 0 });
    expect(axis.relativeDensity).toBeGreaterThan(0);
    expect(node.relativeDensity).toBeCloseTo(0, 12);
    expect(runHydrogenOrbitalScenario({ orbital: '2pz', x: 0, y: 0, z: 1 })).toEqual(axis);
  });

  it('rejects unsupported orbitals and points outside the Canvas extent', () => {
    expect(() => runHydrogenOrbitalScenario({ orbital: '4f' })).toThrow('Nieznany orbital');
    expect(() => runHydrogenOrbitalScenario({ orbital: '1s', x: 7 })).toThrow('poza zakresem');
  });
});
