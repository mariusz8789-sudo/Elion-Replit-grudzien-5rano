import { canonicalJson, fnv1a } from '../events/hash';
import { analyseTransmissionClusters } from '../contacts/clusterAnalysis';
import type { HouseholdStructure, TransmissionEdge } from '../contacts/contactNetwork';
import {
  NEUTRAL_COHORT_PROFILE,
  AGE_BANDS,
  differentiatesCohorts,
  type AgeBand,
  type CohortProfile,
} from '../agents/cohortModel';
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
  | 'PROTECT_SENIORS'
  | 'PROTECT_CHILDREN'
  | 'PROTECT_ADULTS'
  | 'SCHOOL_CLOSURE'
  | 'HOUSEHOLD_PROTECTION'
  | 'SCHOOL_CLOSURE_ONLY'
  | 'TRANSPORT_REDUCTION'
  | 'VACCINATION';

/**
 * Siła ochrony priorytetowej: o ile spada skłonność chronionej grupy do
 * opuszczenia domu. To DŹWIGNIA POLITYKI, tej samej natury co `restrictions` —
 * nie oszacowanie empiryczne skuteczności żadnego realnego programu.
 */
export const PRIORITY_PROTECTION_EFFECTIVENESS = 0.75;

/**
 * Siła ochrony domowej: mnożnik zaraźliwości wewnątrz gospodarstwa. Dźwignia
 * polityki, nie zmierzona skuteczność żadnego realnego programu.
 */
export const HOUSEHOLD_PROTECTION_SCALE = 0.3;

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
  /**
   * Nadpisania profilu kohortowego — tak wyraża się ochrona priorytetowa
   * wybranej grupy. Puste dla polityk, które nie dotyczą struktury populacji.
   */
  cohortOverrides?: Partial<CohortProfile>;
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
  PROTECT_SENIORS: {
    id: 'PROTECT_SENIORS',
    label: 'Ochrona priorytetowa seniorów',
    rationale:
      'Ogranicza wychodzenie z domu w paśmie seniorów o 75%. Ochrona działa WYŁĄCZNIE przez zmniejszenie liczby kontaktów — model nie zna odporności nabytej inaczej niż przez przechorowanie, więc to nie jest szczepienie. Siła ochrony jest dźwignią polityki, nie oszacowaniem skuteczności realnego programu.',
    epidemicOverrides: { restrictions: 0, isolate: false },
    hospitalOverrides: {},
    cohortOverrides: { shieldedBands: ['senior'], shieldingEffectiveness: PRIORITY_PROTECTION_EFFECTIVENESS },
  },
  PROTECT_CHILDREN: {
    id: 'PROTECT_CHILDREN',
    label: 'Ochrona priorytetowa dzieci i młodzieży',
    rationale:
      'To samo ograniczenie kontaktów, skierowane do pasma dziecięcego. Porównywalne z ochroną seniorów przy identycznych warunkach początkowych.',
    epidemicOverrides: { restrictions: 0, isolate: false },
    hospitalOverrides: {},
    cohortOverrides: { shieldedBands: ['child'], shieldingEffectiveness: PRIORITY_PROTECTION_EFFECTIVENESS },
  },
  PROTECT_ADULTS: {
    id: 'PROTECT_ADULTS',
    label: 'Ochrona priorytetowa dorosłych',
    rationale:
      'To samo ograniczenie kontaktów, skierowane do pasma dorosłych — najliczniejszej grupy w tej populacji.',
    epidemicOverrides: { restrictions: 0, isolate: false },
    hospitalOverrides: {},
    cohortOverrides: { shieldedBands: ['adult'], shieldingEffectiveness: PRIORITY_PROTECTION_EFFECTIVENESS },
  },
  SCHOOL_CLOSURE: {
    id: 'SCHOOL_CLOSURE',
    label: 'Zamknięcie szkół',
    rationale:
      'Niezależna dźwignia `closeSchools`: szkoła znika z listy celów podróży, a mobilność, zaraźliwość na kontakt i pozostałe obiekty zostają nietknięte. Dzięki temu efekt SAMEGO zamknięcia szkół da się zmierzyć — wcześniej był nierozerwalnie sklejony z ogólnymi restrykcjami.',
    epidemicOverrides: { restrictions: 0, isolate: false, closeSchools: true },
    hospitalOverrides: {},
  },
  HOUSEHOLD_PROTECTION: {
    id: 'HOUSEHOLD_PROTECTION',
    label: 'Ochrona wewnątrz gospodarstwa domowego',
    rationale:
      'Obniża zaraźliwość WYŁĄCZNIE w kontakcie domowym (wspólny dom obu agentów). Siła jest dźwignią polityki, nie zmierzoną skutecznością realnego programu — model nie ma danych o skuteczności izolacji domowej.',
    epidemicOverrides: { restrictions: 0, isolate: false, householdTransmissionScale: HOUSEHOLD_PROTECTION_SCALE },
    hospitalOverrides: {},
  },
  SCHOOL_CLOSURE_ONLY: {
    id: 'SCHOOL_CLOSURE_ONLY',
    label: 'Zamknięcie samych szkół (wycofane)',
    rationale: 'Zastąpione realnym scenariuszem SCHOOL_CLOSURE.',
    epidemicOverrides: {},
    hospitalOverrides: {},
    notModeledReason:
      'Ten wpis pozostaje wyłącznie jako ślad po ograniczeniu, którego już nie ma. Model ma teraz niezależną dźwignię zamknięcia szkół — użyj SCHOOL_CLOSURE, które wykonuje realny przebieg.',
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
      'Model ma przedziały S/E/I/R/D bez odporności nabytej inaczej niż przez przechorowanie. Brak parametru pokrycia, skuteczności i opóźnienia odpowiedzi immunologicznej. Dostępnym zamiennikiem jest OCHRONA PRIORYTETOWA (PROTECT_*), która ogranicza kontakty wybranej grupy — to inna interwencja i nie wolno jej opisywać jako szczepień.',
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
  /** Profil kohortowy przed nadpisaniem przez scenariusz. Domyślnie neutralny. */
  baseCohort?: CohortProfile;
  /**
   * Nadpisania stosowane PO scenariuszu. Służą przemiataniu dźwigni, którą sam
   * scenariusz deklaruje — bez tego wartość scenariusza zawsze by wygrywała i
   * sweep po cichu liczyłby pięć razy to samo. Wchodzą do `params`, więc są
   * widoczne w odcisku wejścia.
   */
  overrideParams?: Partial<EpidemicCityParams>;
  /**
   * Dzień, od którego interwencja wchodzi w życie. Przed nim świat biegnie bez
   * niej. Pominięty albo 0 = interwencja obowiązuje od początku.
   *
   * To realna dźwignia czasu, nie kosmetyka: model dostaje zmianę parametru w
   * trakcie przebiegu przez `setParam`, więc wcześniejsze i późniejsze
   * uruchomienie tej samej polityki daje różne, policzalne wyniki.
   */
  interventionStartDay?: number;
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

/** Wynik w rozbiciu na pasmo wieku. Mianownikiem jest liczebność pasma. */
export interface BandOutcome {
  population: number;
  infected: number;
  deaths: number;
  hospitalizedEver: number;
  attackRate: number;
  /** Odsetek ZAKAŻONYCH w tym paśmie, którzy trafili do szpitala. */
  severeShareOfInfected: number;
  /** Odsetek ZAKAŻONYCH w tym paśmie, którzy zmarli. */
  caseFatalityOfInfected: number;
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
  /** Wyniki per pasmo wieku — liczone zawsze, także przy profilu neutralnym. */
  byBand: Record<AgeBand, BandOutcome>;
  /** Transmisje wg typu kontaktu, z realnego grafu transmisji przebiegu. */
  transmissionsByContactType: Record<string, number>;
  totalTransmissions: number;
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
  /** Dzień wejścia interwencji w życie; 0 = od początku przebiegu. */
  interventionStartDay: number;
  /**
   * Parametry obowiązujące PRZED interwencją. Równe `params`, gdy interwencja
   * działa od początku. Zapisane, bo bez nich opóźnionego przebiegu nie dałoby
   * się odtworzyć — replay musiałby zgadywać stan sprzed zmiany.
   */
  preInterventionParams: EpidemicCityParams;
  preInterventionHospital: HospitalCapacityParams;
  /** Profil kohortowy użyty w przebiegu — część prowenancji, nie ozdoba. */
  cohort: CohortProfile;
  /**
   * Pełny graf transmisji przebiegu: kto kogo zaraził, gdzie i jakim typem
   * kontaktu. Puste dla przebiegów NOT_MODELED.
   */
  transmissionGraph: readonly TransmissionEdge[];
  /** Gospodarstwa domowe wraz z zastrzeżeniem o pochodzeniu ich rozkładu. */
  households: HouseholdStructure | null;
  /** Odcisk WEJŚCIA: identyczny odcisk => identyczne warunki startowe. */
  inputFingerprint: string;
  /**
   * Odcisk PEŁNEGO WYNIKU: przebieg epidemii RAZEM z obciążeniem systemu
   * ochrony zdrowia. To jest tożsamość przebiegu do celów dowodowych — dwa
   * przebiegi o tej samej krzywej zakażeń, ale różnym obłożeniu łóżek, są
   * różnymi wynikami i muszą mieć różne odciski.
   */
  resultFingerprint: string | null;
  /**
   * Odcisk SAMEJ EPIDEMII (S/E/I/R/D). Pozwala wykazać, że warstwa szpitalna
   * niczego w epidemii nie zmieniła — przy wyłączonym sprzężeniu śmiertelności
   * rozbudowa szpitala musi zostawić ten odcisk nietknięty.
   */
  epidemicFingerprint: string | null;
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

/**
 * Wyniki per pasmo wieku z końcowego stanu modelu. Wszystkie liczniki pochodzą
 * z `stats()`; nic tu nie jest doszacowywane. Pasmo bez ani jednego zakażenia
 * dostaje udziały 0, a nie dzielenie przez zero.
 */
function bandOutcomes(stats: Record<string, number>): Record<AgeBand, BandOutcome> {
  const out = {} as Record<AgeBand, BandOutcome>;
  for (const band of AGE_BANDS) {
    const bandPopulation = stats[`pop_${band}`] ?? 0;
    const infected = stats[`zakazeni_${band}`] ?? 0;
    const deaths = stats[`zgony_${band}`] ?? 0;
    const hospitalizedEver = stats[`hospitalizowani_kiedykolwiek_${band}`] ?? 0;
    out[band] = {
      population: bandPopulation,
      infected,
      deaths,
      hospitalizedEver,
      attackRate: bandPopulation > 0 ? infected / bandPopulation : 0,
      severeShareOfInfected: infected > 0 ? hospitalizedEver / infected : 0,
      caseFatalityOfInfected: infected > 0 ? deaths / infected : 0,
    };
  }
  return out;
}

function resolveCohort(def: ScenarioDefinition, base: CohortProfile = NEUTRAL_COHORT_PROFILE): CohortProfile {
  return def.cohortOverrides ? { ...base, ...def.cohortOverrides } : base;
}

function resolveHospital(def: ScenarioDefinition, base: HospitalCapacityParams = DEFAULT_HOSPITAL_CAPACITY): HospitalCapacityParams {
  return { ...base, ...def.hospitalOverrides };
}

/**
 * Wartości dźwigni scenariusza sprzed interwencji — czyli to, co model miałby
 * bez tej polityki. Bierzemy je z bazy, a nie zgadujemy „stanu neutralnego".
 */
function pickBaseValues(def: ScenarioDefinition, options: ScenarioRunOptions): Partial<EpidemicCityParams> {
  const base = { ...DEFAULT_CITY_PARAMS, ...options.baseParams };
  const out: Record<string, number | boolean> = {};
  for (const key of [...Object.keys(def.epidemicOverrides), ...Object.keys(options.overrideParams ?? {})]) {
    out[key] = base[key as keyof EpidemicCityParams];
  }
  return out as Partial<EpidemicCityParams>;
}

/**
 * Uruchamia nazwany scenariusz na realnym modelu.
 *
 * Scenariusz nadpisuje wyłącznie parametry; cała dynamika pochodzi z
 * `EpidemicCitySimulation`. Przy tym samym ziarnie wynik jest identyczny.
 */
/**
 * Parametry, których nie da się zmienić w trakcie przebiegu: model przesiewa na
 * nich świat od nowa, więc opóźniona interwencja przestałaby być tym samym
 * eksperymentem.
 */
const STRUCTURAL_PARAMS: readonly (keyof EpidemicCityParams)[] = ['nAgents', 'initialInfected', 'seed'];

export function runScenario(scenarioId: ScenarioId, options: ScenarioRunOptions = {}): ScenarioRun {
  const def = SCENARIOS[scenarioId];
  const days = options.days ?? DEFAULT_SCENARIO_RUN.days;
  const stepsPerDay = Math.max(1, Math.floor(options.stepsPerDay ?? DEFAULT_SCENARIO_RUN.stepsPerDay));
  const params = resolveParams(def, options.baseParams, options.overrideParams);
  const hospitalCapacity = resolveHospital(def, options.baseHospital);
  const cohort = resolveCohort(def, options.baseCohort);
  const interventionStartDay = Math.max(0, Math.floor(options.interventionStartDay ?? 0));
  const timed = interventionStartDay > 0;
  const preInterventionParams: EpidemicCityParams = timed ? { ...params, ...pickBaseValues(def, options) } : params;
  const preInterventionHospital = timed ? (options.baseHospital ?? DEFAULT_HOSPITAL_CAPACITY) : hospitalCapacity;
  // Profil wchodzi do odcisku tylko wtedy, gdy w ogóle różnicuje grupy. Dzięki
  // temu przebiegi nietykające warstwy kohortowej zachowują dotychczasowe
  // odciski, a te z heterogenicznością są od nich odróżnialne.
  const inputFingerprint = fnv1a(
    canonicalJson({
      v: SCENARIO_ENGINE_VERSION, scenarioId, params, hospitalCapacity, days, stepsPerDay, interventionStartDay,
      ...(differentiatesCohorts(cohort) ? { cohort } : {}),
    }),
  );

  const shell: Omit<ScenarioRun, 'status' | 'series' | 'summary' | 'resultFingerprint' | 'epidemicFingerprint' | 'transmissionGraph' | 'households'> = {
    contractVersion: SCENARIO_ENGINE_VERSION,
    scenarioId,
    label: def.label,
    params,
    hospitalCapacity,
    days,
    stepsPerDay,
    interventionStartDay,
    preInterventionParams,
    preInterventionHospital,
    cohort,
    inputFingerprint,
  };

  // Polityka bez dźwigni w modelu: zwracamy pustkę z powodem, nie podrobiony przebieg.
  if (def.notModeledReason !== undefined) {
    return {
      ...shell,
      status: 'NOT_MODELED',
      resultFingerprint: null,
      epidemicFingerprint: null,
      series: [],
      summary: null,
      transmissionGraph: [],
      households: null,
      notModeledReason: def.notModeledReason,
    };
  }

  // Zmiany strukturalne przesiewają świat, więc nie da się ich włączyć w trakcie.
  // Liczy się faktyczna różnica przed/po, a nie samo wymienienie klucza.
  const timedStructural = timed
    ? STRUCTURAL_PARAMS.filter((key) => preInterventionParams[key] !== params[key])
    : [];
  if (timedStructural.length > 0) {
    return {
      ...shell,
      status: 'NOT_MODELED',
      resultFingerprint: null,
      epidemicFingerprint: null,
      series: [],
      summary: null,
      transmissionGraph: [],
      households: null,
      notModeledReason: `Opóźniona interwencja nie może zmieniać parametrów strukturalnych (${timedStructural.join(', ')}) — model przesiewa dla nich świat od nowa, więc przebieg przestałby być porównywalny.`,
    };
  }

  const sim = new EpidemicCitySimulation(preInterventionParams, undefined, undefined, cohort);
  const dt = 1 / stepsPerDay;
  const series: ScenarioDaySample[] = [];
  let interventionApplied = !timed;

  for (let day = 1; day <= days; day++) {
    if (timed && !interventionApplied && day >= interventionStartDay) {
      for (const [key, value] of Object.entries(params)) {
        if (preInterventionParams[key as keyof EpidemicCityParams] !== value) sim.setParam(key, value as number | boolean);
      }
      interventionApplied = true;
    }
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
      hospital: evaluateHospitalState(
        { day: s.dzien, hospitalizedNow: s.hospitalizowani },
        interventionApplied ? hospitalCapacity : preInterventionHospital,
      ),
    });
  }

  const finalStats = sim.stats();
  const transmissionGraph = [...sim.transmissionGraph()];
  const analysis = analyseTransmissionClusters(transmissionGraph);
  const population = finalStats.agenci;
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
    byBand: bandOutcomes(finalStats),
    transmissionsByContactType: Object.fromEntries(
      analysis.attribution.filter((a) => a.transmissions > 0).map((a) => [a.contactType, a.transmissions]),
    ),
    totalTransmissions: analysis.totalTransmissions,
  };

  return {
    ...shell,
    status: 'COMPLETED',
    transmissionGraph,
    households: sim.households(),
    // Odciski liczone z samego przebiegu — nie z nazwy scenariusza.
    resultFingerprint: fnv1a(
      canonicalJson(
        // Wszystko, co przebieg raportuje jako wynik dnia — łącznie z obłożeniem
        // względnym, bo to ono odróżnia „10 pacjentów na 16 łóżek" od
        // „10 pacjentów na 32 łóżka" przy identycznym rozdziale bezwzględnym.
        series.map((d) => [
          d.day, d.susceptible, d.exposed, d.infectious, d.recovered, d.deceased,
          d.hospital.occupiedBeds, d.hospital.occupiedIcu, d.hospital.unmetCare,
          d.hospital.bedOccupancy, d.hospital.icuOccupancy, d.hospital.status,
        ]),
      ),
    ),
    epidemicFingerprint: fnv1a(
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
  // Odtworzenie musi wyjść od stanu SPRZED interwencji i dołożyć ją w tym samym
  // dniu — inaczej opóźniony przebieg zostałby odtworzony jako natychmiastowy.
  const replayed = runScenario(run.scenarioId, {
    days: run.days,
    stepsPerDay: run.stepsPerDay,
    baseParams: run.preInterventionParams,
    overrideParams: run.params,
    baseHospital: run.preInterventionHospital,
    baseCohort: run.cohort,
    interventionStartDay: run.interventionStartDay,
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
  /**
   * Różnice w CZASIE wejścia interwencji. To osobny wymiar niż `params`: ta
   * sama polityka wprowadzona w innym dniu ma identyczne parametry, więc bez
   * tego pola kontrfaktyczne pytanie „a gdyby wejść 20 dni później" wyglądało
   * jak porównanie dwóch identycznych układów.
   */
  changedTiming: readonly string[];
  /** Różnice w pojemności placówki — dźwignia systemu opieki, nie epidemii. */
  changedCapacity: readonly string[];
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
      changedTiming: [],
      changedCapacity: [],
      metrics: [],
      message: 'Co najmniej jeden scenariusz nie jest modelowany — porównanie byłoby zmyśleniem różnicy.',
    };
  }

  const changedParameters = (Object.keys(baseline.params) as (keyof EpidemicCityParams)[])
    .filter((k) => baseline.params[k] !== variant.params[k])
    .map((k) => String(k))
    .sort();
  const changedTiming = baseline.interventionStartDay === variant.interventionStartDay ? [] : ['interventionStartDay'];
  const changedCapacity = (Object.keys(baseline.hospitalCapacity) as (keyof HospitalCapacityParams)[])
    .filter((k) => baseline.hospitalCapacity[k] !== variant.hospitalCapacity[k])
    .map((k) => String(k))
    .sort();
  const changed = { changedParameters, changedTiming, changedCapacity };

  if (baseline.params.seed !== variant.params.seed || baseline.params.nAgents !== variant.params.nAgents) {
    return {
      ...base,
      ...changed,
      status: 'BLOCKED_NOT_COMPARABLE',
      metrics: [],
      message: 'Przebiegi różnią się ziarnem lub populacją — różnicy nie da się przypisać interwencji.',
    };
  }

  // Różny horyzont to różna liczba dni, w których cokolwiek mogło się wydarzyć.
  // Bez tej bramki „mniej zgonów" w krótszym przebiegu wyglądałoby jak efekt
  // polityki, a byłoby wyłącznie efektem wcześniejszego zatrzymania zegara.
  if (baseline.days !== variant.days || baseline.stepsPerDay !== variant.stepsPerDay) {
    return {
      ...base,
      ...changed,
      status: 'BLOCKED_NOT_COMPARABLE',
      metrics: [],
      message: `Przebiegi mają różny horyzont (${baseline.days}×${baseline.stepsPerDay} vs ${variant.days}×${variant.stepsPerDay}) — różnicy nie da się przypisać interwencji.`,
    };
  }

  const b = baseline.summary!;
  const v = variant.summary!;
  return {
    ...base,
    ...changed,
    status: 'COMPLETED',
    metrics: [
      delta('peakInfectious', b.peakInfectious, v.peakInfectious),
      delta('peakInfectiousDay', b.peakInfectiousDay, v.peakInfectiousDay),
      delta('totalDeaths', b.totalDeaths, v.totalDeaths),
      delta('attackRate', b.attackRate, v.attackRate),
      delta('peakBedOccupancy', b.peakBedOccupancy, v.peakBedOccupancy),
      delta('totalUnmetCareDays', b.totalUnmetCareDays, v.totalUnmetCareDays),
    ],
    message:
      changedParameters.length > 0
        ? `Różnica polityki: ${changedParameters.join(', ')}.${changedTiming.length > 0 ? ` Różnica czasu wejścia: dzień ${baseline.interventionStartDay} → ${variant.interventionStartDay}.` : ''}`
        : changedTiming.length > 0
          ? `Ta sama polityka, inny moment wejścia: dzień ${baseline.interventionStartDay} → ${variant.interventionStartDay}. Parametry epidemii identyczne, więc cała różnica pochodzi z czasu.`
          : 'Parametry epidemii identyczne — różnice mogą pochodzić wyłącznie z warstwy szpitalnej.',
  };
}
