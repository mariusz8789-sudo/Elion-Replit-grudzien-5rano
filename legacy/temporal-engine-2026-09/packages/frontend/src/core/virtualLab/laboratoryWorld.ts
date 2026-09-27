import {
  compareScenarios, type ScenarioComparison, type ScenarioId, type ScenarioRunOptions,
} from '../simulation/scenarioEngine';
import { DEFAULT_HOSPITAL_CAPACITY, type HospitalCapacityParams } from '../simulation/hospitalResource';
import { projectEpidemiologyWorldStates } from '../world/epidemiologyWorldAdapter';
import type { WorldState } from '../world/scientificWorldState';
import {
  replayLiveExperimentSession, runLiveExperimentSession, type LiveExperimentSessionReplay, type LiveExperimentSessionResult,
} from './liveExperimentSession';

/**
 * LABORATORY WORLD — the scientific foundation of the Virtual Lab, kept
 * intentionally small. It does NOT introduce a new simulation engine: every
 * function here calls `runLiveExperimentSession` (unchanged) and
 * `compareScenarios`/`replayScenario` (unchanged, existing Scenario Engine).
 *
 * WHY THE HOSPITAL-CAPACITY WARD AND NOT AN AQUARIUM: the mission's own
 * instruction is "only expose scientific variables the underlying executor
 * actually models" and "if the best existing executor for a compelling
 * vertical slice is something other than an aquarium, use that instead."
 * No executor in this codebase models water chemistry, dissolved oxygen, pH,
 * or flow — building an "AquariumWorld" would mean inventing environmental
 * parameters purely for looks, which this mission explicitly forbids. The
 * hospital-capacity ward is the one station this codebase can honestly
 * back: every `ExperimentSubject.modeledProperties` below is a REAL field
 * on `HospitalState` (`core/simulation/hospitalResource.ts`), and every
 * `Instrument` reads one of them, nothing else.
 */
export const LABORATORY_WORLD_VERSION = '1.0.0';

export interface Instrument {
  instrumentId: string;
  label: string;
  /** Property keys this instrument reads — must be a subset of the subject's `modeledProperties`. */
  measures: readonly string[];
}

export interface MeasurementPoint {
  pointId: string;
  entityId: string;
  propertyKey: string;
}

export interface ObservationPoint {
  pointId: string;
  label: string;
  /** A `CityCameraPreset` value (kept as a plain string here so this module does not depend on the renderer). */
  cameraHint: string;
}

export interface ExperimentSubject {
  subjectId: string;
  label: string;
  /** Only properties the real executor actually reports — never a wishlist. */
  modeledProperties: readonly string[];
}

export interface ExperimentStation {
  stationId: string;
  label: string;
  subject: ExperimentSubject;
  instruments: readonly Instrument[];
  measurementPoints: readonly MeasurementPoint[];
  observationPoints: readonly ObservationPoint[];
}

export interface LaboratoryWorld {
  labId: string;
  station: ExperimentStation;
}

const HOSPITAL_MODELED_PROPERTIES = ['occupiedBeds', 'occupiedIcu', 'unmetCare', 'bedOccupancy', 'icuOccupancy', 'status'] as const;

export function buildHospitalCapacityLaboratory(): LaboratoryWorld {
  return {
    labId: 'hospital-capacity-lab',
    station: {
      stationId: 'capacity-ward',
      label: 'Hospital Capacity Ward',
      subject: {
        subjectId: 'facility:hospital',
        label: 'Hospital capacity ward',
        modeledProperties: HOSPITAL_MODELED_PROPERTIES,
      },
      instruments: [
        { instrumentId: 'bed-occupancy-sensor', label: 'Bed occupancy sensor', measures: ['occupiedBeds', 'bedOccupancy'] },
        { instrumentId: 'icu-admission-monitor', label: 'ICU admission monitor', measures: ['occupiedIcu', 'icuOccupancy'] },
        { instrumentId: 'unmet-care-counter', label: 'Unmet care counter', measures: ['unmetCare'] },
      ],
      measurementPoints: [
        { pointId: 'mp-beds', entityId: 'facility:hospital', propertyKey: 'bedOccupancy' },
        { pointId: 'mp-icu', entityId: 'facility:hospital', propertyKey: 'icuOccupancy' },
        { pointId: 'mp-unmet', entityId: 'facility:hospital', propertyKey: 'unmetCare' },
      ],
      observationPoints: [
        { pointId: 'op-city', label: 'Wide establishing view', cameraHint: 'city' },
        { pointId: 'op-district', label: 'District overview', cameraHint: 'district' },
        { pointId: 'op-street', label: 'Street-level close observation', cameraHint: 'street' },
      ],
    },
  };
}

/**
 * The ONLY parameters this laboratory lets a user change — exactly the
 * fields `ScenarioRunOptions.baseHospital` (`HospitalCapacityParams`)
 * accepts. A control for anything else would imply a scientific capability
 * the executor does not have.
 */
export const ALLOWED_LAB_PARAMETERS = ['totalBeds', 'icuBeds', 'icuShareOfAdmissions'] as const;
export type AllowedLabParameter = (typeof ALLOWED_LAB_PARAMETERS)[number];

export interface LabRunRequest {
  scenarioId: ScenarioId;
  days?: number;
  stepsPerDay?: number;
  hospitalCapacity?: Partial<Pick<HospitalCapacityParams, AllowedLabParameter>>;
}

export interface LabRun {
  runId: string;
  request: LabRunRequest;
  session: LiveExperimentSessionResult;
  worldStates: readonly WorldState[];
}

let labRunSequence = 0;

/** START -> REAL EXPERIMENT -> REAL STATE -> (observation/events/world states derived downstream). */
export function startLabExperiment(request: LabRunRequest): LabRun {
  labRunSequence += 1;
  const options: ScenarioRunOptions = {
    days: request.days,
    stepsPerDay: request.stepsPerDay,
    baseHospital: request.hospitalCapacity ? { ...DEFAULT_HOSPITAL_CAPACITY, ...request.hospitalCapacity } : undefined,
  };
  const session = runLiveExperimentSession(request.scenarioId, options);
  const worldStates = projectEpidemiologyWorldStates(session.run);
  return { runId: `lab-run-${labRunSequence}`, request, session, worldStates };
}

/** CHANGE_ALLOWED_PARAMETER -> RUN_AGAIN. Refuses (at the type level) any key outside `ALLOWED_LAB_PARAMETERS`. */
export function changeParameterAndRunAgain(
  previous: LabRun,
  parameterChanges: Partial<Pick<HospitalCapacityParams, AllowedLabParameter>>,
): LabRun {
  return startLabExperiment({
    ...previous.request,
    hospitalCapacity: { ...previous.request.hospitalCapacity, ...parameterChanges },
  });
}

export interface LabComparison {
  comparison: ScenarioComparison;
  /** Did the two runs land on different capacity verdicts (HOLDS vs EXCEEDED)? Read from the real hypothesis resolution, never guessed from the metric deltas alone. */
  verdictChanged: boolean;
}

/** COMPARE_RUNS. Reuses `compareScenarios` unchanged — no second comparison engine. */
export function compareLabRuns(a: LabRun, b: LabRun): LabComparison {
  const comparison = compareScenarios(a.session.run, b.session.run);
  return { comparison, verdictChanged: a.session.verdict !== b.session.verdict };
}

/** REPLAY. Reuses `replayLiveExperimentSession` unchanged (which itself reuses `replayScenario`). */
export function replayLabRun(run: LabRun): LiveExperimentSessionReplay {
  return replayLiveExperimentSession(run.session);
}
