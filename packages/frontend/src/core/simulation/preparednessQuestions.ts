import { canonicalJson, fnv1a } from '../events/hash';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import { SCENARIOS, type ScenarioId } from './scenarioEngine';

/**
 * GOVERNED PREPAREDNESS QUESTIONS.
 *
 * Pytanie zadane zwykłym zdaniem NIE MOŻE wymyślać parametrów modelu. Ten
 * moduł jest bramką między tym, co użytkownik napisał, a tym, co Genesis
 * wolno uruchomić: skończony, zadeklarowany katalog pytań, z których każde
 * jest związane z ISTNIEJĄCYM kontraktem scenariusza i jawnym zestawem
 * rządzonych dźwigni.
 *
 * Reguła jest jednokierunkowa i fail-closed: pytanie, którego nie da się
 * przypisać do istniejącego scenariusza, kończy się `NOT_AVAILABLE` i NICZEGO
 * nie uruchamia. Nie ma tu ścieżki „zrób coś podobnego" — podobny scenariusz
 * jest innym scenariuszem, a jego wynik nie odpowiadałby na zadane pytanie.
 *
 * Wartości dźwigni są DEMONSTRACYJNE i SCENARIUSZOWE. Nie pochodzą z żadnej
 * rzeczywistej epidemii, miasta ani placówki i nie są kalibracją.
 */
export const PREPAREDNESS_QUESTION_CONTRACT_VERSION = '1.0.0';

/** Dźwignie, które pytanie rządzone ma prawo ustawić. Nic poza tą listą. */
export interface GovernedLevers {
  days: number;
  stepsPerDay: number;
  nAgents: number;
  initialInfected: number;
  seed: number;
  baselineInterventionStartDay: number;
  variantInterventionStartDay: number;
}

export interface GovernedPreparednessQuestion {
  questionId: string;
  /** Kanoniczne brzmienie pytania — to, co użytkownik wybiera z listy. */
  question: string;
  /** Frazy, które mapują się na to pytanie. Dopasowanie, nie interpretacja. */
  phrasing: readonly string[];
  baselineScenarioId: ScenarioId;
  variantScenarioId: ScenarioId;
  levers: GovernedLevers;
  /** Co dokładnie różni oba ramiona — widoczne dla użytkownika przed uruchomieniem. */
  governedDifference: string;
  rationale: string;
  /**
   * Metryka pierwotna i KRYTERIUM FALSYFIKACJI, zapisane w katalogu PRZED
   * jakimkolwiek uruchomieniem. To jest prerejestracja: bez niej ocena
   * hipotezy byłaby dobrana po zobaczeniu liczb, czyli HARK-owaniem.
   * Kryterium celowo nie podaje spodziewanej WARTOŚCI — porównanie idzie
   * względem zmierzonego ramienia odniesienia, bo to ono jest kontrolą.
   */
  primaryMetric: string;
  falsification: FalsificationCriterion;
}

/**
 * Katalog. Każde pytanie wskazuje scenariusze, KTÓRE JUŻ ISTNIEJĄ w
 * `SCENARIOS`; walidacja poniżej nie pozwala dodać pytania wskazującego na
 * scenariusz nieznany silnikowi ani niemodelowany.
 */
export const GOVERNED_PREPAREDNESS_QUESTIONS: readonly GovernedPreparednessQuestion[] = [
  {
    questionId: 'prep:isolation-timing',
    question: 'Ile kosztuje opóźnienie izolacji objawowych o 20 dni?',
    // Odmiana jest DEKLAROWANA, nie zgadywana: literalne dopasowanie w języku
    // fleksyjnym wymaga wypisania realnych form, a nie miary podobieństwa.
    phrasing: ['opóźnienie izolacji', 'opóźnieniem izolacji', 'opóźnienia izolacji', 'izolacja później', 'izolacja po 20 dniach', 'delayed isolation', 'kiedy wprowadzić izolację'],
    baselineScenarioId: 'ISOLATION',
    variantScenarioId: 'ISOLATION',
    levers: { days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828, baselineInterventionStartDay: 0, variantInterventionStartDay: 20 },
    governedDifference: 'Ta sama polityka, inny moment wejścia: dzień 0 wobec dnia 20. Parametry epidemii identyczne.',
    rationale: 'Czas wejścia interwencji jest realną dźwignią Scenario Engine i jedyną różnicą między ramionami.',
    primaryMetric: 'totalDeaths',
    falsification: {
      metric: 'totalDeaths', relation: 'less-than',
      rationale: 'Hipoteza sprawdzana: opóźnione wejście izolacji NIE daje wyższej liczby zgonów niż wejście natychmiastowe. Kryterium jest spełnione, gdy wariant ma mniej zgonów niż odniesienie; w przeciwnym razie hipoteza zostaje sfalsyfikowana w granicach tego protokołu.',
    },
  },
  {
    questionId: 'prep:isolation-vs-contact-reduction',
    question: 'Izolacja objawowych czy ograniczenie kontaktów — co daje większą różnicę?',
    phrasing: ['izolacja czy ograniczenie kontaktów', 'izolacja vs kontakty', 'porównaj izolację z ograniczeniem kontaktów', 'isolation vs contact reduction'],
    baselineScenarioId: 'ISOLATION',
    variantScenarioId: 'CONTACT_REDUCTION',
    levers: { days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828, baselineInterventionStartDay: 0, variantInterventionStartDay: 0 },
    governedDifference: 'Dwie różne polityki wprowadzone w tym samym dniu, na tej samej populacji i tym samym ziarnie.',
    rationale: 'Oba scenariusze istnieją w bibliotece i są porównywalne przy wspólnych warunkach startowych.',
    primaryMetric: 'totalDeaths',
    falsification: {
      metric: 'totalDeaths', relation: 'less-than',
      rationale: 'Hipoteza sprawdzana: ograniczenie kontaktów daje mniej zgonów niż izolacja objawowych przy tych samych warunkach startowych.',
    },
  },
  {
    questionId: 'prep:hospital-expansion',
    question: 'Czy rozbudowa szpitala zmienia przebieg epidemii, czy tylko obciążenie systemu?',
    phrasing: ['rozbudowa szpitala', 'więcej łóżek', 'healthcare expansion', 'czy szpital zmienia epidemię'],
    baselineScenarioId: 'BASELINE',
    variantScenarioId: 'HEALTHCARE_EXPANSION',
    levers: { days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828, baselineInterventionStartDay: 0, variantInterventionStartDay: 0 },
    governedDifference: 'Zmieniona wyłącznie pojemność placówki; parametry epidemii pozostają bez zmian.',
    rationale: 'Pozwala pokazać różnicę, która NIE dotyczy epidemii — sprzężenie śmiertelności jest domyślnie wyłączone.',
    primaryMetric: 'totalDeaths',
    falsification: {
      metric: 'totalDeaths', relation: 'less-than',
      rationale: 'Hipoteza sprawdzana: rozbudowa szpitala zmniejsza liczbę zgonów. Przy wyłączonym sprzężeniu śmiertelności oczekiwanym wynikiem jest FALSYFIKACJA — i tak ma to zostać zaraportowane, a nie ukryte.',
    },
  },
  {
    questionId: 'prep:protect-seniors',
    question: 'Czy priorytetowa ochrona seniorów zmienia liczbę zgonów?',
    phrasing: ['ochrona seniorów', 'chronić starszych', 'protect seniors', 'kogo chronić najpierw'],
    baselineScenarioId: 'BASELINE',
    variantScenarioId: 'PROTECT_SENIORS',
    levers: { days: 72, stepsPerDay: 4, nAgents: 400, initialInfected: 5, seed: 20260828, baselineInterventionStartDay: 0, variantInterventionStartDay: 0 },
    governedDifference: 'Włączona ochrona priorytetowa pasma seniorów; pozostałe warunki startowe wspólne.',
    rationale: 'Warstwa kohortowa istnieje w modelu i wystawia wyniki per pasmo wieku.',
    primaryMetric: 'totalDeaths',
    falsification: {
      metric: 'totalDeaths', relation: 'less-than',
      rationale: 'Hipoteza sprawdzana: priorytetowa ochrona seniorów daje mniej zgonów niż brak takiej ochrony.',
    },
  },
] as const;

export type PreparednessResolutionStatus = 'GOVERNED' | 'NOT_AVAILABLE';

export interface PreparednessResolution {
  contractVersion: string;
  status: PreparednessResolutionStatus;
  /** Dosłownie to, co napisał użytkownik — zapisujemy pytanie, nie parafrazę. */
  askedText: string;
  question: GovernedPreparednessQuestion | null;
  reason: string;
  /** Katalog pokazywany przy odmowie: użytkownik ma zobaczyć, co JEST dostępne. */
  available: readonly { questionId: string; question: string }[];
  /** Odcisk rozstrzygnięcia — wchodzi do prowieniencji przebiegu. */
  resolutionFingerprint: string;
}

function normalize(text: string): string {
  return text.trim().toLocaleLowerCase('pl-PL');
}

const CATALOG_SUMMARY = GOVERNED_PREPAREDNESS_QUESTIONS.map((entry) => ({ questionId: entry.questionId, question: entry.question }));

/**
 * Dopasowuje tekst do katalogu. Dopasowanie jest DOSŁOWNE: pytanie kanoniczne
 * albo jedna z zadeklarowanych fraz. Świadomie nie ma tu miary podobieństwa —
 * „prawie pasuje" to za mało, żeby uruchomić model i przypisać jego wynik do
 * cudzego pytania.
 */
export function resolvePreparednessQuestion(text: string, questionId?: string): PreparednessResolution {
  const askedText = text.trim();
  const normalized = normalize(askedText);
  const byId = questionId === undefined ? undefined : GOVERNED_PREPAREDNESS_QUESTIONS.find((entry) => entry.questionId === questionId);
  const matched = byId
    ?? GOVERNED_PREPAREDNESS_QUESTIONS.find((entry) =>
      normalized === normalize(entry.question)
      || entry.phrasing.some((phrase) => normalized.includes(normalize(phrase))));

  const base = { contractVersion: PREPAREDNESS_QUESTION_CONTRACT_VERSION, askedText, available: CATALOG_SUMMARY };
  if (matched === undefined) {
    return {
      ...base,
      status: 'NOT_AVAILABLE',
      question: null,
      reason: 'To pytanie nie jest związane z żadnym istniejącym kontraktem scenariusza. Genesis nie uruchamia scenariusza „zbliżonego" — wynik odpowiadałby wtedy na inne pytanie niż zadane.',
      resolutionFingerprint: fnv1a(canonicalJson({ status: 'NOT_AVAILABLE', askedText })),
    };
  }
  return {
    ...base,
    status: 'GOVERNED',
    question: matched,
    reason: `Pytanie przypisane do rządzonego kontraktu ${matched.questionId}: ${matched.governedDifference}`,
    resolutionFingerprint: fnv1a(canonicalJson({ status: 'GOVERNED', questionId: matched.questionId, levers: matched.levers })),
  };
}

/** Parametry żądania kontrfaktycznego wprost z rządzonych dźwigni — bez zgadywania. */
export function governedCounterfactualParameters(question: GovernedPreparednessQuestion): Record<string, string | number> {
  return {
    baselineScenarioId: question.baselineScenarioId,
    variantScenarioId: question.variantScenarioId,
    days: question.levers.days,
    stepsPerDay: question.levers.stepsPerDay,
    nAgents: question.levers.nAgents,
    initialInfected: question.levers.initialInfected,
    seed: question.levers.seed,
    baselineInterventionStartDay: question.levers.baselineInterventionStartDay,
    variantInterventionStartDay: question.levers.variantInterventionStartDay,
  };
}

/**
 * Katalog musi wskazywać wyłącznie scenariusze, które silnik zna i modeluje.
 * Wywoływane w teście: pytanie wskazujące na niemodelowany scenariusz byłoby
 * obietnicą przebiegu, którego nie da się wykonać.
 */
export function assertGovernedCatalog(catalog: readonly GovernedPreparednessQuestion[] = GOVERNED_PREPAREDNESS_QUESTIONS): void {
  const seen = new Set<string>();
  for (const entry of catalog) {
    if (seen.has(entry.questionId)) throw new Error(`Zduplikowane pytanie rządzone: ${entry.questionId}.`);
    seen.add(entry.questionId);
    for (const scenarioId of [entry.baselineScenarioId, entry.variantScenarioId]) {
      const definition = SCENARIOS[scenarioId];
      if (definition === undefined) throw new Error(`Pytanie ${entry.questionId} wskazuje nieznany scenariusz ${scenarioId}.`);
      if (definition.notModeledReason !== undefined) {
        throw new Error(`Pytanie ${entry.questionId} wskazuje niemodelowany scenariusz ${scenarioId}: ${definition.notModeledReason}`);
      }
    }
    if (entry.levers.days <= 0 || entry.levers.stepsPerDay <= 0 || entry.levers.nAgents <= 0) {
      throw new Error(`Pytanie ${entry.questionId} ma niepoprawne dźwignie.`);
    }
    if (entry.falsification.metric !== entry.primaryMetric) {
      throw new Error(`Pytanie ${entry.questionId}: kryterium falsyfikacji musi dotyczyć metryki pierwotnej.`);
    }
    if (entry.falsification.rationale.trim().length === 0) {
      throw new Error(`Pytanie ${entry.questionId}: kryterium falsyfikacji bez uzasadnienia nie jest prerejestracją.`);
    }
  }
}
