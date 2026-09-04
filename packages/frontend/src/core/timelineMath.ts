import type { TimelineEpoch } from '../data/timeline';

/**
 * Czysta logika Discovery Timeline Engine — wyszukiwanie epoki i płynne
 * przenikanie (cross-fade) między sąsiednimi epokami na osi log-czasu, bez
 * ekranów ładowania: w każdej klatce renderuje się MIX dwóch najbliższych
 * scen, nie przełącznik dyskretny.
 */

export interface EpochBlend {
  prev: TimelineEpoch;
  next: TimelineEpoch;
  /** 0 = w pełni `prev`, 1 = w pełni `next`. */
  mix: number;
}

/** Epoka o wieku najbliższym `ageSeconds` (odległość w log-czasie). Zakłada niepustą listę. */
export function nearestEpoch(ageSeconds: number, epochs: readonly TimelineEpoch[]): TimelineEpoch {
  const logAge = Math.log10(Math.max(ageSeconds, 1e-45));
  return epochs.reduce((a, b) =>
    Math.abs(Math.log10(Math.max(b.ageSeconds, 1e-45)) - logAge) <
    Math.abs(Math.log10(Math.max(a.ageSeconds, 1e-45)) - logAge)
      ? b
      : a,
  );
}

/**
 * Dwie epoki otaczające `ageSeconds` (posortowane rosnąco po ageSeconds) +
 * pozycja mieszania między nimi. Zakłada epochs posortowane rosnąco i
 * niepuste; poza zakresem zwraca skrajną epokę z mix 0 lub 1.
 */
export function epochBlend(ageSeconds: number, epochs: readonly TimelineEpoch[]): EpochBlend {
  if (epochs.length === 1) return { prev: epochs[0], next: epochs[0], mix: 0 };
  if (ageSeconds <= epochs[0].ageSeconds) return { prev: epochs[0], next: epochs[0], mix: 0 };
  const last = epochs[epochs.length - 1];
  // Ściśle > (nie >=): wiek RÓWNY wiekowi ostatniej epoki musi trafić w
  // pętlę niżej i dać mix=1 dla przedziału [przedostatnia, ostatnia] —
  // inaczej granica "dokładnie na ostatniej epoce" fałszywie cofa mix do 0.
  if (ageSeconds > last.ageSeconds) return { prev: last, next: last, mix: 0 };

  for (let i = 0; i < epochs.length - 1; i++) {
    const a = epochs[i];
    const b = epochs[i + 1];
    if (ageSeconds >= a.ageSeconds && ageSeconds <= b.ageSeconds) {
      const logA = Math.log10(Math.max(a.ageSeconds, 1e-45));
      const logB = Math.log10(b.ageSeconds);
      const logT = Math.log10(ageSeconds);
      const mix = logB === logA ? 0 : (logT - logA) / (logB - logA);
      return { prev: a, next: b, mix: Math.min(1, Math.max(0, mix)) };
    }
  }
  return { prev: last, next: last, mix: 0 };
}
