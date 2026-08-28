/**
 * Nagrywanie przebiegu eksperymentu użytkownika — czysty bufor próbek w
 * pamięci (żadnej trwałości; sam eksperyment/parametry zapisuje się osobno
 * przez customExperiment.ts). Bufor kołowy: 300 próbek przy kadencji ~1/s
 * (ta sama co odświeżanie Narratora w LabShell) to 5 minut nagrania —
 * wystarczające na obserwację trendu, bez nieograniczonego wzrostu pamięci
 * przy pozostawieniu karty otwartej na dłużej.
 */

export interface RunSample {
  t: number; // sekundy od startu nagrywania
  stats: Record<string, number>;
}

export const MAX_SAMPLES = 300;

export function appendSample(samples: RunSample[], t: number, stats: Record<string, number>): RunSample[] {
  if (!Number.isFinite(t) || (samples.length > 0 && t < samples[samples.length - 1].t) || Object.keys(stats).length === 0 || Object.values(stats).some((value) => !Number.isFinite(value))) return samples;
  const next = [...samples, { t, stats: { ...stats } }];
  return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
}
