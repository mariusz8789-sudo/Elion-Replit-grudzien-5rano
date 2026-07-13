import { ModelGraph } from './graph';

/**
 * Biology Lab × Graf Modeli — logistyczny wzrost populacji (Priorytet 1).
 *
 * Ścisłe rozwiązanie równania logistycznego dN/dt = rN(1−N/K):
 *   N(t) = K / (1 + ((K−N₀)/N₀)·e^(−rt)).
 * Wzór ROZWIĄZANIA jest dokładny (derivation 'direct'), ale sam MODEL logistyczny
 * jest uproszczeniem biologii (stałe r i K, brak struktury wiekowej, opóźnień,
 * drapieżnictwa, stochastyczności) — stąd honesty 'simplified'. Dobrze oddaje
 * wzrost z nasyceniem do pojemności środowiska K.
 */

export const BASELINE_GROWTH_RATE = 0.4;
export const BASELINE_CAPACITY = 1000;
export const BASELINE_INITIAL = 10;
export const BASELINE_TIME = 10;

export function buildLogisticGrowthGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'growthRate', label: 'Tempo wzrostu r', unit: '1/czas', domain: 'dynamika populacji',
      honesty: 'exact', honestyNote: 'Wewnętrzne tempo wzrostu — zadane.', derivation: 'direct',
      inputs: [], compute: (i) => i.growthRate ?? BASELINE_GROWTH_RATE, formula: 'r (parametr)' },
    BASELINE_GROWTH_RATE,
  );
  g.addNode(
    { id: 'carryingCapacity', label: 'Pojemność środowiska K', unit: 'osobn.', domain: 'dynamika populacji',
      honesty: 'exact', honestyNote: 'Maksymalna trwała liczebność — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.carryingCapacity ?? BASELINE_CAPACITY, formula: 'K (parametr)' },
    BASELINE_CAPACITY,
  );
  g.addNode(
    { id: 'initialPopulation', label: 'Populacja początkowa N₀', unit: 'osobn.', domain: 'dynamika populacji',
      honesty: 'exact', honestyNote: 'Liczebność w chwili t=0 — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => Math.max(1e-6, i.initialPopulation ?? BASELINE_INITIAL), formula: 'N₀ (parametr)' },
    BASELINE_INITIAL,
  );
  g.addNode(
    { id: 'timeElapsed', label: 'Czas t', unit: 'czas', domain: 'dynamika populacji',
      honesty: 'exact', honestyNote: 'Upływ czasu od chwili początkowej — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => i.timeElapsed ?? BASELINE_TIME, formula: 't (parametr)' },
    BASELINE_TIME,
  );

  g.addNode({
    id: 'populationAtT', label: 'Populacja N(t)', unit: 'osobn.', domain: 'dynamika populacji',
    honesty: 'simplified',
    honestyNote: 'N(t) = K/(1+((K−N₀)/N₀)e^(−rt)) — ścisłe rozwiązanie równania logistycznego. MODEL uproszczony: stałe r,K, bez struktury wiekowej, opóźnień, drapieżnictwa i losowości.',
    derivation: 'direct', inputs: ['carryingCapacity', 'initialPopulation', 'growthRate', 'timeElapsed'],
    compute: (i) => i.carryingCapacity / (1 + ((i.carryingCapacity - i.initialPopulation) / i.initialPopulation) * Math.exp(-i.growthRate * i.timeElapsed)),
    formula: 'N(t) = K/(1+((K−N₀)/N₀)e^(−rt))',
  });
  g.addNode({
    id: 'fractionOfCapacity', label: 'Wypełnienie pojemności N/K', unit: '%', domain: 'dynamika populacji',
    honesty: 'simplified', honestyNote: '100·N(t)/K — jak blisko populacja jest nasycenia. Powyżej ~99% wzrost praktycznie ustaje.',
    derivation: 'direct', inputs: ['populationAtT', 'carryingCapacity'],
    compute: (i) => (i.populationAtT / i.carryingCapacity) * 100,
    formula: '100·N/K',
  });

  return g;
}
