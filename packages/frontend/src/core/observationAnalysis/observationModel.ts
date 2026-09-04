import type { ScenarioDaySample, ScenarioRun } from '../simulation/scenarioEngine';

export const OBSERVATION_MODEL_VERSION = '1.0.0';

export type ObservationType =
  | 'METRIC_VALUE'
  | 'METRIC_PEAK'
  | 'METRIC_THRESHOLD'
  | 'STATUS_CHANGE'
  | 'ANOMALY'
  | 'EXPERIMENT_COMPLETED';

export type ObservationSeverity = 'INFO' | 'NOTABLE' | 'CRITICAL';

/** Read-only pointer into the existing scenario result and its real daily sample. */
export interface ObservationEvidenceReference {
  source: 'scenario-engine';
  resultFingerprint: string;
  day: number;
  sampleIndex: number;
}

export interface Observation {
  modelVersion: typeof OBSERVATION_MODEL_VERSION;
  experimentId: string;
  scenarioId: ScenarioRun['scenarioId'];
  day: number;
  inputParameter: string;
  observedValue: number | string;
  observationType: ObservationType;
  source: 'scenario-engine';
  severity: ObservationSeverity;
  evidence: ObservationEvidenceReference;
}

export function evidenceForSample(run: ScenarioRun, sample: ScenarioDaySample, sampleIndex: number): ObservationEvidenceReference {
  if (run.resultFingerprint === null) {
    throw new Error(`Scenario ${run.scenarioId} has no result fingerprint for evidence.`);
  }
  return {
    source: 'scenario-engine',
    resultFingerprint: run.resultFingerprint,
    day: sample.day,
    sampleIndex,
  };
}

export function observationForSample(
  run: ScenarioRun,
  sample: ScenarioDaySample,
  sampleIndex: number,
  inputParameter: string,
  observedValue: number | string,
  observationType: ObservationType,
  severity: ObservationSeverity = 'INFO',
): Observation {
  return {
    modelVersion: OBSERVATION_MODEL_VERSION,
    experimentId: run.inputFingerprint,
    scenarioId: run.scenarioId,
    day: sample.day,
    inputParameter,
    observedValue,
    observationType,
    source: 'scenario-engine',
    severity,
    evidence: evidenceForSample(run, sample, sampleIndex),
  };
}

export function observationEvidenceMatchesRun(observation: Observation, run: ScenarioRun): boolean {
  return run.resultFingerprint !== null
    && observation.evidence.source === 'scenario-engine'
    && observation.evidence.resultFingerprint === run.resultFingerprint
    && observation.experimentId === run.inputFingerprint;
}
