import type { ExperimentDef } from '../../core/types';
import { buildBohrModelGraph } from '../../core/modelGraph/bohrModelGraph';

/** Atom Lab × Graf Modeli — model Bohra atomu wodoropodobnego (Priorytet 1). */
export const atomBohrConsequence: ExperimentDef = {
  id: 'atom.bohr-consequence',
  name: 'Łańcuch konsekwencji: model Bohra',
  honesty: 'simplified',
  honestyNote:
    'Model Bohra: E_n=−13,606·Z²/n² eV, r_n=52,9·n²/Z pm. MODEL PRZYBLIŻONY — ścisły tylko dla układów jednoelektronowych (H, He⁺…). Dla wodoru n=1 daje energię jonizacji 13,6 eV. ✓ Liczy go wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildBohrModelGraph(),
    headline: 'Ładunek jądra Z i powłoka n → energia poziomu, promień orbity, energia jonizacji',
    params: [
      { id: 'atomicNumber', min: 1, max: 20, step: 1 },
      { id: 'principalN', min: 1, max: 8, step: 1 },
    ],
    outputs: [
      { id: 'energyLevelEV', format: (v) => v.toFixed(3) },
      { id: 'orbitalRadiusPm', format: (v) => v.toFixed(1) },
      { id: 'ionizationPhotonEV', format: (v) => v.toFixed(3) },
    ],
  }),
};
