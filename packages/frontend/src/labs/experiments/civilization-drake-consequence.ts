import type { ExperimentDef } from '../../core/types';
import { buildDrakeEquationGraph } from '../../core/modelGraph/drakeEquationGraph';

export function runDrakeEquationScenario({
  starFormationRate = 1.5, fractionWithPlanets = 0.9, earthlikePerSystem = 0.2,
  fractionDevelopingLife = 0.5, fractionIntelligent = 0.1, fractionCommunicative = 0.1, lifetimeLog10Years = 4,
}: Record<string, number> = {}) {
  const fractions = { fractionWithPlanets, fractionDevelopingLife, fractionIntelligent, fractionCommunicative };
  if (!Number.isFinite(starFormationRate) || starFormationRate < 0.1 || starFormationRate > 10) throw new Error('starFormationRate must be within [0.1, 10].');
  if (!Number.isFinite(earthlikePerSystem) || earthlikePerSystem < 0 || earthlikePerSystem > 5) throw new Error('earthlikePerSystem must be within [0, 5].');
  if (!Number.isFinite(lifetimeLog10Years) || lifetimeLog10Years < 2 || lifetimeLog10Years > 9) throw new Error('lifetimeLog10Years must be within [2, 9].');
  for (const [id, value] of Object.entries(fractions)) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${id} must be within [0, 1].`);
  const graph = buildDrakeEquationGraph();
  graph.applyParameterSnapshot({ starFormationRate, fractionWithPlanets, earthlikePerSystem, fractionDevelopingLife, fractionIntelligent, fractionCommunicative, lifetimeLog10Years });
  return { starFormationRate, fractionWithPlanets, earthlikePerSystem, fractionDevelopingLife, fractionIntelligent, fractionCommunicative, lifetimeLog10Years, assumedLifetimeYears: 10 ** lifetimeLog10Years, civilizationCount: graph.getValue('civilizationCount') };
}

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
