import { canonicalJson, fnv1a } from '../events/hash';
import { AGE_BANDS, COHORT_NOT_MODELED, NEUTRAL_COHORT_PROFILE, type CohortProfile } from '../agents/cohortModel';
import { CONTACT_NETWORK_NOT_MODELED, CONTACT_TYPES, CONTACT_TYPES_NOT_MODELED } from '../contacts/contactNetwork';
import { getRouterModel } from '../experimentFabric/router';
import { DEFAULT_HOSPITAL_CAPACITY, HOSPITAL_NOT_MODELED, type HospitalCapacityParams } from '../simulation/hospitalResource';
import { WORLD_NOT_MODELED } from '../simulation/worldEngineContract';
import {
  SCENARIOS,
  compareScenarios,
  runScenario,
  type ScenarioId,
  type ScenarioRun,
  type ScenarioSummary,
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

/**
 * Metryki w rozbiciu na pasma wieku. Liczone z realnych przebiegów także przy
 * profilu neutralnym — wtedy odpowiadają na pytanie, czy model w ogóle
 * różnicuje grupy. Równe wartości są wynikiem, nie brakiem wyniku.
 */
/**
 * Metryki transmisji wg typu kontaktu. Typy niemodelowane (praca, transport)
 * NIE mają tu wpisu — zero przy nich byłoby czytane jako wynik, a jest brakiem
 * zdolności modelu.
 */
export const DISCOVERY_CONTACT_METRIC_KEYS = CONTACT_TYPES
  .filter((t) => !CONTACT_TYPES_NOT_MODELED.includes(t))
  .map((t) => `transmissions_${t}`);

export function contactMetricsOf(summary: ScenarioSummary): Record<string, number> {
  const out: Record<string, number> = { transmissions_total: summary.totalTransmissions };
  for (const type of CONTACT_TYPES) {
    if (CONTACT_TYPES_NOT_MODELED.includes(type)) continue;
    out[`transmissions_${type}`] = summary.transmissionsByContactType[type] ?? 0;
  }
  return out;
}

export const DISCOVERY_BAND_METRIC_KEYS = AGE_BANDS.flatMap((band) => [
  `attackRate_${band}`,
  `deaths_${band}`,
  `hospitalizedEver_${band}`,
  `caseFatalityOfInfected_${band}`,
  `severeShareOfInfected_${band}`,
]);

/** Płaska mapa metryk pasmowych z podsumowania przebiegu. */
export function bandMetricsOf(summary: ScenarioSummary): Record<string, number> {
  const out: Record<string, number> = {};
  for (const band of AGE_BANDS) {
    const o = summary.byBand[band];
    out[`attackRate_${band}`] = o.attackRate;
    out[`deaths_${band}`] = o.deaths;
    out[`hospitalizedEver_${band}`] = o.hospitalizedEver;
    out[`caseFatalityOfInfected_${band}`] = o.caseFatalityOfInfected;
    out[`severeShareOfInfected_${band}`] = o.severeShareOfInfected;
  }
  return out;
}

/** Granice ważności każdego wniosku z tego modelu — dołączane do sprawy. */
export const DISCOVERY_LIMITATIONS: readonly string[] = [
  'Model jest agentowy i edukacyjny; nie jest prognozą dla żadnej rzeczywistej populacji.',
  'Pojedynczy przebieg to jedna realizacja procesu stochastycznego przy ustalonym ziarnie.',
  'Warstwa szpitalna to księgowość pojemności; sprzężenie śmiertelności jest domyślnie wyłączone.',
  `Model nie obejmuje: ${[...WORLD_NOT_MODELED].join(', ')}.`,
  `Szpital nie obejmuje: ${[...HOSPITAL_NOT_MODELED].join(', ')}.`,
  `Struktura populacji nie obejmuje: ${[...COHORT_NOT_MODELED].join(', ')}.`,
  `Sieć kontaktów nie obejmuje: ${[...CONTACT_NETWORK_NOT_MODELED].join(', ')}.`,
  `Typy kontaktu nierozpoznawalne w tym modelu: ${[...CONTACT_TYPES_NOT_MODELED].join(', ')} — zero transmisji w tych kategoriach oznacza brak zdolności modelu, a nie brak zakażeń.`,
];

/**
 * Ograniczenia wynikające z użytego profilu kohortowego. Profil bez podanego
 * źródła MUSI unieważnić każde twierdzenie o rzeczywistej populacji — sprawa
 * zapisuje to sobie sama, zamiast liczyć na czujność czytelnika.
 */
export function cohortLimitations(cohort: CohortProfile): string[] {
  if (cohort.calibration === 'NEUTRAL') {
    return [
      'Profil kohortowy jest NEUTRALNY: wiek nie wpływa na podatność, ciężkość ani śmiertelność. Różnice między pasmami w wynikach mogą pochodzić wyłącznie z ekspozycji i losowości, nie z biologii.',
    ];
  }
  const base = [
    `Profil kohortowy „${cohort.profileId}" różnicuje grupy. ${cohort.provenanceNote}`,
  ];
  if (cohort.calibration === 'REQUIRES_CALIBRATION') {
    base.push(
      'Mnożniki nie mają podanego źródła (REQUIRES_CALIBRATION). Wynik wolno czytać wyłącznie jako analizę „co, jeśli"; nie jest to twierdzenie o żadnej rzeczywistej populacji.',
    );
  }
  return base;
}

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
      cohort: spec.cohort ?? null,
      replayTolerance: spec.replayTolerance ?? 0,
    }),
  );
}

function executeArm(
  spec: DiscoveryCaseSpec,
  scenario: ScenarioId,
  role: 'baseline' | 'variant',
  hospital: HospitalCapacityParams,
  cohort: CohortProfile,
): DiscoveryArm {
  const run = runScenario(scenario, {
    days: spec.initialConditions.days,
    stepsPerDay: spec.initialConditions.stepsPerDay,
    baseParams: sharedBaseParams(spec),
    baseHospital: hospital,
    baseCohort: cohort,
  });
  return { armId: `${role}:${scenario}`, scenario, role, run, summary: run.summary };
}

/**
 * Różnice w profilu kohortowym. Wyszczególniamy je po nazwie pola, żeby było
 * widać, CO dokładnie odróżnia ramiona — „inny profil" nie byłoby dowodem.
 */
function cohortDifferences(a: ScenarioRun, b: ScenarioRun): string[] {
  const out: string[] = [];
  const left = a.cohort as unknown as Record<string, unknown>;
  const right = b.cohort as unknown as Record<string, unknown>;
  for (const key of ['susceptibilityMultiplier', 'severityMultiplier', 'fatalityMultiplier', 'contactWeight', 'ageBandBounds']) {
    if (canonicalJson(left[key]) !== canonicalJson(right[key])) out.push(`cohort.${key}`);
  }
  const shieldingOf = (run: ScenarioRun) =>
    run.cohort.shieldingEffectiveness > 0 ? [...run.cohort.shieldedBands].sort() : [];
  if (canonicalJson(shieldingOf(a)) !== canonicalJson(shieldingOf(b)) || (shieldingOf(a).length > 0 && a.cohort.shieldingEffectiveness !== b.cohort.shieldingEffectiveness)) {
    out.push('cohort.shielding');
  }
  return out.sort();
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
  if (difference.startsWith('hospital.')) return 'hospital-capacity';
  // Ochrona priorytetowa to jedna dźwignia niezależnie od tego, ile pasm obejmuje.
  if (difference === 'cohort.shielding') return 'priority-protection';
  if (difference.startsWith('cohort.')) return 'cohort-calibration';
  return difference;
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
  const observedDifferences = [
    ...scenarioCompare.changedParameters,
    ...hospitalDifferences(baseline.run, variant.run),
    ...cohortDifferences(baseline.run, variant.run),
  ].sort();
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
  const baseBands = bandMetricsOf(b);
  const variantBands = bandMetricsOf(v);
  const delta = (key: string, base: number, variantValue: number) => ({
    key,
    baseline: base,
    variant: variantValue,
    absoluteDelta: variantValue - base,
    relativeDeltaPercent: base === 0 ? null : ((variantValue - base) / base) * 100,
  });
  const baseContacts = contactMetricsOf(b);
  const variantContacts = contactMetricsOf(v);
  const metrics = [
    ...DISCOVERY_METRIC_KEYS.map((key) => delta(key, b[key], v[key])),
    ...DISCOVERY_BAND_METRIC_KEYS.map((key) => delta(key, baseBands[key], variantBands[key])),
    ...['transmissions_total', ...DISCOVERY_CONTACT_METRIC_KEYS].map((key) => delta(key, baseContacts[key], variantContacts[key])),
  ];

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
  const cohort = spec.cohort ?? NEUTRAL_COHORT_PROFILE;
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

  const baseline = executeArm(spec, spec.baselineScenario, 'baseline', hospital, cohort);
  const variant = executeArm(spec, spec.variantScenario, 'variant', hospital, cohort);
  // Prowenancja kohorty obu ramion trafia do ograniczeń sprawy.
  const cohortNotes = [...new Set([...cohortLimitations(baseline.run.cohort), ...cohortLimitations(variant.run.cohort)])];
  const arms = [baseline, variant];
  const comparison = compareDiscoveryArms(baseline, variant);

  const record: DiscoveryCase = {
    ...shell,
    limitations: [...shell.limitations, ...cohortNotes],
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
