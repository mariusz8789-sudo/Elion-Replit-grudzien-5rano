import { canonicalJson, fnv1a } from '../events/hash';
import type { CohortProfile } from '../agents/cohortModel';
import type { EpidemicCityParams } from './epidemicCity';
import type { HospitalCapacityParams } from './hospitalResource';
import {
  compareScenarios,
  runScenario,
  SCENARIO_ENGINE_VERSION,
  type ScenarioComparison,
  type ScenarioDaySample,
  type ScenarioId,
  type ScenarioRun,
} from './scenarioEngine';
import {
  buildSavedScenarioRunContext,
  isSavedScenarioRunContext,
  replaySavedScenarioRun,
  SCENARIO_MEMORY_CONTRACT_VERSION,
  type SavedScenarioReplayDifference,
  type SavedScenarioReplayStatus,
  type SavedScenarioRunContext,
} from './scenarioMemory';

/**
 * SILNIK KONTRFAKTYCZNY.
 *
 * „Co, gdyby zamiast tego…" — odpowiedź musi pochodzić z DWÓCH REALNYCH
 * PRZEBIEGÓW, nie z jednego przebiegu i doszacowanej różnicy. Ten moduł nie
 * dokłada fizyki: składa istniejący `runScenario` (dwa razy) z istniejącym
 * `compareScenarios` i dopisuje to, czego brakowało, żeby różnicę dało się
 * OBRONIĆ — dzień, w którym światy faktycznie się rozjechały, oraz odcisk
 * całości pozwalający porównanie odtworzyć.
 *
 * `firstDivergentDay` jest MIERZONY na seriach obu przebiegów, a nie
 * przyjmowany jako dzień wejścia interwencji: polityka wprowadzona w dniu 20
 * może nie zmienić stanu świata natychmiast i wtedy uczciwa odpowiedź brzmi
 * „rozjazd zaczął się później", a nie „w dniu 20".
 */
export const SCENARIO_COUNTERFACTUAL_CONTRACT_VERSION = '1.0.0';

export interface ScenarioCounterfactualSpec {
  baselineScenarioId: ScenarioId;
  variantScenarioId: ScenarioId;
  days: number;
  stepsPerDay: number;
  /** Wspólne warunki startowe — ta sama populacja i to samo ziarno w obu ramionach. */
  baseParams: Partial<EpidemicCityParams>;
  baseHospital?: HospitalCapacityParams;
  baseCohort?: CohortProfile;
  baselineInterventionStartDay?: number;
  variantInterventionStartDay?: number;
}

export interface ScenarioCounterfactual {
  contractVersion: string;
  engineVersion: string;
  spec: ScenarioCounterfactualSpec;
  baseline: ScenarioRun;
  variant: ScenarioRun;
  comparison: ScenarioComparison;
  /**
   * Pierwszy dzień, w którym stan epidemiczny obu przebiegów przestaje być
   * identyczny. `null`, gdy światy nie rozeszły się ani razu — wtedy różnica
   * wyniku, jeżeli jakakolwiek jest, pochodzi wyłącznie z warstwy szpitalnej.
   */
  firstDivergentDay: number | null;
  counterfactualFingerprint: string;
  epistemicStatus: 'SIMULATION';
}

const EPIDEMIC_FIELDS: readonly (keyof ScenarioDaySample)[] = [
  'susceptible', 'exposed', 'infectious', 'recovered', 'deceased', 'isolated', 'hospitalized',
];

/** Dzień rozjazdu z REALNYCH serii. Nie zakładamy, że polityka działa natychmiast. */
export function firstDivergentDay(baseline: readonly ScenarioDaySample[], variant: readonly ScenarioDaySample[]): number | null {
  const shared = Math.min(baseline.length, variant.length);
  for (let day = 0; day < shared; day++) {
    const a = baseline[day]!;
    const b = variant[day]!;
    if (EPIDEMIC_FIELDS.some((field) => a[field] !== b[field])) return a.day;
  }
  return baseline.length === variant.length ? null : shared;
}

function armOptions(spec: ScenarioCounterfactualSpec, interventionStartDay: number) {
  return {
    days: spec.days,
    stepsPerDay: spec.stepsPerDay,
    baseParams: spec.baseParams,
    ...(spec.baseHospital === undefined ? {} : { baseHospital: spec.baseHospital }),
    ...(spec.baseCohort === undefined ? {} : { baseCohort: spec.baseCohort }),
    interventionStartDay,
  };
}

/**
 * Wykonuje oba ramiona i porównuje je. Ramiona dzielą warunki startowe z
 * definicji — `baseParams`, `baseHospital` i `baseCohort` są wspólne, więc
 * jedyne, co wolno tu zmienić, to scenariusz i moment jego wejścia.
 */
export function runScenarioCounterfactual(spec: ScenarioCounterfactualSpec): ScenarioCounterfactual {
  const baseline = runScenario(spec.baselineScenarioId, armOptions(spec, spec.baselineInterventionStartDay ?? 0));
  const variant = runScenario(spec.variantScenarioId, armOptions(spec, spec.variantInterventionStartDay ?? 0));
  const comparison = compareScenarios(baseline, variant);
  const divergence = comparison.status === 'COMPLETED' ? firstDivergentDay(baseline.series, variant.series) : null;
  const fingerprintBase = {
    contractVersion: SCENARIO_COUNTERFACTUAL_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    baselineResult: baseline.resultFingerprint,
    variantResult: variant.resultFingerprint,
    comparisonStatus: comparison.status,
    metrics: comparison.metrics,
    changedParameters: comparison.changedParameters,
    changedTiming: comparison.changedTiming,
    changedCapacity: comparison.changedCapacity,
    firstDivergentDay: divergence,
  };
  return {
    contractVersion: SCENARIO_COUNTERFACTUAL_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    spec,
    baseline,
    variant,
    comparison,
    firstDivergentDay: divergence,
    counterfactualFingerprint: fnv1a(canonicalJson(fingerprintBase)),
    epistemicStatus: 'SIMULATION',
  };
}

/**
 * Zapisywalny kontrfaktyk. Oba ramiona są zapisywane tym samym kontraktem co
 * pojedynczy przebieg — nie powstaje drugi format pamięci ani drugi replay.
 */
export interface SavedScenarioCounterfactual {
  contractVersion: string;
  baseline: SavedScenarioRunContext;
  variant: SavedScenarioRunContext;
  comparisonStatus: ScenarioComparison['status'];
  changedParameters: readonly string[];
  changedTiming: readonly string[];
  changedCapacity: readonly string[];
  metrics: ScenarioComparison['metrics'];
  firstDivergentDay: number | null;
  counterfactualFingerprint: string;
  epistemicStatus: 'SIMULATION';
}

export function buildSavedScenarioCounterfactual(counterfactual: ScenarioCounterfactual): SavedScenarioCounterfactual {
  if (counterfactual.comparison.status !== 'COMPLETED') {
    throw new Error(`Kontrfaktyk nie jest porównywalny (${counterfactual.comparison.status}): ${counterfactual.comparison.message}`);
  }
  return {
    contractVersion: SCENARIO_MEMORY_CONTRACT_VERSION,
    baseline: buildSavedScenarioRunContext(counterfactual.baseline),
    variant: buildSavedScenarioRunContext(counterfactual.variant),
    comparisonStatus: counterfactual.comparison.status,
    changedParameters: counterfactual.comparison.changedParameters,
    changedTiming: counterfactual.comparison.changedTiming,
    changedCapacity: counterfactual.comparison.changedCapacity,
    metrics: counterfactual.comparison.metrics,
    firstDivergentDay: counterfactual.firstDivergentDay,
    counterfactualFingerprint: counterfactual.counterfactualFingerprint,
    epistemicStatus: 'SIMULATION',
  };
}

export function isSavedScenarioCounterfactual(value: unknown): value is SavedScenarioCounterfactual {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.contractVersion !== 'string' || saved.contractVersion.trim().length === 0) return false;
  if (!isSavedScenarioRunContext(saved.baseline) || !isSavedScenarioRunContext(saved.variant)) return false;
  if (saved.comparisonStatus !== 'COMPLETED') return false;
  const lists = ['changedParameters', 'changedTiming', 'changedCapacity'];
  if (!lists.every((key) => Array.isArray(saved[key]) && (saved[key] as unknown[]).every((entry) => typeof entry === 'string'))) return false;
  if (!Array.isArray(saved.metrics) || saved.metrics.length === 0) return false;
  const metricsValid = (saved.metrics as unknown[]).every((metric) => {
    if (!metric || typeof metric !== 'object') return false;
    const row = metric as Record<string, unknown>;
    return typeof row.key === 'string' && Number.isFinite(row.baseline) && Number.isFinite(row.variant)
      && Number.isFinite(row.absoluteDelta)
      && (row.relativeDeltaPercent === null || Number.isFinite(row.relativeDeltaPercent));
  });
  if (!metricsValid) return false;
  if (saved.firstDivergentDay !== null && !Number.isFinite(saved.firstDivergentDay)) return false;
  if (typeof saved.counterfactualFingerprint !== 'string' || saved.counterfactualFingerprint.trim().length === 0) return false;
  return saved.epistemicStatus === 'SIMULATION';
}

export interface SavedScenarioCounterfactualReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  baselineStatus: SavedScenarioReplayStatus | null;
  variantStatus: SavedScenarioReplayStatus | null;
  differences: readonly SavedScenarioReplayDifference[];
  /** Przeliczony kontrfaktyk — wyłącznie przy MATCH. */
  counterfactual: ScenarioCounterfactual | null;
}

/**
 * Odtwarza kontrfaktyk, wykonując OBA ramiona od nowa i przeliczając różnicę.
 * Werdykt jest najsłabszym ogniwem: BLOCKED bije DRIFT, DRIFT bije MATCH.
 * Sama zgodność odcisków ramion nie wystarcza — porównanie jest liczone
 * ponownie i zestawiane z zapisanymi metrykami, więc podmieniona różnica przy
 * nietkniętych ramionach też kończy się DRIFT.
 */
export function replaySavedScenarioCounterfactual(saved: unknown): SavedScenarioCounterfactualReplay {
  if (!isSavedScenarioCounterfactual(saved)) {
    return { status: 'BLOCKED', reason: 'Zapisany kontrfaktyk jest niekompletny albo uszkodzony.', baselineStatus: null, variantStatus: null, differences: [], counterfactual: null };
  }
  const baselineReplay = replaySavedScenarioRun(saved.baseline);
  const variantReplay = replaySavedScenarioRun(saved.variant);
  const armDifferences = [
    ...baselineReplay.differences.map((entry) => ({ ...entry, field: `baseline.${entry.field}` })),
    ...variantReplay.differences.map((entry) => ({ ...entry, field: `variant.${entry.field}` })),
  ];
  if (baselineReplay.status === 'BLOCKED' || variantReplay.status === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      reason: `Co najmniej jedno ramię nie dało się odtworzyć (baseline=${baselineReplay.status}, variant=${variantReplay.status}).`,
      baselineStatus: baselineReplay.status, variantStatus: variantReplay.status, differences: armDifferences, counterfactual: null,
    };
  }
  if (baselineReplay.run === null || variantReplay.run === null) {
    return {
      status: 'DRIFT',
      reason: `Ramiona odtworzyły się z werdyktem baseline=${baselineReplay.status}, variant=${variantReplay.status} — różnicy nie wolno na tym oprzeć.`,
      baselineStatus: baselineReplay.status, variantStatus: variantReplay.status, differences: armDifferences, counterfactual: null,
    };
  }

  const comparison = compareScenarios(baselineReplay.run, variantReplay.run);
  const divergence = comparison.status === 'COMPLETED' ? firstDivergentDay(baselineReplay.run.series, variantReplay.run.series) : null;
  const differences: SavedScenarioReplayDifference[] = [...armDifferences];
  if (comparison.status !== saved.comparisonStatus) {
    differences.push({ field: 'comparisonStatus', expected: saved.comparisonStatus, actual: comparison.status });
  }
  if (divergence !== saved.firstDivergentDay) {
    differences.push({ field: 'firstDivergentDay', expected: saved.firstDivergentDay, actual: divergence });
  }
  for (const metric of saved.metrics) {
    const current = comparison.metrics.find((entry) => entry.key === metric.key);
    if (current === undefined) {
      differences.push({ field: `metric.${metric.key}`, expected: metric.absoluteDelta, actual: null });
      continue;
    }
    if (current.baseline !== metric.baseline) differences.push({ field: `metric.${metric.key}.baseline`, expected: metric.baseline, actual: current.baseline });
    if (current.variant !== metric.variant) differences.push({ field: `metric.${metric.key}.variant`, expected: metric.variant, actual: current.variant });
    if (current.absoluteDelta !== metric.absoluteDelta) differences.push({ field: `metric.${metric.key}.absoluteDelta`, expected: metric.absoluteDelta, actual: current.absoluteDelta });
  }

  if (differences.length > 0) {
    return {
      status: 'DRIFT',
      reason: `Odtworzony kontrfaktyk różni się w ${differences.length} ${differences.length === 1 ? 'polu' : 'polach'}: ${differences.map((entry) => entry.field).join(', ')}.`,
      baselineStatus: baselineReplay.status, variantStatus: variantReplay.status, differences, counterfactual: null,
    };
  }

  return {
    status: 'MATCH',
    reason: 'Oba ramiona policzono od nowa, a różnica między nimi odtworzyła się co do metryki.',
    baselineStatus: 'MATCH',
    variantStatus: 'MATCH',
    differences: [],
    counterfactual: {
      contractVersion: SCENARIO_COUNTERFACTUAL_CONTRACT_VERSION,
      engineVersion: SCENARIO_ENGINE_VERSION,
      spec: {
        baselineScenarioId: saved.baseline.scenarioId,
        variantScenarioId: saved.variant.scenarioId,
        days: saved.baseline.days,
        stepsPerDay: saved.baseline.stepsPerDay,
        baseParams: saved.baseline.preInterventionParams,
        baseHospital: saved.baseline.preInterventionHospital,
        baseCohort: saved.baseline.cohort,
        baselineInterventionStartDay: saved.baseline.interventionStartDay,
        variantInterventionStartDay: saved.variant.interventionStartDay,
      },
      baseline: baselineReplay.run,
      variant: variantReplay.run,
      comparison,
      firstDivergentDay: divergence,
      counterfactualFingerprint: saved.counterfactualFingerprint,
      epistemicStatus: 'SIMULATION',
    },
  };
}
