import type { ExperimentDef } from '../../core/types';
import { buildAtmosphericEscapeGraph } from '../../core/modelGraph/atmosphericEscapeGraph';

/**
 * FLAGOWY łańcuch międzydziedzinowy (Priorytet 3): ucieczka atmosfery.
 * Jeden wykonywalny graf spina astronomię gwiazdową → klimat planetarny →
 * fizykę termiczną → mechanikę grawitacyjną → chemię składu, prowadząc do
 * parametru ucieczki Jeansa. Zmień jasność gwiazdy, odległość, masę/promień
 * planety albo rodzaj gazu i zobacz, czy planeta utrzyma atmosferę — z pełnym
 * oznaczeniem, które węzły są międzydziedzinowe i gdzie kończy się ważność modelu.
 */
export const universeAtmosphericEscape: ExperimentDef = {
  id: 'universe.atmospheric-escape',
  name: 'Łańcuch międzydziedzinowy: ucieczka atmosfery',
  honesty: 'simplified',
  honestyNote:
    'Ucieczka TERMICZNA (Jeansa): gwiazda → temperatura równowagowa → prędkość cieplna gazu vs prędkość ucieczki → parametr Jeansa λ. Wielkości grawitacyjne i termiczne DOKŁADNE; temperatura równowagowa i kryterium ucieczki PRZYBLIŻONE (bez efektu cieplarnianego, bez ucieczki hydrodynamicznej / wiatru gwiazdowego). Wszystko liczy wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildAtmosphericEscapeGraph(),
    headline: 'Gwiazda + orbita + planeta + gaz → temperatura, prędkość cieplna, prędkość ucieczki, parametr Jeansa λ',
    params: [
      { id: 'stellarLuminositySolar', min: 0.01, max: 100, step: 0.01, format: (v) => v.toFixed(2) },
      { id: 'orbitalDistanceAu', min: 0.05, max: 30, step: 0.05, format: (v) => v.toFixed(2) },
      { id: 'planetAlbedo', min: 0, max: 0.9, step: 0.01 },
      { id: 'planetMassEarth', min: 0.01, max: 300, step: 0.01, format: (v) => v.toFixed(2) },
      { id: 'planetRadiusEarth', min: 0.1, max: 12, step: 0.1 },
      { id: 'moleculeMassAmu', min: 1, max: 50, step: 1 },
    ],
    outputs: [
      { id: 'equilibriumTempK', format: (v) => v.toFixed(0), sonify: { min: 50, max: 1500 } },
      { id: 'escapeVelocityMs', format: (v) => (v / 1000).toFixed(2) + ' km/s →' },
      { id: 'thermalVelocityMs', format: (v) => (v / 1000).toFixed(3) + ' km/s →' },
      { id: 'jeansParameter', format: (v) => (v >= 1e4 ? v.toExponential(2) : v.toFixed(1)) },
      { id: 'thermalToEscapeRatio', format: (v) => v.toFixed(4) },
    ],
    domainGuard: (graph) => {
      const lambda = graph.getValue('jeansParameter');
      if (lambda < 15) {
        return {
          message: `Parametr Jeansa λ = ${lambda.toFixed(1)} < ~15 — w tym reżimie ucieczka termiczna jest szybka, a przybliżenie „stabilnej atmosfery" nie obowiązuje. Realny los atmosfery zależy też od procesów pominiętych w tym modelu (ucieczka hydrodynamiczna, wiatr gwiazdowy).`,
        };
      }
      return null;
    },
  }),
};
