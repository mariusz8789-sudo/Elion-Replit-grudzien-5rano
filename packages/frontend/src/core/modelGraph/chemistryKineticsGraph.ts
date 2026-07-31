import { ModelGraph } from './graph';

/**
 * Graf kinetyki chemicznej — równanie Arrheniusa (Priorytet 1: adopcja Grafu
 * Modeli przez Chemistry Lab; fundament pod Discovery Engine dla chemii).
 *
 * k = A·exp(−Eₐ/RT). To PRAWDZIWE, powszechnie stosowane prawo fenomenologiczne,
 * ale MODEL PRZYBLIŻONY: zakłada, że czynnik przedwykładniczy A i energia
 * aktywacji Eₐ nie zależą od temperatury (w rzeczywistości słabo zależą), i nie
 * opisuje mechanizmu wieloetapowego. Dlatego derivation węzła k = 'approximate',
 * a poziom uczciwości 'simplified'. Half-life liczy się dla reakcji I rzędu.
 *
 * Przyspieszenie względem temperatury pokojowej (298,15 K) jest NIEZALEŻNE od A
 * (A się skraca), więc to najczystszy, najlepiej określony wynik tego modelu.
 */

export const R_GAS = 8.314; // J/(mol·K)
export const T_ROOM = 298.15; // K

export const BASELINE_TEMPERATURE_K = 350;
export const BASELINE_EA_KJ = 60;
export const BASELINE_LOG10_A = 11; // A ≈ 10¹¹ 1/s (typowy rząd dla reakcji I rzędu)

export function buildChemistryKineticsGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    {
      id: 'temperatureK', label: 'Temperatura T', unit: 'K', domain: 'kinetyka chemiczna',
      honesty: 'exact', honestyNote: 'Temperatura bezwzględna reakcji — zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.temperatureK ?? BASELINE_TEMPERATURE_K, formula: 'T (parametr)',
    },
    BASELINE_TEMPERATURE_K,
  );
  g.addNode(
    {
      id: 'activationEnergyKJ', label: 'Energia aktywacji Eₐ', unit: 'kJ/mol', domain: 'kinetyka chemiczna',
      honesty: 'exact', honestyNote: 'Bariera energetyczna reakcji — z danych/eksperymentu; tu zadana.', derivation: 'direct',
      inputs: [], compute: (i) => i.activationEnergyKJ ?? BASELINE_EA_KJ, formula: 'Eₐ (parametr)',
    },
    BASELINE_EA_KJ,
  );
  g.addNode(
    {
      id: 'preExponentialLog10', label: 'Czynnik przedwykładniczy log₁₀A', unit: 'log₁₀(1/s)', domain: 'kinetyka chemiczna',
      honesty: 'simplified', honestyNote: 'log₁₀ czynnika częstości A. Zależy od mechanizmu; tu zadany jako rząd wielkości.', derivation: 'direct',
      inputs: [], compute: (i) => i.preExponentialLog10 ?? BASELINE_LOG10_A, formula: 'log₁₀A (parametr)',
    },
    BASELINE_LOG10_A,
  );

  g.addNode({
    id: 'rateConstant', label: 'Stała szybkości k', unit: '1/s', domain: 'kinetyka chemiczna',
    honesty: 'simplified',
    honestyNote: 'Arrhenius: k = A·exp(−Eₐ/RT). MODEL PRZYBLIŻONY — zakłada A i Eₐ niezależne od T oraz reakcję elementarną. Dobre dla trendu, nie dla mechanizmu.',
    derivation: 'approximate', inputs: ['preExponentialLog10', 'activationEnergyKJ', 'temperatureK'],
    compute: (i) => Math.pow(10, i.preExponentialLog10) * Math.exp(-(i.activationEnergyKJ * 1000) / (R_GAS * i.temperatureK)),
    formula: 'k = A·exp(−Eₐ/RT)',
  });

  g.addNode({
    id: 'halfLifeFirstOrder', label: 'Czas połowicznej przemiany (I rzędu) t½', unit: 's', domain: 'kinetyka chemiczna',
    honesty: 'simplified',
    honestyNote: 't½ = ln2/k — DOKŁADNE dla reakcji I rzędu. Dla innych rzędów t½ zależy od stężenia i ten wzór NIE obowiązuje.',
    derivation: 'direct', inputs: ['rateConstant'],
    compute: (i) => Math.LN2 / i.rateConstant,
    formula: 't½ = ln2 / k',
  });

  g.addNode({
    id: 'speedupVsRoom', label: 'Przyspieszenie względem 25°C', unit: '×', domain: 'kinetyka chemiczna',
    honesty: 'exact',
    honestyNote: 'k(T)/k(298,15K) = exp(Eₐ/R·(1/298,15 − 1/T)). NIEZALEŻNE od A (skraca się) — najczystszy wynik modelu Arrheniusa.',
    derivation: 'direct', inputs: ['activationEnergyKJ', 'temperatureK'],
    compute: (i) => Math.exp((i.activationEnergyKJ * 1000 / R_GAS) * (1 / T_ROOM - 1 / i.temperatureK)),
    formula: 'exp(Eₐ/R·(1/T_pok − 1/T))',
  });

  return g;
}
