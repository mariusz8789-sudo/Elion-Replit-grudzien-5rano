import { canonicalJson, fnv1a } from '../events/hash';
import { EpidemicCitySimulation, DEFAULT_CITY_PARAMS, type EpidemicCityParams } from './epidemicCity';
import {
  evaluateHospitalState,
  peakHospitalPressure,
  DEFAULT_HOSPITAL_CAPACITY,
  type HospitalCapacityParams,
  type HospitalState,
} from './hospitalResource';

/**
 * SCENARIO ENGINE — nazwane, powtarzalne, porównywalne przebiegi polityk.
 *
 * DLACZEGO ISTNIEJE
 * Model epidemii potrafi przyjąć parametry, ale nie ma pojęcia „scenariusza":
 * nie da się powiedzieć „uruchom IZOLACJĘ i porównaj z bazą", nie da się tego
 * odtworzyć ani udowodnić, że dwa przebiegi różni tylko polityka. Bez tego nie
 * ma wniosku naukowego — jest pojedynczy wykres.
 *
 * ZASADY
 *  - Scenariusz to WYŁĄCZNIE nadpisanie realnych parametrów modelu. Silnik nie
 *    dokłada własnej mechaniki epidemii ani własnych wyników.
 *  - Każdy przebieg niesie ziarno i odcisk wejścia, więc jest odtwarzalny.
 *    `replayScenario` faktycznie przelicza model i porównuje odcisk wyniku —
 *    to dowód, a nie deklaracja.
 *  - Polityka bez dźwigni w modelu NIE JEST udawana. Zwraca status
 *    `NOT_MODELED` i pustą serię; nigdy podrobiony przebieg.
 *  - Nie duplikujemy Scenario Capsule z Experiment Fabric: tamto jest kapsułą
 *    nad `ExperimentRun` silników backendowych, to jest warstwa polityk nad
 *    modelem miasta. Hashowanie jest wspólne (`core/events/hash`).
 */

export const SCENARIO_ENGINE_VERSION = '1.0.0';

export type ScenarioId =
  | 'BASELINE'
  | 'ISOLATION'
  | 'CONTACT_REDUCTION'
  | 'HEALTHCARE_EXPANSION'
  | 'SCHOOL_CLOSURE_ONLY'
  | 'TRANSPORT_REDUCTION'
  | 'VACCINATION';

export type ScenarioStatus = 'COMPLETED' | 'NOT_MODELED';

export interface ScenarioDefinition {
  id: ScenarioId;
  label: string;
  /** Co ta polityka realnie zmienia — po ludzku, dla raportu. */
  rationale: string;
  /** Nadpisania parametrów epidemii. Puste = scenariusz nie dotyka epidemii. */
  epidemicOverrides: Partial<EpidemicCityParams>;
  /** Nadpisania pojemności systemu ochrony zdrowia. */
  hospitalOverrides: Partial<HospitalCapacityParams>;
  /** Ustawione, gdy model NIE MA dźwigni dla tej polityki. */
  notModeledReason?: string;
}

/**
 * Katalog scenariuszy. Każdy modelowany scenariusz odwzorowuje się na dźwignię,
 * która ISTNIEJE w `EpidemicCityParams` lub w pojemności szpitala.
 */
export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioDefinition>> = {
  BASELINE: {
    id: 'BASELINE',
    label: 'Baza — brak interwencji',
    rationale: 'Punkt odniesienia: żadnych restrykcji, żadnej izolacji objawowych.',
    epidemicOverrides: { restrictions: 0, isolate: false },
    hospitalOverrides: {},
  },
  ISOLATION: {
    id: 'ISOLATION',
    label: 'Izolacja objawowych',
    rationale: 'Wykryci zakaźni trafiają do izolatki — model kieruje ich poza obieg kontaktów.',
    epidemicOverrides: { restrictions: 0, isolate: true },
    hospitalOverrides: {},
  },
  CONTACT_REDUCTION: {
    id: 'CONTACT_REDUCTION',
    label: 'Redukcja kontaktów (restrykcje 0,6)',
    rationale:
      'Dźwignia restrykcji obniża mobilność i zaraźliwość na kontakt oraz zamyka szkołę i sklep — dokładnie tak, jak liczy to interventionEffects().',
    epidemicOverrides: { restrictions: 0.6, isolate: false },
    hospitalOverrides: {},
  },
  HEALTHCARE_EXPANSION: {
    id: 'HEALTHCARE_EXPANSION',
    label: 'Rozbudowa systemu ochrony zdrowia',
    rationale:
      'Więcej łóżek i miejsc ICU. UWAGA: przy wyłączonym sprzężeniu śmiertelności (domyślnie) ta polityka nie zmienia przebiegu epidemii — zmienia wyłącznie obciążenie systemu. To realna właściwość modelu, nie ukryty efekt.',
    epidemicOverrides: {},
    hospitalOverrides: { totalBeds: 72, icuBeds: 18 },
  },
  SCHOOL_CLOSURE_ONLY: {
    id: 'SCHOOL_CLOSURE_ONLY',
    label: 'Zamknięcie samych szkół',
    rationale: 'Nie do wyrażenia w tym modelu.',
    epidemicOverrides: {},
    hospitalOverrides: {},
    notModeledReason:
      'Model zamyka szkołę wyłącznie jako skutek uboczny dźwigni restrykcji (>= 0,35), razem ze spadkiem mobilności i zaraźliwości. Nie ma niezależnego parametru zamknięcia szkół, więc efektu tej polityki nie da się odseparować.',
  },
  TRANSPORT_REDUCTION: {
    id: 'TRANSPORT_REDUCTION',
    label: 'Ograniczenie transportu zbiorowego',
    rationale: 'Nie do wyrażenia w tym modelu.',
    epidemicOverrides: {},
    hospitalOverrides: {},
    notModeledReason:
      'Model nie ma transportu zbiorowego: brak linii, przystanków, pojazdów i pasażerów. Agenci przemieszczają się bezpośrednio między obiektami.',
  },
  VACCINATION: {
    id: 'VACCINATION',
    label: 'Szczepienia',
    rationale: 'Nie do wyrażenia w tym modelu.',
    epidemicOverrides: {},
    hospitalOverrides: {},
    notModeledReason:
      'Model ma przedziały S/E/I/R/D bez odporności nabytej inaczej niż przez przechorowanie. Brak parametru pokrycia, skuteczności i opóźnienia odpowiedzi immunologicznej.',
  },
};

/** Scenariusze, których ten model nie potrafi wyrazić — deklaracja, nie zaślepka. */
export const SCENARIOS_NOT_MODELED: readonly ScenarioId[] = Object.values(SCENARIOS)
  .filter((s) => s.notModeledReason !== undefined)
  .map((s) => s.id);

export interface ScenarioRunOptions {
  /** Ile dni symulacji przeliczyć. */
  days?: number;
  /** Ile kroków na dzień (krok = 1/samplesPerDay dnia). */
  stepsPerDay?: number;
  /** Parametry wyjściowe modelu, przed nadpisaniem przez scenariusz. */
  baseParams?: Partial<EpidemicCityParams>;
  /** Pojemność placówki, przed nadpisaniem przez scenariusz. */
  baseHospital?: HospitalCapacityParams;
  /**
   * Nadpisania stosowane PO scenariuszu. Służą przemiataniu dźwigni, którą sam
   * scenariusz deklaruje — bez tego wartość scenariusza zawsze by wygrywała i
   * sweep po cichu liczyłby pięć razy to samo. Wchodzą do `params`, więc są
   * widoczne w odcisku wejścia.
   */
  overrideParams?: Partial<EpidemicCityParams>;
}

export const DEFAULT_SCENARIO_RUN: Required<Pick<ScenarioRunOptions, 'days' | 'stepsPerDay'>> = {
  days: 60,
  stepsPerDay: 4,
};

/** Pojedynczy dzień przebiegu — liczby prosto z modelu plus księgowość szpitalna. */
export interface ScenarioDaySample {
  day: number;
  susceptible: number;
  exposed: number;
  infectious: number;
  recovered: number;
  deceased: number;
  isolated: number;
  hospitalized: number;
  hospital: HospitalState;
}

export interface ScenarioSummary {
  population: number;
  peakInfectious: number;
  peakInfectiousDay: number;
  totalDeaths: number;
  /** Odsetek populacji, który przeszedł zakażenie (R + D) na koniec przebiegu. */
  attackRate: number;
  peakBedOccupancy: number;
  peakIcuOccupancy: number;
  totalUnmetCareDays: number;
  firstCriticalDay: number | null;
}

export interface ScenarioRun {
  contractVersion: string;
  scenarioId: ScenarioId;
  label: string;
  status: ScenarioStatus;
  /** Pełne, rozwiązane parametry użyte w przebiegu — nic domyślnego w ukryciu. */
  params: EpidemicCityParams;
  hospitalCapacity: HospitalCapacityParams;
  days: number;
  stepsPerDay: number;
  /** Odcisk WEJŚCIA: identyczny odcisk => identyczne warunki startowe. */
  inputFingerprint: string;
  /** Odcisk WYNIKU: podstawa dowodu odtwarzalności. Pusty dla NOT_MODELED. */
  resultFingerprint: string | null;
  series: readonly ScenarioDaySample[];
  summary: ScenarioSummary | null;
  /** Wypełnione tylko dla NOT_MODELED — dlaczego model tego nie potrafi. */
  notModeledReason?: string;
}

function resolveParams(
  def: ScenarioDefinition,
  base: Partial<EpidemicCityParams> = {},
  override: Partial<EpidemicCityParams> = {},
): EpidemicCityParams {
  return { ...DEFAULT_CITY_PARAMS, ...base, ...def.epidemicOverrides, ...override };
}

function resolveHospital(def: ScenarioDefinition, base: HospitalCapacityParams = DEFAULT_HOSPITAL_CAPACITY): HospitalCapacityParams {
  return { ...base, ...def.hospitalOverrides };
}

/**
 * Uruchamia nazwany scenariusz na realnym modelu.
 *
 * Scenariusz nadpisuje wyłącznie parametry; cała dynamika pochodzi z
 * `EpidemicCitySimulation`. Przy tym samym ziarnie wynik jest identyczny.
 */
export function runScenario(scenarioId: ScenarioId, options: ScenarioRunOptions = {}): ScenarioRun {
  const def = SCENARIOS[scenarioId];
  const days = options.days ?? DEFAULT_SCENARIO_RUN.days;
  const stepsPerDay = Math.max(1, Math.floor(options.stepsPerDay ?? DEFAULT_SCENARIO_RUN.stepsPerDay));
  const params = resolveParams(def, options.baseParams, options.overrideParams);
  const hospitalCapacity = resolveHospital(def, options.baseHospital);
  const inputFingerprint = fnv1a(
    canonicalJson({ v: SCENARIO_ENGINE_VERSION, scenarioId, params, hospitalCapacity, days, stepsPerDay }),
  );

  const shell: Omit<ScenarioRun, 'status' | 'series' | 'summary' | 'resultFingerprint'> = {
    contractVersion: SCENARIO_ENGINE_VERSION,
    scenarioId,
    label: def.label,
    params,
    hospitalCapacity,
    days,
    stepsPerDay,
    inputFingerprint,
  };

  // Polityka bez dźwigni w modelu: zwracamy pustkę z powodem, nie podrobiony przebieg.
  if (def.notModeledReason !== undefined) {
    return {
      ...shell,
      status: 'NOT_MODELED',
      resultFingerprint: null,
      series: [],
      summary: null,
      notModeledReason: def.notModeledReason,
    };
  }

  const sim = new EpidemicCitySimulation(params);
  const dt = 1 / stepsPerDay;
  const series: ScenarioDaySample[] = [];

  for (let day = 1; day <= days; day++) {
    for (let step = 0; step < stepsPerDay; step++) sim.tick(dt);
    const s = sim.stats();
    series.push({
      day: s.dzien,
      susceptible: s.S,
      exposed: s.E,
      infectious: s.I,
      recovered: s.R,
      deceased: s.D,
      isolated: s.izolowani,
      hospitalized: s.hospitalizowani,
      hospital: evaluateHospitalState({ day: s.dzien, hospitalizedNow: s.hospitalizowani }, hospitalCapacity),
    });
  }

  const population = sim.stats().agenci;
  const pressure = peakHospitalPressure(series.map((d) => d.hospital));
  let peakInfectious = 0;
  let peakInfectiousDay = 0;
  for (const d of series) {
    if (d.infectious > peakInfectious) {
      peakInfectious = d.infectious;
      peakInfectiousDay = d.day;
    }
  }
  const last = series[series.length - 1];
  const summary: ScenarioSummary = {
    population,
    peakInfectious,
    peakInfectiousDay,
    totalDeaths: last ? last.deceased : 0,
    attackRate: last && population > 0 ? (last.recovered + last.deceased) / population : 0,
    peakBedOccupancy: pressure.peakBedOccupancy,
    peakIcuOccupancy: pressure.peakIcuOccupancy,
    totalUnmetCareDays: pressure.totalUnmetCareDays,
    firstCriticalDay: pressure.firstCriticalDay,
  };

  return {
    ...shell,
    status: 'COMPLETED',
    // Odcisk wyniku liczony z samego przebiegu epidemii — niezależny od tego,
    // jak nazwaliśmy scenariusz.
    resultFingerprint: fnv1a(
      canonicalJson(series.map((d) => [d.day, d.susceptible, d.exposed, d.infectious, d.recovered, d.deceased])),
    ),
    series,
    summary,
  };
}

export type ScenarioReplayStatus = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE';

export interface ScenarioReplay {
  status: ScenarioReplayStatus;
  scenarioId: ScenarioId;
  expectedResultFingerprint: string | null;
  actualResultFingerprint: string | null;
  message: string;
}

/**
 * Odtwarza przebieg z jego własnych zapisanych wejść i porównuje odcisk wyniku.
 * To realne przeliczenie modelu, a nie odczyt zapisanej odpowiedzi.
 */
export function replayScenario(run: ScenarioRun): ScenarioReplay {
  if (run.status === 'NOT_MODELED') {
    return {
      status: 'NOT_COMPARABLE',
      scenarioId: run.scenarioId,
      expectedResultFingerprint: null,
      actualResultFingerprint: null,
      message: 'Scenariusz nie jest modelowany — nie ma czego odtwarzać.',
    };
  }
  const replayed = runScenario(run.scenarioId, {
    days: run.days,
    stepsPerDay: run.stepsPerDay,
    baseParams: run.params,
    baseHospital: run.hospitalCapacity,
  });
  const matched = replayed.resultFingerprint === run.resultFingerprint;
  return {
    status: matched ? 'MATCH' : 'DRIFT',
    scenarioId: run.scenarioId,
    expectedResultFingerprint: run.resultFingerprint,
    actualResultFingerprint: replayed.resultFingerprint,
    message: matched
      ? 'Przebieg odtworzony bit w bit z zapisanych wejść.'
      : 'Odtworzenie dało inny przebieg — wejścia nie opisują w pełni wyniku.',
  };
}

export type ScenarioComparisonStatus = 'COMPLETED' | 'BLOCKED_NOT_MODELED' | 'BLOCKED_NOT_COMPARABLE';

export interface ScenarioMetricDelta {
  key: string;
  baseline: number;
  variant: number;
  absoluteDelta: number;
  relativeDeltaPercent: number | null;
}

export interface ScenarioComparison {
  contractVersion: string;
  status: ScenarioComparisonStatus;
  baselineScenario: ScenarioId;
  variantScenario: ScenarioId;
  /** Które parametry faktycznie się różnią — dowód, że porównujemy politykę. */
  changedParameters: readonly string[];
  metrics: readonly ScenarioMetricDelta[];
  message: string;
}

function delta(key: string, baseline: number, variant: number): ScenarioMetricDelta {
  return {
    key,
    baseline,
    variant,
    absoluteDelta: variant - baseline,
    relativeDeltaPercent: baseline === 0 ? null : ((variant - baseline) / baseline) * 100,
  };
}

/**
 * Porównuje dwa przebiegi. Blokuje porównanie, gdy różnią się czymś więcej niż
 * polityką (inna populacja lub inne ziarno) — inaczej różnica nie byłaby
 * przypisywalna interwencji.
 */
export function compareScenarios(baseline: ScenarioRun, variant: ScenarioRun): ScenarioComparison {
  const base = {
    contractVersion: SCENARIO_ENGINE_VERSION,
    baselineScenario: baseline.scenarioId,
    variantScenario: variant.scenarioId,
  };

  if (baseline.status === 'NOT_MODELED' || variant.status === 'NOT_MODELED') {
    return {
      ...base,
      status: 'BLOCKED_NOT_MODELED',
      changedParameters: [],
      metrics: [],
      message: 'Co najmniej jeden scenariusz nie jest modelowany — porównanie byłoby zmyśleniem różnicy.',
    };
  }

  const changedParameters = (Object.keys(baseline.params) as (keyof EpidemicCityParams)[])
    .filter((k) => baseline.params[k] !== variant.params[k])
    .map((k) => String(k))
    .sort();

  if (baseline.params.seed !== variant.params.seed || baseline.params.nAgents !== variant.params.nAgents) {
    return {
      ...base,
      status: 'BLOCKED_NOT_COMPARABLE',
      changedParameters,
      metrics: [],
      message: 'Przebiegi różnią się ziarnem lub populacją — różnicy nie da się przypisać interwencji.',
    };
  }

  const b = baseline.summary!;
  const v = variant.summary!;
  return {
    ...base,
    status: 'COMPLETED',
    changedParameters,
    metrics: [
      delta('peakInfectious', b.peakInfectious, v.peakInfectious),
      delta('peakInfectiousDay', b.peakInfectiousDay, v.peakInfectiousDay),
      delta('totalDeaths', b.totalDeaths, v.totalDeaths),
      delta('attackRate', b.attackRate, v.attackRate),
      delta('peakBedOccupancy', b.peakBedOccupancy, v.peakBedOccupancy),
      delta('totalUnmetCareDays', b.totalUnmetCareDays, v.totalUnmetCareDays),
    ],
    message:
      changedParameters.length === 0
        ? 'Parametry epidemii identyczne — różnice mogą pochodzić wyłącznie z warstwy szpitalnej.'
        : `Różnica polityki: ${changedParameters.join(', ')}.`,
  };
}
