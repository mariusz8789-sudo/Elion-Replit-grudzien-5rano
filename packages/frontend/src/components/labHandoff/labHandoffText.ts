import type { Locale } from '../../core/i18n';

/**
 * LAB HANDOFF — every sentence of #/lab-handoff in Polish and English (Arabic and any other language read
 * English until a native speaker checks a translation; the same rule as verifyText.ts). Statuses, verdicts
 * and refusals are CODES the server sends (packages/backend/src/researchRunLab.mjs); this file only says
 * them in plain words. A code it does not know falls back to the code itself, never to a guessed label.
 *
 * Wording rules: no laboratory partner exists yet, and the CSRN production key has not been generated, so
 * nothing here says "signed", "certified" or "confirmed". A model value is a GENESIS COMPUTATION, a lab
 * value is a REAL MEASUREMENT, and neither is a clinical verdict. Engine names never appear outside the
 * collapsed technical details.
 */
type Pair = readonly [pl: string, en: string];

const TEXT = {
  kicker: ['Przekazanie do laboratorium', 'Lab handoff'],
  title: ['Od kandydata do pomiaru w laboratorium', 'From a candidate to a laboratory measurement'],
  lead: [
    'Wybierz kandydata, którego obliczenia przeszły falsyfikację i powtórzenie. Przygotuj prośbę o jeden pomiar, pobierz paczkę dla laboratorium, a gdy wynik wróci — wpisz go. Inna osoba go sprawdzi, a Genesis porówna obliczenie z pomiarem.',
    'Pick a candidate whose computation passed falsification and replay. Prepare a request for one measurement, download the package for the laboratory and, when the result comes back, enter it. Another person checks it, and Genesis compares the computation with the measurement.',
  ],
  honestTitle: ['Uczciwie: jak jest dzisiaj', 'Honestly: where this stands today'],
  honestNoPartner: [
    'Genesis nie ma jeszcze partnera laboratoryjnego. Paczkę wysyłasz sam do laboratorium, które wybierzesz; Genesis niczego nie zleca i nie wykonuje żadnej procedury.',
    'Genesis has no laboratory partner yet. You send the package yourself to a laboratory you choose; Genesis orders nothing and runs no procedure.',
  ],
  honestUnsigned: [
    'Paczka jest NIEPODPISANA (UNSIGNED): klucz produkcyjny CSRN nie został jeszcze wygenerowany. Jej spójność sprawdzają tylko odciski (sha256) i powtórzenie obliczenia.',
    'The package is UNSIGNED: the CSRN production key has not been generated yet. Its integrity rests only on fingerprints (sha256) and replay.',
  ],
  honestNotClinical: [
    'Zgodność obliczenia z pomiarem nie mówi nic o skuteczności ani bezpieczeństwie leku.',
    'Agreement between computation and measurement says nothing about whether a medicine works or is safe.',
  ],
  signedOut: ['Zaloguj się, żeby przekazać kandydata do laboratorium. Każdy krok jest zapisywany w projekcie, więc wymaga konta.', 'Sign in to hand a candidate to a laboratory. Every step is recorded in a project, so it needs an account.'],
  signIn: ['Zaloguj się', 'Sign in'],
  noProject: ['Nie masz jeszcze projektu. Przekazanie działa w projekcie, bo tam są przebiegi badań.', 'You have no project yet. The handoff works in a project, because that is where research runs live.'],
  createProject: ['Załóż projekt', 'Create a project'],
  loadingProjects: ['Sprawdzam Twoje projekty…', 'Checking your projects…'],
  projectsFailed: ['Nie udało się pobrać listy projektów.', 'Could not load the list of projects.'],
  project: ['Projekt', 'Project'],
  run: ['Przebieg badań', 'Research run'],
  chooseRun: ['Wybierz przebieg…', 'Choose a run…'],
  loadingRuns: ['Pobieram przebiegi badań…', 'Loading research runs…'],
  noRuns: ['W tym projekcie nie ma jeszcze przebiegów badań. Zacznij od „Przebiegi badań”.', 'This project has no research runs yet. Start in “Research runs”.'],
  openRuns: ['Otwórz Przebiegi badań', 'Open Research runs'],
  loadingRun: ['Pobieram przebieg i stan przekazania…', 'Loading the run and its handoff state…'],
  technical: ['Szczegóły techniczne', 'Technical details'],
  refresh: ['Odśwież', 'Refresh'],
  you: ['Ty', 'You'],
  anotherPerson: ['inna osoba', 'another person'],

  step1: ['1. Kandydaci, których można przekazać', '1. Candidates you can hand over'],
  step1Lead: [
    'Do laboratorium trafia tylko eksperyment, który przeszedł trzy bramki: wynik potwierdził hipotezę w ramach protokołu, powtórzenie obliczenia dało to samo, a dowód czeka na decyzję człowieka.',
    'Only an experiment that passed three gates goes to a laboratory: the result supported the hypothesis within its protocol, re-running the computation gave the same, and the evidence is waiting for a person’s decision.',
  ],
  noExperiments: ['Ten przebieg nie ma jeszcze eksperymentów.', 'This run has no experiments yet.'],
  eligible: ['Można przekazać', 'Can be handed over'],
  notEligible: ['Nie można przekazać', 'Cannot be handed over'],
  prepareFor: ['Przygotuj prośbę', 'Prepare a request'],
  hasRequest: ['Prośba już istnieje', 'A request already exists'],

  step2: ['2. Prośba o pomiar — ustalona, zanim pomiar istnieje', '2. The measurement request, fixed before the measurement exists'],
  step2Lead: [
    'Zanim laboratorium cokolwiek zmierzy, ustalasz trzy rzeczy: co ma być zmierzone, w jakiej jednostce i jak daleko pomiar może odbiegać od obliczenia Genesis, żeby wciąż liczyć się jako zgodny (tolerancja). Genesis zamraża je razem z prośbą. Nic, co laboratorium przyśle później, nie może ich przesunąć — nikt nie dopasuje miary do wyniku.',
    'Before the laboratory measures anything, you fix three things: what is measured, in which unit, and how far the measurement may be from the Genesis computation and still count as agreement (the tolerance). Genesis freezes them with the request. Nothing the laboratory sends later can move them, so nobody can fit the yardstick to the result.',
  ],
  forExperiment: ['Dla eksperymentu', 'For the experiment'],
  endpointId: ['Nazwa mierzonej wielkości (krótki identyfikator)', 'Name of the measured quantity (a short identifier)'],
  endpointIdHint: ['Np. „measured-logp”. Tę samą nazwę laboratorium wpisze przy wyniku.', 'For example “measured-logp”. The laboratory gives the same name with its result.'],
  assay: ['Co laboratorium ma zmierzyć (opis pomiaru)', 'What the laboratory measures (the assay)'],
  assayHint: ['Opisz wielkość, nie procedurę. Prośby o syntezę, hodowlę czy dawkowanie Genesis odrzuca.', 'Describe a quantity, not a procedure. Requests for synthesis, culture or dosing are refused.'],
  outputKey: ['Z którym obliczonym wynikiem porównać', 'Which computed value to compare with'],
  chooseOutput: ['Wybierz wynik obliczenia…', 'Choose a computed value…'],
  noNumericOutput: ['To obliczenie nie ma wyniku liczbowego, więc nie ma z czym porównać pomiaru.', 'This computation has no numeric result, so there is nothing to compare a measurement with.'],
  unit: ['Jednostka', 'Unit'],
  unitHint: ['Pomiar musi przyjść dokładnie w tej jednostce; inna jednostka jest odrzucana przy porównaniu.', 'The measurement must come in exactly this unit; a different unit is refused at comparison.'],
  toleranceAbs: ['Tolerancja bezwzględna (w tej jednostce)', 'Absolute tolerance (in this unit)'],
  toleranceRel: ['Tolerancja względna (ułamek, np. 0,1 = 10%)', 'Relative tolerance (a fraction, e.g. 0.1 = 10%)'],
  toleranceHint: ['Podaj co najmniej jedną. Bez tolerancji Genesis nie przyjmie prośby.', 'Give at least one. Without a tolerance Genesis does not accept the request.'],
  objective: ['Cel pomiaru (opcjonalnie)', 'Purpose of the measurement (optional)'],
  labName: ['Laboratorium, do którego wyślesz paczkę (opcjonalnie)', 'The laboratory you will send the package to (optional)'],
  providerType: ['Rodzaj laboratorium', 'Kind of laboratory'],
  prepare: ['Przygotuj prośbę', 'Prepare the request'],
  preparing: ['Zapisuję prośbę…', 'Recording the request…'],
  cancel: ['Anuluj', 'Cancel'],
  missingFields: ['Uzupełnij pola:', 'Fill in:'],
  invalidNumber: ['To nie jest liczba nieujemna.', 'This is not a non-negative number.'],
  frozenModelValue: ['Zamrożona wartość z obliczenia', 'Frozen value from the computation'],
  frozenTolerance: ['Tolerancja', 'Tolerance'],

  step3: ['3. Paczka dla laboratorium', '3. The package for the laboratory'],
  step3Lead: [
    'Plik JSON: kandydat, mierzona wielkość, jednostka i lista tego, co laboratorium ma odesłać. W środku jest też pakiet dowodów obliczenia. Paczka jest NIEPODPISANA.',
    'A JSON file: the candidate, the measured quantity, the unit and what the laboratory should send back. The evidence pack of the computation is inside too. The package is UNSIGNED.',
  ],
  requests: ['Prośby w tym przebiegu', 'Requests in this run'],
  noRequests: ['Nie ma jeszcze żadnej prośby.', 'There is no request yet.'],
  getPackage: ['Przygotuj paczkę', 'Prepare the package'],
  gettingPackage: ['Składam paczkę…', 'Assembling the package…'],
  savePackage: ['Zapisz paczkę (JSON)', 'Save the package (JSON)'],
  packageReady: ['Paczka gotowa. Jej odcisk:', 'The package is ready. Its fingerprint:'],
  packageUnsigned: ['Stan podpisu: NIEPODPISANA (UNSIGNED)', 'Signature: UNSIGNED'],
  pleaseReturn: ['Laboratorium ma odesłać', 'The laboratory should send back'],

  verifyTitle: ['Sprawdź paczkę, którą ktoś Ci odesłał', 'Check a package someone sent back to you'],
  verifyLead: [
    'Wgraj plik paczki. Genesis sprawdzi, czy nikt jej nie zmienił: odcisk paczki, odcisk prośby i pakiet dowodów w środku. To sprawdzenie spójności, nie podpis.',
    'Upload the package file. Genesis checks that nobody changed it: the package fingerprint, the request fingerprint and the evidence pack inside. This is an integrity check, not a signature.',
  ],
  verifyFile: ['Wybierz plik paczki', 'Choose the package file'],
  verifyLast: ['Sprawdź paczkę zapisaną przed chwilą', 'Check the package saved a moment ago'],
  verifying: ['Sprawdzam…', 'Checking…'],
  notJson: ['Ten plik nie jest poprawnym JSON-em.', 'This file is not valid JSON.'],
  pkgValid: ['Paczka jest nienaruszona — tylko spójność (UNSIGNED, bez podpisu).', 'The package is intact: integrity only (UNSIGNED, no signature).'],
  pkgRejected: ['Paczka NIE przeszła sprawdzenia. Nie opieraj się na niej.', 'The package did NOT pass the check. Do not rely on it.'],

  step4: ['4. Wynik z laboratorium — PRAWDZIWY POMIAR', '4. The laboratory result: a REAL MEASUREMENT'],
  step4Lead: [
    'Wpisz to, co odesłało laboratorium, i dołącz surowy plik wyniku. Genesis sam policzy odcisk sha256 bajtów, które dostał. To dowodzi, które bajty Genesis ma — nie dowodzi, że wytworzył je przyrząd.',
    'Enter what the laboratory sent back and attach the raw result file. Genesis computes the sha256 of the bytes it received itself. That proves which bytes Genesis holds; it does not prove an instrument produced them.',
  ],
  forRequest: ['Dla prośby', 'For the request'],
  chooseRequest: ['Wybierz prośbę…', 'Choose a request…'],
  value: ['Zmierzona wartość', 'Measured value'],
  observedAt: ['Kiedy zmierzono', 'When it was measured'],
  methodReference: ['Metoda (odnośnik laboratorium)', 'Method (the laboratory’s reference)'],
  labId: ['Identyfikator laboratorium', 'Laboratory id'],
  externalObservationId: ['Numer wyniku w laboratorium', 'The laboratory’s own result number'],
  sourceUri: ['Adres źródłowy wyniku', 'Source address of the result'],
  quality: ['Kontrola jakości laboratorium', 'The laboratory’s quality control'],
  qualityNotes: ['Uwagi (opcjonalnie)', 'Notes (optional)'],
  rawFile: ['Surowy plik wyniku', 'Raw result file'],
  rawFileHint: ['Dowolny plik z laboratorium (raport, eksport z aparatu). Genesis policzy jego sha256.', 'Any file from the laboratory (report, instrument export). Genesis computes its sha256.'],
  chooseFile: ['Wybierz plik', 'Choose a file'],
  fileBytes: ['bajtów', 'bytes'],
  fileFailed: ['Nie udało się odczytać pliku.', 'Could not read the file.'],
  submitObservation: ['Zapisz wynik laboratorium', 'Record the laboratory result'],
  submittingObservation: ['Zapisuję wynik…', 'Recording the result…'],
  observationSaved: ['Wynik zapisany. Odcisk sha256 policzony przez Genesis:', 'Result recorded. The sha256 Genesis computed:'],

  step5: ['5. Sprawdzenie przez inną osobę', '5. Review by another person'],
  step5Lead: [
    'Wynik laboratorium liczy się dopiero, gdy przyjmie go człowiek inny niż ten, kto go wpisał. Wynik z nieudaną kontrolą jakości nie może zostać przyjęty.',
    'A laboratory result counts only after a person other than the one who entered it accepts it. A result that failed quality control cannot be accepted.',
  ],
  observations: ['Wyniki laboratorium', 'Laboratory results'],
  noObservations: ['Nie ma jeszcze żadnego wyniku z laboratorium.', 'There is no laboratory result yet.'],
  enteredBy: ['Wpisał(a)', 'Entered by'],
  reviewState: ['Sprawdzenie', 'Review'],
  notReviewed: ['jeszcze niesprawdzony', 'not reviewed yet'],
  youEntered: ['Ten wynik wpisałeś Ty, więc musi go sprawdzić ktoś inny z projektu.', 'You entered this result, so someone else in the project has to review it.'],
  qcFailedNoAccept: ['Kontrola jakości laboratorium nie przeszła, więc tego wyniku nie można przyjąć.', 'The laboratory’s quality control failed, so this result cannot be accepted.'],
  verdict: ['Decyzja', 'Decision'],
  reviewNote: ['Uzasadnienie (opcjonalnie)', 'Reason (optional)'],
  submitReview: ['Zapisz decyzję', 'Record the decision'],
  submittingReview: ['Zapisuję decyzję…', 'Recording the decision…'],

  step6: ['6. Obliczenie a pomiar', '6. Computation versus measurement'],
  step6Lead: [
    'Genesis porównuje pomiar z wartością zamrożoną w prośbie, w tej samej jednostce i z tą samą tolerancją. Jeśli zapisane obliczenie zmieniło się od tamtej pory, porównanie jest odrzucane.',
    'Genesis compares the measurement with the value frozen in the request, in the same unit and with the same tolerance. If the stored computation has changed since then, the comparison is refused.',
  ],
  compare: ['Porównaj obliczenie z pomiarem', 'Compare computation and measurement'],
  comparing: ['Porównuję…', 'Comparing…'],
  needsAccept: ['Porównanie i dowód są możliwe dopiero po przyjęciu wyniku przez inną osobę.', 'Comparison and evidence are possible only after another person accepts the result.'],
  computed: ['Obliczenie Genesis', 'Genesis computation'],
  measured: ['Pomiar z laboratorium', 'Laboratory measurement'],
  difference: ['Różnica (pomiar − obliczenie)', 'Difference (measurement − computation)'],
  toleranceCheck: ['Sprawdzenie tolerancji', 'Tolerance check'],
  absolute: ['bezwzględna', 'absolute'],
  relative: ['względna', 'relative'],
  withinTolerance: ['mieści się', 'within'],
  outsideTolerance: ['poza tolerancją', 'outside'],
  clinicalUnknown: ['Skuteczność kliniczna: NIEZNANA. Ten wynik o niej nie mówi.', 'Clinical efficacy: UNKNOWN. This result does not speak to it.'],

  step7: ['7. Propozycja dowodu', '7. Evidence proposal'],
  step7Lead: [
    'Przyjęty pomiar może trafić do rejestru wiedzy jako PROPOZYCJA. Opublikować ją może tylko człowiek; Genesis nie publikuje sam.',
    'An accepted measurement can enter the knowledge ledger as a PROPOSAL. Only a person can publish it; Genesis never publishes on its own.',
  ],
  propose: ['Zaproponuj dowód', 'Propose evidence'],
  proposing: ['Zapisuję propozycję…', 'Recording the proposal…'],
  proposed: ['Propozycja dowodu czeka na publikację przez człowieka.', 'The evidence proposal is waiting for a person to publish it.'],
  openKnowledge: ['Otwórz Wiedza i źródła', 'Open Knowledge and sources'],

  nextTitle: ['Co dalej według Genesis', 'What Genesis suggests next'],

  errForbidden: ['Serwer odmówił: ten krok wymaga w projekcie uprawnień edytora.', 'The server refused: this step needs editor rights in this project.'],
  errNotFound: ['Serwer nie znalazł tego przebiegu, prośby albo wyniku.', 'The server did not find this run, request or result.'],
  errOffline: ['Brak połączenia z serwerem.', 'No connection to the server.'],
  errSignedOut: ['Sesja wygasła. Zaloguj się ponownie.', 'Your session expired. Sign in again.'],
  errOther: ['Serwer odmówił.', 'The server refused.'],
  errCode: ['Kod odpowiedzi', 'Response code'],
} as const satisfies Record<string, Pair>;

export type LabTextKey = keyof typeof TEXT;

export function lText(key: LabTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

export const pairText = (pair: Pair, locale: Locale): string => pair[locale === 'pl' ? 0 : 1];

/** Why an experiment cannot go to a laboratory: the same reason codes the server's gate uses. */
export const INELIGIBLE_TEXT: Readonly<Record<string, Pair>> = {
  EXPERIMENT_NOT_CLOSED_WITH_REAL_EXECUTION: ['Eksperyment nie został jeszcze wykonany do końca prawdziwym obliczeniem.', 'The experiment has not been completed with a real computation yet.'],
  NOT_SUPPORTED_WITHIN_PROTOCOL: ['Wynik nie potwierdził hipotezy w ramach protokołu (np. został sfalsyfikowany), więc nie ma czego mierzyć.', 'The result did not support the hypothesis within its protocol (for example it was falsified), so there is nothing to measure.'],
  REPLAY_NOT_MATCHED: ['Powtórzenie obliczenia nie dało tego samego wyniku albo jeszcze go nie było.', 'Re-running the computation did not give the same result, or has not happened yet.'],
  EVIDENCE_PROPOSAL_MISSING: ['Brakuje propozycji dowodu z tego obliczenia.', 'There is no evidence proposal from this computation.'],
};

/** The protocol verdict of an experiment, in words. */
export const PROTOCOL_VERDICT_TEXT: Readonly<Record<string, Pair>> = {
  SUPPORTED_WITHIN_PROTOCOL: ['potwierdzona w ramach protokołu', 'supported within its protocol'],
  FALSIFIED_WITHIN_PROTOCOL: ['SFALSYFIKOWANA w ramach protokołu', 'FALSIFIED within its protocol'],
  INCONCLUSIVE: ['nierozstrzygnięta', 'inconclusive'],
};

export const REPLAY_TEXT: Readonly<Record<string, Pair>> = {
  MATCH: ['powtórzenie zgodne', 'replay matched'],
  DRIFT: ['powtórzenie rozbieżne', 'replay drifted'],
  ENGINE_VERSION_CHANGED: ['zmieniła się wersja obliczenia', 'the computation version changed'],
  BLOCKED_BY_RUNTIME: ['powtórzenie zablokowane', 'replay blocked'],
  REPLAY_UNSUPPORTED: ['bez powtarzalnej ścieżki', 'no reproducible path'],
  NOT_APPLICABLE: ['powtórzenie nie dotyczy', 'replay not applicable'],
};

export const PROVIDER_TEXT: Readonly<Record<string, Pair>> = {
  CRO: ['Firma badawcza (CRO)', 'Contract research organisation (CRO)'],
  ACADEMIC_LAB: ['Laboratorium akademickie', 'Academic laboratory'],
  INTERNAL_LAB: ['Własne laboratorium', 'Your own laboratory'],
  OTHER_EXTERNAL: ['Inne laboratorium zewnętrzne', 'Other external laboratory'],
};

export const QC_TEXT: Readonly<Record<string, Pair>> = {
  QC_PASSED: ['przeszła', 'passed'],
  QC_FAILED: ['NIE przeszła', 'FAILED'],
  QC_UNKNOWN: ['nieznana', 'unknown'],
};

export const REVIEW_TEXT: Readonly<Record<string, Pair>> = {
  ACCEPTED_AS_OBSERVATION: ['Przyjęty jako pomiar', 'Accepted as a measurement'],
  NEEDS_CLARIFICATION: ['Wymaga wyjaśnień', 'Needs clarification'],
  REJECTED_INTEGRITY: ['Odrzucony (spójność)', 'Rejected (integrity)'],
};

export const COMPARISON_TEXT: Readonly<Record<string, Pair>> = {
  AGREES_WITHIN_TOLERANCE: ['ZGODNE w ramach tolerancji', 'AGREES within tolerance'],
  DISAGREES_OUTSIDE_TOLERANCE: ['NIEZGODNE — poza tolerancją', 'DISAGREES: outside tolerance'],
};

export const INTEGRITY_TEXT: Readonly<Record<string, Pair>> = {
  VERIFIED_BY_GENESIS: ['Odcisk policzony przez Genesis z otrzymanych bajtów.', 'Fingerprint computed by Genesis from the bytes it received.'],
  DECLARED_BY_CLIENT: ['Odcisk podany przez wysyłającego; Genesis nie ma pliku.', 'Fingerprint declared by the sender; Genesis does not hold the file.'],
};

/** deriveNextResearchAction (labClosedLoop.mjs) codes. */
export const NEXT_ACTION_TEXT: Readonly<Record<string, Pair>> = {
  PREPARE_EXTERNAL_VALIDATION_REQUEST: ['Przygotuj prośbę o pomiar.', 'Prepare a measurement request.'],
  AWAIT_EXTERNAL_OBSERVATION: ['Czekaj na wynik z laboratorium i wpisz go, gdy przyjdzie.', 'Wait for the laboratory result and enter it when it arrives.'],
  HUMAN_REVIEW_REQUIRED: ['Wynik czeka na sprawdzenie przez inną osobę.', 'A result is waiting for review by another person.'],
  COMPARE_MODEL_TO_OBSERVATION: ['Porównaj obliczenie z przyjętym pomiarem.', 'Compare the computation with the accepted measurement.'],
  REVISE_MODEL_OR_HYPOTHESIS: ['Pomiar przeczy obliczeniu: popraw model albo hipotezę.', 'The measurement contradicts the computation: revise the model or the hypothesis.'],
  SEEK_INDEPENDENT_REPLICATION: ['Jest pomiar z jednego laboratorium. Poszukaj niezależnego powtórzenia w innym.', 'There is a measurement from one laboratory. Look for independent replication in another.'],
  EVIDENCE_ACCUMULATION_READY: ['Są zgodne pomiary z co najmniej dwóch laboratoriów.', 'There are agreeing measurements from at least two laboratories.'],
  BLOCKED: ['Stan przekazania jest niekompletny.', 'The handoff state is incomplete.'],
};

/** Package verification failure codes (researchRunLab.verifyLabPackage). */
export const PACKAGE_FAILURE_TEXT: Readonly<Record<string, Pair>> = {
  KIND: ['To nie jest paczka laboratoryjna Genesis.', 'This is not a Genesis laboratory package.'],
  SIGNATURE_STATUS_CLAIMED: ['Paczka twierdzi, że jest podpisana — a Genesis nie ma jeszcze klucza do podpisu. Ktoś ją zmienił.', 'The package claims a signature, and Genesis has no signing key yet. Someone changed it.'],
  PACKAGE_HASH_MISMATCH: ['Treść paczki nie zgadza się z jej odciskiem — ktoś ją zmienił.', 'The package content does not match its fingerprint: someone changed it.'],
  REQUEST_FINGERPRINT_MISMATCH: ['Prośba w paczce nie zgadza się ze swoim odciskiem.', 'The request inside does not match its fingerprint.'],
  REQUEST_MISSING: ['W paczce brakuje prośby.', 'The request is missing from the package.'],
  EVIDENCE_PACK_MISSING: ['W paczce brakuje pakietu dowodów.', 'The evidence pack is missing from the package.'],
  EVIDENCE_PACK_RUN_MISMATCH: ['Pakiet dowodów dotyczy innego przebiegu niż prośba.', 'The evidence pack belongs to a different run than the request.'],
  EVIDENCE_PACK_REJECTED: ['Pakiet dowodów w środku nie przeszedł sprawdzenia.', 'The evidence pack inside did not pass its check.'],
};

/** Server refusals (labFail in api.mjs), by error code; a BLOCKED refusal is worded by its reason via INELIGIBLE_TEXT. */
export const REFUSAL_TEXT: Readonly<Record<string, Pair>> = {
  RUN_NOT_ACTIVE: ['Ten przebieg jest anulowany, więc nie przyjmuje nowych próśb.', 'This run is cancelled, so it takes no new requests.'],
  EXPERIMENT_NOT_FOUND: ['Serwer nie zna tego eksperymentu w tym przebiegu.', 'The server does not know this experiment in this run.'],
  INVALID_ENDPOINT: ['Prośba jest niekompletna: potrzebna nazwa wielkości, opis pomiaru, wynik obliczenia, jednostka i tolerancja.', 'The request is incomplete: it needs a quantity name, an assay, a computed value, a unit and a tolerance.'],
  INVALID_ENDPOINT_PROCEDURE: ['Odmowa: prośba nazywa procedurę laboratoryjną (np. syntezę, hodowlę albo dawkowanie). Genesis prosi wyłącznie o pomiar wielkości, nigdy o wykonanie procedury.', 'Refused: the request names a wet-lab procedure (for example synthesis, culture or dosing). Genesis asks only for a measured quantity, never for a procedure.'],
  INVALID_ENDPOINT_TOLERANCE: ['Odmowa: tolerancję trzeba podać, zanim pomiar istnieje.', 'Refused: the tolerance must be given before the measurement exists.'],
  INVALID_ENDPOINT_OUTPUT: ['Odmowa: obliczenie nie ma takiego wyniku liczbowego.', 'Refused: the computation has no such numeric value.'],
  REQUEST_NOT_FOUND: ['Serwer nie zna tej prośby.', 'The server does not know this request.'],
  OBSERVATION_NOT_FOUND: ['Serwer nie zna tego wyniku.', 'The server does not know this result.'],
  INCOMPLETE_EXTERNAL_OBSERVATION: ['Wynik jest niekompletny: potrzebne są wartość, jednostka, data, metoda, laboratorium, numer wyniku, adres i surowy plik.', 'The result is incomplete: it needs a value, unit, date, method, laboratory, result number, address and the raw file.'],
  ENDPOINT_NOT_REQUESTED: ['Laboratorium podało inną wielkość niż ta, o którą proszono.', 'The laboratory reported a different quantity than the one requested.'],
  RAW_ARTIFACT_HASH_MISMATCH: ['Podany odcisk pliku różni się od policzonego przez Genesis. Niczego nie zapisano.', 'The declared file fingerprint differs from the one Genesis computed. Nothing was recorded.'],
  RAW_ARTIFACT_NOT_BASE64: ['Pliku nie udało się przesłać w całości.', 'The file could not be sent intact.'],
  RAW_ARTIFACT_TOO_LARGE: ['Plik jest większy, niż Genesis przyjmuje w jednym wyniku.', 'The file is larger than Genesis accepts for one result.'],
  RAW_ARTIFACT_EMPTY: ['Plik jest pusty.', 'The file is empty.'],
  EXTERNAL_OBSERVATION_CONFLICT: ['To laboratorium zgłosiło już wynik o tym numerze, z inną treścią. Genesis nie nadpisuje wyników.', 'This laboratory already reported a result with this number and different content. Genesis does not overwrite results.'],
  INGESTED_BY_REQUIRED: ['Brakuje osoby, która wpisuje wynik.', 'The person entering the result is missing.'],
  REVIEWER_CANNOT_BE_INGESTER: ['Odmowa: osoba, która wpisała wynik, nie może go sama sprawdzić. Musi to zrobić ktoś inny.', 'Refused: the person who entered a result cannot review it. Someone else has to.'],
  QC_FAILED_CANNOT_BE_ACCEPTED: ['Odmowa: wyniku z nieudaną kontrolą jakości nie można przyjąć.', 'Refused: a result that failed quality control cannot be accepted.'],
  INVALID_REVIEW_VERDICT: ['Nieznana decyzja.', 'Unknown decision.'],
  REVIEWER_REQUIRED: ['Brakuje osoby sprawdzającej.', 'The reviewer is missing.'],
  EVIDENCE_BRIDGE_VALIDATION_FAILED: ['Wynik nie ma wszystkiego, czego wymaga zapis w rejestrze wiedzy.', 'The result lacks something the knowledge ledger requires.'],
  OBSERVATION_NOT_ACCEPTED: ['Najpierw inna osoba musi przyjąć ten wynik.', 'Another person has to accept this result first.'],
  MODEL_VALUE_CHANGED: ['Odmowa: zapisane obliczenie zmieniło się od chwili prośby, więc porównanie byłoby z inną liczbą.', 'Refused: the stored computation changed since the request, so the comparison would be against a different number.'],
  UNIT_MISMATCH: ['Odmowa: jednostka pomiaru różni się od jednostki z prośby.', 'Refused: the measurement unit differs from the unit in the request.'],
  NON_NUMERIC_COMPARISON_NOT_SUPPORTED: ['Ten pomiar nie jest liczbą, więc nie da się go porównać liczbowo.', 'This measurement is not a number, so it cannot be compared numerically.'],
  EXPLICIT_TOLERANCE_REQUIRED: ['Prośba nie ma tolerancji, więc porównanie jest niemożliwe.', 'The request has no tolerance, so no comparison is possible.'],
  EVIDENCE_PROPOSAL_FAILED: ['Rejestr wiedzy nie przyjął propozycji.', 'The knowledge ledger did not take the proposal.'],
  STATE_INTEGRITY_FAILURE: ['Łańcuch zapisów tego przebiegu nie przechodzi kontroli. Genesis niczego do niego nie dopisze.', 'This run’s record chain fails its check. Genesis appends nothing to it.'],
};
