import type { ModelGraph } from '../modelGraph/graph';

/**
 * Trzecia oś epistemiczna — PROWENIENCJA INŻYNIERSKA (Faza 0). Uzupełnia
 * istniejące dwie osie z warstwy naukowej (HonestyLevel + NodeDerivation):
 * HonestyLevel mówi „jak wiarygodny jest cały model", derivation „jak węzeł
 * wiąże się z własnymi wejściami", a `Provenance` — SKĄD wzięła się dana
 * liczba (pomiar, dane producenta, obliczenie, model empiryczny, oszacowanie
 * inżynierskie, dana od użytkownika, czy wymaga jeszcze walidacji fizycznej).
 *
 * To jest jedyny mechanizm chroniący przed najgroźniejszym trybem awarii
 * pre-build symulatora: policzony wynik NIE MOŻE wyglądać na pewniejszy niż
 * pozwala jego najsłabsze krytyczne wejście lub model. Propagacja prowieniencji
 * (propagateProvenance) egzekwuje to strukturalnie, po tych samych krawędziach
 * zależności co obliczenia.
 */

export type Provenance =
  | 'measured'
  | 'manufacturer'
  | 'user-provided'
  | 'calculated'
  | 'empirical-model'
  | 'engineering-estimate'
  | 'requires-validation';

/**
 * Ranga pewności — wyższa = mocniej wsparta. Kolejność jest CELOWA i
 * egzekwuje regułę „wynik nie pewniejszy niż najsłabsze wejście/model":
 *  measured(6) > manufacturer(5) > user-provided(4) > calculated(3)
 *  > empirical-model(2) > engineering-estimate(1) > requires-validation(0).
 * 'calculated' stoi nad modelami empirycznymi/oszacowaniami, bo dokładne
 * przekształcenie dokładnych wejść JEST wiarygodne — ale i tak zostaje
 * ograniczone w dół przez własne wejścia (patrz propagateProvenance).
 */
const RANK: Record<Provenance, number> = {
  measured: 6,
  manufacturer: 5,
  'user-provided': 4,
  calculated: 3,
  'empirical-model': 2,
  'engineering-estimate': 1,
  'requires-validation': 0,
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  measured: 'zmierzone',
  manufacturer: 'dane producenta',
  'user-provided': 'podane przez użytkownika',
  calculated: 'obliczone',
  'empirical-model': 'model empiryczny',
  'engineering-estimate': 'oszacowanie inżynierskie',
  'requires-validation': 'wymaga walidacji fizycznej',
};

export function provenanceRank(p: Provenance): number {
  return RANK[p];
}

/** Słabsza (mniej pewna) z dwóch prowieniencji. */
export function weakerProvenance(a: Provenance, b: Provenance): Provenance {
  return RANK[a] <= RANK[b] ? a : b;
}

export interface EffectiveProvenance {
  /** Efektywna prowieniencja węzła po propagacji przez zależności. */
  provenance: Provenance;
  /**
   * Czy ten wynik jest „ograniczony walidacją" — tzn. w jego łańcuchu
   * zależności leży wejście `requires-validation` (albo on sam nim jest).
   * UI nie może prezentować takiego wyniku jako autorytatywnego faktu.
   */
  validationLimited: boolean;
  /** Id wejść-korzeni, które NAJMOCNIEJ obniżyły pewność tego węzła (te o najniższej randze w łańcuchu). */
  limitingInputs: string[];
}

export interface ProvenanceConfig {
  /** Prowieniencja przypisana węzłom-parametrom (korzeniom). Klucz = id węzła. */
  parameterProvenance: Record<string, Provenance>;
  /**
   * „Prowieniencja modelu" węzła pochodnego — jakim TYPEM zależności jest
   * jego wzór (calculated dla dokładnego przekształcenia, empirical-model dla
   * korelacji empirycznej, engineering-estimate dla przybliżenia). Klucz = id.
   * Domyślnie 'calculated', jeśli nie podano.
   */
  modelProvenance: Record<string, Provenance>;
}

/**
 * Propaguje prowieniencję przez graf. Reguła (Faza 0, pkt 3):
 *   - węzeł-parametr: jego przypisana prowieniencja.
 *   - węzeł pochodny: NAJSŁABSZA z {prowieniencja jego modelu, efektywne
 *     prowieniencje wszystkich wejść}. Czyli obliczenie nigdy nie jest
 *     pewniejsze ani niż jego własny typ modelu, ani niż jego najsłabsze
 *     wejście — dokładnie tak, jak wymaga specyfikacja.
 *   - validationLimited propaguje się jak „zaraza": prawdziwe, jeśli węzeł
 *     jest requires-validation LUB dowolne jego wejście jest validationLimited.
 *
 * Zwraca mapę id → EffectiveProvenance dla WSZYSTKICH węzłów. Kolejność
 * przetwarzania jest topologiczna (wejścia przed węzłem), co graf gwarantuje
 * konstrukcyjnie (append-only DAG).
 */
export function propagateProvenance(graph: ModelGraph, config: ProvenanceConfig): Map<string, EffectiveProvenance> {
  const out = new Map<string, EffectiveProvenance>();
  const nodes = topoSorted(graph);

  for (const node of nodes) {
    if (node.inputs.length === 0) {
      const p = config.parameterProvenance[node.id] ?? 'user-provided';
      out.set(node.id, {
        provenance: p,
        validationLimited: p === 'requires-validation',
        limitingInputs: p === 'requires-validation' ? [node.id] : [],
      });
      continue;
    }

    const model = config.modelProvenance[node.id] ?? 'calculated';
    let effective: Provenance = model;
    let validationLimited = model === 'requires-validation';
    let minRank = RANK[effective];
    let limiting: string[] = [];

    for (const inputId of node.inputs) {
      const inputEff = out.get(inputId)!;
      effective = weakerProvenance(effective, inputEff.provenance);
      validationLimited = validationLimited || inputEff.validationLimited;
      const inputMin = RANK[inputEff.provenance];
      if (inputMin < minRank) {
        minRank = inputMin;
        limiting = inputEff.limitingInputs.length > 0 ? [...inputEff.limitingInputs] : [inputId];
      } else if (inputMin === minRank && inputMin < RANK[model]) {
        const add = inputEff.limitingInputs.length > 0 ? inputEff.limitingInputs : [inputId];
        for (const a of add) if (!limiting.includes(a)) limiting.push(a);
      }
    }

    out.set(node.id, { provenance: effective, validationLimited, limitingInputs: limiting });
  }
  return out;
}

/** Węzły w porządku topologicznym (wejścia przed węzłem). Graf jest append-only DAG-iem, więc kolejność dodania już to spełnia; sortujemy jawnie dla bezpieczeństwa. */
function topoSorted(graph: ModelGraph) {
  const all = graph.getAllNodes();
  const byId = new Map(all.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const order: typeof all = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const n = byId.get(id)!;
    for (const inp of n.inputs) visit(inp);
    order.push(n);
  };
  for (const n of all) visit(n.id);
  return order;
}
