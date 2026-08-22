import { canonicalJson, fnv1a } from '../events/hash';
import { DEFAULT_HOSPITAL_CAPACITY } from '../simulation/hospitalResource';
import { runScenario, type ScenarioId, type ScenarioSummary } from '../simulation/scenarioEngine';
import { DISCOVERY_LIMITATIONS, DISCOVERY_METRIC_KEYS, discoveryModelIdentity, type DiscoveryMetricKey } from './discoveryExecution';
import type { DiscoveryModelIdentity, MultiRunSpec } from './discoveryCase';

export type { MultiRunSpec };

/**
 * MULTI-RUN — ten sam scenariusz na wielu ziarnach.
 *
 * Jedno ziarno to jedna realizacja procesu stochastycznego. Wielokrotny przebieg
 * pokazuje, jak bardzo wynik zależy od losowego przebiegu świata, a nie od
 * badanej dźwigni.
 *
 * ŚWIADOMIE NIE NAZYWAMY TEGO PRZEDZIAŁEM UFNOŚCI.
 * Przedział ufności zakłada model próbkowania i rozkład, których tu nie
 * postulujemy: to jest zwykły rozstęp i mediana z policzonych przebiegów.
 * Raportujemy min, max, medianę i PEŁNĄ listę wartości, żeby nikt nie musiał
 * wierzyć podsumowaniu na słowo.
 */

export const MULTI_RUN_VERSION = '1.0.0';

export interface MultiRunSeedResult {
  seed: number;
  status: 'COMPLETED' | 'NOT_EXECUTED';
  runFingerprint: string | null;
  summary: ScenarioSummary | null;
}

export interface MultiRunDispersion {
  metric: DiscoveryMetricKey;
  min: number;
  max: number;
  median: number;
  /** Wszystkie policzone wartości w kolejności ziaren — bez wygładzania. */
  distribution: readonly number[];
  /** Rozstęp; celowo NIE jest to miara niepewności statystycznej. */
  range: number;
}

export type MultiRunStatus = 'COMPLETED' | 'BLOCKED_NOT_ENOUGH_SEEDS' | 'BLOCKED_DUPLICATE_SEEDS';

export interface MultiRunResult {
  contractVersion: string;
  multiRunId: string;
  question: string;
  model: DiscoveryModelIdentity;
  scenario: ScenarioId;
  status: MultiRunStatus;
  runs: readonly MultiRunSeedResult[];
  dispersion: readonly MultiRunDispersion[];
  limitations: readonly string[];
  /** Jawne zastrzeżenie, czym te liczby NIE są. */
  statisticalNote: string;
  message: string;
}

export const STATISTICAL_NOTE =
  'Min, max, mediana i rozstęp opisują wyłącznie policzone przebiegi przy podanych ziarnach. To nie jest przedział ufności ani oszacowanie niepewności: nie postulujemy tu żadnego modelu próbkowania ani rozkładu populacji.';

/** Mediana z policzonych wartości; przy parzystej liczbie — średnia środkowych. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Uruchamia ten sam scenariusz na każdym ziarnie i raportuje rozrzut wyników.
 *
 * Odmawia, gdy ziaren jest mniej niż dwa (nie ma czego porównywać) albo gdy się
 * powtarzają (powtórzone ziarno da identyczny przebieg i fałszywie zawęziłoby
 * rozstęp).
 */
export function runMultiSeed(spec: MultiRunSpec): MultiRunResult {
  const model = discoveryModelIdentity();
  const multiRunId = `multi_${fnv1a(canonicalJson({
    v: MULTI_RUN_VERSION,
    scenario: spec.scenario,
    seeds: spec.seeds,
    initialConditions: spec.initialConditions,
    baseParams: spec.baseParams ?? null,
    hospitalCapacity: spec.hospitalCapacity ?? null,
  }))}`;
  const shell = {
    contractVersion: MULTI_RUN_VERSION,
    multiRunId,
    question: spec.question,
    model,
    scenario: spec.scenario,
    runs: [] as readonly MultiRunSeedResult[],
    dispersion: [] as readonly MultiRunDispersion[],
    limitations: DISCOVERY_LIMITATIONS,
    statisticalNote: STATISTICAL_NOTE,
  };

  if (spec.seeds.length < 2) {
    return { ...shell, status: 'BLOCKED_NOT_ENOUGH_SEEDS', message: 'Wielokrotny przebieg wymaga co najmniej dwóch różnych ziaren.' };
  }
  if (new Set(spec.seeds).size !== spec.seeds.length) {
    return {
      ...shell,
      status: 'BLOCKED_DUPLICATE_SEEDS',
      message: 'Powtórzone ziarno daje identyczny przebieg i sztucznie zawęziłoby rozstęp — ziarna muszą być różne.',
    };
  }

  const runs: MultiRunSeedResult[] = spec.seeds.map((seed) => {
    const run = runScenario(spec.scenario, {
      days: spec.initialConditions.days,
      stepsPerDay: spec.initialConditions.stepsPerDay,
      baseParams: {
        ...spec.baseParams,
        nAgents: spec.initialConditions.nAgents,
        initialInfected: spec.initialConditions.initialInfected,
        seed,
      },
      baseHospital: spec.hospitalCapacity ?? DEFAULT_HOSPITAL_CAPACITY,
    });
    return {
      seed,
      status: run.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_EXECUTED',
      runFingerprint: run.resultFingerprint,
      summary: run.summary,
    };
  });

  const completed = runs.filter((r) => r.status === 'COMPLETED' && r.summary !== null);
  const dispersion = DISCOVERY_METRIC_KEYS.map((metric) => {
    const distribution = completed.map((r) => r.summary![metric]);
    const min = distribution.length > 0 ? Math.min(...distribution) : Number.NaN;
    const max = distribution.length > 0 ? Math.max(...distribution) : Number.NaN;
    return { metric, min, max, median: median(distribution), distribution, range: max - min };
  });

  return {
    ...shell,
    status: 'COMPLETED',
    runs,
    dispersion,
    message: `Wykonano ${completed.length} z ${runs.length} przebiegów, po jednym na ziarno.`,
  };
}
