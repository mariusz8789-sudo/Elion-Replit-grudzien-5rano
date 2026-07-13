import { ModelGraph } from './graph';

/**
 * Atom Lab × Graf Modeli — model Bohra atomu wodoropodobnego (Priorytet 1).
 *
 * E_n = −13,606 eV · Z²/n²; promień orbity r_n = 52,9 pm · n²/Z; energia
 * fotonu przy przejściu na poziom podstawowy ΔE = E_n − E_1. MODEL PRZYBLIŻONY:
 * Bohr działa DOKŁADNIE tylko dla układów jednoelektronowych (H, He⁺, Li²⁺…),
 * nie tłumaczy struktury subtelnej ani atomów wieloelektronowych — stąd
 * honesty 'simplified' i derivation 'approximate'.
 */

export const RYDBERG_EV = 13.605693;
export const BOHR_RADIUS_PM = 52.917721;

export const BASELINE_Z = 1;
export const BASELINE_N = 2;

export function buildBohrModelGraph(): ModelGraph {
  const g = new ModelGraph();

  g.addNode(
    { id: 'atomicNumber', label: 'Liczba atomowa Z', unit: '', domain: 'model atomu (Bohr)',
      honesty: 'exact', honestyNote: 'Ładunek jądra (H=1, He⁺=2…). Model Bohra jest ścisły tylko dla JEDNEGO elektronu.', derivation: 'direct',
      inputs: [], compute: (i) => i.atomicNumber ?? BASELINE_Z, formula: 'Z (parametr)' },
    BASELINE_Z,
  );
  g.addNode(
    { id: 'principalN', label: 'Główna liczba kwantowa n', unit: '', domain: 'model atomu (Bohr)',
      honesty: 'exact', honestyNote: 'Numer powłoki (n = 1, 2, 3…) — zadany.', derivation: 'direct',
      inputs: [], compute: (i) => Math.max(1, Math.round(i.principalN ?? BASELINE_N)), formula: 'n (parametr)' },
    BASELINE_N,
  );

  g.addNode({
    id: 'energyLevelEV', label: 'Energia poziomu E_n', unit: 'eV', domain: 'model atomu (Bohr)',
    honesty: 'simplified',
    honestyNote: 'E_n = −13,606·Z²/n² eV. PRZYBLIŻONE: dokładne dla układów jednoelektronowych; dla atomów wieloelektronowych ekranowanie i odpychanie łamią tę prostą zależność.',
    derivation: 'approximate', inputs: ['atomicNumber', 'principalN'],
    compute: (i) => -RYDBERG_EV * (i.atomicNumber * i.atomicNumber) / (i.principalN * i.principalN),
    formula: 'E_n = −13,606·Z²/n²',
  });
  g.addNode({
    id: 'orbitalRadiusPm', label: 'Promień orbity r_n', unit: 'pm', domain: 'model atomu (Bohr)',
    honesty: 'simplified',
    honestyNote: 'r_n = 52,9·n²/Z pm (promień Bohra). PRZYBLIŻONE — model kołowych orbit; mechanika kwantowa zastępuje je rozkładem prawdopodobieństwa (orbitalami).',
    derivation: 'approximate', inputs: ['principalN', 'atomicNumber'],
    compute: (i) => BOHR_RADIUS_PM * (i.principalN * i.principalN) / i.atomicNumber,
    formula: 'r_n = 52,9·n²/Z',
  });
  g.addNode({
    id: 'ionizationPhotonEV', label: 'Energia jonizacji z poziomu n', unit: 'eV', domain: 'model atomu (Bohr)',
    honesty: 'simplified',
    honestyNote: 'E_jon = −E_n = 13,606·Z²/n² eV — energia potrzebna, by usunąć elektron z poziomu n do nieskończoności. Dla H, n=1 daje 13,6 eV. ✓',
    derivation: 'approximate', inputs: ['energyLevelEV'],
    compute: (i) => -i.energyLevelEV,
    formula: 'E_jon = −E_n',
  });

  return g;
}
