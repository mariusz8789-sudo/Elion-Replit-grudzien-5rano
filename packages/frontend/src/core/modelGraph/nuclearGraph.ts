import { ModelGraph } from './graph';
import { semfBindingEnergy, semfBindingPerNucleon, semfStabilityGradient } from '../physics';

/**
 * Drugi konkretny graf w Scientific Model Graph: struktura jądra atomowego
 * wg półempirycznego wzoru na masę (SEMF / Weizsäcker). Węzły REUŻYWAJĄ
 * dokładnie te same, już zweryfikowane funkcje z core/physics.ts, które
 * napędzają Nuclear Lab (mapa nuklidów + dolina stabilności 3D) —
 * Consequence Chain Engine nie wymyśla nowej fizyki jądrowej.
 *
 * Łańcuch (2 parametry → 4 wielkości pochodne):
 *   protonNumber Z  (parametr)  ┐
 *   neutronNumber N (parametr)  ┴→ massNumber A            (A = Z+N, dokładne)
 *                                → bindingEnergy           (SEMF, PRZYBLIŻONE — pomija efekty powłokowe)
 *                                → bindingPerNucleon        (B/A, dokładne z B i A)
 *                                → stabilityGradient        (SEMF, PRZYBLIŻONE — kierunek rozpadu β)
 *
 * To jest pierwszy graf z DWOMA niezależnymi parametrami i węzłem (massNumber,
 * bindingEnergy) zależnym od OBU — realny test propagacji wielu korzeni i
 * causedBy z wieloma przyczynami (patrz graph.ts::propagate).
 *
 * derivation:
 *  - massNumber = 'direct'      (czysta arytmetyka A = Z + N)
 *  - bindingEnergy = 'approximate' (SEMF to model gładki; realne B odbiega
 *    przy liczbach magicznych — efekty powłokowe, których wzór NIE zawiera;
 *    dlatego maksimum B/A leży realnie przy Ni-62, nie dokładnie tam, gdzie
 *    przewiduje SEMF). To jest przykład węzła 'exact' w sensie HonestyLevel
 *    (SEMF to znany, standardowy wzór) ale 'approximate' w sensie derivation
 *    (sam wzór przybliża głębszą fizykę powłokową).
 */
export const BASELINE_Z = 26; // żelazo — blisko szczytu krzywej wiązania
export const BASELINE_N = 30; // Fe-56

export function buildNuclearModelGraph(): ModelGraph {
  const graph = new ModelGraph();

  graph.addNode(
    {
      id: 'protonNumber',
      label: 'Liczba protonów Z',
      unit: '',
      domain: 'fizyka jądrowa',
      honesty: 'exact',
      honestyNote: 'Parametr wejściowy (liczba atomowa) — definiuje pierwiastek. Ustawiany bezpośrednio.',
      derivation: 'direct',
      inputs: [],
      compute: (i) => i.protonNumber ?? BASELINE_Z,
      formula: 'Z (parametr)',
    },
    BASELINE_Z,
  );

  graph.addNode(
    {
      id: 'neutronNumber',
      label: 'Liczba neutronów N',
      unit: '',
      domain: 'fizyka jądrowa',
      honesty: 'exact',
      honestyNote: 'Parametr wejściowy — definiuje izotop przy danym Z. Ustawiany bezpośrednio.',
      derivation: 'direct',
      inputs: [],
      compute: (i) => i.neutronNumber ?? BASELINE_N,
      formula: 'N (parametr)',
    },
    BASELINE_N,
  );

  graph.addNode({
    id: 'massNumber',
    label: 'Liczba masowa A',
    unit: 'nukleonów',
    domain: 'fizyka jądrowa',
    honesty: 'exact',
    honestyNote: 'A = Z + N — dokładna arytmetyka, zależy od OBU parametrów jednocześnie.',
    derivation: 'direct',
    inputs: ['protonNumber', 'neutronNumber'],
    compute: (i) => i.protonNumber + i.neutronNumber,
    formula: 'A = Z + N',
  });

  graph.addNode({
    id: 'bindingEnergy',
    label: 'Energia wiązania jądra',
    unit: 'MeV',
    domain: 'fizyka jądrowa',
    honesty: 'exact',
    honestyNote:
      'Półempiryczny wzór SEMF (Weizsäcker): B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓ − a_A·(A−2Z)²/A ± δ. To ZNANY, standardowy wzór (stąd HonestyLevel „exact"), ale sam jest MODELEM przybliżającym — pomija efekty powłokowe, więc odbiega od zmierzonych mas przy liczbach magicznych (stąd derivation „approximate"). Ta sama funkcja core/physics.ts::semfBindingEnergy co Nuclear Lab.',
    derivation: 'approximate',
    inputs: ['protonNumber', 'neutronNumber'],
    compute: (i) => semfBindingEnergy(i.protonNumber, i.neutronNumber),
    formula: 'B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓ − a_A·(A−2Z)²/A ± δ',
  });

  graph.addNode({
    id: 'bindingPerNucleon',
    label: 'Energia wiązania na nukleon',
    unit: 'MeV/nukleon',
    domain: 'fizyka jądrowa',
    honesty: 'exact',
    honestyNote:
      'B/A — miara „jak mocno związane" jest jądro; szczyt (~8,8 MeV) wyznacza granicę między zyskiem z fuzji (lekkie jądra) a rozszczepienia (ciężkie). Dokładny iloraz z B i A, ale dziedziczy przybliżenie SEMF z węzła bindingEnergy. Ta sama funkcja core/physics.ts::semfBindingPerNucleon co dolina stabilności 3D.',
    derivation: 'approximate',
    inputs: ['protonNumber', 'neutronNumber'],
    compute: (i) => semfBindingPerNucleon(i.protonNumber, i.neutronNumber),
    formula: 'B/A',
  });

  graph.addNode({
    id: 'stabilityGradient',
    label: 'Gradient stabilności (kierunek rozpadu β)',
    unit: 'MeV',
    domain: 'fizyka jądrowa',
    honesty: 'exact',
    honestyNote:
      'Różnica energii wiązania sąsiednich izobarów przy stałym A: dodatnia → faworyzuje β⁻ (n→p), ujemna → β⁺/EC (p→n), zero w dolinie stabilności. Wyprowadzone z SEMF, więc przybliżone (nie przewiduje półokresów, tylko kierunek). Ta sama funkcja core/physics.ts::semfStabilityGradient.',
    derivation: 'approximate',
    inputs: ['protonNumber', 'neutronNumber'],
    compute: (i) => semfStabilityGradient(i.protonNumber, i.neutronNumber),
    formula: 'ΔB między izobarami (Z±1, N∓1)',
  });

  return graph;
}
