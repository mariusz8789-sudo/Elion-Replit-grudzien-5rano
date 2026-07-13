import { describe, expect, it } from 'vitest';
import { isCrossDomainNode, inputDomains } from '../core/modelGraph/labConsequence';
import { nuclearConsequence } from '../labs/experiments/nuclear-consequence';
import { einsteinAstroConsequence } from '../labs/experiments/einstein-astro-consequence';
import { universeOrbitalConsequence } from '../labs/experiments/universe-orbital-consequence';
import { chemistryKineticsConsequence } from '../labs/experiments/chemistry-kinetics-consequence';
import { spacetimeRelativityConsequence } from '../labs/experiments/spacetime-relativity-consequence';
import { civilizationDrakeConsequence } from '../labs/experiments/civilization-drake-consequence';
import { spacetimeCSlider } from '../labs/experiments/spacetime-cslider';
import { universeAtmosphericEscape } from '../labs/experiments/universe-atmospheric-escape';
import { particleRelativisticEnergy } from '../labs/experiments/particle-relativistic-energy';
import { atomBohrConsequence } from '../labs/experiments/atom-bohr-consequence';
import { biologyLogisticConsequence } from '../labs/experiments/biology-logistic-consequence';
import type { ExperimentDef } from '../core/types';

/**
 * Adopcja Grafu Modeli przez laboratoria (Priorytet 1). Testuje, że każdy
 * eksperyment-graf jest STRUKTURALNIE poprawny: parametry i wyjścia wskazują
 * realne węzły grafu, a wykrywanie krawędzi międzydziedzinowej działa na
 * prawdziwych polach `domain` — nie da się zadeklarować połączenia, którego
 * w grafie nie ma.
 */
const EXPERIMENTS: ExperimentDef[] = [
  nuclearConsequence, einsteinAstroConsequence, universeOrbitalConsequence,
  chemistryKineticsConsequence, spacetimeRelativityConsequence, civilizationDrakeConsequence,
  spacetimeCSlider, universeAtmosphericEscape,
  particleRelativisticEnergy, atomBohrConsequence, biologyLogisticConsequence,
];

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

  it('c-Slider domainGuard sygnalizuje v ≥ c (β ≥ 1), a poniżej milczy', () => {
    const spec = spacetimeCSlider.createConsequenceModel!();
    expect(spec.domainGuard).toBeTruthy();
    // Baseline v=1.5e8, c=2.998e8 → β<1 → brak naruszenia.
    expect(spec.domainGuard!(spec.graph)).toBeNull();
    // Ustaw v > c → naruszenie granicy modelu.
    spec.graph.setParameter('velocityMs', 3.5e8);
    const violation = spec.domainGuard!(spec.graph);
    expect(violation).not.toBeNull();
    expect(violation!.message.length).toBeGreaterThan(0);
    // γ musi być nieoznaczone w tym zakresie (model nie obowiązuje).
    expect(Number.isFinite(spec.graph.getValue('lorentzGammaFactor'))).toBe(false);
  });

  it('flagowy łańcuch ucieczki atmosfery: wiele krawędzi międzydziedzinowych + baseline Ziemi', () => {
    const spec = universeAtmosphericEscape.createConsequenceModel!();
    const g = spec.graph;
    // Baseline Ziemi (L=1, a=1, A=0.3): T_eq ≈ 255 K, v_esc ≈ 11.2 km/s.
    expect(g.getValue('equilibriumTempK')).toBeGreaterThan(240);
    expect(g.getValue('equilibriumTempK')).toBeLessThan(270);
    expect(g.getValue('escapeVelocityMs') / 1000).toBeGreaterThan(10.5);
    expect(g.getValue('escapeVelocityMs') / 1000).toBeLessThan(11.9);
    // Węzeł termiczny łączy klimat (T_eq) i chemię (masa cząsteczki) → międzydziedzinowy.
    expect(isCrossDomainNode(g, g.getNode('thermalVelocityMs')!)).toBe(true);
    // Węzeł Jeansa łączy mechanikę (v_esc) i termikę (v_th) → międzydziedzinowy.
    expect(isCrossDomainNode(g, g.getNode('jeansParameter')!)).toBe(true);
    // Zmiana jasności gwiazdy propaguje aż do parametru Jeansa (astronomia → ucieczka).
    const before = g.getValue('jeansParameter');
    g.setParameter('stellarLuminositySolar', 20);
    expect(g.getValue('jeansParameter')).not.toBe(before);
  });

  it('nowe grafy zgadzają się z podręcznikowymi wartościami (walidacja fizyki)', () => {
    // Bohr: wodór (Z=1, n=1) → energia jonizacji 13,6 eV.
    const bohr = atomBohrConsequence.createConsequenceModel!();
    bohr.graph.setParameter('atomicNumber', 1);
    bohr.graph.setParameter('principalN', 1);
    expect(bohr.graph.getValue('ionizationPhotonEV')).toBeCloseTo(13.606, 1);
    // Cząstka relatywistyczna: elektron (0,511 MeV) w spoczynku (β=0) → E = m, E_kin = 0.
    const rel = particleRelativisticEnergy.createConsequenceModel!();
    rel.graph.setParameter('velocityFraction', 0);
    expect(rel.graph.getValue('totalEnergyMeV')).toBeCloseTo(0.511, 3);
    expect(rel.graph.getValue('kineticEnergyMeV')).toBeCloseTo(0, 6);
    // Logistyka: przy dużym t populacja dąży do pojemności K.
    const log = biologyLogisticConsequence.createConsequenceModel!();
    log.graph.setParameter('timeElapsed', 40);
    expect(log.graph.getValue('fractionOfCapacity')).toBeGreaterThan(99);
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
