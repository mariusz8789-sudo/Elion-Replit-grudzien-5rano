import type { ExperimentDef } from '../../core/types';
import { buildDrakeEquationGraph } from '../../core/modelGraph/drakeEquationGraph';

/**
 * Civilization Lab × Graf Modeli — równanie Drake'a (Priorytet 1). CELOWO
 * oznaczone jako spekulatywne: to rama pojęciowa, nie przewidywanie. Zmieniasz
 * siedem czynników, a liczba cywilizacji N przelicza się przez graf — a że kilka
 * czynników jest praktycznie nieznanych, wynik rozciąga się o rzędy wielkości.
 * Pokazuje, KTÓRE założenie dominuje, a nie „ile jest cywilizacji".
 */
export const civilizationDrakeConsequence: ExperimentDef = {
  id: 'civilization.drake-consequence',
  name: 'Łańcuch konsekwencji: równanie Drake\'a',
  honesty: 'theoretical',
  honestyNote:
    'Równanie Drake\'a N = R⋆·f_p·n_e·f_l·f_i·f_c·L — RAMA POJĘCIOWA, nie przewidywanie. Kilka czynników (f_l, f_i, f_c, L) jest praktycznie nieznanych, więc N zmienia się o wiele rzędów wielkości. Wynik oznaczony jako „interpretacja/most", nie wyprowadzenie z danych.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildDrakeEquationGraph(),
    headline: 'Siedem czynników astrobiologicznych → szacowana liczba cywilizacji N (rama Drake\'a)',
    params: [
      { id: 'starFormationRate', min: 0.1, max: 10, step: 0.1 },
      { id: 'fractionWithPlanets', min: 0, max: 1, step: 0.01 },
      { id: 'earthlikePerSystem', min: 0, max: 5, step: 0.1 },
      { id: 'fractionDevelopingLife', min: 0, max: 1, step: 0.01 },
      { id: 'fractionIntelligent', min: 0, max: 1, step: 0.01 },
      { id: 'fractionCommunicative', min: 0, max: 1, step: 0.01 },
      { id: 'lifetimeLog10Years', min: 2, max: 9, step: 0.1 },
    ],
    outputs: [
      { id: 'civilizationCount', format: (v) => (v >= 1e4 || (v > 0 && v < 0.01) ? v.toExponential(2) : v.toFixed(2)) },
    ],
  }),
};
