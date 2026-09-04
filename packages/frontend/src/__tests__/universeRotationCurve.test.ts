import { describe, expect, it } from 'vitest';
import { runRotationCurveScenario } from '../labs/experiments/universe-rotationcurve';

describe('universe rotation curve runner', () => {
  it('reuses deterministic visible-disk and pseudo-isothermal halo calculations', () => {
    const noHalo = runRotationCurveScenario({ haloVInf: 0, altGravity: false });
    const halo = runRotationCurveScenario({ haloVInf: 150, altGravity: false });
    const repeated = runRotationCurveScenario({ haloVInf: 150, altGravity: false });

    expect(repeated).toEqual(halo);
    expect(noHalo.modeledVelocityKmS).toBeCloseTo(noHalo.visibleDiskVelocityKmS);
    expect(halo.modeledVelocityKmS).toBeGreaterThan(halo.visibleDiskVelocityKmS);
    expect(halo.markerRadiusKpc).toBe(20);
  });

  it('calculates the existing MOND branch without presenting it as a data fit', () => {
    const mond = runRotationCurveScenario({ altGravity: true });

    expect(mond.altGravity).toBe(true);
    expect(mond.modeledVelocityKmS).toBeGreaterThan(0);
    expect(mond.mondAsymptoticVelocityKmS).toBeGreaterThan(0);
  });

  it('rejects halo speeds outside the existing slider domain', () => {
    expect(() => runRotationCurveScenario({ haloVInf: -1 })).toThrow('haloVInf');
    expect(() => runRotationCurveScenario({ haloVInf: 221 })).toThrow('haloVInf');
  });
});
