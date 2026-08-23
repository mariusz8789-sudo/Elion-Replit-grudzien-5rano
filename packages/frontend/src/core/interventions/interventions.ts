/**
 * INTERVENTIONS — jak restrykcje ZMIENIAJĄ ZACHOWANIE ŚWIATA (nie tylko liczby).
 *
 * Jedna dźwignia „restrykcje" [0..1] przekłada się na konkretne, widoczne skutki:
 * mniejsza mobilność (krótszy zasięg wyjść), mniej kontaktów (redukcja β przez
 * maski/dystans), zamknięcie szkoły i sklepu (agenci ich unikają) oraz izolacja
 * wykrytych zakaźnych. Dzięki temu użytkownik WIDZI przyczynę zmiany wykresu.
 */

export interface InterventionState {
  /** Poziom restrykcji 0..1 (0 = brak, 1 = twardy lockdown). */
  level: number;
  /** Czy izolować wykrytych objawowych (kwarantanna). */
  isolate: boolean;
  /**
   * Niezależne zamknięcie szkół. Dotąd szkoła zamykała się WYŁĄCZNIE jako skutek
   * uboczny dźwigni restrykcji (>= 0,35), razem ze spadkiem mobilności i
   * zaraźliwości — więc efektu samego zamknięcia szkół nie dało się odseparować.
   * Ta dźwignia to zmienia i nie rusza niczego poza szkołą.
   */
  closeSchools?: boolean;
}

export interface InterventionEffects {
  /** Mnożnik prawdopodobieństwa, że agent w ogóle wyrusza w podróż (mobilność). */
  mobilityScale: number;
  /** Mnożnik zaraźliwości na kontakt (maski/dystans). */
  transmissionScale: number;
  /** Które typy budynków są zamknięte (agenci ich nie wybierają). */
  closedKinds: Set<string>;
  /** Czy kierować wykrytych zakaźnych do izolatki. */
  isolateInfected: boolean;
}

export function interventionEffects(s: InterventionState): InterventionEffects {
  const lvl = clamp01(s.level);
  const closed = new Set<string>();
  // Przy umiarkowanych restrykcjach zamyka się szkoła, przy wyższych też sklep.
  if (lvl >= 0.35 || s.closeSchools === true) closed.add('school');
  if (lvl >= 0.6) closed.add('shop');
  return {
    // Mobilność spada nawet do ~25% przy pełnym lockdownie.
    mobilityScale: 1 - 0.75 * lvl,
    // Zaraźliwość na kontakt spada do ~40% (maski/dystans) przy pełnych restrykcjach.
    transmissionScale: 1 - 0.6 * lvl,
    closedKinds: closed,
    isolateInfected: s.isolate,
  };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
