import { canonicalJson, fnv1a } from '../events/hash';
import { NEUTRAL_COHORT_PROFILE, type CohortProfile } from '../agents/cohortModel';
import { SCENARIOS, type ScenarioId } from '../simulation/scenarioEngine';
import type { HospitalCapacityParams } from '../simulation/hospitalResource';
import type { EpidemicCityParams } from '../simulation/epidemicCity';
import { runDiscoveryCase } from './discoveryEngine';
import { bandMetricsOf, cohortLimitations, DISCOVERY_LIMITATIONS } from './discoveryExecution';
import { discoveryModelIdentity } from './discoveryExecution';
import type { DiscoveryCase, DiscoveryInitialConditions, DiscoveryModelIdentity } from './discoveryCase';

/**
 * „KOGO CHRONIĆ NAJPIERW?" — badanie porównawcze ochrony priorytetowej.
 *
 * DLACZEGO NIE JEDNA ODPOWIEDŹ
 * To pytanie nie ma jednej odpowiedzi, dopóki nie powie się, CO się minimalizuje.
 * Ochrona najliczniejszej grupy tłumi transmisję; ochrona grupy najciężej
 * chorującej ratuje życia w tej grupie, zostawiając epidemię w biegu. Te dwa
 * cele mogą wskazać różnych zwycięzców i badanie ma to POKAZAĆ, a nie ukryć za
 * jedną liczbą. Dlatego ranking powstaje osobno dla każdego celu, a rozbieżność
 * jest jawnie odnotowana.
 *
 * JAK TO JEST LICZONE
 * Każdy kandydat to osobna, pełna sprawa odkrycia względem tego samego
 * odniesienia, przy identycznych warunkach początkowych i tym samym ziarnie.
 * Kandydat wchodzi do rankingu WYŁĄCZNIE wtedy, gdy jego sprawa przeszła
 * bramkę porównania i odtworzenie — nie ma miejsc w rankingu bez dowodu.
 *
 * Wynik zależy od profilu kohortowego. Przy profilu neutralnym wiek nie wpływa
 * na ciężkość, więc badanie mierzy wyłącznie efekt ekspozycji i liczebności
 * grup — i tak też jest opisane w ograniczeniach.
 */

export const PROTECTION_PRIORITY_VERSION = '1.0.0';

/** Wielkość, którą polityka ma minimalizować. Wybór celu jest decyzją, nie danymi. */
export const PROTECTION_OBJECTIVES = [
  'totalDeaths',
  'peakInfectious',
  'attackRate',
  'totalUnmetCareDays',
  'deaths_senior',
  'deaths_adult',
  'deaths_child',
  'hospitalizedEver_senior',
] as const;

export type ProtectionObjective = (typeof PROTECTION_OBJECTIVES)[number];

/** Scenariusze ochrony priorytetowej dostępne w modelu. */
export const PROTECTION_SCENARIOS: readonly ScenarioId[] = ['PROTECT_SENIORS', 'PROTECT_ADULTS', 'PROTECT_CHILDREN'];

export interface ProtectionPrioritySpec {
  question: string;
  /** Odniesienie — polityka, wobec której mierzymy ochronę. */
  referenceScenario?: ScenarioId;
  candidates?: readonly ScenarioId[];
  initialConditions: DiscoveryInitialConditions;
  baseParams?: Partial<EpidemicCityParams>;
  hospitalCapacity?: HospitalCapacityParams;
  cohort?: CohortProfile;
}

export interface ProtectionCandidate {
  scenario: ScenarioId;
  label: string;
  /** Pełna sprawa odkrycia: porównanie, replay, dowód. */
  case: DiscoveryCase;
  /** Czy kandydat ma prawo wejść do rankingu. */
  admitted: boolean;
  /** Powód odrzucenia, gdy kandydat nie ma dowodu. */
  rejectionReason?: string;
  /** Wartości wszystkich celów z realnego przebiegu tego kandydata. */
  objectives: Readonly<Record<ProtectionObjective, number>>;
}

export interface ProtectionRankingEntry {
  rank: number;
  scenario: ScenarioId;
  value: number;
  referenceValue: number;
  delta: number;
}

export type ProtectionStudyStatus = 'COMPLETED' | 'BLOCKED_NO_ADMITTED_CANDIDATE' | 'BLOCKED_REFERENCE_NOT_EXECUTED';

export interface ProtectionPriorityStudy {
  contractVersion: string;
  studyId: string;
  question: string;
  model: DiscoveryModelIdentity;
  status: ProtectionStudyStatus;
  referenceScenario: ScenarioId;
  cohortProfileId: string;
  cohortCalibration: CohortProfile['calibration'];
  candidates: readonly ProtectionCandidate[];
  /** Ranking osobno dla każdego celu — mniejsza wartość jest lepsza. */
  rankingByObjective: Readonly<Record<ProtectionObjective, readonly ProtectionRankingEntry[]>>;
  /** Zwycięzca dla każdego celu; null, gdy nie ma dopuszczonego kandydata. */
  winnerByObjective: Readonly<Record<ProtectionObjective, ScenarioId | null>>;
  /** Ustawione, gdy różne cele wskazują różnych zwycięzców. */
  conflictNote: string | null;
  limitations: readonly string[];
  message: string;
}

function objectivesOf(record: DiscoveryCase): Record<ProtectionObjective, number> {
  const variant = record.arms.find((a) => a.role === 'variant');
  const summary = variant?.summary;
  if (!summary) {
    return Object.fromEntries(PROTECTION_OBJECTIVES.map((o) => [o, Number.NaN])) as Record<ProtectionObjective, number>;
  }
  const bands = bandMetricsOf(summary);
  return {
    totalDeaths: summary.totalDeaths,
    peakInfectious: summary.peakInfectious,
    attackRate: summary.attackRate,
    totalUnmetCareDays: summary.totalUnmetCareDays,
    deaths_senior: bands.deaths_senior,
    deaths_adult: bands.deaths_adult,
    deaths_child: bands.deaths_child,
    hospitalizedEver_senior: bands.hospitalizedEver_senior,
  };
}

function referenceObjectives(record: DiscoveryCase): Record<ProtectionObjective, number> {
  const baseline = record.arms.find((a) => a.role === 'baseline');
  const summary = baseline?.summary;
  if (!summary) {
    return Object.fromEntries(PROTECTION_OBJECTIVES.map((o) => [o, Number.NaN])) as Record<ProtectionObjective, number>;
  }
  const bands = bandMetricsOf(summary);
  return {
    totalDeaths: summary.totalDeaths,
    peakInfectious: summary.peakInfectious,
    attackRate: summary.attackRate,
    totalUnmetCareDays: summary.totalUnmetCareDays,
    deaths_senior: bands.deaths_senior,
    deaths_adult: bands.deaths_adult,
    deaths_child: bands.deaths_child,
    hospitalizedEver_senior: bands.hospitalizedEver_senior,
  };
}

/** Kandydat wchodzi do rankingu tylko z kompletnym dowodem. */
function admissionOf(record: DiscoveryCase): { admitted: boolean; rejectionReason?: string } {
  if (record.status === 'NOT_MODELED') return { admitted: false, rejectionReason: record.notModeledReason ?? 'NOT_MODELED' };
  if (record.comparison?.status !== 'COMPLETED') {
    return { admitted: false, rejectionReason: `porównanie zablokowane: ${record.comparison?.blockedReason ?? 'brak porównania'}` };
  }
  if (record.replay?.status !== 'MATCH' && record.replay?.status !== 'WITHIN_TOLERANCE') {
    return { admitted: false, rejectionReason: `odtworzenie nie potwierdzone: ${record.replay?.status ?? 'brak odtworzenia'}` };
  }
  if (record.evidence === null || record.evidence.missingFields.length > 0) {
    return { admitted: false, rejectionReason: `pakiet dowodowy niekompletny: ${record.evidence?.missingFields.join(', ') ?? 'brak pakietu'}` };
  }
  return { admitted: true };
}

/**
 * Przeprowadza badanie: każdy wariant ochrony jako osobna, w pełni udowodniona
 * sprawa wobec tego samego odniesienia.
 */
export function runProtectionPriorityStudy(spec: ProtectionPrioritySpec): ProtectionPriorityStudy {
  const model = discoveryModelIdentity();
  const referenceScenario = spec.referenceScenario ?? 'BASELINE';
  const candidateIds = spec.candidates ?? PROTECTION_SCENARIOS;
  const cohort = spec.cohort ?? NEUTRAL_COHORT_PROFILE;
  const studyId = `protect_${fnv1a(canonicalJson({
    v: PROTECTION_PRIORITY_VERSION,
    referenceScenario,
    candidateIds,
    initialConditions: spec.initialConditions,
    baseParams: spec.baseParams ?? null,
    hospitalCapacity: spec.hospitalCapacity ?? null,
    cohort,
  }))}`;

  const candidates: ProtectionCandidate[] = candidateIds.map((scenario) => {
    const record = runDiscoveryCase({
      question: `Czy „${SCENARIOS[scenario].label}" poprawia wynik wobec „${SCENARIOS[referenceScenario].label}"?`,
      hypothesis: {
        statement: `Ochrona priorytetowa grupy zmienia wynik epidemii wobec „${SCENARIOS[referenceScenario].label}".`,
        // Kryterium kierunkowe: ochrona ma zmniejszyć liczbę zgonów. Sprawdzane
        // na realnych liczbach, więc kandydat może je oblać.
        falsification: { metric: 'totalDeaths', relation: 'less-than', rationale: 'Ochrona ma zmniejszyć liczbę zgonów wobec odniesienia.' },
        assumptions: ['Ochrona działa wyłącznie przez ograniczenie kontaktów; model nie zna odporności nabytej.'],
      },
      baselineScenario: referenceScenario,
      variantScenario: scenario,
      initialConditions: spec.initialConditions,
      ...(spec.baseParams ? { baseParams: spec.baseParams } : {}),
      ...(spec.hospitalCapacity ? { hospitalCapacity: spec.hospitalCapacity } : {}),
      cohort,
    });
    const admission = admissionOf(record);
    return {
      scenario,
      label: SCENARIOS[scenario].label,
      case: record,
      objectives: objectivesOf(record),
      ...admission,
    };
  });

  const admitted = candidates.filter((c) => c.admitted);
  const limitations = [
    ...DISCOVERY_LIMITATIONS,
    ...cohortLimitations(cohort),
    'Ranking zależy od WYBRANEGO celu. Różne cele mogą wskazać różne grupy i nie istnieje jedna „poprawna" odpowiedź niezależna od tego wyboru.',
    'Ochrona priorytetowa jest w tym modelu wyłącznie ograniczeniem kontaktów. Nie jest szczepieniem ani odpornością — patrz COHORT_NOT_MODELED.',
    `Siła ochrony jest dźwignią polityki (${SCENARIOS.PROTECT_SENIORS.cohortOverrides?.shieldingEffectiveness ?? 0}), a nie zmierzoną skutecznością realnego programu.`,
  ];

  const shell = {
    contractVersion: PROTECTION_PRIORITY_VERSION,
    studyId,
    question: spec.question,
    model,
    referenceScenario,
    cohortProfileId: cohort.profileId,
    cohortCalibration: cohort.calibration,
    candidates,
    limitations,
  };

  const emptyRanking = Object.fromEntries(PROTECTION_OBJECTIVES.map((o) => [o, []])) as unknown as Record<ProtectionObjective, readonly ProtectionRankingEntry[]>;
  const emptyWinners = Object.fromEntries(PROTECTION_OBJECTIVES.map((o) => [o, null])) as unknown as Record<ProtectionObjective, ScenarioId | null>;

  if (admitted.length === 0) {
    return {
      ...shell,
      status: 'BLOCKED_NO_ADMITTED_CANDIDATE',
      rankingByObjective: emptyRanking,
      winnerByObjective: emptyWinners,
      conflictNote: null,
      message: `Żaden kandydat nie przeszedł bramki dowodowej: ${candidates.map((c) => `${c.scenario} (${c.rejectionReason})`).join('; ')}.`,
    };
  }

  const reference = referenceObjectives(admitted[0].case);
  const rankingByObjective = Object.fromEntries(
    PROTECTION_OBJECTIVES.map((objective) => {
      const sorted = [...admitted].sort(
        (a, b) => a.objectives[objective] - b.objectives[objective] || a.scenario.localeCompare(b.scenario),
      );
      return [
        objective,
        sorted.map((c, i) => ({
          rank: i + 1,
          scenario: c.scenario,
          value: c.objectives[objective],
          referenceValue: reference[objective],
          delta: c.objectives[objective] - reference[objective],
        })),
      ];
    }),
  ) as unknown as Record<ProtectionObjective, readonly ProtectionRankingEntry[]>;

  const winnerByObjective = Object.fromEntries(
    PROTECTION_OBJECTIVES.map((o) => [o, rankingByObjective[o][0]?.scenario ?? null]),
  ) as unknown as Record<ProtectionObjective, ScenarioId | null>;

  const distinctWinners = [...new Set(Object.values(winnerByObjective).filter((w): w is ScenarioId => w !== null))];
  const conflictNote = distinctWinners.length > 1
    ? `Cele wskazują różne grupy: ${PROTECTION_OBJECTIVES.filter((o) => winnerByObjective[o] !== null).map((o) => `${o} → ${winnerByObjective[o]}`).join(', ')}. Wybór grupy do ochrony jest decyzją o tym, co minimalizujemy, a nie wnioskiem z samego modelu.`
    : null;

  return {
    ...shell,
    status: 'COMPLETED',
    rankingByObjective,
    winnerByObjective,
    conflictNote,
    message: `Dopuszczono ${admitted.length} z ${candidates.length} kandydatów; każdy jako osobna, odtworzona sprawa wobec „${SCENARIOS[referenceScenario].label}".`,
  };
}
