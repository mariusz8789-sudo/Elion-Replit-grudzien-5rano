import { canonicalJson, fnv1a } from '../events/hash';
import { getRouterModel } from '../experimentFabric/router';
import { DEFAULT_HOSPITAL_CAPACITY, HOSPITAL_NOT_MODELED, type HospitalCapacityParams } from '../simulation/hospitalResource';
import { WORLD_NOT_MODELED } from '../simulation/worldEngineContract';
import {
  SCENARIOS,
  compareScenarios,
  runScenario,
  type ScenarioId,
  type ScenarioRun,
} from '../simulation/scenarioEngine';
import {
  DISCOVERY_ENGINE_VERSION,
  highestEarnedStatus,
  type DiscoveryArm,
  type DiscoveryCase,
  type DiscoveryCaseSpec,
  type DiscoveryComparison,
  type DiscoveryModelIdentity,
} from './discoveryCase';

/**
 * DISCOVERY EXECUTION — realne wykonanie sprawy odkrycia.
 *
 * Każda liczba w sprawie pochodzi z uruchomienia modelu przez Scenario Engine.
 * Ten moduł nie liczy epidemii, nie generuje wyników i nie zna „oczekiwanej"
 * odpowiedzi. Jeżeli eksperymentu nie da się wykonać, sprawa kończy się
 * statusem NOT_MODELED albo BLOCKED — nigdy wynikiem zastępczym.
 *
 * Tożsamość modelu jest CZYTANA z rejestru routera (`epidemic-city`), a nie
 * wpisywana tutaj — wersja modelu ma jedno źródło prawdy.
 */

export const DISCOVERY_MODEL_ID = 'epidemic-city';

/** Metryki porównania — wszystkie pochodzą z podsumowania realnego przebiegu. */
export const DISCOVERY_METRIC_KEYS = [
  'peakInfectious',
  'peakInfectiousDay',
  'totalDeaths',
  'attackRate',
  'peakBedOccupancy',
  'peakIcuOccupancy',
  'totalUnmetCareDays',
] as const;

export type DiscoveryMetricKey = (typeof DISCOVERY_METRIC_KEYS)[number];

/** Granice ważności każdego wniosku z tego modelu — dołączane do sprawy. */
export const DISCOVERY_LIMITATIONS: readonly string[] = [
  'Model jest agentowy i edukacyjny; nie jest prognozą dla żadnej rzeczywistej populacji.',
  'Pojedynczy przebieg to jedna realizacja procesu stochastycznego przy ustalonym ziarnie.',
  'Warstwa szpitalna to księgowość pojemności; sprzężenie śmiertelności jest domyślnie wyłączone.',
  `Model nie obejmuje: ${[...WORLD_NOT_MODELED].join(', ')}.`,
  `Szpital nie obejmuje: ${[...HOSPITAL_NOT_MODELED].join(', ')}.`,
];

export function discoveryModelIdentity(): DiscoveryModelIdentity {
  const model = getRouterModel(DISCOVERY_MODEL_ID);
  if (!model) throw new Error(`Discovery Engine wymaga zarejestrowanego modelu ${DISCOVERY_MODEL_ID}.`);
  return {
    modelId: model.id,
    modelVersion: model.modelVersion,
    engine: model.engine,
    domainId: model.domainId,
  };
}

/** Parametry wspólne dla obu ramion — stąd bierze się porównywalność. */
function sharedBaseParams(spec: DiscoveryCaseSpec) {
  return {
    ...spec.baseParams,
    nAgents: spec.initialConditions.nAgents,
    initialInfected: spec.initialConditions.initialInfected,
    seed: spec.initialConditions.seed,
  };
}

export function fingerprintDiscoverySpec(spec: DiscoveryCaseSpec): string {
  return fnv1a(
    canonicalJson({
      v: DISCOVERY_ENGINE_VERSION,
      question: spec.question,
      hypothesis: spec.hypothesis,
      baselineScenario: spec.baselineScenario,
      variantScenario: spec.variantScenario,
      initialConditions: spec.initialConditions,
      baseParams: spec.baseParams ?? null,
      hospitalCapacity: spec.hospitalCapacity ?? null,
      replayTolerance: spec.replayTolerance ?? 0,
    }),
  );
}

function executeArm(
  spec: DiscoveryCaseSpec,
  scenario: ScenarioId,
  role: 'baseline' | 'variant',
  hospital: HospitalCapacityParams,
): DiscoveryArm {
  const run = runScenario(scenario, {
    days: spec.initialConditions.days,
    stepsPerDay: spec.initialConditions.stepsPerDay,
    baseParams: sharedBaseParams(spec),
    baseHospital: hospital,
  });
  return { armId: `${role}:${scenario}`, scenario, role, run, summary: run.summary };
}

function hospitalDifferences(a: ScenarioRun, b: ScenarioRun): string[] {
  const keys = new Set([...Object.keys(a.hospitalCapacity), ...Object.keys(b.hospitalCapacity)]);
  const out: string[] = [];
  for (const key of keys) {
    const left = (a.hospitalCapacity as unknown as Record<string, unknown>)[key];
    const right = (b.hospitalCapacity as unknown as Record<string, unknown>)[key];
    if (left !== right) out.push(`hospital.${key}`);
  }
  return out.sort();
}

/**
 * Nazwa dźwigni, do której należy dana różnica parametru.
 *
 * Pojemność szpitala jest zwiększana jako PAKIET (łóżka ogólne i ICU razem),
 * więc wszystkie `hospital.*` liczą się jako jedna dźwignia. Cena tej decyzji
 * jest jawna: takiego porównania nie da się rozłożyć na wkład łóżek i wkład
 * ICU — to trafia do ograniczeń sprawy, a nie pod dywan.
 */
export function leverOf(difference: string): string {
  return difference.startsWith('hospital.') ? 'hospital-capacity' : difference;
}

/**
 * Porównanie z twardą bramką kontrolowanej różnicy.
 *
 * Porównanie przechodzi wyłącznie przy tym samym ziarnie, tej samej populacji,
 * tych samych warunkach początkowych i DOKŁADNIE JEDNEJ zmienionej dźwigni.
 * Zero zmian to brak eksperymentu, dwie i więcej to zmienne splątane — w obu
 * przypadkach różnica nie byłaby przypisywalna interwencji.
 */
export function compareDiscoveryArms(baseline: DiscoveryArm, variant: DiscoveryArm): DiscoveryComparison {
  const blocked = (blockedReason: DiscoveryComparison['blockedReason'], message: string): DiscoveryComparison => ({
    status: 'COMPARISON_BLOCKED',
    controlledDifference: null,
    observedDifferences: [],
    metrics: [],
    blockedReason,
    message,
  });

  if (baseline.run.status !== 'COMPLETED' || variant.run.status !== 'COMPLETED') {
    return blocked('ARM_NOT_EXECUTED', 'Co najmniej jedno ramię nie zostało wykonane — nie ma czego porównywać.');
  }
  if (baseline.run.params.seed !== variant.run.params.seed) {
    return blocked('SEED_MISMATCH', 'Ramiona mają różne ziarna — różnicy nie da się przypisać interwencji.');
  }
  if (baseline.run.params.nAgents !== variant.run.params.nAgents) {
    return blocked('POPULATION_MISMATCH', 'Ramiona mają różną populację — porównanie byłoby nieuprawnione.');
  }
  if (
    baseline.run.params.initialInfected !== variant.run.params.initialInfected ||
    baseline.run.days !== variant.run.days ||
    baseline.run.stepsPerDay !== variant.run.stepsPerDay
  ) {
    return blocked('INITIAL_CONDITIONS_MISMATCH', 'Ramiona różnią się warunkami początkowymi lub horyzontem.');
  }

  const scenarioCompare = compareScenarios(baseline.run, variant.run);
  const observedDifferences = [...scenarioCompare.changedParameters, ...hospitalDifferences(baseline.run, variant.run)].sort();
  const levers = [...new Set(observedDifferences.map(leverOf))].sort();

  if (levers.length === 0) {
    return blocked('NO_CONTROLLED_DIFFERENCE', 'Ramiona są identyczne — to nie jest eksperyment, tylko powtórzenie.');
  }
  if (levers.length > 1) {
    return {
      ...blocked(
        'CONFOUNDED_MULTIPLE_DIFFERENCES',
        `Ramiona różnią się więcej niż jedną dźwignią (${levers.join(', ')}) — efektu nie da się przypisać żadnej z nich.`,
      ),
      observedDifferences,
    };
  }

  const b = baseline.summary!;
  const v = variant.summary!;
  const metrics = DISCOVERY_METRIC_KEYS.map((key) => {
    const base = b[key];
    const variantValue = v[key];
    return {
      key,
      baseline: base,
      variant: variantValue,
      absoluteDelta: variantValue - base,
      relativeDeltaPercent: base === 0 ? null : ((variantValue - base) / base) * 100,
    };
  });

  const bundled = observedDifferences.length > 1;
  return {
    status: 'COMPLETED',
    controlledDifference: levers[0],
    observedDifferences,
    metrics,
    message: bundled
      ? `Jedna kontrolowana dźwignia: ${levers[0]}, zmieniona jako pakiet (${observedDifferences.join(', ')}). Wkładu poszczególnych parametrów nie da się z tego porównania rozdzielić.`
      : `Jedna kontrolowana różnica: ${levers[0]}.`,
  };
}

/**
 * Wykonuje sprawę odkrycia na realnym modelu.
 *
 * Zwraca sprawę bez wniosku, dowodu i replayu — te etapy dokładają kolejne
 * moduły, a status zawsze wynika z bramek, nie z deklaracji.
 */
export function executeDiscoveryCase(spec: DiscoveryCaseSpec): DiscoveryCase {
  const model = discoveryModelIdentity();
  const hospital = spec.hospitalCapacity ?? DEFAULT_HOSPITAL_CAPACITY;
  const inputFingerprint = fingerprintDiscoverySpec(spec);

  const shell = {
    contractVersion: DISCOVERY_ENGINE_VERSION,
    caseId: `case_${inputFingerprint}`,
    question: spec.question,
    hypothesis: spec.hypothesis,
    model,
    seed: spec.initialConditions.seed,
    initialConditions: spec.initialConditions,
    scenarios: { baseline: spec.baselineScenario, variant: spec.variantScenario },
    inputFingerprint,
    replayTolerance: Math.max(0, spec.replayTolerance ?? 0),
    comparison: null,
    replay: null,
    evidence: null,
    conclusion: null,
    followUp: [],
    limitations: DISCOVERY_LIMITATIONS,
  };

  // Polityka bez dźwigni w modelu: sprawa kończy się jawnym NOT_MODELED.
  const unavailable = [spec.baselineScenario, spec.variantScenario]
    .map((id) => SCENARIOS[id])
    .find((def) => def.notModeledReason !== undefined);
  if (unavailable) {
    return {
      ...shell,
      status: 'NOT_MODELED',
      parameters: {},
      runFingerprint: null,
      arms: [],
      notModeledReason: `${unavailable.label}: ${unavailable.notModeledReason}`,
    };
  }

  const baseline = executeArm(spec, spec.baselineScenario, 'baseline', hospital);
  const variant = executeArm(spec, spec.variantScenario, 'variant', hospital);
  const arms = [baseline, variant];
  const comparison = compareDiscoveryArms(baseline, variant);

  const record: DiscoveryCase = {
    ...shell,
    status: 'RUNNING',
    // Snapshot parametrów bierzemy z ramienia bazowego — to warunki wyjściowe.
    parameters: { ...baseline.run.params },
    runFingerprint: `run_${fnv1a(canonicalJson(arms.map((a) => [a.armId, a.run.resultFingerprint])))}`,
    arms,
    comparison,
    ...(comparison.status === 'COMPARISON_BLOCKED'
      ? { blockedReason: `${comparison.blockedReason}: ${comparison.message}` }
      : {}),
  };

  return { ...record, status: highestEarnedStatus(record) };
}
