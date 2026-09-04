/**
 * Reality Branch — wersjonowany snapshot parametrów, żeby dwie (lub więcej)
 * rzeczywistości mogły ISTNIEĆ RÓWNOCZEŚNIE i być porównywane, zamiast
 * nadpisywać jeden płaski stan (tak jak dziś działa SimParams w każdym
 * labie — jeden aktywny zestaw, bez historii/rozgałęzień).
 *
 * To jest struktura danych ("Git fork dla modelu rzeczywistości" z wizji),
 * NIE efekt wizualny — samo rozgałęzienie nie renderuje niczego. Reality
 * Navigator (core/reality/RealityEngine.ts + sceny) czyta z tego store'a,
 * żeby wiedzieć, jakie wartości parametrów odtworzyć przy przejściu do
 * danej gałęzi.
 */

export interface RealityBranch {
  id: string;
  label: string;
  /** null tylko dla gałęzi korzenia (pierwotnej, "znajomej" rzeczywistości). */
  parentId: string | null;
  createdAt: number;
  /** Snapshot wartości węzłów-parametrów (id węzła Grafu Modeli → wartość) definiujący start tej gałęzi. */
  parameters: Record<string, number>;
}

export interface ParameterDiffEntry {
  key: string;
  a: number;
  b: number;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export class RealityBranchStore {
  private branches = new Map<string, RealityBranch>();
  private activeId: string;
  private readonly rootId: string;
  private listeners = new Set<() => void>();

  constructor(rootLabel: string, initialParameters: Record<string, number>) {
    const root: RealityBranch = {
      id: nextId('branch'),
      label: rootLabel,
      parentId: null,
      createdAt: Date.now(),
      parameters: { ...initialParameters },
    };
    this.branches.set(root.id, root);
    this.rootId = root.id;
    this.activeId = root.id;
  }

  getRootId(): string {
    return this.rootId;
  }

  getBranch(id: string): RealityBranch {
    const b = this.branches.get(id);
    if (!b) throw new Error(`Nieznana gałąź rzeczywistości „${id}"`);
    return b;
  }

  listBranches(): RealityBranch[] {
    return [...this.branches.values()];
  }

  getActive(): RealityBranch {
    return this.getBranch(this.activeId);
  }

  setActive(id: string): void {
    this.getBranch(id); // throws if unknown
    this.activeId = id;
    this.emit();
  }

  /**
   * Tworzy nową gałąź jako kopię `fromId` z nadpisanymi parametrami
   * (`overrides`) — dokładnie moment "DIVERGENCE EVENT" z wizji: stary
   * model zostaje nietknięty pod swoim id, nowy dostaje własny.
   */
  createBranch(fromId: string, label: string, overrides: Record<string, number>): RealityBranch {
    const parent = this.getBranch(fromId);
    const branch: RealityBranch = {
      id: nextId('branch'),
      label,
      parentId: parent.id,
      createdAt: Date.now(),
      parameters: { ...parent.parameters, ...overrides },
    };
    this.branches.set(branch.id, branch);
    this.emit();
    return branch;
  }

  /** Różnice parametrów między dwiema gałęziami — tylko klucze, których wartości faktycznie się różnią. */
  diff(idA: string, idB: string): ParameterDiffEntry[] {
    const a = this.getBranch(idA).parameters;
    const b = this.getBranch(idB).parameters;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: ParameterDiffEntry[] = [];
    for (const key of keys) {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      if (av !== bv) out.push({ key, a: av, b: bv });
    }
    return out;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
