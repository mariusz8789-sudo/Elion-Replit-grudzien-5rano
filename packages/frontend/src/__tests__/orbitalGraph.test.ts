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

  it('exposes TWO independent parameters (mass and radius) as the graph roots', () => {
    const g = buildOrbitalModelGraph();
    expect(new Set(g.getParameterNodeIds())).toEqual(new Set(['centralMassSolar', 'orbitalRadiusAu']));
    expect(g.getParameterSnapshot()).toEqual({ centralMassSolar: 1, orbitalRadiusAu: 1 });
  });

  it('orbit radius affects period via Kepler III (T ~ a^3/2): 4x radius at fixed mass gives 8x period', () => {
    const g = buildOrbitalModelGraph();
    const t0 = g.getValue('orbitalPeriodYears');
    g.setParameter('orbitalRadiusAu', 4);
    expect(g.getValue('orbitalPeriodYears')).toBeCloseTo(t0 * 8, 6);
  });

  it('relativeTidalStrength falls as 1/r^3: doubling radius at fixed mass gives 1/8 tidal strength', () => {
    const g = buildOrbitalModelGraph();
    g.setParameter('orbitalRadiusAu', 2);
    expect(g.getValue('relativeTidalStrength')).toBeCloseTo(1 / 8, 10);
  });

  it('applyParameterSnapshot changing BOTH mass and radius recomputes each derived node once, caused by both roots', () => {
    const g = buildOrbitalModelGraph();
    const steps = g.applyParameterSnapshot({ centralMassSolar: 4, orbitalRadiusAu: 4 });
    const periodSteps = steps.filter((s) => s.nodeId === 'orbitalPeriodYears');
    expect(periodSteps).toHaveLength(1);
    expect(periodSteps[0].causedBy.sort()).toEqual(['centralMassSolar', 'orbitalRadiusAu']);
    // Kepler III with M=4, a=4: T = 2*pi*sqrt(a^3/(4pi^2 M)) = sqrt(64/4) = 4 years
    expect(g.getValue('orbitalPeriodYears')).toBeCloseTo(4, 6);
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

  it('every node carries an honesty label, a derivation class, and a non-empty honestyNote (no silent unlabeled claims)', () => {
    const g = buildOrbitalModelGraph();
    for (const node of g.getAllNodes()) {
      expect(node.honesty).toBeTruthy();
      expect(['direct', 'approximate', 'interpretive']).toContain(node.derivation);
      expect(node.honestyNote.length).toBeGreaterThan(10);
    }
  });
});
