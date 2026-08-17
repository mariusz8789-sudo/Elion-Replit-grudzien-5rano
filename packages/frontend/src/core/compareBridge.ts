import type { ModelConfig } from './epidemic/compare';

/**
 * Most jednorazowego porównania modeli — łączy Science Chat (intencja
 * COMPARE_MODELS) z ekranem porównania (#/compare), bez nowego systemu
 * równoległego. Analogiczny do scenarioBridge: stan w pamięci, zużywany raz.
 */
interface PendingComparison { a: ModelConfig; b: ModelConfig }

let pending: PendingComparison | null = null;

export function setPendingComparison(a: ModelConfig, b: ModelConfig): void {
  pending = { a, b };
}

/** Zwraca i KASUJE oczekujące porównanie (jeśli jest). */
export function consumePendingComparison(): PendingComparison | null {
  const p = pending;
  pending = null;
  return p;
}
