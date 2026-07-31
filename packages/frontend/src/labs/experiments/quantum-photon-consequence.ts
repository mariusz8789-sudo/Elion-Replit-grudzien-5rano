import type { ExperimentDef } from '../../core/types';
import { buildPhotonGraph } from '../../core/modelGraph/photonGraph';

/** Quantum Lab × Graf Modeli — kwant światła + krawędź do chemii (Priorytet 1). */
export const quantumPhotonConsequence: ExperimentDef = {
  id: 'quantum.photon-consequence',
  name: 'Łańcuch konsekwencji: kwant światła',
  honesty: 'exact',
  honestyNote:
    'Kwantyzacja fotonu: E=hc/λ, f=c/λ (DOKŁADNE). Krawędź międzydziedzinowa: energia fotonu w kJ/mol (skala chemiczna) do porównania z energiami wiązań. Liczy to wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildPhotonGraph(),
    headline: 'Długość fali λ → energia fotonu (eV), częstotliwość (THz), energia w skali chemicznej (kJ/mol)',
    params: [
      { id: 'wavelengthNm', min: 100, max: 2000, step: 1 },
    ],
    outputs: [
      { id: 'photonEnergyEV', format: (v) => v.toFixed(3), sonify: { min: 0.5, max: 12 } },
      { id: 'photonFrequencyTHz', format: (v) => v.toFixed(1) },
      { id: 'photonEnergyKJmol', format: (v) => v.toFixed(1) },
    ],
  }),
};
