import type { Locale } from '../../core/i18n';
import type { CounterfactualComparisonStatus, SeedControlStatus } from '../../core/experimentFabric/counterfactualCompare';

/**
 * A/B panel of #/pilot in Polish and English — the same pattern as
 * components/home/startText.ts: Polish for `pl`, English for every other
 * language. Status CODES come from `compareCounterfactual`; this file only
 * names them in plain words. An unknown code is shown as the code itself.
 */
const TEXT = {
  title: ['Porównaj dwa ramiona tego protokołu (A/B)', 'Compare two arms of this protocol (A/B)'],
  lead: [
    'Ten sam model, dwa ustawienia z Twojego protokołu. Pokazujemy tylko, co się zmieniło w wyniku — bez nowych założeń.',
    'Same model, two settings from your protocol. We only show what changed in the result, with no new assumptions.',
  ],
  baseline: ['Punkt odniesienia (A)', 'Baseline (A)'],
  variant: ['Wariant (B)', 'Variant (B)'],
  compare: ['Porównaj A/B', 'Compare A/B'],
  sameArm: ['Wybierz dwa różne ramiona.', 'Choose two different arms.'],
  notRun: ['Porównanie nie zostało wykonane.', 'The comparison was not run.'],
  changedSetting: ['Zmienione ustawienie', 'Changed setting'],
  repeatability: ['Powtarzalność', 'Repeatability'],
  fingerprints: ['Odciski przebiegów', 'Run fingerprints'],
  fingerprintsMatch: ['zgodne z przebiegami protokołu', 'match the protocol runs'],
  fingerprintsDiffer: ['INNE niż w przebiegach protokołu — sprawdź powtarzalność', 'DIFFERENT from the protocol runs — check repeatability'],
  baselineZero: ['A = 0, procent niedostępny', 'A = 0, percent not available'],
  // Polish always shows the contract's own disclaimer verbatim (pilotAbDisclaimer); these are its English renderings.
  disclaimer: [
    'Porównanie przedstawia wyłącznie różnicę między dwoma realnymi runami tego samego modelu w zadanych parametrach.',
    'This comparison shows only the difference between two real runs of the same model at the given settings. It is not a real-world prediction, a recommendation, proof of causation or a scientific discovery.',
  ],
  disclaimerNotRun: [
    'Porównanie kontrfaktyczne nie zostało uruchomione.',
    'Genesis does not produce a result when the settings are invalid or the two sides point at different models.',
  ],
} as const satisfies Record<string, readonly [string, string]>;

export type PilotAbTextKey = keyof typeof TEXT;

export function pilotAbText(key: PilotAbTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

const STATUS: Readonly<Record<CounterfactualComparisonStatus, readonly [string, string]>> = {
  COMPLETED: ['Porównanie wykonane', 'Comparison done'],
  BLOCKED_INVALID_REQUEST: ['Zablokowane: nieprawidłowe ustawienia', 'Blocked: invalid settings'],
  BLOCKED_MODEL_MISMATCH: ['Zablokowane: różne modele', 'Blocked: different models'],
  INCOMPLETE_RUN: ['Niepełne: jeden z przebiegów nie zakończył się', 'Incomplete: one of the runs did not finish'],
  NO_SHARED_NUMERIC_METRICS: ['Brak wspólnych wyników liczbowych', 'No shared numeric results'],
};

const SEED: Readonly<Record<SeedControlStatus, readonly [string, string]>> = {
  MATCHED: ['to samo ziarno losowe po obu stronach', 'same random seed on both sides'],
  MISMATCHED: ['RÓŻNE ziarno losowe — różnica może wynikać z losowości', 'DIFFERENT random seed — the difference may be chance'],
  UNSPECIFIED: ['ziarno losowe nieznane', 'random seed unknown'],
  DETERMINISTIC_NO_SEED: ['model deterministyczny (bez losowości)', 'deterministic model (no randomness)'],
};

export function pilotAbStatus(status: string, locale: Locale): string {
  const pair = (STATUS as Record<string, readonly [string, string]>)[status];
  return pair ? pair[locale === 'pl' ? 0 : 1] : status;
}

export function pilotAbSeed(status: string, locale: Locale): string {
  const pair = (SEED as Record<string, readonly [string, string]>)[status];
  return pair ? pair[locale === 'pl' ? 0 : 1] : status;
}

/** Polish uses the contract's own disclaimer verbatim; other languages use the English rendering of it. */
export function pilotAbDisclaimer(contractDisclaimer: string, completed: boolean, locale: Locale): string {
  if (locale === 'pl') return contractDisclaimer;
  return pilotAbText(completed ? 'disclaimer' : 'disclaimerNotRun', locale);
}
