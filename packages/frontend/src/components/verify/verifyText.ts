import type { Locale } from '../../core/i18n';

/**
 * GENESIS VERIFY — every sentence of #/verify in Polish and English, the same pattern as
 * flightControl/flightControlText.ts: Polish for `pl`, English for every other language until a native
 * speaker checks a translation. Verdicts, check ids, statuses and reasons are CODES the server sends
 * (packages/backend/src/genesisVerify.mjs); this file only says them in plain words. A code it does not
 * know falls back to the server's own sentence, never to a guessed label.
 *
 * Wording rule: Genesis Verify compares fingerprints and replays the computation. No certificate exists
 * (the CSRN production key has not been generated), so no sentence here claims one, and engine product
 * names never appear outside the collapsed technical details.
 */
type Pair = readonly [pl: string, en: string];

const TEXT = {
  kicker: ['Genesis Verify', 'Genesis Verify'],
  title: ['Sprawdź zapis wyniku', 'Check a result record'],
  lead: [
    'Wgraj zapis wyniku z Genesis. Sprawdzimy jego odciski (sha256), porównamy z kopią w rejestrze Genesis i powtórzymy obliczenie. Dostaniesz jeden werdykt i raport do pobrania.',
    'Upload a Genesis result record. We check its fingerprints (sha256), compare it with the copy in the Genesis ledger and re-run the computation. You get one verdict and a report to download.',
  ],
  unsignedTitle: ['Raport bez podpisu (UNSIGNED)', 'Report without a signature (UNSIGNED)'],
  unsignedBody: [
    'Klucz produkcyjny CSRN nie został jeszcze wygenerowany. Ten raport opiera się wyłącznie na odciskach i powtórzeniu obliczenia — nie jest certyfikatem.',
    'The CSRN production key has not been generated yet. This report rests only on fingerprints and replay; it is not a certificate.',
  ],
  signedOut: ['Zaloguj się, żeby sprawdzić zapis. Weryfikacja powtarza prawdziwe obliczenie, więc wymaga konta.', 'Sign in to check a record. Verification re-runs a real computation, so it needs an account.'],
  signIn: ['Zaloguj się', 'Sign in'],
  noProject: ['Nie masz jeszcze projektu. Weryfikacja działa w projekcie, bo tam jest rejestr, z którym porównujemy zapis.', 'You have no project yet. Verification runs in a project, because that is where the ledger it compares against lives.'],
  createProject: ['Załóż projekt', 'Create a project'],
  loadingProjects: ['Sprawdzam Twoje projekty…', 'Checking your projects…'],
  projectsFailed: ['Nie udało się pobrać listy projektów.', 'Could not load the list of projects.'],
  project: ['Projekt', 'Project'],
  technical: ['Szczegóły techniczne', 'Technical details'],

  stepRecord: ['1. Zapis do sprawdzenia', '1. The record to check'],
  stepRecordLead: ['Wgraj plik JSON z Genesis albo wklej jego treść. Możesz też pobrać zapis z wykonanego eksperymentu poniżej.', 'Upload the Genesis JSON file or paste its content. You can also take the record of an executed experiment below.'],
  uploadFile: ['Wybierz plik JSON', 'Choose a JSON file'],
  fileLoaded: ['Wczytano plik', 'File loaded'],
  fileFailed: ['Nie udało się odczytać pliku.', 'Could not read the file.'],
  pasteLabel: ['Treść zapisu (JSON)', 'Record content (JSON)'],
  pastePlaceholder: ['Wklej tutaj zapis z Genesis…', 'Paste the Genesis record here…'],
  bytesSuffix: ['bajtów', 'bytes'],
  shaLabel: ['Skrót sha256, który dostałeś razem z plikiem (opcjonalnie)', 'The sha256 you were given with the file (optional)'],
  shaHint: ['64 znaki 0–9 i a–f. Jeśli go podasz, sprawdzimy, czy plik jest bajt w bajt tym, który wydał Genesis.', '64 characters 0–9 and a–f. If you give it, we check the file is byte for byte the one Genesis issued.'],
  shaInvalid: ['To nie wygląda na sha256: potrzeba dokładnie 64 znaków 0–9 i a–f.', 'This does not look like a sha256: it needs exactly 64 characters 0–9 and a–f.'],
  verify: ['Sprawdź zapis', 'Verify the record'],
  verifying: ['Sprawdzam… (powtórzenie obliczenia może potrwać)', 'Checking… (the replay can take a while)'],
  clear: ['Wyczyść', 'Clear'],
  needRecord: ['Najpierw dodaj zapis: plik albo wklejoną treść.', 'Add a record first: a file or pasted content.'],

  fromRunTitle: ['Nie masz pliku? Weź zapis z wykonanego eksperymentu', 'No file? Take the record of an executed experiment'],
  fromRunLead: ['Genesis wyda dokładnie te bajty, które zapisał po eksperymencie, razem z ich sha256.', 'Genesis hands over exactly the bytes it stored after the experiment, together with their sha256.'],
  pickRun: ['Przebieg badań', 'Research run'],
  pickExperiment: ['Wykonany eksperyment', 'Executed experiment'],
  loadingRuns: ['Pobieram przebiegi badań…', 'Loading research runs…'],
  runsFailed: ['Nie udało się pobrać przebiegów badań.', 'Could not load the research runs.'],
  noRuns: ['W tym projekcie nie ma jeszcze przebiegów badań.', 'This project has no research runs yet.'],
  noExecuted: ['Ten przebieg nie ma jeszcze wykonanego eksperymentu, więc nie ma zapisu do wydania.', 'This run has no executed experiment yet, so there is no record to hand over.'],
  chooseRun: ['Wybierz przebieg…', 'Choose a run…'],
  chooseExperiment: ['Wybierz eksperyment…', 'Choose an experiment…'],
  getRecord: ['Pobierz zapis do sprawdzenia', 'Get the record to check'],
  gettingRecord: ['Pobieram zapis…', 'Getting the record…'],
  recordReady: ['Zapis jest w polu powyżej, a jego sha256 wpisaliśmy w pole skrótu.', 'The record is in the field above and its sha256 is in the hash field.'],
  downloadRecord: ['Zapisz plik zapisu', 'Save the record file'],
  custodyVerified: ['Kopia w magazynie Genesis jest nienaruszona.', 'The copy in Genesis storage is intact.'],
  custodyNone: ['Zapis odtworzony z rejestru Genesis (brak osobnej kopii w magazynie).', 'Record rebuilt from the Genesis ledger (no separate stored copy).'],
  exportNotExecuted: ['Ten eksperyment nie został wykonany, więc nie ma zapisu.', 'This experiment was not executed, so there is no record.'],
  exportIntegrity: ['Kopia w magazynie Genesis nie zgadza się z rejestrem. Genesis nie wyda zapisu, którego nie może potwierdzić.', 'The copy in Genesis storage does not match the ledger. Genesis will not hand over a record it cannot confirm.'],

  resultTitle: ['Werdykt', 'Verdict'],
  checksTitle: ['Co sprawdziliśmy', 'What we checked'],
  notCheckedTitle: ['Czego NIE sprawdziliśmy', 'What we did NOT check'],
  replayedAs: ['Powtórzone obliczenie', 'Computation replayed'],
  reportTitle: ['Raport do pobrania', 'Report to download'],
  reportLead: ['Jedna strona HTML bez skryptów i zewnętrznych zasobów — da się ją wysłać mailem i otworzyć na telefonie.', 'One HTML page with no scripts or external resources: you can email it and open it on a phone.'],
  downloadReport: ['Pobierz raport (HTML)', 'Download the report (HTML)'],
  openReport: ['Otwórz raport w nowej karcie', 'Open the report in a new tab'],
  preparingReport: ['Przygotowuję raport…', 'Preparing the report…'],
  reportFingerprint: ['Odcisk raportu', 'Report fingerprint'],
  generatedAt: ['Wygenerowano', 'Generated'],

  errForbidden: ['Serwer odmówił: weryfikacja powtarza obliczenie, więc wymaga w tym projekcie uprawnień edytora.', 'The server refused: verification re-runs a computation, so it needs editor rights in this project.'],
  errNotFound: ['Serwer nie znalazł tego przebiegu ani eksperymentu.', 'The server did not find this run or experiment.'],
  errOffline: ['Brak połączenia z serwerem.', 'No connection to the server.'],
  errSignedOut: ['Sesja wygasła. Zaloguj się ponownie.', 'Your session expired. Sign in again.'],
  errBusy: ['Inne ciężkie obliczenie jest teraz wykonywane. Spróbuj za chwilę.', 'Another heavy computation is running now. Try again in a moment.'],
  errRateLimited: ['Wyczerpałeś limit ciężkich obliczeń. Spróbuj później.', 'You have used up your heavy-computation limit. Try again later.'],
  errTooLarge: ['Plik jest za duży, żeby go przesłać.', 'The file is too large to send.'],
  errOther: ['Serwer odmówił.', 'The server refused.'],
  errCode: ['Kod odpowiedzi', 'Response code'],
} as const satisfies Record<string, Pair>;

export type VerifyTextKey = keyof typeof TEXT;

export function vText(key: VerifyTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

const pick = (pair: Pair | undefined, locale: Locale): string | undefined => (pair ? pair[locale === 'pl' ? 0 : 1] : undefined);

/** Headline and plain meaning of each verdict code. */
export const VERDICT_TEXT: Readonly<Record<string, { word: Pair; meaning: Pair }>> = {
  MATCH: {
    word: ['ZGODNY', 'MATCH'],
    meaning: [
      'Powtórzyliśmy to samo obliczenie z danych w Twoim zapisie i wyszedł ten sam wynik. Zapis zgadza się z własnymi odciskami i nic, co mamy, mu nie przeczy.',
      'We re-ran the same computation from the inputs in your record and got the same result. The record agrees with its own fingerprints and nothing we hold contradicts it.',
    ],
  },
  DRIFT: {
    word: ['ROZBIEŻNY', 'DRIFT'],
    meaning: [
      'Zapis jest wewnętrznie spójny, ale powtórzenie dało inny wynik albo działało na innej wersji silnika. Wyniku w tej postaci nie udało się tu odtworzyć.',
      'The record is internally consistent, but the replay gave a different result or ran on a different engine version. The result, as recorded, was not reproduced here.',
    ],
  },
  TAMPERED: {
    word: ['ZMIENIONY', 'TAMPERED'],
    meaning: [
      'Treść zapisu nie zgadza się z jego odciskami, z podanym sha256 albo z kopią w rejestrze Genesis. Coś zmieniono po uzyskaniu wyniku. Nie opieraj się na nim.',
      'The record does not match its own fingerprints, the sha256 you were given, or the copy in the Genesis ledger. Something was changed after the result was produced. Do not rely on it.',
    ],
  },
  BLOCKED: {
    word: ['NIEROZSTRZYGNIĘTY', 'BLOCKED'],
    meaning: [
      'Nie dało się dokończyć sprawdzenia, więc to ani zaliczenie, ani porażka. Powody są niżej.',
      'Verification could not be completed, so this is neither a pass nor a fail. The reasons are below.',
    ],
  },
};

export const STATUS_TEXT: Readonly<Record<string, Pair>> = {
  PASS: ['Zaliczone', 'Passed'],
  FAIL: ['Niezaliczone', 'Failed'],
  NOT_RUN: ['Nie sprawdzono', 'Not checked'],
};

/** What each check asks, in a sentence a non-scientist can follow. */
export const CHECK_TITLE: Readonly<Record<string, Pair>> = {
  readable: ['Czy plik jest czytelnym zapisem Genesis', 'Is the file a readable Genesis record'],
  'file-hash': ['Czy plik jest bajt w bajt tym, który dostałeś', 'Is the file byte for byte the one you were given'],
  provenance: ['Czy zapis mówi, skąd pochodzi', 'Does the record say where it came from'],
  'content-hash': ['Czy dane i wynik zgadzają się z ich odciskami', 'Do the inputs and result match their fingerprints'],
  'ledger-anchor': ['Czy zgadza się z kopią w rejestrze Genesis', 'Does it match the copy in the Genesis ledger'],
  replay: ['Czy powtórzenie obliczenia daje ten sam wynik', 'Does re-running the computation give the same result'],
};

/**
 * Plain explanation per check, chosen by the server's reason code when one applies, else by status.
 * Keys: `<checkId>:<STATUS>` or `<checkId>:<REASON>`.
 */
const CHECK_EXPLAIN: Readonly<Record<string, Pair>> = {
  'readable:PASS': ['Plik da się odczytać jako zapis.', 'The file reads as a record.'],
  'readable:NOT_JSON': ['To nie jest poprawny JSON — plik jest uszkodzony albo to inny plik.', 'This is not valid JSON: the file is damaged or it is a different file.'],
  'readable:EMPTY_INPUT': ['Plik jest pusty.', 'The file is empty.'],
  'readable:INPUT_TOO_LARGE': ['Plik jest większy, niż weryfikacja przyjmuje.', 'The file is larger than verification accepts.'],
  'readable:NOT_A_RECORD': ['To JSON, ale nie pojedynczy zapis (np. lista albo liczba).', 'This is JSON, but not a single record (for example a list or a number).'],
  'readable:FAIL': ['Pliku nie da się odczytać jako zapisu.', 'The file cannot be read as a record.'],

  'file-hash:PASS': ['Plik jest bajt w bajt tym, który wydał Genesis.', 'The file is byte for byte the one Genesis issued.'],
  'file-hash:FILE_HASH_MISMATCH': ['Plik różni się od tego, który wydał Genesis: jego sha256 jest inny niż podany.', 'The file differs from the one Genesis issued: its sha256 is not the one you gave.'],
  'file-hash:DECLARED_SHA256_INVALID': ['Podany skrót nie jest wartością sha256.', 'The hash you gave is not a sha256 value.'],
  'file-hash:NOT_RUN': ['Nie podałeś skrótu sha256, więc tego nie porównaliśmy.', 'You did not give a sha256, so this was not compared.'],

  'provenance:PASS': ['Zapis ma wszystko: przebieg, eksperyment, zamrożoną prognozę, prerejestrację, silnik z wersją, dane wejściowe, wynik i oba odciski.', 'The record has everything: run, experiment, frozen prediction, preregistration, engine and version, input, output and both fingerprints.'],
  'provenance:FAIL': ['Brakuje części informacji o pochodzeniu, więc nie da się nic o zapisie powiedzieć. Lista braków jest w szczegółach technicznych.', 'Part of the provenance is missing, so nothing can be said about the record. The list is in the technical details.'],

  'content-hash:PASS': ['Przeliczone odciski danych i wyniku są równe zapisanym.', 'The recomputed fingerprints of the input and the result equal the recorded ones.'],
  'content-hash:FAIL': ['Dane albo wynik nie zgadzają się już z odciskami zapisanymi obok nich — ktoś je zmienił.', 'The input or the result no longer matches the fingerprint recorded next to it: someone changed it.'],
  'content-hash:NOT_RUN': ['Pominięte, bo zapis jest niepełny albo nieczytelny.', 'Skipped because the record is incomplete or unreadable.'],

  'ledger-anchor:PASS': ['Zapis jest identyczny z eksperymentem zapisanym w łańcuchu rejestru Genesis.', 'The record is identical to the experiment stored in the Genesis ledger chain.'],
  'ledger-anchor:LEDGER_MISMATCH': ['Zapis różni się od kopii tego eksperymentu w rejestrze Genesis.', 'The record differs from the copy of this experiment in the Genesis ledger.'],
  'ledger-anchor:LEDGER_CHAIN_INVALID': ['Kopia w rejestrze nie przeszła własnej kontroli łańcucha, więc nie może służyć do porównania.', 'The ledger copy failed its own chain check, so it cannot be used to compare.'],
  'ledger-anchor:NOT_RUN': ['Ten przebieg nie należy do wybranego projektu (albo zapis jest niepełny), więc nie było kopii do porównania.', 'This run is not in the chosen project (or the record is incomplete), so there was no copy to compare with.'],

  'replay:PASS': ['Powtórzone obliczenie dało ten sam wynik.', 'The replayed computation gave the same result.'],
  'replay:OUTPUT_DIFFERS': ['Powtórzone obliczenie dało inny wynik, poza udokumentowaną tolerancją.', 'The replayed computation gave a different result, outside the documented tolerance.'],
  'replay:ENGINE_VERSION_CHANGED': ['Tutaj działa inna wersja silnika niż w zapisie, więc różnicy nie da się przypisać samemu wynikowi.', 'A different engine version runs here than in the record, so a difference cannot be put down to the result alone.'],
  'replay:ENGINE_UNAVAILABLE': ['Silnik potrzebny do powtórzenia jest teraz niedostępny w tym Genesis.', 'The engine needed for the replay is not available in this Genesis right now.'],
  'replay:BLOCKED_BY_LICENSE': ['Licencja silnika nie pozwala tu na to powtórzenie.', 'The engine licence does not allow this replay here.'],
  'replay:UNKNOWN_ENGINE': ['Genesis nie zna silnika, który wpisano w zapis.', 'Genesis does not know the engine named in the record.'],
  'replay:REPLAY_UNSUPPORTED': ['Dla tego rodzaju obliczenia Genesis nie ma powtarzalnej ścieżki.', 'Genesis has no reproducible path for this kind of computation.'],
  'replay:INPUT_NOT_ACCEPTED': ['Dane wejściowe w zapisie nie są w postaci, którą silnik przyjmuje bez zmian.', 'The input in the record is not in a form the engine accepts as is.'],
  'replay:REPLAY_FAILED': ['Powtórzenie nie dobiegło końca.', 'The replay did not complete.'],
  'replay:NOT_AN_EXECUTED_EXPERIMENT': ['Eksperyment w zapisie nie został wykonany, więc nie ma wyniku do powtórzenia.', 'The experiment in the record was not executed, so there is no result to replay.'],
  'replay:NOT_RUN': ['Pominięte, bo wcześniejsze sprawdzenie już przesądziło werdykt.', 'Skipped because an earlier check already decided the verdict.'],
};

/** Reason codes that belong to each check (server codes from genesisVerify.mjs), most specific first. */
export const CHECK_REASONS: Readonly<Record<string, readonly string[]>> = {
  readable: ['NOT_JSON', 'EMPTY_INPUT', 'INPUT_TOO_LARGE', 'NOT_A_RECORD'],
  'file-hash': ['DECLARED_SHA256_INVALID', 'FILE_HASH_MISMATCH'],
  'ledger-anchor': ['LEDGER_MISMATCH', 'LEDGER_CHAIN_INVALID'],
  replay: ['NOT_AN_EXECUTED_EXPERIMENT', 'ENGINE_VERSION_CHANGED', 'OUTPUT_DIFFERS', 'ENGINE_UNAVAILABLE', 'BLOCKED_BY_LICENSE', 'UNKNOWN_ENGINE', 'REPLAY_UNSUPPORTED', 'INPUT_NOT_ACCEPTED', 'REPLAY_FAILED'],
};

export function checkExplain(checkId: string, keyCode: string, locale: Locale): string | undefined {
  return pick(CHECK_EXPLAIN[`${checkId}:${keyCode}`], locale);
}

/** Plain names of the replayed capability (a capability, never an engine product name). */
export const CAPABILITY_TEXT: Readonly<Record<string, Pair>> = {
  'molecular-descriptors': ['właściwości cząsteczki (np. masa cząsteczkowa)', 'molecule properties (for example molecular weight)'],
  'quantum-chemistry': ['obliczenie chemii kwantowej', 'quantum chemistry calculation'],
  'molecular-docking': ['dokowanie cząsteczki do białka', 'docking a molecule to a protein'],
  'admet-estimation': ['szacowanie wchłaniania, rozkładu i toksyczności', 'absorption, distribution and toxicity estimate'],
  'toxicity-risk-estimation': ['szacowanie ryzyka toksyczności', 'toxicity risk estimate'],
};

/** What a record check never covers; the conditional lines follow the report's own anchor status. */
export const NOT_CHECKED_TEXT = {
  always: [
    ['Czy hipoteza, pytanie albo wniosek są naukowo słuszne. Sprawdzamy tylko, czy jedno zapisane obliczenie jest nienaruszone i powtarzalne.', 'Whether the hypothesis, question or conclusion is scientifically right. We only check that one recorded computation is intact and reproducible.'],
    ['Czy wybrane dane wejściowe (cząsteczka, cel, parametry) były właściwe do Twojego celu.', 'Whether the chosen input (molecule, target, parameters) was the right one for your purpose.'],
    ['Inne eksperymenty, źródła i kroki tego samego przebiegu. Sprawdziliśmy tylko ten jeden zapis.', 'Other experiments, sources and steps of the same run. Only this one record was checked.'],
    ['Ważność laboratoryjną, kliniczną ani regulacyjną. Nie było żadnego pomiaru fizycznego.', 'Laboratory, clinical or regulatory validity. No physical measurement is involved.'],
    ['Czy licencja silnika pozwala na komercyjne użycie wyniku.', 'Whether the engine licence permits commercial use of the result.'],
    ['Podpis cyfrowy: raport jest UNSIGNED, bo klucz produkcyjny CSRN nie został jeszcze wygenerowany.', 'Digital signature: the report is UNSIGNED because the CSRN production key has not been generated yet.'],
  ] as readonly Pair[],
  noAnchor: [
    'Porównanie z kopią w rejestrze Genesis: nie było kopii. Zapis przepisany razem z przeliczonymi odciskami wyszedłby tylko jako ROZBIEŻNY przy powtórzeniu, nie jako ZMIENIONY.',
    'Comparison with a Genesis ledger copy: none was available. A record rewritten with recomputed fingerprints would show up only as DRIFT on replay, not as TAMPERED.',
  ] as Pair,
  prediction: [
    'Samej zarejestrowanej prognozy: z zapisem wędruje tylko jej odcisk, nie odtwarzaliśmy jej z prerejestracji.',
    'The preregistered prediction itself: only its fingerprint travels with the record; it was not re-derived from the preregistration.',
  ] as Pair,
};

export function pairText(pair: Pair, locale: Locale): string {
  return pair[locale === 'pl' ? 0 : 1];
}

export function verdictWord(verdict: string, locale: Locale): string {
  return pick(VERDICT_TEXT[verdict]?.word, locale) ?? verdict;
}

export function statusWord(status: string, locale: Locale): string {
  return pick(STATUS_TEXT[status], locale) ?? status;
}
