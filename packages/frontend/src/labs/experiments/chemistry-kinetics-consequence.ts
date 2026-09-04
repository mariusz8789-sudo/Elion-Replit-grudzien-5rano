import type { ExperimentDef } from '../../core/types';
import { buildChemistryKineticsGraph } from '../../core/modelGraph/chemistryKineticsGraph';

/**
 * Chemistry Lab × Graf Modeli — kinetyka Arrheniusa (Priorytet 1 + fundament
 * pod chemiczny Discovery Engine). Zmieniasz temperaturę, energię aktywacji i
 * czynnik przedwykładniczy, a stała szybkości, czas połowicznej przemiany i
 * przyspieszenie względem 25°C liczą się przez wykonywalny graf, z pełną
 * etykietą uczciwości (model przybliżony vs wynik dokładny).
 */
export const chemistryKineticsConsequence: ExperimentDef = {
  id: 'chemistry.kinetics-consequence',
  name: 'Łańcuch konsekwencji: kinetyka (Arrhenius)',
  honesty: 'simplified',
  honestyNote:
    'Równanie Arrheniusa k = A·exp(−Eₐ/RT) — MODEL PRZYBLIŻONY (A, Eₐ niezależne od T; reakcja elementarna). Liczy je wykonywalny Graf Modeli. Przyspieszenie względem temperatury pokojowej jest niezależne od A, więc to najlepiej określony wynik.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildChemistryKineticsGraph(),
    headline: 'Temperatura, energia aktywacji, czynnik A → stała szybkości, czas połowiczny, przyspieszenie',
    params: [
      { id: 'temperatureK', min: 250, max: 600, step: 1 },
      { id: 'activationEnergyKJ', min: 10, max: 200, step: 1 },
      { id: 'preExponentialLog10', min: 8, max: 14, step: 0.1 },
    ],
    outputs: [
      { id: 'rateConstant', format: (v) => (v >= 1e4 || v < 1e-3 ? v.toExponential(2) : v.toFixed(3)) },
      { id: 'halfLifeFirstOrder', format: (v) => (v >= 1e4 || v < 1e-3 ? v.toExponential(2) : v.toFixed(2)) },
      { id: 'speedupVsRoom', format: (v) => (v >= 1e4 ? v.toExponential(2) : v.toFixed(1)) },
    ],
  }),
};
