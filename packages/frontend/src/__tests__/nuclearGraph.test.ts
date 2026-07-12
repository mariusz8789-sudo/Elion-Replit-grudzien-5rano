import { describe, expect, it } from 'vitest';
import { buildNuclearModelGraph } from '../core/modelGraph/nuclearGraph';
import { semfBindingEnergy } from '../core/physics';

describe('buildNuclearModelGraph', () => {
  it('defaults to Fe-56 (Z=26, N=30) with A=56 and B/A near the ~8.8 MeV iron peak', () => {
    const g = buildNuclearModelGraph();
    expect(g.getValue('protonNumber')).toBe(26);
    expect(g.getValue('neutronNumber')).toBe(30);
    expect(g.getValue('massNumber')).toBe(56);
    expect(g.getValue('bindingPerNucleon')).toBeGreaterThan(8.5);
    expect(g.getValue('bindingPerNucleon')).toBeLessThan(9.0);
  });

  it('massNumber and bindingEnergy both depend on BOTH parameters (multi-root child)', () => {
    const g = buildNuclearModelGraph();
    expect(g.getNode('massNumber')!.inputs.sort()).toEqual(['neutronNumber', 'protonNumber']);
    expect(g.getNode('bindingEnergy')!.inputs.sort()).toEqual(['neutronNumber', 'protonNumber']);
  });

  it('bindingEnergy node reproduces physics.ts::semfBindingEnergy exactly for U-238', () => {
    const g = buildNuclearModelGraph();
    g.setParameter('protonNumber', 92);
    g.setParameter('neutronNumber', 146);
    expect(g.getValue('massNumber')).toBe(238);
    expect(g.getValue('bindingEnergy')).toBeCloseTo(semfBindingEnergy(92, 146), 6);
  });

  it('changing a single parameter propagates causedBy with only that parameter for single-input paths', () => {
    const g = buildNuclearModelGraph();
    const steps = g.setParameter('neutronNumber', 31);
    const massStep = steps.find((s) => s.nodeId === 'massNumber')!;
    // massNumber depends on both Z and N, but only N changed here -> causedBy is only neutronNumber.
    expect(massStep.causedBy).toEqual(['neutronNumber']);
  });

  it('applyParameterSnapshot changing both Z and N recomputes massNumber once, caused by both', () => {
    const g = buildNuclearModelGraph();
    const steps = g.applyParameterSnapshot({ protonNumber: 28, neutronNumber: 34 }); // Ni-62
    expect(g.getValue('massNumber')).toBe(62);
    const massSteps = steps.filter((s) => s.nodeId === 'massNumber');
    expect(massSteps).toHaveLength(1);
    expect(massSteps[0].causedBy.sort()).toEqual(['neutronNumber', 'protonNumber']);
  });

  it('binding energy nodes are labeled derivation="approximate" (SEMF omits shell effects), not "direct"', () => {
    const g = buildNuclearModelGraph();
    expect(g.getNode('bindingEnergy')!.derivation).toBe('approximate');
    expect(g.getNode('bindingPerNucleon')!.derivation).toBe('approximate');
    // pure arithmetic node stays direct
    expect(g.getNode('massNumber')!.derivation).toBe('direct');
  });
});
