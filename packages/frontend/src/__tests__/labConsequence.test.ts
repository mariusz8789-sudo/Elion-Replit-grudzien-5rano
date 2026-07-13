import { describe, expect, it } from 'vitest';
import { isCrossDomainNode, inputDomains } from '../core/modelGraph/labConsequence';
import { nuclearConsequence } from '../labs/experiments/nuclear-consequence';
import { einsteinAstroConsequence } from '../labs/experiments/einstein-astro-consequence';
import { universeOrbitalConsequence } from '../labs/experiments/universe-orbital-consequence';
import type { ExperimentDef } from '../core/types';

/**
 * Adopcja Grafu Modeli przez laboratoria (Priorytet 1). Testuje, że każdy
 * eksperyment-graf jest STRUKTURALNIE poprawny: parametry i wyjścia wskazują
 * realne węzły grafu, a wykrywanie krawędzi międzydziedzinowej działa na
 * prawdziwych polach `domain` — nie da się zadeklarować połączenia, którego
 * w grafie nie ma.
 */
const EXPERIMENTS: ExperimentDef[] = [nuclearConsequence, einsteinAstroConsequence, universeOrbitalConsequence];

describe('adopcja Grafu Modeli — spójność specyfikacji', () => {
  for (const exp of EXPERIMENTS) {
    it(`${exp.id}: parametry i wyjścia wskazują istniejące węzły grafu`, () => {
      const spec = exp.createConsequenceModel!();
      expect(spec.params.length).toBeGreaterThan(0);
      expect(spec.outputs.length).toBeGreaterThan(0);
      const paramIds = new Set(spec.graph.getParameterNodeIds());
      for (const p of spec.params) {
        expect(spec.graph.getNode(p.id), `param ${p.id}`).toBeTruthy();
        expect(paramIds.has(p.id), `${p.id} to węzeł-parametr`).toBe(true);
      }
      for (const o of spec.outputs) {
        const node = spec.graph.getNode(o.id);
        expect(node, `output ${o.id}`).toBeTruthy();
        expect(node!.inputs.length, `${o.id} jest węzłem pochodnym`).toBeGreaterThan(0);
      }
    });
  }
});

describe('wykrywanie krawędzi międzydziedzinowej', () => {
  it('flaguje observedIscoFrequency jako GW × STW', () => {
    const spec = einsteinAstroConsequence.createConsequenceModel!();
    const node = spec.graph.getNode('observedIscoFrequency')!;
    expect(isCrossDomainNode(spec.graph, node)).toBe(true);
    const domains = inputDomains(spec.graph, node);
    expect(domains.length).toBeGreaterThanOrEqual(2);
  });

  it('NIE flaguje węzła jednodziedzinowego jako międzydziedzinowego', () => {
    const spec = universeOrbitalConsequence.createConsequenceModel!();
    // Okres orbitalny zależy tylko od parametrów w tej samej dziedzinie.
    const node = spec.graph.getNode('orbitalPeriodYears')!;
    expect(isCrossDomainNode(spec.graph, node)).toBe(false);
  });

  it('propagacja realnie przelicza wyjścia po zmianie parametru', () => {
    const spec = nuclearConsequence.createConsequenceModel!();
    const before = spec.graph.getValue('bindingEnergy');
    const steps = spec.graph.setParameter('protonNumber', spec.graph.getValue('protonNumber') + 4);
    expect(steps.length).toBeGreaterThan(0);
    expect(spec.graph.getValue('bindingEnergy')).not.toBe(before);
    // causedBy musi wskazywać zmieniony parametr gdzieś w łańcuchu.
    expect(steps.some((s) => s.causedBy.includes('protonNumber') || s.nodeId === 'protonNumber')).toBe(true);
  });
});
