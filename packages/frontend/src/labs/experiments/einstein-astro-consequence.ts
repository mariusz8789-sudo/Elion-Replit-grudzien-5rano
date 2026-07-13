import type { ExperimentDef } from '../../core/types';
import { buildRelativisticAstroGraph } from '../../core/modelGraph/relativisticAstroGraph';

/**
 * Einstein Lab × Graf Modeli — pierwsza WIDOCZNA krawędź międzydziedzinowa
 * (Priorytety 1, 2, 4 roadmapy naraz).
 *
 * `relativisticAstroGraph` był wykonywalny i przetestowany, ale HEADLESS. Zawiera
 * jedyną prawdziwą krawędź międzydziedzinową całej platformy:
 *
 *   f_ISCO (dziedzina: fale grawitacyjne)  ──┐
 *                                            ├─► f_obs (GW × STW)
 *   czynnik Dopplera (dziedzina: STW)     ──┘
 *
 * Ten eksperyment udostępnia ją w produkcie: zmieniasz masę układu, stosunek
 * mas albo prędkość źródła w linii widzenia — a obserwowana częstotliwość ISCO
 * u detektora liczy się z inspiralu GW przesuniętego relatywistycznym Dopplerem
 * ruchu źródła. Panel oznacza ten węzeł jako „międzydziedzinowy" strukturalnie
 * (z pól `domain`), nie deklaratywnie.
 */
export const einsteinAstroConsequence: ExperimentDef = {
  id: 'einstein.gw-sr-consequence',
  name: 'Krawędź międzydziedzinowa: GW × STW',
  honesty: 'simplified',
  honestyNote:
    'Łączy inspiral fal grawitacyjnych (masa ćwierkowa, częstotliwość ISCO — PRZYBLIŻONE: Schwarzschild, brak spinu) z relatywistycznym Dopplerem szczególnej teorii względności (DOKŁADNY dla prędkości peculiar w linii widzenia). Obserwowana częstotliwość ISCO to REALNa krawędź międzydziedzinowa: f_obs = f_ISCO,źródło × √((1−β)/(1+β)). Wszystko liczy wykonywalny Graf Modeli (core/modelGraph/relativisticAstroGraph).',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildRelativisticAstroGraph(),
    headline: 'Inspiral GW + ruch źródła → obserwowana częstotliwość u detektora (GW × STW)',
    params: [
      { id: 'totalMassSolar', min: 5, max: 120, step: 1 },
      { id: 'massRatio', min: 0.1, max: 1, step: 0.01 },
      { id: 'lineOfSightBeta', min: -0.6, max: 0.6, step: 0.01 },
    ],
    outputs: [
      { id: 'chirpMassSolar', format: (v) => v.toFixed(2) },
      { id: 'iscoFrequencySource', format: (v) => v.toFixed(1) },
      { id: 'lorentzGammaFactor', format: (v) => v.toFixed(4) },
      { id: 'dopplerRedshiftFactor', format: (v) => v.toFixed(4) },
      { id: 'observedIscoFrequency', format: (v) => v.toFixed(1) },
    ],
  }),
};
