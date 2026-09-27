import { describe, expect, it } from 'vitest';
import { computePharmacokinetics } from '../core/scientificWorlds/pharmacokineticsAdapter';
import { simulatePhysiology } from '../core/scientificWorlds/humanLab/physiology';
import { dockLigand } from '@genesis/core/chemistry/moleculeDockingEngine.js';

const H2SO4_SMILES = 'O=S(=O)(O)O';
const docking = dockLigand(H2SO4_SMILES, 'receptor:kinase-atp-pocket-illustrative');

describe('pharmacokineticsAdapter — real physiology seam, deterministic PK model', () => {
  it('uses the REAL humanLab/physiology.ts seam (simulatePhysiology), not an invented AnatomySession', () => {
    const state = simulatePhysiology({ seed: 3, timeSeconds: 120, activity: 0.4 });
    const profile = computePharmacokinetics({ dockingResult: docking, seed: 3, timeSeconds: 120, activity: 0.4 });
    expect(profile.physiologyUsed.heartRateBpm).toBeCloseTo(state.heartRateBpm, 1);
    expect(profile.physiologyUsed.bodyTemperatureC).toBeCloseTo(state.bodyTemperatureC, 2);
    expect(profile.physiologyUsed.cerebralPerfusionIndex).toBeCloseTo(state.cerebralPerfusionIndex, 3);
  });

  it('is fully deterministic: identical inputs always yield an identical profile', () => {
    const a = computePharmacokinetics({ dockingResult: docking, seed: 7, timeSeconds: 60, activity: 0.3 });
    const b = computePharmacokinetics({ dockingResult: docking, seed: 7, timeSeconds: 60, activity: 0.3 });
    expect(a).toEqual(b);
  });

  it('a stronger illustrative binding affinity (more negative kcal/mol) damps the elimination rate, per the documented model', () => {
    const weakDocking = dockLigand('C', 'receptor:kinase-atp-pocket-illustrative');
    const strongDocking = dockLigand('CC(=O)Oc1ccccc1C(=O)O', 'receptor:nuclear-hormone-illustrative');
    expect(Math.abs(strongDocking.affinityProxyKcalMol)).toBeGreaterThan(Math.abs(weakDocking.affinityProxyKcalMol));
    const weak = computePharmacokinetics({ dockingResult: weakDocking, seed: 1, timeSeconds: 0, activity: 0.2 });
    const strong = computePharmacokinetics({ dockingResult: strongDocking, seed: 1, timeSeconds: 0, activity: 0.2 });
    expect(strong.eliminationRateKePerHour).toBeLessThanOrEqual(weak.eliminationRateKePerHour);
    expect(strong.halfLifeHours).toBeGreaterThanOrEqual(weak.halfLifeHours);
  });

  it('produces a real one-compartment concentration series that rises then falls, with cMaxProxy matching its own peak', () => {
    const profile = computePharmacokinetics({ dockingResult: docking, seed: 2, timeSeconds: 0, activity: 0.2, doseMg: 200 });
    expect(profile.series.length).toBeGreaterThan(5);
    const peakIndex = profile.series.reduce((best, p, i) => (p.concentrationMgL > profile.series[best].concentrationMgL ? i : best), 0);
    expect(peakIndex).toBeGreaterThan(0);
    expect(peakIndex).toBeLessThan(profile.series.length - 1);
    expect(profile.cMaxProxyMgL).toBeCloseTo(profile.series[peakIndex].concentrationMgL, 3);
    expect(profile.doseMg).toBe(200);
    expect(profile.epistemic).toBe('MODEL');
  });

  it('falls back to a default dose when none, or an invalid one, is supplied', () => {
    expect(computePharmacokinetics({ dockingResult: docking, seed: 1, timeSeconds: 0, activity: 0.2 }).doseMg).toBe(100);
    expect(computePharmacokinetics({ dockingResult: docking, seed: 1, timeSeconds: 0, activity: 0.2, doseMg: -5 }).doseMg).toBe(100);
  });
});
