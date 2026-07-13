import type { ModelGraph, ModelNodeDef } from './graph';

/**
 * Warstwa adopcji Grafu Modeli przez laboratoria (Priorytet 1 roadmapy).
 *
 * Do tej pory wykonywalny Graf Modeli (core/modelGraph) był używany WYŁĄCZNIE
 * przez Reality Navigator i Machine Pre-Build — żadne z 13 laboratoriów go nie
 * konsumowało. Ta warstwa daje laboratoriom lekki, WSPÓLNY kontrakt „eksperyment
 * = graf konsekwencji": lab podaje zbudowany graf, listę parametrów (korzeni) do
 * suwaków i listę węzłów-wyjść do pokazania. LabShell renderuje to jednym,
 * współdzielonym panelem (components/ConsequenceChainPanel), bez duplikowania
 * architektury i bez dotykania istniejących scen 2D/3D.
 *
 * NIC tu nie wymyśla fizyki: graf, wzory, jednostki, poziom uczciwości i
 * `derivation` pochodzą z gotowych, przetestowanych builderów grafów
 * (orbitalGraph / nuclearGraph / relativisticAstroGraph). Ta warstwa to tylko
 * adapter prezentacji.
 */

export interface ConsequenceParamSpec {
  /** Id węzła-parametru (korzenia) w grafie. */
  id: string;
  min: number;
  max: number;
  step: number;
  /** Opcjonalne formatowanie wartości do etykiety suwaka. */
  format?: (v: number) => string;
}

export interface ConsequenceOutputSpec {
  /** Id węzła pochodnego do pokazania jako wynik. */
  id: string;
  format?: (v: number) => string;
}

export interface LabConsequenceSpec {
  /** Zbudowany, wykonywalny graf (świeża instancja na każdy mount eksperymentu). */
  graph: ModelGraph;
  /** Parametry (korzenie) sterowane suwakami, w kolejności wyświetlania. */
  params: ConsequenceParamSpec[];
  /** Węzły-wyjścia pokazywane jako policzone konsekwencje, w kolejności. */
  outputs: ConsequenceOutputSpec[];
  /** Krótki nagłówek: co ten graf łączy (pokazywany nad łańcuchem). */
  headline: string;
}

/**
 * Węzeł jest KRAWĘDZIĄ MIĘDZYDZIEDZINOWĄ, gdy któreś z jego wejść pochodzi z
 * innej dziedziny (`domain`) niż on sam — czyli obliczenie realnie przenosi
 * wynik z jednej gałęzi nauki do drugiej. To wykrywanie jest STRUKTURALNE
 * (z pól `domain` węzłów), nie zadeklarowane ręcznie, więc nie da się „udawać"
 * połączenia, którego w grafie nie ma.
 */
export function isCrossDomainNode(graph: ModelGraph, node: ModelNodeDef): boolean {
  if (node.inputs.length === 0) return false;
  for (const inId of node.inputs) {
    const input = graph.getNode(inId);
    if (input && input.domain !== node.domain) return true;
  }
  return false;
}

/** Lista dziedzin, z których dany węzeł czerpie wejścia (do etykiety „X × Y"). */
export function inputDomains(graph: ModelGraph, node: ModelNodeDef): string[] {
  const domains = new Set<string>();
  for (const inId of node.inputs) {
    const input = graph.getNode(inId);
    if (input) domains.add(input.domain);
  }
  return [...domains];
}
