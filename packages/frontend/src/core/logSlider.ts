/**
 * Suwak logarytmiczny — czysta matematyka współdzielona przez ScaleJourney
 * (skala przestrzenna) i DiscoveryTimeline (oś czasu + soczewka skali).
 * Pozycja suwaka t∈[0,1] mapuje się na wartość w dekadach logarytmicznych
 * [logMin,logMax] — ta sama technika co "45 rzędów wielkości na jednym
 * suwaku" ze Scale Journey, wydzielona, bo teraz ma dwóch niezależnych
 * konsumentów.
 */

/** Pozycja suwaka [0,1] → wartość rzeczywista (np. metry, sekundy). */
export function logSliderValue(t: number, logMin: number, logMax: number): number {
  return 10 ** (logMin + t * (logMax - logMin));
}

/** Wartość rzeczywista → pozycja suwaka [0,1] (odwrotność logSliderValue; NIE przycina do [0,1]). */
export function logSliderPosition(value: number, logMin: number, logMax: number): number {
  return (Math.log10(value) - logMin) / (logMax - logMin);
}
