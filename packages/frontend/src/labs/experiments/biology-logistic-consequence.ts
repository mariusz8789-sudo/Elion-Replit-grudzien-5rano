import type { ExperimentDef } from '../../core/types';
import { buildLogisticGrowthGraph } from '../../core/modelGraph/logisticGrowthGraph';

/** Biology Lab × Graf Modeli — logistyczny wzrost populacji (Priorytet 1). */
export const biologyLogisticConsequence: ExperimentDef = {
  id: 'biology.logistic-consequence',
  name: 'Łańcuch konsekwencji: wzrost logistyczny',
  honesty: 'simplified',
  honestyNote:
    'Logistyczny wzrost populacji: N(t)=K/(1+((K−N₀)/N₀)e^(−rt)) — ścisłe rozwiązanie równania dN/dt=rN(1−N/K). MODEL uproszczony (stałe r,K; bez struktury wiekowej, opóźnień, drapieżnictwa, losowości). Liczy go wykonywalny Graf Modeli.',
  params: [],
  narrate: () => [],
  createConsequenceModel: () => ({
    graph: buildLogisticGrowthGraph(),
    headline: 'Tempo wzrostu, pojemność, populacja początkowa, czas → populacja N(t) i wypełnienie pojemności',
    params: [
      { id: 'growthRate', min: 0.05, max: 2, step: 0.05 },
      { id: 'carryingCapacity', min: 100, max: 10000, step: 100, format: (v) => v.toFixed(0) },
      { id: 'initialPopulation', min: 1, max: 2000, step: 1 },
      { id: 'timeElapsed', min: 0, max: 40, step: 0.5 },
    ],
    outputs: [
      { id: 'populationAtT', format: (v) => v.toFixed(0), sonify: { min: 0, max: 10000 } },
      { id: 'fractionOfCapacity', format: (v) => v.toFixed(1) },
    ],
  }),
};
