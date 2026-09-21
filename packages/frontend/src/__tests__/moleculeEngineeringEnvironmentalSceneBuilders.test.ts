import { describe, expect, it } from 'vitest';
import { buildMoleculeScene } from '../core/lookingGlass/urbanTransformation/moleculeSceneBuilder';
import { buildEngineeringScene } from '../core/lookingGlass/urbanTransformation/engineeringSceneBuilder';
import { buildEnvironmentalScene } from '../core/lookingGlass/urbanTransformation/environmentalSceneBuilder';
import { biologicalCellCapabilityGap } from '../core/lookingGlass/urbanTransformation/biologicalCapabilityGap';

describe('buildMoleculeScene — calls the real chemistry engine (chemistrySMILES.ts), builds no second one', () => {
  it('resolves caffeine to real, non-trivial descriptors', () => {
    const result = buildMoleculeScene('Build a caffeine molecule in 3D.');
    expect(result.status).toBe('COMPLETED');
    expect(result.moleculeName).toBe('caffeine');
    expect(result.descriptors).not.toBeNull();
    expect(result.descriptors!.heavyAtomCount).toBeGreaterThan(5);
  });

  it('an unknown molecule name is BLOCKED, never a guessed structure', () => {
    const result = buildMoleculeScene('Build a floobarium molecule.');
    expect(result.status).toBe('BLOCKED');
    expect(result.descriptors).toBeNull();
  });

  it('is deterministic', () => {
    const a = buildMoleculeScene('caffeine molecule');
    const b = buildMoleculeScene('caffeine molecule');
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

describe('buildEngineeringScene — calls the real pump-pipe hydraulics model, builds no second solver', () => {
  it('computes real, non-zero engineering values', () => {
    const result = buildEngineeringScene('Build a water-treatment plant.');
    expect(result.status).toBe('COMPLETED');
    expect(result.values.totalHead).toBeGreaterThan(0);
    expect(result.values.reynolds).toBeGreaterThan(0);
    expect(result.values.hydraulicPower).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const a = buildEngineeringScene('factory');
    const b = buildEngineeringScene('factory');
    expect(a.values).toEqual(b.values);
  });
});

describe('buildEnvironmentalScene — reuses the real SEIR World Model domain SW-4 already proved, builds no second epidemic engine', () => {
  it('produces a real S/E/I/R/D series that conserves population', () => {
    const result = buildEnvironmentalScene('Show a flood... (environmental system placeholder)', 20);
    expect(result.status).toBe('COMPLETED');
    expect(result.series.length).toBe(21);
    const total0 = result.series[0].S + result.series[0].E + result.series[0].I + result.series[0].R + result.series[0].D;
    const totalLast = result.series.at(-1)!.S + result.series.at(-1)!.E + result.series.at(-1)!.I + result.series.at(-1)!.R + result.series.at(-1)!.D;
    expect(totalLast).toBeCloseTo(total0, 0);
  });
});

describe('biologicalCellCapabilityGap — honest CAPABILITY_GAP, never a fabricated cell scene', () => {
  it('names the real existing capability and the real missing adapter', () => {
    const result = biologicalCellCapabilityGap();
    expect(result.status).toBe('CAPABILITY_GAP');
    expect(result.existingCapability).toContain('Human Biology Lab');
    expect(result.missingAdapter.length).toBeGreaterThan(10);
  });
});
