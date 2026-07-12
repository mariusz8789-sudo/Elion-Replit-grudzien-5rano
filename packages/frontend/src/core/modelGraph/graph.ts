import type { HonestyLevel } from '../types';

/**
 * Scientific Model Graph — PRAWDZIWY, wykonywalny graf zależności między
 * wielkościami fizycznymi, nie diagram ani dokumentacja (patrz
 * VISION-BACKLOG.md „Formalny schemat węzła" — to jest jego pierwsza
 * rzeczywista implementacja kodu, nie tylko opis).
 *
 * Każdy węzeł to funkcja czystych wielkości liczbowych z jawną etykietą
 * uczciwości (ten sam core/types.ts::HonestyLevel co reszta platformy —
 * jedna taksonomia, nie równoległy system). Krawędzie to DEKLAROWANE
 * zależności wejść węzła; propagacja zmiany parametru jest topologicznym
 * BFS/DFS po prawdziwym grafie, nie wyreżyserowaną animacją.
 *
 * To jest fundament pod „Causal Shockwave": zmiana węzła zwraca
 * `PropagationStep[]` w PRAWDZIWEJ kolejności obliczeń — Reality Navigator
 * (core/reality) używa tej listy, żeby kamera odwiedzała węzły w kolejności,
 * w jakiej FAKTYCZNIE zostały przeliczone, a nie w kolejności wybranej dla
 * efektu. Dopóki graf nie ma węzłów, nie ma fali — świadomie, zgodnie z
 * zasadą „nie udawaj fali przyczynowej, zanim graf istnieje".
 */

export interface ModelNodeDef {
  id: string;
  label: string;
  /** Jednostka wielkości (np. 'lata', 'AU/rok', '×') — wyłącznie do wyświetlenia, nie do obliczeń (brak jednostkowej algebry). */
  unit: string;
  /** Krótki opis domeny (np. 'mechanika orbitalna') — do grupowania w UI. */
  domain: string;
  honesty: HonestyLevel;
  honestyNote: string;
  /** Id węzłów, od których zależy compute() — [] dla węzła-parametru (korzenia). */
  inputs: string[];
  /** Czysta funkcja: wartości węzłów wejściowych (po id) → wartość tego węzła. Węzeł-parametr (inputs=[]) ignoruje argument i zwraca bieżącą wartość ustawioną przez setParameter(). */
  compute: (inputValues: Record<string, number>) => number;
  /** Czytelny dla człowieka zapis wzoru — do panelu narracji/cytowania, nie do obliczeń. */
  formula: string;
}

export interface PropagationStep {
  nodeId: string;
  value: number;
  previousValue: number;
}

export class ModelGraph {
  private nodes = new Map<string, ModelNodeDef>();
  private values = new Map<string, number>();
  private listeners = new Set<(steps: PropagationStep[]) => void>();

  /**
   * Dodaje węzeł do grafu. `inputs` może odwoływać się WYŁĄCZNIE do węzłów
   * dodanych wcześniej — graf jest więc DAG-iem z konstrukcji (append-only:
   * nowy węzeł nigdy nie istnieje w chwili, gdy sprawdzane są jego własne
   * wejścia, więc cykl — łącznie z samo-odwołaniem — jest strukturalnie
   * niemożliwy do zbudowania tym API, nie tylko wykrywany po fakcie).
   */
  addNode(def: ModelNodeDef, initialValue = 0): void {
    if (this.nodes.has(def.id)) throw new Error(`Węzeł „${def.id}" już istnieje w Scientific Model Graph`);
    for (const inputId of def.inputs) {
      if (!this.nodes.has(inputId)) {
        throw new Error(`Węzeł „${def.id}" zależy od nieistniejącego węzła „${inputId}" — dodaj go najpierw`);
      }
    }
    this.nodes.set(def.id, def);
    this.values.set(def.id, def.inputs.length === 0 ? initialValue : def.compute(this.collectInputs(def)));
  }

  private collectInputs(def: ModelNodeDef): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of def.inputs) out[id] = this.values.get(id)!;
    return out;
  }

  getNode(id: string): ModelNodeDef | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): ModelNodeDef[] {
    return [...this.nodes.values()];
  }

  getValue(id: string): number {
    const v = this.values.get(id);
    if (v === undefined) throw new Error(`Nieznany węzeł „${id}"`);
    return v;
  }

  /** Wszyscy potomkowie (bezpośredni i pośredni) węzła — wyznacza, co w ogóle MOŻE zmienić się w wyniku edycji tego węzła. */
  private descendantsOf(rootId: string): Set<string> {
    const desc = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, def] of this.nodes) {
        if (desc.has(id)) continue;
        if (def.inputs.includes(rootId) || def.inputs.some((i) => desc.has(i))) {
          desc.add(id);
          changed = true;
        }
      }
    }
    return desc;
  }

  /** Zwraca id potomków rootId w PRAWDZIWEJ kolejności topologicznej obliczeń (nie w kolejności dodania do grafu). */
  private topoOrderOf(ids: Set<string>): string[] {
    const inDegree = new Map<string, number>();
    for (const id of ids) {
      const def = this.nodes.get(id)!;
      inDegree.set(id, def.inputs.filter((i) => ids.has(i)).length);
    }
    const queue: string[] = [...ids].filter((id) => inDegree.get(id) === 0);
    const order: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const otherId of ids) {
        const def = this.nodes.get(otherId)!;
        if (!def.inputs.includes(id)) continue;
        const remaining = (inDegree.get(otherId) ?? 0) - 1;
        inDegree.set(otherId, remaining);
        if (remaining === 0) queue.push(otherId);
      }
    }
    return order;
  }

  /**
   * Ustawia wartość węzła-parametru (musi mieć inputs=[]) i propaguje zmianę
   * do wszystkich potomków w PRAWDZIWEJ kolejności zależności. Zwraca listę
   * kroków — to jest dokładnie to, co Reality Navigator odtwarza jako
   * "widoczną konsekwencję", węzeł po węźle, w kolejności, w jakiej naprawdę
   * zostały przeliczone.
   */
  setParameter(id: string, value: number): PropagationStep[] {
    const def = this.nodes.get(id);
    if (!def) throw new Error(`Nieznany węzeł „${id}"`);
    if (def.inputs.length > 0) throw new Error(`Węzeł „${id}" nie jest parametrem (ma zależności) — nie można go ustawić bezpośrednio`);
    const steps: PropagationStep[] = [];
    const previousValue = this.values.get(id)!;
    this.values.set(id, value);
    if (value !== previousValue) steps.push({ nodeId: id, value, previousValue });

    const descendants = this.descendantsOf(id);
    for (const nodeId of this.topoOrderOf(descendants)) {
      const nodeDef = this.nodes.get(nodeId)!;
      const prev = this.values.get(nodeId)!;
      const next = nodeDef.compute(this.collectInputs(nodeDef));
      this.values.set(nodeId, next);
      if (next !== prev) steps.push({ nodeId, value: next, previousValue: prev });
    }
    if (steps.length > 0) for (const listener of this.listeners) listener(steps);
    return steps;
  }

  /** Powiadamiane po każdym setParameter() z niepustą listą kroków — Reality Navigator używa tego do napędzania kamery/UI, nie do udawania fizyki. */
  subscribe(fn: (steps: PropagationStep[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
