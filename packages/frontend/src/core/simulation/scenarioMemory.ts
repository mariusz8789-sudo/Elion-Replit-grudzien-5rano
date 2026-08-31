import { AGE_BANDS, type AgeBand, type BandMultipliers, type CohortProfile } from '../agents/cohortModel';
import { canonicalJson, fnv1a } from '../events/hash';
import type { EpidemicCityParams } from './epidemicCity';
import type { HospitalCapacityParams } from './hospitalResource';
import {
  runScenario,
  SCENARIOS,
  SCENARIO_ENGINE_VERSION,
  type ScenarioId,
  type ScenarioRun,
  type ScenarioSummary,
} from './scenarioEngine';

/**
 * TRWAŁA PAMIĘĆ PRZEBIEGU SCENARIUSZA.
 *
 * Przebieg Scenario Engine był dotąd ulotny: seria dobowa żyła w pamięci
 * procesu (`worldHandoff`), więc zamknięcie karty kasowało wynik, a łańcuch
 * SCENARIO → RUN → RESULT → ARTIFACT → MEMORY → RELOAD → REPLAY urywał się na
 * RESULT. Ten moduł domyka go bez tworzenia drugiego magazynu: zapisem zajmuje
 * się istniejąca Pamięć Naukowa (`core/scienceMemory.ts`), a tutaj mieszka
 * WYŁĄCZNIE kontrakt tego, co trzeba zapamiętać, i uczciwe odtworzenie.
 *
 * Decyzja projektowa, która odróżnia to od „zapisania wyniku": ZAPISUJEMY
 * WEJŚCIA I ODCISKI, NIE ODPOWIEDŹ. Po przeładowaniu seria dobowa nie jest
 * odczytywana z dysku — model liczy ją od nowa z zapisanych wejść, a dopiero
 * zgodność odcisków decyduje, czy wolno jej użyć. Dzięki temu:
 *
 *  - MATCH oznacza realne, powtórzone wykonanie modelu, a nie odczyt pliku;
 *  - podmieniony rekord w localStorage nie ma jak udawać wyniku, bo jego
 *    treść nigdy nie trafia do świata;
 *  - zmiana parametru daje DRIFT z nazwanymi polami różnicy, a nie ciszę.
 *
 * Fail-closed jest tu strukturalne, nie umowne: przy werdykcie innym niż
 * MATCH `run` pozostaje `null`, więc warstwa prezentacji fizycznie nie ma co
 * pokazać. Nie da się tego obejść „ostrożnym UI".
 */
export const SCENARIO_MEMORY_CONTRACT_VERSION = '1.0.0';

/**
 * Migawka podsumowania. Trzymana OBOK odcisku, nie zamiast niego: sam odcisk
 * wykrywa zmianę przeliczenia, ale nie wykrywa, że ktoś podmienił zapisane
 * liczby przy nietkniętym odcisku. Odtworzenie porównuje jedno i drugie.
 */
export interface SavedScenarioSummaryDigest {
  peakInfectious: number;
  peakInfectiousDay: number;
  totalDeaths: number;
  attackRate: number;
  peakBedOccupancy: number;
  peakIcuOccupancy: number;
  totalUnmetCareDays: number;
  firstCriticalDay: number | null;
  totalTransmissions: number;
  /** fnv1a(canonicalJson(summary)) — CAŁE podsumowanie, łącznie z pasmami wieku. */
  summaryFingerprint: string;
}

/**
 * Komplet wejść wystarczający, by policzyć przebieg od nowa. Jeśli czegoś tu
 * brakuje, odtworzenie musiałoby zgadywać — dlatego walidacja jest zerojedynkowa,
 * a brak pola kończy się BLOCKED, nigdy domyślną wartością.
 */
export interface SavedScenarioRunContext {
  contractVersion: string;
  engineVersion: string;
  scenarioId: ScenarioId;
  label: string;
  days: number;
  stepsPerDay: number;
  interventionStartDay: number;
  params: EpidemicCityParams;
  /** Stan sprzed interwencji — bez niego opóźnionego przebiegu nie da się odtworzyć. */
  preInterventionParams: EpidemicCityParams;
  hospitalCapacity: HospitalCapacityParams;
  preInterventionHospital: HospitalCapacityParams;
  cohort: CohortProfile;
  inputFingerprint: string;
  resultFingerprint: string;
  epidemicFingerprint: string;
  seriesLength: number;
  summaryDigest: SavedScenarioSummaryDigest;
  /** Model nie jest skalibrowany do żadnej rzeczywistej epidemii. */
  epistemicStatus: 'SIMULATION';
}

export type SavedScenarioReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface SavedScenarioReplayDifference {
  field: string;
  expected: string | number | null;
  actual: string | number | null;
}

export interface SavedScenarioReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  scenarioId: ScenarioId | null;
  expectedResultFingerprint: string | null;
  actualResultFingerprint: string | null;
  differences: readonly SavedScenarioReplayDifference[];
  /**
   * Przeliczony przebieg — JEDYNE dopuszczalne źródło serii po przeładowaniu.
   * `null` dla wszystkiego poza MATCH, żeby niezweryfikowany wynik nie miał
   * drogi do świata 3D.
   */
  run: ScenarioRun | null;
}

export function summaryDigest(summary: ScenarioSummary): SavedScenarioSummaryDigest {
  return {
    peakInfectious: summary.peakInfectious,
    peakInfectiousDay: summary.peakInfectiousDay,
    totalDeaths: summary.totalDeaths,
    attackRate: summary.attackRate,
    peakBedOccupancy: summary.peakBedOccupancy,
    peakIcuOccupancy: summary.peakIcuOccupancy,
    totalUnmetCareDays: summary.totalUnmetCareDays,
    firstCriticalDay: summary.firstCriticalDay,
    totalTransmissions: summary.totalTransmissions,
    summaryFingerprint: fnv1a(canonicalJson(summary)),
  };
}

/**
 * Buduje zapisywalny kontekst z realnego przebiegu. Przebieg niemodelowany lub
 * bez odcisku wyniku NIE JEST zapisywalny — pamięć nie przechowuje czegoś,
 * czego nie da się później odtworzyć i zweryfikować.
 */
export function buildSavedScenarioRunContext(run: ScenarioRun): SavedScenarioRunContext {
  if (run.status !== 'COMPLETED' || run.summary === null) {
    throw new Error(`Scenariusz ${run.scenarioId} nie został wykonany (${run.status}) — nie ma czego zapisać w pamięci.`);
  }
  if (run.resultFingerprint === null || run.epidemicFingerprint === null) {
    throw new Error(`Przebieg ${run.scenarioId} nie ma odcisku wyniku — zapis bez odcisku byłby niesprawdzalny.`);
  }
  return {
    contractVersion: SCENARIO_MEMORY_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    scenarioId: run.scenarioId,
    label: run.label,
    days: run.days,
    stepsPerDay: run.stepsPerDay,
    interventionStartDay: run.interventionStartDay,
    params: { ...run.params },
    preInterventionParams: { ...run.preInterventionParams },
    hospitalCapacity: { ...run.hospitalCapacity },
    preInterventionHospital: { ...run.preInterventionHospital },
    cohort: run.cohort,
    inputFingerprint: run.inputFingerprint,
    resultFingerprint: run.resultFingerprint,
    epidemicFingerprint: run.epidemicFingerprint,
    seriesLength: run.series.length,
    summaryDigest: summaryDigest(run.summary),
    epistemicStatus: 'SIMULATION',
  };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isBandMultipliers(value: unknown): value is BandMultipliers {
  if (!isRecord(value)) return false;
  return AGE_BANDS.every((band) => finite(value[band]));
}

function isEpidemicCityParams(value: unknown): value is EpidemicCityParams {
  if (!isRecord(value)) return false;
  const numbers: readonly (keyof EpidemicCityParams)[] = [
    'nAgents', 'initialInfected', 'r0', 'infectiousDays', 'incubationDays', 'ifr',
    'contactRadius', 'transmissionScale', 'restrictions', 'mobility', 'severeRate',
    'householdTransmissionScale', 'seed',
  ];
  if (!numbers.every((key) => finite(value[key]))) return false;
  return typeof value.isolate === 'boolean' && typeof value.closeSchools === 'boolean';
}

function isHospitalCapacityParams(value: unknown): value is HospitalCapacityParams {
  if (!isRecord(value)) return false;
  if (!finite(value.totalBeds) || !finite(value.icuBeds) || !finite(value.icuShareOfAdmissions)) return false;
  if (value.mortalityFeedback !== undefined && typeof value.mortalityFeedback !== 'boolean') return false;
  return value.unmetCareMortalityMultiplier === undefined || finite(value.unmetCareMortalityMultiplier);
}

function isCohortProfile(value: unknown): value is CohortProfile {
  if (!isRecord(value)) return false;
  const calibrations = ['NEUTRAL', 'REQUIRES_CALIBRATION', 'USER_SUPPLIED'];
  if (!nonEmpty(value.profileId) || typeof value.calibration !== 'string' || !calibrations.includes(value.calibration)) return false;
  if (typeof value.provenanceNote !== 'string') return false;
  if (!isRecord(value.ageBandBounds) || !finite(value.ageBandBounds.childMaxAge) || !finite(value.ageBandBounds.seniorMinAge)) return false;
  const multipliers = ['susceptibilityMultiplier', 'severityMultiplier', 'fatalityMultiplier', 'contactWeight'];
  if (!multipliers.every((key) => isBandMultipliers(value[key]))) return false;
  if (!Array.isArray(value.shieldedBands) || !value.shieldedBands.every((band) => AGE_BANDS.includes(band as AgeBand))) return false;
  return finite(value.shieldingEffectiveness);
}

function isSummaryDigest(value: unknown): value is SavedScenarioSummaryDigest {
  if (!isRecord(value)) return false;
  const numbers: readonly (keyof SavedScenarioSummaryDigest)[] = [
    'peakInfectious', 'peakInfectiousDay', 'totalDeaths', 'attackRate',
    'peakBedOccupancy', 'peakIcuOccupancy', 'totalUnmetCareDays', 'totalTransmissions',
  ];
  if (!numbers.every((key) => finite(value[key]))) return false;
  if (value.firstCriticalDay !== null && !finite(value.firstCriticalDay)) return false;
  return nonEmpty(value.summaryFingerprint);
}

/**
 * localStorage jest edytowalne poza aplikacją, więc rekord z pamięci jest
 * danymi wejściowymi z zewnątrz, nie zaufaną strukturą. Walidujemy pole po
 * polu; cokolwiek nie przejdzie, kończy się BLOCKED.
 */
export function isSavedScenarioRunContext(value: unknown): value is SavedScenarioRunContext {
  if (!isRecord(value)) return false;
  if (!nonEmpty(value.contractVersion) || !nonEmpty(value.engineVersion) || !nonEmpty(value.label)) return false;
  if (typeof value.scenarioId !== 'string' || !(value.scenarioId in SCENARIOS)) return false;
  if (!finite(value.days) || value.days <= 0) return false;
  if (!finite(value.stepsPerDay) || value.stepsPerDay <= 0) return false;
  if (!finite(value.interventionStartDay) || value.interventionStartDay < 0) return false;
  if (!isEpidemicCityParams(value.params) || !isEpidemicCityParams(value.preInterventionParams)) return false;
  if (!isHospitalCapacityParams(value.hospitalCapacity) || !isHospitalCapacityParams(value.preInterventionHospital)) return false;
  if (!isCohortProfile(value.cohort)) return false;
  if (!nonEmpty(value.inputFingerprint) || !nonEmpty(value.resultFingerprint) || !nonEmpty(value.epidemicFingerprint)) return false;
  if (!finite(value.seriesLength) || value.seriesLength <= 0) return false;
  if (!isSummaryDigest(value.summaryDigest)) return false;
  return value.epistemicStatus === 'SIMULATION';
}

function blocked(reason: string, scenarioId: ScenarioId | null = null, expected: string | null = null): SavedScenarioReplay {
  return { status: 'BLOCKED', reason, scenarioId, expectedResultFingerprint: expected, actualResultFingerprint: null, differences: [], run: null };
}

function compare(differences: SavedScenarioReplayDifference[], field: string, expected: string | number | null, actual: string | number | null): void {
  if (expected !== actual) differences.push({ field, expected, actual });
}

export interface ReplaySavedScenarioOptions {
  /**
   * Świadoma zmiana parametru nałożona na zapisane wejścia. Służy do
   * udowodnienia, że pamięć wykrywa różnicę: ten sam zapis policzony z inną
   * dźwignią MUSI dać DRIFT z nazwanym polem, a nie cichy MATCH.
   */
  overrideParams?: Partial<EpidemicCityParams>;
}

/**
 * Odtwarza zapisany przebieg PRZELICZAJĄC MODEL od nowa z zapisanych wejść i
 * porównując wynik z zapisanymi odciskami oraz zapisaną migawką podsumowania.
 * Nie jest to odczyt zapisanej odpowiedzi.
 */
export function replaySavedScenarioRun(saved: unknown, options: ReplaySavedScenarioOptions = {}): SavedScenarioReplay {
  if (!isSavedScenarioRunContext(saved)) {
    return blocked('Zapis scenariusza jest niekompletny albo uszkodzony — brak wejść wystarczających do odtworzenia.');
  }
  if (saved.contractVersion !== SCENARIO_MEMORY_CONTRACT_VERSION) {
    return blocked(
      `Zapis pochodzi z kontraktu ${saved.contractVersion}, a bieżący to ${SCENARIO_MEMORY_CONTRACT_VERSION} — odtworzenie nie byłoby porównywalne.`,
      saved.scenarioId, saved.resultFingerprint,
    );
  }
  if (saved.engineVersion !== SCENARIO_ENGINE_VERSION) {
    return blocked(
      `Zapis wykonano silnikiem ${saved.engineVersion}, a bieżący to ${SCENARIO_ENGINE_VERSION} — różnica odcisków nie byłaby dowodem driftu wyniku.`,
      saved.scenarioId, saved.resultFingerprint,
    );
  }

  let replayed: ScenarioRun;
  try {
    replayed = runScenario(saved.scenarioId, {
      days: saved.days,
      stepsPerDay: saved.stepsPerDay,
      baseParams: saved.preInterventionParams,
      overrideParams: { ...saved.params, ...options.overrideParams },
      baseHospital: saved.preInterventionHospital,
      baseCohort: saved.cohort,
      interventionStartDay: saved.interventionStartDay,
    });
  } catch (error) {
    return blocked(`Model nie policzył przebiegu ponownie: ${error instanceof Error ? error.message : String(error)}`, saved.scenarioId, saved.resultFingerprint);
  }

  if (replayed.status !== 'COMPLETED' || replayed.summary === null || replayed.resultFingerprint === null) {
    return blocked('Ponowne wykonanie nie dało kompletnego przebiegu — nie ma czego porównać.', saved.scenarioId, saved.resultFingerprint);
  }

  const actual = summaryDigest(replayed.summary);
  const differences: SavedScenarioReplayDifference[] = [];
  compare(differences, 'inputFingerprint', saved.inputFingerprint, replayed.inputFingerprint);
  compare(differences, 'resultFingerprint', saved.resultFingerprint, replayed.resultFingerprint);
  compare(differences, 'epidemicFingerprint', saved.epidemicFingerprint, replayed.epidemicFingerprint);
  compare(differences, 'seriesLength', saved.seriesLength, replayed.series.length);
  for (const key of Object.keys(actual) as (keyof SavedScenarioSummaryDigest)[]) {
    compare(differences, `summary.${key}`, saved.summaryDigest[key], actual[key]);
  }

  if (differences.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Odtworzony przebieg różni się od zapisanego w ${differences.length} ${differences.length === 1 ? 'polu' : 'polach'}: ${differences.map((entry) => entry.field).join(', ')}.`,
      scenarioId: saved.scenarioId,
      expectedResultFingerprint: saved.resultFingerprint,
      actualResultFingerprint: replayed.resultFingerprint,
      differences,
      run: null,
    };
  }

  return {
    status: 'MATCH',
    reason: 'Model policzył przebieg od nowa z zapisanych wejść i odtworzył identyczne odciski oraz identyczne podsumowanie.',
    scenarioId: saved.scenarioId,
    expectedResultFingerprint: saved.resultFingerprint,
    actualResultFingerprint: replayed.resultFingerprint,
    differences: [],
    run: replayed,
  };
}
