import { canonicalJson, fnv1a } from '../events/hash';
import { DEFAULT_HOSPITAL_CAPACITY, type HospitalCapacityParams } from '../simulation/hospitalResource';
import { SCENARIOS, runScenario, type ScenarioId, type ScenarioRun, type ScenarioSummary } from '../simulation/scenarioEngine';
import type { EpidemicCityParams } from '../simulation/epidemicCity';
import { DISCOVERY_LIMITATIONS, DISCOVERY_METRIC_KEYS, discoveryModelIdentity, type DiscoveryMetricKey } from './discoveryExecution';
import type { DiscoveryInitialConditions, DiscoveryModelIdentity } from './discoveryCase';

/**
 * PARAMETER SWEEP — jeden REALNY przebieg na każdy punkt.
 *
 * Każdy punkt sweepu to osobne uruchomienie modelu, osobne wejście i osobny
 * odcisk wyniku. Nie ma tu interpolacji, dopasowania krzywej ani „przewidzenia"
 * punktu, którego nie policzono. Jeżeli punkt się nie wykonał, jest widoczny
 * jako niewykonany — nie znika i nie jest zastępowany sąsiadem.
 *
 * Sweep jest też jedynym miejscem, w którym relacje `monotonic-increase` i
 * `monotonic-decrease` z kryterium falsyfikacji mają sens: potrzebują serii
 * punktów, a nie dwóch ramion.
 */

export const SWEEP_VERSION = '1.0.0';

export type SweepPointStatus = 'COMPLETED' | 'INVALID_VALUE' | 'NOT_EXECUTED' | 'VALUE_NOT_APPLIED';
export type SweepStatus = 'COMPLETED' | 'BLOCKED_INVALID_PARAMETER' | 'BLOCKED_NOT_ENOUGH_POINTS' | 'NOT_MODELED';

/** Dopuszczalny zakres wartości parametru wraz z uzasadnieniem z kodu modelu. */
export interface SweepableParameter {
  key: string;
  target: 'epidemic' | 'hospital';
  min: number;
  max: number;
  integer: boolean;
  /** Skąd bierze się ten zakres — czytany z modelu, nie wymyślony. */
  boundsSource: string;
}

/**
 * Parametry, które da się przemiatać. Zakresy pochodzą z samego modelu:
 * ułamki są w nim zaciskane do [0,1], liczby dni i osób muszą być dodatnie.
 */
export const SWEEPABLE_PARAMETERS: Readonly<Record<string, SweepableParameter>> = {
  restrictions: { key: 'restrictions', target: 'epidemic', min: 0, max: 1, integer: false, boundsSource: 'interventions.ts zaciska poziom restrykcji do [0,1].' },
  mobility: { key: 'mobility', target: 'epidemic', min: 0, max: 1, integer: false, boundsSource: 'Mobilność to prawdopodobieństwo wyjścia, czyli ułamek [0,1].' },
  transmissionScale: { key: 'transmissionScale', target: 'epidemic', min: 0, max: 1, integer: false, boundsSource: 'Globalny mnożnik zaraźliwości opisany w EpidemicCityParams jako 0..1.' },
  ifr: { key: 'ifr', target: 'epidemic', min: 0, max: 1, integer: false, boundsSource: 'IFR to ułamek zakażonych, którzy umierają.' },
  severeRate: { key: 'severeRate', target: 'epidemic', min: 0, max: 1, integer: false, boundsSource: 'Odsetek ciężkich przebiegów kierowanych do szpitala.' },
  r0: { key: 'r0', target: 'epidemic', min: 0, max: 20, integer: false, boundsSource: 'Zakres R₀ zadeklarowany dla modelu epidemic-city w rejestrze routera.' },
  infectiousDays: { key: 'infectiousDays', target: 'epidemic', min: 0.25, max: 60, integer: false, boundsSource: 'Czas zakaźności dzieli β = R₀/D, więc musi być dodatni.' },
  incubationDays: { key: 'incubationDays', target: 'epidemic', min: 0, max: 60, integer: false, boundsSource: 'Czas inkubacji w dniach, nieujemny.' },
  contactRadius: { key: 'contactRadius', target: 'epidemic', min: 0, max: 200, integer: false, boundsSource: 'Promień kontaktu w pikselach świata modelu.' },
  totalBeds: { key: 'totalBeds', target: 'hospital', min: 0, max: 100000, integer: true, boundsSource: 'hospitalResource.ts przyjmuje nieujemną liczbę łóżek.' },
  icuBeds: { key: 'icuBeds', target: 'hospital', min: 0, max: 100000, integer: true, boundsSource: 'hospitalResource.ts przyjmuje nieujemną liczbę łóżek ICU.' },
  icuShareOfAdmissions: { key: 'icuShareOfAdmissions', target: 'hospital', min: 0, max: 1, integer: false, boundsSource: 'Udział przyjęć wymagających ICU, zaciskany do [0,1].' },
};

/**
 * Parametry, których świadomie NIE przemiatamy, wraz z powodem. To nie jest
 * ograniczenie techniczne — to informacja, że taki sweep byłby bez sensu albo
 * mierzyłby coś innego, niż autor sądzi.
 */
export const NON_SWEEPABLE_PARAMETERS: Readonly<Record<string, string>> = {
  isolate: 'To parametr logiczny (włączona/wyłączona izolacja), nie natężenie. Model nie ma pojęcia „intensywności izolacji", więc sweep 0,1…0,5 nie miałby odpowiednika w modelu.',
  seed: 'Ziarno nie jest dźwignią polityki. Zmienność między ziarnami bada wielokrotny przebieg (multi-run), nie sweep parametru.',
  nAgents: 'Zmiana populacji zmienia świat, a nie ustawienie interwencji; przebiegi przestałyby być porównywalne między punktami.',
  initialInfected: 'Zmiana liczby początkowo zakażonych zmienia warunki początkowe, a nie badaną dźwignię.',
};

export interface SweepSpec {
  question: string;
  scenario: ScenarioId;
  parameter: string;
  values: readonly number[];
  initialConditions: DiscoveryInitialConditions;
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
}

export interface SweepPoint {
  value: number;
  status: SweepPointStatus;
  inputFingerprint: string | null;
  runFingerprint: string | null;
  summary: ScenarioSummary | null;
  reason?: string;
}

export type MonotonicityVerdict = 'INCREASING' | 'DECREASING' | 'FLAT' | 'NON_MONOTONIC' | 'INSUFFICIENT_POINTS';

export interface SweepMonotonicity {
  metric: DiscoveryMetricKey;
  verdict: MonotonicityVerdict;
  values: readonly number[];
}

export interface SweepResult {
  contractVersion: string;
  sweepId: string;
  question: string;
  model: DiscoveryModelIdentity;
  scenario: ScenarioId;
  parameter: string;
  status: SweepStatus;
  points: readonly SweepPoint[];
  monotonicity: readonly SweepMonotonicity[];
  limitations: readonly string[];
  /**
   * Ustawione, gdy przemiatany parametr jest zadeklarowany przez sam scenariusz
   * — wtedy sweep świadomie nadpisuje wartość scenariusza i przestaje to być
   * „ten scenariusz" w czystej postaci.
   */
  scenarioOverrideNotice?: string;
  message: string;
}

function monotonicityOf(values: readonly number[]): MonotonicityVerdict {
  if (values.length < 3) return 'INSUFFICIENT_POINTS';
  let up = false;
  let down = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) up = true;
    if (values[i] < values[i - 1]) down = true;
  }
  if (up && down) return 'NON_MONOTONIC';
  if (up) return 'INCREASING';
  if (down) return 'DECREASING';
  return 'FLAT';
}

function runPoint(spec: SweepSpec, definition: SweepableParameter, value: number): { point: SweepPoint; run: ScenarioRun | null } {
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
    return {
      point: {
        value,
        status: 'INVALID_VALUE',
        inputFingerprint: null,
        runFingerprint: null,
        summary: null,
        reason: `Wartość poza dopuszczalnym zakresem [${definition.min}, ${definition.max}]. ${definition.boundsSource}`,
      },
      run: null,
    };
  }
  if (definition.integer && !Number.isInteger(value)) {
    return {
      point: {
        value,
        status: 'INVALID_VALUE',
        inputFingerprint: null,
        runFingerprint: null,
        summary: null,
        reason: `Parametr „${definition.key}" jest liczbą całkowitą; ${value} nie jest.`,
      },
      run: null,
    };
  }

  const baseParams = {
    ...spec.baseParams,
    nAgents: spec.initialConditions.nAgents,
    initialInfected: spec.initialConditions.initialInfected,
    seed: spec.initialConditions.seed,
  };
  const baseHospital = {
    ...(spec.hospitalCapacity ?? DEFAULT_HOSPITAL_CAPACITY),
    ...(definition.target === 'hospital' ? { [definition.key]: value } : {}),
  };
  const run = runScenario(spec.scenario, {
    days: spec.initialConditions.days,
    stepsPerDay: spec.initialConditions.stepsPerDay,
    baseParams,
    baseHospital,
    // Przemiatana wartość musi wygrać ze scenariuszem, inaczej sweep policzyłby
    // wielokrotnie ten sam przebieg.
    ...(definition.target === 'epidemic' ? { overrideParams: { [definition.key]: value } } : {}),
  });

  // Twarda weryfikacja: model MUSI był uruchomiony z przemiataną wartością.
  const applied = definition.target === 'epidemic'
    ? (run.params as unknown as Record<string, number>)[definition.key]
    : (run.hospitalCapacity as unknown as Record<string, number>)[definition.key];
  if (applied !== value) {
    return {
      point: {
        value,
        status: 'VALUE_NOT_APPLIED',
        inputFingerprint: run.inputFingerprint,
        runFingerprint: null,
        summary: null,
        reason: `Model został uruchomiony z ${definition.key}=${applied}, a nie ${value}; punktu nie wolno raportować jako policzonego.`,
      },
      run: null,
    };
  }

  return {
    point: {
      value,
      status: run.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_EXECUTED',
      inputFingerprint: run.inputFingerprint,
      runFingerprint: run.resultFingerprint,
      summary: run.summary,
      ...(run.status === 'COMPLETED' ? {} : { reason: run.notModeledReason ?? 'Przebieg nie zakończył się wynikiem.' }),
    },
    run,
  };
}

/**
 * Przemiata jeden parametr modelu, wykonując realny przebieg na każdą wartość.
 *
 * Odmawia, gdy parametr nie jest dźwignią, której da się nadać natężenie —
 * przykładowy sweep „izolacja 0,1…0,5" jest odrzucany, bo model zna izolację
 * wyłącznie jako włączoną albo wyłączoną.
 */
export function runParameterSweep(spec: SweepSpec): SweepResult {
  const model = discoveryModelIdentity();
  const sweepId = `sweep_${fnv1a(canonicalJson({
    v: SWEEP_VERSION,
    scenario: spec.scenario,
    parameter: spec.parameter,
    values: spec.values,
    initialConditions: spec.initialConditions,
    baseParams: spec.baseParams ?? null,
    hospitalCapacity: spec.hospitalCapacity ?? null,
  }))}`;
  const shell = {
    contractVersion: SWEEP_VERSION,
    sweepId,
    question: spec.question,
    model,
    scenario: spec.scenario,
    parameter: spec.parameter,
    points: [] as readonly SweepPoint[],
    monotonicity: [] as readonly SweepMonotonicity[],
    limitations: DISCOVERY_LIMITATIONS,
  };

  const notSweepable = NON_SWEEPABLE_PARAMETERS[spec.parameter];
  if (notSweepable) {
    return { ...shell, status: 'NOT_MODELED', message: `Nie można przemiatać „${spec.parameter}". ${notSweepable}` };
  }
  const definition = SWEEPABLE_PARAMETERS[spec.parameter];
  if (!definition) {
    return {
      ...shell,
      status: 'BLOCKED_INVALID_PARAMETER',
      message: `Model nie ma parametru „${spec.parameter}". Przemiatalne: ${Object.keys(SWEEPABLE_PARAMETERS).join(', ')}.`,
    };
  }
  if (spec.values.length < 2) {
    return { ...shell, status: 'BLOCKED_NOT_ENOUGH_POINTS', message: 'Sweep wymaga co najmniej dwóch wartości.' };
  }

  const declaredByScenario = definition.target === 'epidemic'
    && Object.prototype.hasOwnProperty.call(SCENARIOS[spec.scenario].epidemicOverrides, definition.key);
  const executed = spec.values.map((value) => runPoint(spec, definition, value));
  const points = executed.map((e) => e.point);
  const completed = points.filter((p) => p.status === 'COMPLETED');

  // Monotoniczność liczona WYŁĄCZNIE z punktów, które faktycznie się wykonały.
  const monotonicity = DISCOVERY_METRIC_KEYS.map((metric) => {
    const values = completed.map((p) => p.summary![metric]);
    return { metric, verdict: monotonicityOf(values), values };
  });

  return {
    ...shell,
    status: 'COMPLETED',
    points,
    monotonicity,
    ...(declaredByScenario
      ? {
          scenarioOverrideNotice: `Scenariusz „${SCENARIOS[spec.scenario].label}" sam ustala „${definition.key}"; sweep nadpisuje tę wartość, więc punkty nie są już tym scenariuszem w czystej postaci — pozostałe jego dźwignie działają nadal.`,
        }
      : {}),
    message: `Wykonano ${completed.length} z ${points.length} punktów, każdy jako osobny przebieg modelu.`,
  };
}
