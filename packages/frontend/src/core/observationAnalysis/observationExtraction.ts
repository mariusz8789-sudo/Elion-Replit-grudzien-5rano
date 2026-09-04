import type { ScenarioDaySample, ScenarioRun } from '../simulation/scenarioEngine';
import {
  observationForSample,
  type Observation,
  type ObservationSeverity,
} from './observationModel';

const METRICS = ['infectious', 'hospital.bedOccupancy', 'hospital.icuOccupancy'] as const;
type ObservationMetric = (typeof METRICS)[number];

function metricValue(sample: ScenarioDaySample, metric: ObservationMetric): number {
  if (metric === 'infectious') return sample.infectious;
  return metric === 'hospital.bedOccupancy' ? sample.hospital.bedOccupancy : sample.hospital.icuOccupancy;
}

function severityForStatus(status: ScenarioDaySample['hospital']['status']): ObservationSeverity {
  if (status === 'CRITICAL') return 'CRITICAL';
  if (status === 'HIGH' || status === 'WARNING') return 'NOTABLE';
  return 'INFO';
}

function firstIndexOfMax(series: readonly ScenarioDaySample[], metric: ObservationMetric): number {
  let bestIndex = 0;
  for (let index = 1; index < series.length; index += 1) {
    if (metricValue(series[index], metric) > metricValue(series[bestIndex], metric)) bestIndex = index;
  }
  return bestIndex;
}

/** Extracts only events that are present in the real scenario series or summary. */
export function extractObservations(run: ScenarioRun): readonly Observation[] {
  if (run.status !== 'COMPLETED' || run.summary === null || run.resultFingerprint === null || run.series.length === 0) return [];

  const observations: Observation[] = [];
  const add = (
    sampleIndex: number,
    inputParameter: string,
    observedValue: number | string,
    observationType: Parameters<typeof observationForSample>[5],
    severity: ObservationSeverity = 'INFO',
  ) => observations.push(observationForSample(run, run.series[sampleIndex], sampleIndex, inputParameter, observedValue, observationType, severity));

  for (const metric of METRICS) {
    const peakIndex = firstIndexOfMax(run.series, metric);
    add(peakIndex, metric, metricValue(run.series[peakIndex], metric), 'METRIC_PEAK', metric === 'infectious' ? 'NOTABLE' : severityForStatus(run.series[peakIndex].hospital.status));
  }

  for (let index = 1; index < run.series.length; index += 1) {
    const previous = run.series[index - 1];
    const current = run.series[index];
    if (current.hospital.status !== previous.hospital.status) {
      add(index, 'hospital.status', current.hospital.status, 'STATUS_CHANGE', severityForStatus(current.hospital.status));
    }
    if (current.hospital.bedOccupancy >= 0.8 && previous.hospital.bedOccupancy < 0.8) {
      add(index, 'hospital.bedOccupancy', current.hospital.bedOccupancy, 'METRIC_THRESHOLD', severityForStatus(current.hospital.status));
    }
  }

  const lastIndex = run.series.length - 1;
  add(lastIndex, 'experiment.status', run.status, 'EXPERIMENT_COMPLETED', 'INFO');
  return observations;
}
