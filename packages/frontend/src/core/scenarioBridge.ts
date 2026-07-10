import type { SimParams } from './types';

/**
 * Most jednorazowego scenariusza — łączy ekrany nawigacyjne ("Co by było,
 * gdyby?", Multiverse Nexus, Discovery Timeline) z ISTNIEJĄCYM mechanizmem
 * parametrów eksperymentu (ExperimentDef.params/SimParams), bez nowego
 * systemu równoległego. Stan jest w pamięci (nie localStorage) — to
 * nawigacyjna podpowiedź "otwórz ten lab (opcjonalnie: tę zakładkę
 * eksperymentu) z tymi wartościami", zużywana raz i odrzucana, nie trwałe
 * ustawienie.
 */
interface PendingScenario {
  labId: string;
  params: Partial<SimParams>;
  /** Opcjonalnie: id konkretnego eksperymentu w tym labie (nie tylko bazowego). Patrz LabShell.tsx. */
  experimentId?: string;
}

export interface ConsumedScenario {
  params: Partial<SimParams>;
  experimentId?: string;
}

let pending: PendingScenario | null = null;

export function setPendingScenario(labId: string, params: Partial<SimParams>, experimentId?: string): void {
  pending = { labId, params, experimentId };
}

/** Zwraca i KASUJE nadpisania parametrów, jeśli czekają na to konkretne laboratorium. */
export function consumePendingScenario(labId: string): ConsumedScenario | null {
  if (pending && pending.labId === labId) {
    const { params, experimentId } = pending;
    pending = null;
    return { params, experimentId };
  }
  return null;
}
