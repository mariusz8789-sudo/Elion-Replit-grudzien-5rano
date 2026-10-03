import type { Locale } from '../../core/i18n';

/**
 * START — every sentence of the command centre in Polish and English.
 *
 * Mariusz chose on 3 Oct 2026 that Start follows the language switch like the
 * rest of the app. Arabic (and Spanish) show English until a native speaker
 * checks a translation; nothing is machine-translated here. Engine names,
 * hashes, dataset names and protocol tokens (REPLAY MATCH, CSRN) stay as they
 * are in every language.
 */
const TEXT = {
  backendChecking: ['sprawdzam serwer…', 'checking backend…'],
  backendOnline: ['serwer działa', 'backend online'],
  backendOffline: ['serwer niedostępny', 'backend offline'],
  titleEm: ['Sprawdzalne', 'Verifiable'],
  titleRest: [' obliczeniowe odkrywanie leków.', ' computational drug discovery.'],
  sub: ['Uruchom eksperyment, zobacz wynik i sprawdź go w Dowodach i Powtórzeniu.', 'Run an experiment, see the result, verify it with Evidence and Replay.'],
  askPlaceholder: ['Co chcesz zbadać?', 'What do you want to investigate?'],
  askButton: ['Zapytaj Genesis', 'Ask Genesis'],
  runningNow: ['TRWA TERAZ', 'RUNNING NOW'],
  latestBenchmark: ['OSTATNI TEST PORÓWNAWCZY', 'LATEST BENCHMARK'],
  runningAria: ['Trwa teraz', 'Running now'],
  started: ['start', 'started'],
  unseenComplexes: ['nowych kompleksów', 'unseen'],
  complexes: ['kompleksów', 'complexes'],
  seeds: ['powtórzeń', 'seeds'],
  preregistered: ['plan zapisany przed testem', 'pre-registered'],
  passOrFail: ['Wynik, pozytywny czy nie, zostanie opublikowany po zakończeniu', 'Pass or fail is published when the run finishes'],
  status: ['Stan', 'Status'],
  recorded: ['zapisano', 'recorded'],
  latestVerified: ['Ostatnio sprawdzone:', 'Latest verified:'],
  imatinibRerun: ['ponowne wyliczenie drogi syntezy imatynibu', 'Imatinib route re-run'],
  liveView: ['PODGLĄD', 'LIVE VIEW'],
  liveViewAria: ['Podgląd', 'Live view'],
  anatomy: ['Anatomia', 'Anatomy'],
  evidence: ['Dowody', 'Evidence'],
  humanBiology: ['Biologia człowieka', 'Human Biology'],
  physicsCern: ['Fizyka · CERN', 'Physics · CERN'],
  evidenceReplay: ['Dowody i Powtórzenie', 'Evidence & Replay'],
  educationalModel: ['MODEL EDUKACYJNY', 'EDUCATIONAL MODEL'],
  realData: ['PRAWDZIWE DANE', 'REAL DATA'],
  capAnatomy: ['Atlas BodyParts3D (CC BY 4.0) · obraz z Human Explorer', 'BodyParts3D atlas (CC BY 4.0) · Human Explorer snapshot'],
  capCms: ['Prawdziwe zdarzenia CMS Z→μμ z 2011 · analiza zapisanych danych, nie działający detektor', 'Real CMS 2011 Z→μμ events · offline analysis, not a live detector'],
  capEvidence: ['Retrosynteza imatynibu', 'Imatinib retrosynthesis'],
  openExplorer: ['Otwórz Human Explorer', 'Open Human Explorer'],
  openCms: ['Otwórz dane CMS', 'Open CMS data'],
  openEvidence: ['Otwórz Dowody i Powtórzenie', 'Open Evidence & Replay'],
  bodyAlt: ['Ciało człowieka z Human Explorer', 'Human body rendered by Human Explorer'],
  cmsLoading: ['Czytam dane CMS z serwera…', 'Reading CMS data from the server…'],
  cmsUnavailable: ['Dane CMS są teraz niedostępne na tym serwerze.', 'CMS data is not reachable on this server right now.'],
  peak: ['szczyt', 'peak'],
  histAria: ['Masa niezmiennicza par mionów CMS', 'Invariant mass of CMS muon pairs'],
  overview: ['Przegląd', 'Overview'],
  drugDiscovery: ['Odkrywanie leków', 'Drug Discovery'],
  mainFocus: ['GŁÓWNY CEL', 'MAIN FOCUS'],
  dockingSub: ['Test dokowania · zestaw Astex Diverse Set,', 'Docking benchmark · Astex Diverse Set,'],
  knownComplexes: ['znanych kompleksów lek–białko', 'known drug–protein complexes'],
  vinaBaseline: ['Vina, punkt odniesienia · plan zapisany przed testem', 'Vina baseline · pre-registered'],
  gninaRescoring: ['Ponowna ocena GNINA · etap rozwojowy', 'GNINA rescoring · development'],
  overlapOf: ['z tych', 'of these'],
  overlapRest: ['kompleksów jest w danych treningowych GNINA. To etap rozwojowy, nie niezależne potwierdzenie.', "complexes are in GNINA's training data. This is development, not independent validation."],
  running: ['trwa', 'running'],
  openDrug: ['Otwórz Odkrywanie leków', 'Open Drug Discovery'],
  verifiedExample: ['Sprawdzony przykład: imatynib', 'Verified example: imatinib'],
  openMolecule: ['Otwórz Molecule World', 'Open Molecule World'],
  atlasSub: ['Interaktywny atlas anatomii', 'Interactive anatomy atlas'],
  atlasAlt: ['Obraz atlasu z Human Explorer', 'Human Explorer atlas render'],
  body: ['Ciało', 'Body'],
  organ: ['Narząd', 'Organ'],
  tissue: ['Tkanka', 'Tissue'],
  cell: ['Komórka', 'Cell'],
  noPatientData: ['Model edukacyjny · bez danych pacjentów', 'Educational model · no patient data'],
  exploreBody: ['Zwiedzaj ciało', 'Explore the body'],
  evidenceLong: ['Ponowne wyliczenie retrosyntezy imatynibu odtworzyło zapisaną drogę.', 'Re-running the imatinib retrosynthesis reproduced the recorded route.'],
  evidenceShort: ['Ponowne wyliczenie drogi imatynibu zgadza się z zapisem.', 'Imatinib route re-run matched the record.'],
  csrnPending: ['KLUCZ CSRN JESZCZE NIE WYGENEROWANY', 'CSRN KEY PENDING'],
  noLabTest: ['jeszcze bez testu w laboratorium', 'no lab test yet'],
  breakItLong: ['Spróbuj to podważyć w Pokoju Recenzenta', 'Try to break it in the Reviewer Room'],
  breakItShort: ['Pokój Recenzenta', 'Reviewer Room'],
  cernTitle: ['Fizyka · CERN / CMS', 'Physics · CERN / CMS'],
  realEvents: ['prawdziwych zdarzeń Z→μμ', 'real Z→μμ events'],
  realEventsNone: ['Prawdziwe zdarzenia Z→μμ', 'Real Z→μμ events'],
  cmsSub: [', otwarte dane CMS z 2011. Analiza zapisanych danych.', ', CMS 2011 open data. Offline analysis.'],
  recentResearch: ['Ostatnie badania', 'Recent research'],
  recentMeta: ['Pamięć naukowa · ta przeglądarka', 'Scientific Memory · this browser'],
  recentEmpty: ['W tej przeglądarce nie ma jeszcze zapisanych badań. Zadaj pytanie powyżej albo otwórz Odkrywanie leków.', 'No runs saved in this browser yet. Ask a question above or open Drug Discovery to start one.'],
  allSaved: ['Wszystkie zapisane badania:', 'All saved runs:'],
  compute: ['Obliczenia', 'Compute'],
  enginesOf: ['z', 'of'],
  enginesAvailable: ['silników działa na tym serwerze', 'engines available on this server'],
  checkingServer: ['Sprawdzam ten serwer…', 'Checking this server…'],
  serverUnreachable: ['Serwer nie odpowiada, stan silników nieznany.', 'Server unreachable, engine status unknown.'],
  showEngines: ['Pokaż silniki', 'Show engines'],
  moreTitle: ['Więcej · Scientific OS', 'More · Scientific OS'],
  moreSub: ['Wszystko inne, co potrafi Genesis, w grupach', 'Everything else Genesis can do, grouped'],
  openAll: ['Otwórz wszystko', 'Open all'],
  capabilities: ['możliwości', 'capabilities'],
  available: ['dostępne', 'available'],
  unknownTime: ['nieznany czas', 'unknown time'],
  justNow: ['przed chwilą', 'just now'],
  minAgo: ['min temu', 'min ago'],
  hAgo: ['godz. temu', 'h ago'],
  yesterday: ['wczoraj', 'yesterday'],
  daysAgo: ['dni temu', 'days ago'],
} as const satisfies Record<string, readonly [string, string]>;

export type StartTextKey = keyof typeof TEXT;

/** Polish for `pl`; English for every other language until a native speaker checks a translation. */
export function startText(key: StartTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

/** The committed Run 8 title and status and the strip's group names, in Polish; other text falls back to its source. */
const PL_NAMES: Readonly<Record<string, string>> = {
  FINISHED: 'zakończony',
  RUNNING: 'trwa',
  'Unseen docking benchmark': 'Test dokowania na nowych kompleksach',
  'Life Sciences': 'Nauki o życiu',
  'Government & Public Sector': 'Administracja i sektor publiczny',
  'Physics, Quantum & CERN': 'Fizyka, kwanty i CERN',
  'World & Digital Twin': 'Świat i cyfrowy bliźniak',
  Education: 'Edukacja',
};

export function startName(source: string, locale: Locale): string {
  return locale === 'pl' ? PL_NAMES[source] ?? source : source;
}

const DAYS = [['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']] as const;

export function startDay(day: number, locale: Locale): string {
  return DAYS[locale === 'pl' ? 0 : 1][day]!;
}
