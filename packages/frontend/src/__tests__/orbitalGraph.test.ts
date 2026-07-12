import { describe, expect, it } from 'vitest';
import { buildOrbitalModelGraph } from '../core/modelGraph/orbitalGraph';

describe('buildOrbitalModelGraph', () => {
  it('reproduces Earth-like defaults: 1 solar mass at 1 AU gives a 1-year period', () => {
    const g = buildOrbitalModelGraph();
    expect(g.getValue('centralMassSolar')).toBe(1);
    expect(g.getValue('orbitalPeriodYears')).toBeCloseTo(1, 6);
    expect(g.getValue('relativeTidalStrength')).toBeCloseTo(1, 10);
  });

  it('quadrupling the central mass halves the orbital period (Kepler III: T ~ M^-1/2 at fixed a)', () => {
    const g = buildOrbitalModelGraph();
    g.setParameter('centralMassSolar', 4);
    expect(g.getValue('orbitalPeriodYears')).toBeCloseTo(0.5, 6);
  });

  it('doubles orbital speed when mass quadruples (vis-viva: v ~ sqrt(M) at fixed circular orbit)', () => {
    const g = buildOrbitalModelGraph();
    const baseline = g.getValue('orbitalSpeedAuPerYear');
    g.setParameter('centralMassSolar', 4);
    expect(g.getValue('orbitalSpeedAuPerYear')).toBeCloseTo(baseline * 2, 6);
  });

  it('relativeTidalStrength scales linearly with mass at fixed orbital radius', () => {
    const g = buildOrbitalModelGraph();
    g.setParameter('centralMassSolar', 2.5);
    expect(g.getValue('relativeTidalStrength')).toBeCloseTo(2.5, 10);
  });

  it('setParameter returns a propagation order with the parameter first and all three derived nodes following', () => {
    const g = buildOrbitalModelGraph();
    const steps = g.setParameter('centralMassSolar', 3);
    const ids = steps.map((s) => s.nodeId);
    expect(ids[0]).toBe('centralMassSolar');
    expect(new Set(ids)).toEqual(
      new Set(['centralMassSolar', 'orbitalPeriodYears', 'orbitalSpeedAuPerYear', 'relativeTidalStrength']),
    );
  });

  it('every node carries an honesty label and a non-empty honestyNote (no silent unlabeled claims)', () => {
    const g = buildOrbitalModelGraph();
    for (const node of g.getAllNodes()) {
      expect(node.honesty).toBeTruthy();
      expect(node.honestyNote.length).toBeGreaterThan(10);
    }
  });
});
