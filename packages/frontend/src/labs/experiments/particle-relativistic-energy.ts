import type { ExperimentDef } from '../../core/types';
import { buildRelativisticEnergyGraph } from '../../core/modelGraph/relativisticEnergyGraph';

/** Particle Lab × Graf Modeli — relatywistyczna energia i pęd (Priorytet 1). */
export const particleRelativisticEnergy: ExperimentDef = {
  id: 'particle.relativistic-energy',
  name: 'Łańcuch konsekwencji: E = γmc²',
  honesty: 'exact',
  honestyNote:
    'Relatywistyczna energia i pęd cząstki swobodnej: γ, E=γmc², E_kin=(γ−1)mc², p=γmβc — wielkości DOKŁADNE w ramach STW. Liczy je wykonywalny Graf Modeli. Masy w MeV/c² (elektron 0,511; proton 938,3).',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildRelativisticEnergyGraph(),
    headline: 'Masa spoczynkowa i prędkość β → γ, energia całkowita, kinetyczna, pęd',
    params: [
      { id: 'restMassMeV', min: 0.5, max: 1000, step: 0.5, format: (v) => v.toFixed(1) },
      { id: 'velocityFraction', min: 0, max: 0.999, step: 0.001, format: (v) => v.toFixed(3) },
    ],
    outputs: [
      { id: 'lorentzGammaFactor', format: (v) => v.toFixed(3) },
      { id: 'totalEnergyMeV', format: (v) => v.toFixed(2) },
      { id: 'kineticEnergyMeV', format: (v) => v.toFixed(2) },
      { id: 'momentumMeVc', format: (v) => v.toFixed(2) },
    ],
  }),
};
