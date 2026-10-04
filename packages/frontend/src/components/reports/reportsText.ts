import type { Locale } from '../../core/i18n';

/**
 * REPORTS — every sentence of #/reports in Polish and English (other languages read English, as in
 * verifyText.ts). The screen lists only deliverables a server route already produces for a research run:
 * the Evidence Pack, the result record and its Genesis Verify HTML report, the laboratory package and the
 * customer delivery export. It names no other report type, says nothing is signed (no CSRN key exists yet)
 * and keeps engine names inside the collapsed technical details.
 */
type Pair = readonly [pl: string, en: string];

const TEXT = {
  kicker: ['Raporty', 'Reports'],
  title: ['Wszystko, co możesz pobrać z projektu', 'Everything you can download from a project'],
  lead: [
    'Dla każdego przebiegu badań: pakiet dowodów, zapisy wyników i raporty Genesis Verify, paczki dla laboratorium i eksport dla klienta. Pokazujemy tylko to, co Genesis naprawdę wydaje; czego nie ma, mówimy wprost.',
    'For each research run: the evidence pack, result records and Genesis Verify reports, laboratory packages and the customer export. We show only what Genesis really issues; what is missing, we say plainly.',
  ],
  unsignedTitle: ['Bez podpisu (UNSIGNED)', 'Without a signature (UNSIGNED)'],
  unsignedBody: [
    'Klucz produkcyjny CSRN nie został jeszcze wygenerowany. Żaden z tych plików nie ma podpisu i nie jest certyfikatem; ich spójność sprawdzają odciski (sha256) i powtórzenie obliczenia.',
    'The CSRN production key has not been generated yet. No file here carries a signature or is a certificate; their integrity rests on fingerprints (sha256) and replay.',
  ],
  signedOut: ['Zaloguj się, żeby zobaczyć raporty swoich projektów.', 'Sign in to see the reports of your projects.'],
  signIn: ['Zaloguj się', 'Sign in'],
  noProject: ['Nie masz jeszcze projektu, więc nie ma jeszcze raportów.', 'You have no project yet, so there are no reports yet.'],
  createProject: ['Załóż projekt', 'Create a project'],
  loadingProjects: ['Sprawdzam Twoje projekty…', 'Checking your projects…'],
  projectsFailed: ['Nie udało się pobrać listy projektów.', 'Could not load the list of projects.'],
  project: ['Projekt', 'Project'],
  loadingRuns: ['Zbieram rezultaty przebiegów…', 'Collecting the runs’ deliverables…'],
  noRuns: ['W tym projekcie nie ma jeszcze przebiegów badań, więc nie ma czego pobrać.', 'This project has no research runs yet, so there is nothing to download.'],
  openRuns: ['Otwórz Przebiegi badań', 'Open Research runs'],
  runFailed: ['Nie udało się odczytać tego przebiegu.', 'Could not read this run.'],
  technical: ['Szczegóły techniczne', 'Technical details'],
  nothingYet: ['Ten przebieg nie ma jeszcze wykonanego eksperymentu, więc nie ma jeszcze rezultatów do pobrania.', 'This run has no executed experiment yet, so there is nothing to download yet.'],

  packTitle: ['Pakiet dowodów przebiegu', 'Evidence pack of the run'],
  packLine: ['Wszystkie zapisy przebiegu w jednym pliku JSON; każdy odcisk da się przeliczyć.', 'All of the run’s records in one JSON file; every fingerprint can be recomputed.'],
  recordTitle: ['Zapis wyniku eksperymentu', 'Result record of an experiment'],
  recordLine: ['Dokładnie te bajty, które Genesis zapisał po eksperymencie, z ich sha256. Ten plik sprawdza Genesis Verify.', 'Exactly the bytes Genesis stored after the experiment, with their sha256. This is the file Genesis Verify checks.'],
  verifyTitle: ['Raport Genesis Verify (HTML)', 'Genesis Verify report (HTML)'],
  verifyLine: ['Genesis nie przechowuje tych raportów: tworzy go na żądanie z zapisu wyniku i przy tym powtarza obliczenie, więc może to chwilę potrwać.', 'Genesis does not store these reports: it builds one on request from the result record and re-runs the computation, so it can take a moment.'],
  labTitle: ['Paczka dla laboratorium', 'Laboratory package'],
  labLine: ['Prośba o jeden pomiar z zamrożoną wartością, jednostką i tolerancją, razem z pakietem dowodów.', 'A request for one measurement with the frozen value, unit and tolerance, together with the evidence pack.'],
  customerTitle: ['Eksport dla klienta', 'Customer export'],
  customerLine: ['Genesis sprawdza przebieg w bramce wydania. Plik powstaje tylko wtedy, gdy bramka pozwala; sam eksport niczego nie wysyła, nie podpisuje i nie rozlicza.', 'Genesis runs the run through the release gate. A file exists only when the gate allows it; the export itself sends, signs and bills nothing.'],

  get: ['Przygotuj plik', 'Prepare the file'],
  getting: ['Przygotowuję…', 'Preparing…'],
  save: ['Zapisz plik', 'Save the file'],
  build: ['Utwórz raport', 'Build the report'],
  building: ['Tworzę raport (powtarzam obliczenie)…', 'Building the report (re-running the computation)…'],
  saveHtml: ['Zapisz raport (HTML)', 'Save the report (HTML)'],
  openHtml: ['Otwórz raport w nowej karcie', 'Open the report in a new tab'],
  openVerify: ['Otwórz w Genesis Verify', 'Open in Genesis Verify'],
  check: ['Sprawdź w bramce wydania', 'Check against the release gate'],
  checking: ['Sprawdzam…', 'Checking…'],
  openLab: ['Otwórz Przekazanie do laboratorium', 'Open Lab handoff'],
  verdictWas: ['Werdykt raportu', 'Report verdict'],
  fingerprint: ['Odcisk sha256', 'sha256 fingerprint'],
  bytes: ['bajtów', 'bytes'],
  exportBlocked: ['Eksport jest zablokowany, więc pliku dla klienta nie ma.', 'The export is blocked, so there is no customer file.'],
  exportReady: ['Bramka wydania pozwala na eksport. Plik nie został nikomu wysłany ani przyjęty.', 'The release gate allows the export. The file has not been sent to or accepted by anyone.'],
  blockers: ['Czego brakuje', 'What is missing'],

  errForbidden: ['Serwer odmówił: ten plik wymaga w projekcie uprawnień edytora.', 'The server refused: this file needs editor rights in this project.'],
  errNotFound: ['Serwer nie znalazł tego przebiegu.', 'The server did not find this run.'],
  errOffline: ['Brak połączenia z serwerem.', 'No connection to the server.'],
  errSignedOut: ['Sesja wygasła. Zaloguj się ponownie.', 'Your session expired. Sign in again.'],
  errBlocked: ['Genesis nie wyda tego pliku, bo przebieg nie ma kompletnego, wykonanego eksperymentu albo jego zapisy nie przechodzą kontroli.', 'Genesis will not issue this file because the run has no complete executed experiment or its records fail their check.'],
  errBusy: ['Inne ciężkie obliczenie jest teraz wykonywane. Spróbuj za chwilę.', 'Another heavy computation is running now. Try again in a moment.'],
  errOther: ['Serwer odmówił.', 'The server refused.'],
  errCode: ['Kod odpowiedzi', 'Response code'],
} as const satisfies Record<string, Pair>;

export type ReportsTextKey = keyof typeof TEXT;

export function rText(key: ReportsTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

export const pairText = (pair: Pair, locale: Locale): string => pair[locale === 'pl' ? 0 : 1];

/** Customer delivery statuses (customerResearchDelivery.mjs). */
export const DELIVERY_STATUS_TEXT: Readonly<Record<string, Pair>> = {
  READY_FOR_AUTHORISED_EXPORT: ['Gotowy do autoryzowanego eksportu', 'Ready for an authorised export'],
  BLOCKED_SCIENTIFIC_INCOMPLETE: ['Zablokowany: przebieg jest naukowo niekompletny', 'Blocked: the run is scientifically incomplete'],
  BLOCKED_COMMERCIAL_POLICY: ['Zablokowany: brak zgody w bramce wydania (licencje)', 'Blocked: the release gate has no approval (licences)'],
  BLOCKED_PRODUCT_REQUIREMENTS: ['Zablokowany: brakuje wymagań produktu', 'Blocked: product requirements are missing'],
};

/** Scientific blockers of a customer delivery (customerResearchDelivery.scientificBlockers). */
export const DELIVERY_BLOCKER_TEXT: Readonly<Record<string, Pair>> = {
  RESEARCH_STATE_CHAIN_INVALID: ['łańcuch zapisów nie przechodzi kontroli', 'the record chain fails its check'],
  QUESTION_MISSING: ['brak pytania badawczego', 'no research question'],
  LITERATURE_SNAPSHOT_MISSING: ['brak zapisanego przeglądu literatury', 'no saved literature snapshot'],
  RESEARCH_PLAN_MISSING: ['brak planu badań', 'no research plan'],
  COMPLETE_EXPERIMENT_MISSING: ['brak zakończonego eksperymentu', 'no completed experiment'],
  OPEN_OR_INCOMPLETE_EXPERIMENT: ['jest otwarty albo niekompletny eksperyment', 'an experiment is open or incomplete'],
  REAL_EXECUTION_MISSING: ['brak prawdziwego wykonania obliczenia', 'no real execution of the computation'],
  POSITIVE_REPLAY_MISSING: ['brak zgodnego powtórzenia', 'no matching replay'],
  REPLAY_MISMATCH_OR_MISSING: ['powtórzenie rozbieżne albo go brak', 'a replay drifted or is missing'],
  EVIDENCE_CHAIN_INCOMPLETE: ['niepełny łańcuch dowodów', 'the evidence chain is incomplete'],
};
