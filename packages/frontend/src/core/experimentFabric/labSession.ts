import {
  compareScenarios, replayScenario, runScenario,
  type ScenarioComparison, type ScenarioDaySample, type ScenarioId, type ScenarioReplay, type ScenarioRun,
} from '../simulation/scenarioEngine';
import { runScenarioCounterfactual, type ScenarioCounterfactual } from '../simulation/scenarioCounterfactual';
import { saveScenarioCounterfactualToMemory } from '../scienceMemory';
import type { SavedExperiment } from '../scienceMemory';
import type { HospitalStatus } from '../simulation/hospitalResource';

/**
 * FIRST-PERSON LAB SESSION — cienka warstwa nad ISTNIEJĄCYM Scenario Engine
 * (`runScenario`/`replayScenario`/`compareScenarios`/`runScenarioCounterfactual`)
 * i ISTNIEJĄCĄ Pamięcią Naukową (`saveScenarioCounterfactualToMemory`).
 *
 * Nie liczy NICZEGO nowego: ustala wyłącznie, KTÓRY scenariusz i jaki zakres
 * dźwigni czasu interwencji ten jeden pokaz pierwszoosobowy wystawia graczowi,
 * i przekłada realny `ScenarioDaySample.hospital` na to, co ma pokazać
 * naczynie w scenie 3D. Renderer (labScene3D.ts) czyta wyłącznie stąd — sam
 * nigdy nie liczy prawdy naukowej (patrz core/three/labScene3D.ts).
 */

/** Scenariusz z realną dźwignią czasu (`interventionStartDay`) — patrz scenarioEngine.ts. */
export const LAB_SCENARIO_ID: ScenarioId = 'ISOLATION';
export const LAB_RUN_DAYS = 60;
export const LAB_STEPS_PER_DAY = 4;
export const LAB_INTERVENTION_DAY_RANGE = { min: 0, max: 40 } as const;

/**
 * Czego to jedno doświadczenie NIE modeluje wizualnie ani naukowo — deklaracja,
 * nie zaślepka. Naczynie pokazuje WYŁĄCZNIE obłożenie łóżek/ICU z realnego
 * modelu; nic poniżej nie jest symulowane.
 */
export const LAB_NOT_MODELED = [
  'fluid-dynamics', 'organism-movement', 'temperature', 'chemistry-reaction',
  'microscopy', 'individual-patient-outcomes', 'staff-availability',
] as const;

function clampInterventionDay(day: number): number {
  return Math.max(LAB_INTERVENTION_DAY_RANGE.min, Math.min(LAB_INTERVENTION_DAY_RANGE.max, Math.round(day)));
}

/** Uruchamia realny scenariusz z jednym walidnym parametrem: dniem wejścia izolacji. */
export function runLabScenario(interventionStartDay: number): ScenarioRun {
  return runScenario(LAB_SCENARIO_ID, {
    days: LAB_RUN_DAYS,
    stepsPerDay: LAB_STEPS_PER_DAY,
    interventionStartDay: clampInterventionDay(interventionStartDay),
  });
}

/** Odtwarza przebieg od nowa i porównuje odcisk wyniku — realna weryfikacja, nie deklaracja. */
export function replayLabRun(run: ScenarioRun): ScenarioReplay {
  return replayScenario(run);
}

/** Porównuje dwa realne przebiegi tym samym silnikiem, którego używa reszta Genesis. */
export function compareLabRuns(baseline: ScenarioRun, variant: ScenarioRun): ScenarioComparison {
  return compareScenarios(baseline, variant);
}

/** Oba ramiona na wspólnych warunkach startowych — ten sam kontrfaktyk co gdziekolwiek indziej w Genesis. */
export function buildLabCounterfactual(baselineDay: number, variantDay: number): ScenarioCounterfactual {
  return runScenarioCounterfactual({
    baselineScenarioId: LAB_SCENARIO_ID,
    variantScenarioId: LAB_SCENARIO_ID,
    days: LAB_RUN_DAYS,
    stepsPerDay: LAB_STEPS_PER_DAY,
    baseParams: {},
    baselineInterventionStartDay: clampInterventionDay(baselineDay),
    variantInterventionStartDay: clampInterventionDay(variantDay),
  });
}

/** Utrwala kontrfaktyk w istniejącej Pamięci Naukowej — bez drugiego systemu pamięci. */
export function saveLabCounterfactualToMemory(counterfactual: ScenarioCounterfactual): SavedExperiment {
  return saveScenarioCounterfactualToMemory(counterfactual);
}

/** To, co naczynie w scenie 3D ma pokazać dla jednego dnia — WPROST z realnego modelu, nic dodane. */
export interface VesselReading {
  day: number;
  bedFraction: number;
  icuFraction: number;
  status: HospitalStatus;
  unmetCare: number;
}

export function vesselReadingForSample(sample: ScenarioDaySample): VesselReading {
  return {
    day: sample.day,
    bedFraction: Math.max(0, Math.min(1, sample.hospital.bedOccupancy)),
    icuFraction: Math.max(0, Math.min(1, sample.hospital.icuOccupancy)),
    status: sample.hospital.status,
    unmetCare: sample.hospital.unmetCare,
  };
}

/** Pierwszy dzień w serii, w którym status realnie przekracza CRITICAL — albo null, jeśli nigdy. */
export function firstCriticalDayInSeries(series: readonly ScenarioDaySample[]): number | null {
  const hit = series.find((sample) => sample.hospital.status === 'CRITICAL');
  return hit ? hit.day : null;
}
