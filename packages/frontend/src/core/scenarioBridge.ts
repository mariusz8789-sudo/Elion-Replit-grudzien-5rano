import type { SimParams } from './types';

/**
 * Most jednorazowego scenariusza — łączy ekran "Co by było, gdyby?"
 * (data/whatIfScenarios.ts, components/WhatIfScreen.tsx) z ISTNIEJĄCYM
 * mechanizmem parametrów eksperymentu (ExperimentDef.params/SimParams), bez
 * nowego systemu równoległego. Stan jest w pamięci (nie localStorage) —
 * to nawigacyjna podpowiedź "otwórz ten lab z tymi wartościami", zużywana
 * raz i odrzucana, nie trwałe ustawienie.
 */
interface PendingScenario {
  labId: string;
  params: Partial<SimParams>;
}

let pending: PendingScenario | null = null;

export function setPendingScenario(labId: string, params: Partial<SimParams>): void {
  pending = { labId, params };
}

/** Zwraca i KASUJE nadpisania parametrów, jeśli czekają na to konkretne laboratorium. */
export function consumePendingScenario(labId: string): Partial<SimParams> | null {
  if (pending && pending.labId === labId) {
    const { params } = pending;
    pending = null;
    return params;
  }
  return null;
}
