import type { Locale } from '../../core/i18n';

/**
 * KONTROLA LOTÓW NAUKI — every sentence of #/flight-control in Polish and English, the same pattern
 * as components/home/startText.ts: Polish for `pl`, English for every other language until a native
 * speaker checks a translation. Status CODES come from the server; this file only names them in plain
 * words. A code the file does not know is shown as the code itself, never guessed into a label.
 */
const TEXT = {
  kicker: ['Kontrola lotów nauki', 'Science Flight Control'],
  title: ['Co Genesis teraz bada', 'What Genesis is researching now'],
  lead: [
    'Przebiegi badań, kolejka zadań i loty eksperymentów — prosto z serwera. Czego serwer nie podaje, tego tu nie ma.',
    'Research runs, the job queue and experiment flights, straight from the server. What the server does not report is not shown.',
  ],
  signedOut: ['Zaloguj się, żeby zobaczyć przebiegi badań swojego projektu. Bez konta serwer ich nie pokaże.', 'Sign in to see the research runs of your project. Without an account the server does not show them.'],
  signIn: ['Zaloguj się', 'Sign in'],
  noProject: ['Nie masz jeszcze żadnego projektu. Przebiegi badań należą do projektu, więc na razie nie ma tu czego pokazać.', 'You have no project yet. Research runs belong to a project, so there is nothing to show here yet.'],
  createProject: ['Załóż projekt', 'Create a project'],
  loadingProjects: ['Sprawdzam Twoje projekty…', 'Checking your projects…'],
  loading: ['Pobieram stan z serwera…', 'Loading the state from the server…'],
  project: ['Projekt', 'Project'],
  refresh: ['Odśwież', 'Refresh'],
  stateAt: ['Stan z godziny', 'State as of'],
  loadFailed: ['Nie udało się pobrać stanu z serwera.', 'Could not load the state from the server.'],
  projectsFailed: ['Nie udało się pobrać listy projektów.', 'Could not load the list of projects.'],
  partialRuns: ['Lista przebiegów nie przyszła z serwera.', 'The list of runs did not arrive from the server.'],
  technical: ['Szczegóły techniczne', 'Technical details'],

  sumRuns: ['przebiegi', 'runs'],
  sumQueued: ['czeka w kolejce', 'queued'],
  sumClaimed: ['wykonywane teraz', 'running now'],
  sumFlights: ['loty', 'flights'],
  sumVerified: ['zweryfikowane', 'verified'],
  sumBlocked: ['zablokowane', 'blocked'],

  runsTitle: ['Przebiegi badań', 'Research runs'],
  runsLead: ['Jedno pytanie to jeden przebieg. Możesz go wstrzymać, wznowić albo anulować.', 'One question is one run. You can pause, resume or cancel it.'],
  runsEmpty: ['W tym projekcie nie ma jeszcze żadnego przebiegu badań.', 'This project has no research runs yet.'],
  nextStep: ['Następny krok', 'Next step'],
  events: ['zdarzeń w łańcuchu', 'events in the chain'],
  startedAt: ['Rozpoczęty', 'Started'],
  integrityOk: ['łańcuch zdarzeń zgodny', 'event chain intact'],
  integrityBroken: ['łańcuch zdarzeń uszkodzony — stanu nie da się potwierdzić', 'event chain broken — the state cannot be confirmed'],
  pause: ['Wstrzymaj', 'Pause'],
  resume: ['Wznów', 'Resume'],
  cancel: ['Anuluj przebieg', 'Cancel run'],
  confirmCancel: ['Tak, anuluj na stałe', 'Yes, cancel for good'],
  keep: ['Nie anuluj', 'Keep it'],
  cancelWarning: ['Anulowanego przebiegu nie da się wznowić.', 'A cancelled run cannot be resumed.'],
  working: ['Wysyłam…', 'Sending…'],
  showDetails: ['Pokaż hipotezy i eksperymenty', 'Show hypotheses and experiments'],
  hideDetails: ['Ukryj hipotezy i eksperymenty', 'Hide hypotheses and experiments'],
  detailLoading: ['Pobieram szczegóły przebiegu…', 'Loading the run details…'],
  hypotheses: ['Hipotezy', 'Hypotheses'],
  noHypotheses: ['Brak danych o hipotezach w tym widoku.', 'No hypothesis data in this view.'],
  experiments: ['Eksperymenty', 'Experiments'],
  noExperiments: ['Żaden eksperyment tego przebiegu nie został jeszcze zamrożony.', 'No experiment of this run has been frozen yet.'],
  engine: ['Silnik', 'Engine'],
  execution: ['Wykonanie', 'Execution'],
  notExecuted: ['jeszcze nie wykonany', 'not executed yet'],
  verdict: ['Werdykt', 'Verdict'],
  noVerdict: ['jeszcze bez werdyktu', 'no verdict yet'],
  evidence: ['Dowód', 'Evidence'],
  evidenceProposed: ['zaproponowany, czeka na zatwierdzenie człowieka', 'proposed, awaiting human approval'],
  noEvidence: ['brak propozycji dowodu', 'no evidence proposal'],
  replay: ['Powtórzenie', 'Replay'],
  noReplay: ['jeszcze nie powtórzony', 'not replayed yet'],

  jobsTitle: ['Kolejka zadań', 'Job queue'],
  jobsLead: [
    'Każdy eksperyment przebiegu trafia do kolejki. Pracownik (worker) bierze zadanie w dzierżawę do podanej godziny.',
    'Every experiment of a run goes into the queue. A worker takes a job on a lease until the time shown.',
  ],
  laneQueued: ['Czeka', 'Waiting'],
  laneClaimed: ['Wykonywane', 'Running'],
  laneFinished: ['Zakończone', 'Finished'],
  queuedEmpty: ['Nic nie czeka w kolejce.', 'Nothing is waiting in the queue.'],
  claimedEmpty: ['Żaden pracownik nie wykonuje teraz zadania.', 'No worker is executing a job right now.'],
  finishedEmpty: [
    'Serwer nie podaje listy zakończonych zadań. Pojawią się tu tylko zadania, które ten ekran wcześniej zobaczył w kolejce albo które zwróciła Twoja ostatnia akcja.',
    'The server does not list finished jobs. Only jobs this screen saw in the queue earlier, or that your last action returned, appear here.',
  ],
  worker: ['Pracownik', 'Worker'],
  noWorker: ['jeszcze żaden', 'none yet'],
  clearedAfterEnd: ['serwer nie zachowuje go po zakończeniu zadania', 'the server does not keep it once the job ends'],
  leaseUntil: ['Dzierżawa do', 'Lease until'],
  leaseExpired: ['dzierżawa wygasła', 'lease expired'],
  noLease: ['brak dzierżawy', 'no lease'],
  attempts: ['Próby', 'Attempts'],
  ofRun: ['Przebieg', 'Run'],
  hypothesis: ['Hipoteza', 'Hypothesis'],
  nextHypothesis: ['następna według planu', 'next one in the plan'],
  failure: ['Powód', 'Reason'],
  cancelJob: ['Anuluj zadanie', 'Cancel job'],

  flightsTitle: ['Loty eksperymentów', 'Experiment flights'],
  flightsLead: [
    'Lot to jeden zaplanowany eksperyment Virtual Lab: kontrola przed startem, wykonanie wobec planu, dowód i powtórzenie.',
    'A flight is one planned Virtual Lab experiment: preflight, execution against the plan, evidence and replay.',
  ],
  flightsNotComputed: ['Serwer nie przeliczył kontroli lotów w tym widoku.', 'The server did not compute flight control in this view.'],
  flightsEmpty: ['Brak lotów: żadna kampania Virtual Lab w tym projekcie nie zaplanowała jeszcze eksperymentu.', 'No flights: no Virtual Lab campaign in this project has planned an experiment yet.'],
  rejected: ['Rekordy odrzucone, bo nie dało się ich prześledzić', 'Records rejected because they could not be traced'],
  candidate: ['Kandydat', 'Candidate'],
  stagePreflight: ['Przed startem', 'Preflight'],
  stageExecution: ['Wykonanie', 'Execution'],
  stageEvidence: ['Dowód', 'Evidence'],
  stageReplay: ['Powtórzenie', 'Replay'],
  stoppedAt: ['Zatrzymało się na', 'Stopped at'],
  retryable: ['można spróbować ponownie', 'can be retried'],
  notRetryable: ['ponowna próba nic nie zmieni bez zmiany warunków', 'retrying changes nothing until the conditions change'],
  inputIntegrity: ['Wejście zgodne z planem', 'Input matches the plan'],
  plannedCapability: ['Zaplanowana zdolność', 'Planned capability'],
  selectedEngine: ['Użyty silnik', 'Engine used'],
  budget: ['Budżet obliczeń', 'Compute budget'],
  duration: ['Czas wykonania', 'Duration'],
  notObserved: ['jeszcze nie zaobserwowane', 'not observed yet'],
  classification: ['Klasyfikacja wyniku', 'Result classification'],
  epistemic: ['Status wiedzy', 'Knowledge status'],
  inSilicoNote: ['To obserwacja in silico, nie pomiar fizyczny ani kliniczny.', 'This is an in-silico observation, not a physical or clinical measurement.'],

  blockedTitle: ['Zablokowane zależności', 'Blocked dependencies'],
  blockedLead: ['Co stoi na drodze: silniki bez działającego środowiska, zdolności bez adaptera i loty zatrzymane przez zależność.', 'What stands in the way: engines without a working runtime, capabilities without an adapter and flights stopped by a dependency.'],
  blockedUnknown: ['Serwer nie zbudował modelu własnych możliwości, więc nie wiadomo, które silniki są zablokowane.', 'The server did not build its self model, so it is not known which engines are blocked.'],
  blockedNone: ['Serwer nie zgłasza żadnej zablokowanej zależności.', 'The server reports no blocked dependency.'],
  blockedEngine: ['Silnik bez działającego środowiska', 'Engine without a working runtime'],
  blockedAdapter: ['Zdolność bez adaptera', 'Capability without an adapter'],
  blockedFlight: ['Lot zatrzymany przez zależność', 'Flight stopped by a dependency'],
  blockedBy: ['powód', 'reason'],

  pausedDone: ['Przebieg wstrzymany.', 'Run paused.'],
  pausedInFlight: [
    'Zadania, które pracownik już wykonuje, nie da się przerwać — dokończy się do końca. Wstrzymanie zatrzymuje tylko to, co jeszcze czekało w kolejce.',
    'A job a worker is already executing cannot be interrupted — it finishes. Pausing only stops what was still waiting in the queue.',
  ],
  resumedDone: ['Przebieg wznowiony.', 'Run resumed.'],
  cancelledDone: ['Przebieg anulowany.', 'Run cancelled.'],
  jobCancelledDone: ['Zadanie anulowane w kolejce.', 'Job cancelled in the queue.'],
  qWithdrawn: ['Wycofane z kolejki', 'Withdrawn from the queue'],
  qInFlight: ['Wykonywane dalej (dokończą się)', 'Still executing (they will finish)'],
  qRequeued: ['Wróciły do kolejki', 'Back in the queue'],
  qRefused: ['Serwer odmówił zmiany', 'The server refused to change'],
  errForbidden: ['Serwer odmówił: nie masz w tym projekcie uprawnień edytora.', 'The server refused: you do not have editor rights in this project.'],
  errTransition: ['Serwer odmówił: przebieg jest teraz w stanie', 'The server refused: the run is now in the state'],
  errNotFound: ['Serwer nie znalazł tego przebiegu ani zadania.', 'The server did not find this run or job.'],
  errOffline: ['Brak połączenia z serwerem.', 'No connection to the server.'],
  errSignedOut: ['Sesja wygasła. Zaloguj się ponownie.', 'Your session expired. Sign in again.'],
  errOther: ['Serwer odmówił.', 'The server refused.'],
  errCode: ['Kod odpowiedzi', 'Response code'],
} as const satisfies Record<string, readonly [string, string]>;

export type FlightControlTextKey = keyof typeof TEXT;

export function fcText(key: FlightControlTextKey, locale: Locale): string {
  return TEXT[key][locale === 'pl' ? 0 : 1];
}

type Pair = readonly [string, string];
export type Tone = 'good' | 'warn' | 'bad' | 'idle';

/** Plain names for server codes, grouped by which field they come from. */
const CODES = {
  runStatus: {
    RUNNING: ['w toku', 'running'], PAUSED: ['wstrzymany', 'paused'], CANCELLED: ['anulowany', 'cancelled'], RESOLVED: ['zakończony', 'resolved'],
    BLOCKED: ['zablokowany', 'blocked'], BUDGET_EXHAUSTED: ['budżet wyczerpany', 'budget exhausted'], FAILED: ['nieudany', 'failed'],
  },
  nextStep: {
    FORMALIZE_PROBLEM: ['sformułować problem', 'formalize the problem'], PROPOSE_PLAN: ['zaproponować plan i hipotezy', 'propose a plan and hypotheses'],
    EXECUTE_EXPERIMENT: ['wykonać eksperyment', 'execute the experiment'], PROPOSE_EVIDENCE: ['zaproponować dowód', 'propose evidence'],
    PROPOSE_NEXT_EXPERIMENT: ['zaproponować następny eksperyment', 'propose the next experiment'], AWAITING_EXECUTION: ['czeka na uruchomienie eksperymentu', 'awaiting an experiment run'],
    AWAITING_HUMAN_REVIEW: ['czeka na przegląd człowieka', 'awaiting human review'], STATE_INTEGRITY_FAILURE: ['nic — łańcuch zdarzeń jest uszkodzony', 'nothing — the event chain is broken'],
    NONE: ['brak — przebieg nie jest w toku', 'none — the run is not in progress'],
  },
  jobState: {
    QUEUED: ['czeka', 'queued'], CLAIMED: ['wykonywane', 'claimed'], SUCCEEDED: ['zakończone sukcesem', 'succeeded'], FAILED: ['nieudane', 'failed'],
    CANCELLED: ['anulowane', 'cancelled'], DEAD_LETTER: ['porzucone po wygaśnięciu', 'dead-lettered'],
  },
  flightStatus: {
    READY_TO_EXECUTE: ['gotowy do startu', 'ready to execute'], AWAITING_EVIDENCE: ['czeka na dowód', 'awaiting evidence'], AWAITING_REPLAY: ['czeka na powtórzenie', 'awaiting replay'],
    VERIFIED: ['zweryfikowany', 'verified'], BLOCKED: ['zablokowany', 'blocked'], BLOCKED_RETRYABLE: ['zablokowany, do ponowienia', 'blocked, retryable'], FAILED: ['nieudany', 'failed'],
  },
  preflightDecision: { CLEARED: ['dopuszczony', 'cleared'], BLOCKED: ['zatrzymany', 'blocked'] },
  check: {
    INPUT_FROZEN: ['wejście zamrożone przed startem', 'input frozen before start'], CAPABILITY_ADMITTED: ['zdolność dopuszczona', 'capability admitted'],
    RESEARCH_GATE: ['bramka badawcza', 'research gate'], CLAIM_BOUNDARY: ['granica twierdzeń zapisana', 'claim boundary recorded'],
  },
  checkStatus: { PASS: ['spełnione', 'pass'], FAIL: ['niespełnione', 'fail'] },
  failureLayer: {
    PREFLIGHT: ['kontrola przed startem', 'preflight'], RESEARCH_GATE: ['bramka badawcza', 'research gate'], CAPABILITY_BINDING: ['brak silnika dla zdolności', 'capability binding'],
    RUNTIME: ['środowisko uruchomieniowe', 'runtime'], WORKER_TRANSPORT: ['połączenie z pracownikiem', 'worker transport'], ENGINE: ['silnik', 'engine'], REPLAY: ['powtórzenie', 'replay'],
  },
  inputIntegrity: { MATCH: ['tak', 'yes'], DRIFT: ['nie — wejście się zmieniło', 'no — the input drifted'], NOT_OBSERVED: ['jeszcze nie zaobserwowane', 'not observed yet'] },
  budgetVerdict: {
    WITHIN_BUDGET: ['w budżecie', 'within budget'], EXCEEDED: ['przekroczony', 'exceeded'], NOT_DECLARED: ['budżet nie został zadeklarowany', 'no budget declared'],
    NOT_OBSERVED: ['jeszcze nie zaobserwowany', 'not observed yet'],
  },
  evidenceStatus: {
    PROPOSED_REQUIRES_HUMAN_APPROVAL: ['zaproponowany, czeka na człowieka', 'proposed, awaiting a human'], MISSING: ['brak — mimo wykonania', 'missing despite execution'],
    NOT_ELIGIBLE: ['jeszcze nie przysługuje', 'not eligible yet'],
  },
  replayStatus: {
    NOT_YET_REPLAYED: ['jeszcze nie powtórzony', 'not replayed yet'], REPLAY_MATCH: ['zgodny', 'match'], REPLAY_DRIFT: ['rozbieżny', 'drift'], REPLAY_DRIFT_DETECTED: ['rozbieżny', 'drift detected'],
    REPLAY_ENGINE_VERSION_CHANGED: ['zmieniła się wersja silnika', 'engine version changed'], REPLAY_BLOCKED_BY_RUNTIME: ['zablokowany przez środowisko', 'blocked by runtime'],
    REPLAY_BLOCKED: ['zablokowany', 'blocked'], REPLAY_UNSUPPORTED: ['nieobsługiwany', 'unsupported'],
    MATCH: ['zgodny', 'match'], DRIFT: ['rozbieżny', 'drift'], ENGINE_VERSION_CHANGED: ['zmieniła się wersja silnika', 'engine version changed'],
    BLOCKED_BY_RUNTIME: ['zablokowany przez środowisko', 'blocked by runtime'], NOT_APPLICABLE: ['nie dotyczy', 'not applicable'],
  },
  verdict: {
    SUPPORTED_WITHIN_PROTOCOL: ['potwierdzona w ramach protokołu', 'supported within protocol'], FALSIFIED_WITHIN_PROTOCOL: ['obalona w ramach protokołu', 'falsified within protocol'],
    INCONCLUSIVE: ['nierozstrzygnięta', 'inconclusive'],
  },
  epistemic: {
    SIMULATED: ['symulacja', 'simulated'], CONTRADICTED: ['sprzeczne', 'contradicted'], UNKNOWN: ['nieznane', 'unknown'],
  },
} as const satisfies Record<string, Record<string, Pair>>;

export type CodeGroup = keyof typeof CODES;

/** The plain name of a server code, or the code itself when this file does not know it. */
export function fcCode(group: CodeGroup, code: string | null | undefined, locale: Locale): string {
  if (code === null || code === undefined || code === '') return '—';
  const pair = (CODES[group] as Record<string, Pair>)[code];
  return pair ? pair[locale === 'pl' ? 0 : 1] : code;
}

const GOOD = new Set(['RUNNING', 'RESOLVED', 'SUCCEEDED', 'VERIFIED', 'CLEARED', 'PASS', 'MATCH', 'REPLAY_MATCH', 'WITHIN_BUDGET', 'SUPPORTED_WITHIN_PROTOCOL', 'PROPOSED_REQUIRES_HUMAN_APPROVAL']);
const BAD = new Set(['FAILED', 'CANCELLED', 'DEAD_LETTER', 'BLOCKED', 'FAIL', 'DRIFT', 'REPLAY_DRIFT', 'REPLAY_DRIFT_DETECTED', 'EXCEEDED', 'FALSIFIED_WITHIN_PROTOCOL', 'STATE_INTEGRITY_FAILURE', 'MISSING', 'BUDGET_EXHAUSTED']);
const WARN = new Set(['PAUSED', 'QUEUED', 'CLAIMED', 'BLOCKED_RETRYABLE', 'AWAITING_EVIDENCE', 'AWAITING_REPLAY', 'READY_TO_EXECUTE', 'INCONCLUSIVE', 'REPLAY_BLOCKED_BY_RUNTIME', 'REPLAY_ENGINE_VERSION_CHANGED', 'AWAITING_HUMAN_REVIEW']);

/** A colour for a server code; anything unknown stays neutral rather than looking good or bad. */
export function toneOf(code: string | null | undefined): Tone {
  if (!code) return 'idle';
  if (GOOD.has(code)) return 'good';
  if (BAD.has(code)) return 'bad';
  if (WARN.has(code)) return 'warn';
  return 'idle';
}
