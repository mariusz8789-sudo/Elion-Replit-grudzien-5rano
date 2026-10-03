import type { Locale } from '../../core/i18n';

/**
 * Evidence section of the WHAT IF? multiverse panel, in Polish and English — the
 * same pattern as components/home/startText.ts (Polish for `pl`, English for
 * every other language). Status CODES come from the evidence bridge; this file
 * only names them in plain words. An unknown code is shown as the code itself.
 */
const TEXT = {
  questionLabel: ['Pytanie zadane PRZED uruchomieniem (opcjonalnie)', 'Question asked BEFORE running (optional)'],
  questionNone: ['bez pytania — tylko podgląd światów', 'no question — just preview the worlds'],
  questionHint: [
    'Dowód powstaje tylko dla pytania wybranego przed uruchomieniem. Kryterium dobrane po obejrzeniu wyników nie byłoby uczciwe.',
    'Evidence is built only for a question chosen before running. A criterion picked after seeing the results would not be fair.',
  ],
  demo: ['DEMO · syntetyczne miasto, nie prawdziwa epidemia', 'DEMO · synthetic city, not a real epidemic'],
  title: ['Dowód dla wybranego świata', 'Evidence for the selected world'],
  decision: ['Decyzja zapadła w dniu', 'Decision taken on day'],
  diverged: ['Światy faktycznie się rozeszły w dniu', 'Worlds actually diverged on day'],
  noDivergence: ['Ten świat nie rozszedł się z punktem odniesienia', 'This world did not diverge from the reference'],
  build: ['Zbuduj pakiet dowodowy', 'Build evidence pack'],
  download: ['Pobierz pakiet (RO-Crate)', 'Download pack (RO-Crate)'],
  roundTrip: ['Kontrola zapisu i odczytu pakietu', 'Pack save-and-reload check'],
  next: ['Następny eksperyment', 'Next experiment'],
  nextNone: ['brak gotowego kroku — powód w szczegółach', 'no ready step — reason in the details'],
  details: ['Szczegóły techniczne', 'Technical details'],
  selectWorld: ['Wybierz świat B, C lub D.', 'Choose world B, C or D.'],
} as const satisfies Record<string, readonly [string, string]>;

export type MultiverseEvidenceTextKey = keyof typeof TEXT;

export function mvText(key: MultiverseEvidenceTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

const CODES: Readonly<Record<string, readonly [string, string]>> = {
  CREATED: ['Pakiet dowodowy utworzony', 'Evidence pack created'],
  BLOCKED_REPLAY: ['Zablokowane: przebiegu nie udało się powtórzyć', 'Blocked: the run could not be repeated'],
  BLOCKED_NOT_COMPARABLE: ['Zablokowane: tych światów nie da się uczciwie porównać pod tym pytaniem', 'Blocked: these worlds cannot be fairly compared under this question'],
  NOT_REPRODUCIBLE: ['Zablokowane: ponowny przebieg dał inny wynik', 'Blocked: re-running gave a different result'],
  NOT_AVAILABLE: ['Niedostępne: brak pytania zadanego przed uruchomieniem', 'Not available: no question asked before running'],
  MATCH: ['zgodny', 'identical'],
  BLOCKED: ['niezgodny', 'not identical'],
  READY_TO_RUN: ['gotowy do uruchomienia', 'ready to run'],
};

export function mvCode(code: string, locale: Locale): string {
  const pair = CODES[code];
  return pair ? pair[locale === 'pl' ? 0 : 1] : code;
}
