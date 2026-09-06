import { canonicalJson, fnv1a } from '../events/hash';
import { SCENARIO_ENGINE_VERSION, type ScenarioDaySample, type ScenarioId, type ScenarioRun } from './scenarioEngine';

/**
 * OŚ CZASU — KOPERTA STANU.
 *
 * Temporal Engine nie liczy nowej fizyki i nie zna kalendarza. Bierze REALNY
 * przebieg Scenario Engine i opisuje go krok po kroku tak, żeby dla każdego
 * kroku było widać JEDNO: skąd ten stan pochodzi.
 *
 * DLACZEGO STATUS JEST WYPROWADZANY, A NIE PODAWANY
 * Gdyby `observationStatus` był parametrem, wystarczyłoby jedno wywołanie z
 * `'OBSERVED'`, żeby wynik modelu zaczął udawać pomiar. Dlatego status liczy
 * ten moduł — z tego, co faktycznie jest w przebiegu — i nie ma wejścia,
 * przez które dałoby się go nadpisać.
 *
 * CZEGO FAZA 1 NIE POTRAFI
 * Nie ma tu żadnej ścieżki do `OBSERVED`, `RECONSTRUCTED` ani `INFERRED`:
 * Genesis nie ma dziś ani przechwytywania rzeczywistości, ani źródła danych
 * historycznych. Te wartości istnieją w słowniku, bo bez nich UI musiałoby
 * kłamać w fazie 2 — nie dlatego, że coś już je produkuje.
 *
 * CZAS KALENDARZOWY
 * `calendarTime` jest zawsze `'NOT_AVAILABLE'`. Model liczy dni przebiegu, nie
 * daty; przypisanie stanu do roku 2018 czy 2050 byłoby zmyśleniem.
 */
export const TEMPORAL_STATE_CONTRACT_VERSION = '1.0.0';

/**
 * Status epistemiczny pojedynczego stanu na osi czasu.
 *
 * `SIMULATED` / `COUNTERFACTUAL` różnią się tylko ramieniem, z którego stan
 * pochodzi — oba są wynikiem modelu i żadne nie jest obserwacją.
 */
export type TemporalObservationStatus =
  | 'SIMULATED'
  | 'COUNTERFACTUAL'
  | 'OBSERVED'
  | 'RECONSTRUCTED'
  | 'INFERRED'
  | 'NOT_AVAILABLE'
  | 'UNKNOWN';

/**
 * Statusy, których w fazie 1 NIE MOŻE wyprodukować żadna ścieżka kodu. Lista
 * jest testowana, a nie tylko opisana: test przechodzi wszystkie koperty i
 * sprawdza, że żadna nie niesie statusu z tej listy.
 */
export const TEMPORAL_STATUS_UNREACHABLE_IN_PHASE_1 = ['OBSERVED', 'RECONSTRUCTED', 'INFERRED'] as const;

/** Ramię osi czasu. BASELINE = bez interwencji, VARIANT = z interwencją. */
export type TemporalBranchRole = 'BASELINE' | 'VARIANT';

export interface TemporalStateEnvelope {
  contractVersion: string;
  engineVersion: string;
  temporalStateId: string;
  timelineId: string;
  branchRole: TemporalBranchRole;
  scenarioId: ScenarioId;
  /** Dzień przebiegu. Scenario Engine liczy od dnia 1 — dzień 0 to warunki wejściowe. */
  logicalDay: number;
  /** Data rzeczywista nie jest modelowana i nie będzie zgadywana. */
  calendarTime: 'NOT_AVAILABLE';
  observationStatus: TemporalObservationStatus;
  /** Realna próbka modelu; `null`, gdy przebieg nie ma próbki dla tego dnia. */
  sample: ScenarioDaySample | null;
  inputFingerprint: string;
  resultFingerprint: string;
  /** Poprzedni stan w TYM SAMYM ramieniu; `null` dla pierwszego stanu osi. */
  parentStateId: string | null;
  stateFingerprint: string;
}

export interface TemporalTimeline {
  contractVersion: string;
  engineVersion: string;
  timelineId: string;
  branchRole: TemporalBranchRole;
  scenarioId: ScenarioId;
  label: string;
  /** Dzień wejścia interwencji — DEKLAROWANY, nie zmierzony. */
  interventionStartDay: number;
  days: number;
  states: readonly TemporalStateEnvelope[];
  inputFingerprint: string;
  resultFingerprint: string;
  timelineFingerprint: string;
  /** Model nie jest skalibrowany do żadnej rzeczywistej epidemii. */
  epistemicStatus: 'SIMULATION';
}

/** Status wyprowadzony z tego, co realnie jest w przebiegu — bez wejścia od wołającego. */
function deriveObservationStatus(sample: ScenarioDaySample | null, branchRole: TemporalBranchRole): TemporalObservationStatus {
  if (sample === null) return 'NOT_AVAILABLE';
  return branchRole === 'VARIANT' ? 'COUNTERFACTUAL' : 'SIMULATED';
}

/** Deterministyczny identyfikator stanu: te same wejścia => ten sam identyfikator. */
function temporalStateId(timelineId: string, logicalDay: number): string {
  return `${timelineId}#d${logicalDay}`;
}

/**
 * Identyfikator osi czasu wyprowadzony z ODCISKU WYNIKU przebiegu. Dwa różne
 * przebiegi nie mogą trafić na ten sam identyfikator, a ten sam przebieg
 * policzony ponownie dostanie ten sam — dzięki temu replay porównuje osie,
 * zamiast zakładać, że kolejność wywołań się nie zmieniła.
 */
export function temporalTimelineId(run: ScenarioRun, branchRole: TemporalBranchRole): string {
  return `${branchRole}:${run.scenarioId}:${run.resultFingerprint ?? 'NO_RESULT'}`;
}

/**
 * Buduje oś czasu z REALNEGO przebiegu.
 *
 * Przebieg niewykonany albo bez odcisku wyniku nie ma osi czasu — tak samo jak
 * nie ma zapisu w pamięci (`buildSavedScenarioRunContext`). Oś czasu bez
 * odtwarzalnego źródła byłaby ładnym wykresem bez pokrycia.
 */
export function buildTemporalTimeline(run: ScenarioRun, branchRole: TemporalBranchRole): TemporalTimeline {
  if (run.status !== 'COMPLETED') {
    throw new Error(`Przebieg ${run.scenarioId} nie został wykonany (${run.status}) — nie ma z czego zbudować osi czasu.`);
  }
  if (run.resultFingerprint === null) {
    throw new Error(`Przebieg ${run.scenarioId} nie ma odcisku wyniku — oś czasu nie byłaby odtwarzalna.`);
  }

  const timelineId = temporalTimelineId(run, branchRole);
  const byDay = new Map(run.series.map((sample) => [sample.day, sample]));
  const states: TemporalStateEnvelope[] = [];

  // Dzień 0 jest częścią osi, ale Scenario Engine nie zapisuje dla niego
  // próbki — koperta niesie wtedy NOT_AVAILABLE zamiast dorobionej wartości.
  for (let logicalDay = 0; logicalDay <= run.days; logicalDay++) {
    const sample = byDay.get(logicalDay) ?? null;
    const stateId = temporalStateId(timelineId, logicalDay);
    const envelope: TemporalStateEnvelope = {
      contractVersion: TEMPORAL_STATE_CONTRACT_VERSION,
      engineVersion: SCENARIO_ENGINE_VERSION,
      temporalStateId: stateId,
      timelineId,
      branchRole,
      scenarioId: run.scenarioId,
      logicalDay,
      calendarTime: 'NOT_AVAILABLE',
      observationStatus: deriveObservationStatus(sample, branchRole),
      sample,
      inputFingerprint: run.inputFingerprint,
      resultFingerprint: run.resultFingerprint,
      parentStateId: logicalDay === 0 ? null : temporalStateId(timelineId, logicalDay - 1),
      stateFingerprint: fnv1a(canonicalJson({
        v: TEMPORAL_STATE_CONTRACT_VERSION,
        timelineId,
        logicalDay,
        branchRole,
        resultFingerprint: run.resultFingerprint,
        sample,
      })),
    };
    states.push(envelope);
  }

  return {
    contractVersion: TEMPORAL_STATE_CONTRACT_VERSION,
    engineVersion: SCENARIO_ENGINE_VERSION,
    timelineId,
    branchRole,
    scenarioId: run.scenarioId,
    label: run.label,
    interventionStartDay: run.interventionStartDay,
    days: run.days,
    states,
    inputFingerprint: run.inputFingerprint,
    resultFingerprint: run.resultFingerprint,
    timelineFingerprint: fnv1a(canonicalJson({
      v: TEMPORAL_STATE_CONTRACT_VERSION,
      timelineId,
      states: states.map((state) => state.stateFingerprint),
    })),
    epistemicStatus: 'SIMULATION',
  };
}

/** Stan dla wskazanego dnia; `null`, gdy dzień leży poza osią. */
export function temporalStateAt(timeline: TemporalTimeline, logicalDay: number): TemporalStateEnvelope | null {
  return timeline.states.find((state) => state.logicalDay === logicalDay) ?? null;
}

/**
 * Czy w tej osi czasu jakikolwiek stan podaje się za obserwację. Używane przez
 * testy i przez UI: jeżeli kiedykolwiek zwróci `true` w fazie 1, znaczy to, że
 * ktoś dorobił ścieżkę produkującą nieistniejące dane.
 */
export function claimsObservedReality(timeline: TemporalTimeline): boolean {
  const unreachable = new Set<TemporalObservationStatus>(TEMPORAL_STATUS_UNREACHABLE_IN_PHASE_1);
  return timeline.states.some((state) => unreachable.has(state.observationStatus));
}
