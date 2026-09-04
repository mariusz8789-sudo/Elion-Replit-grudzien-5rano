import type { ScenarioRun } from '../simulation/scenarioEngine';
import { extractObservations } from './observationExtraction';
import { evidenceForSample, type Observation } from './observationModel';

export type AnalysisTrend = 'RISING' | 'FALLING' | 'STABLE';
export type AnalysisMetric = 'infectious' | 'hospital.bedOccupancy' | 'hospital.icuOccupancy' | 'totalDeaths' | 'attackRate';

export interface AnalysisExtremum {
  metric: AnalysisMetric;
  value: number;
  day: number;
  evidence: Observation['evidence'];
}

export interface AnalysisTrendResult {
  metric: AnalysisMetric;
  from: number;
  to: number;
  delta: number;
  direction: AnalysisTrend;
  evidence: readonly Observation['evidence'][];
}

export interface BaselineDelta {
  metric: AnalysisMetric;
  observedValue: number;
  baselineValue: number;
  delta: number;
  evidence: Observation['evidence'];
}

export interface AnalysisEvent {
  day: number;
  type: Observation['observationType'];
  value: number | string;
  severity: Observation['severity'];
  evidence: Observation['evidence'];
}

export interface ExperimentAnalysis {
  experimentId: string;
  scenarioId: ScenarioRun['scenarioId'];
  maxima: readonly AnalysisExtremum[];
  minima: readonly AnalysisExtremum[];
  trends: readonly AnalysisTrendResult[];
  baselineDeltas: readonly BaselineDelta[];
  mostSignificantDeviation: BaselineDelta | null;
  significantEvents: readonly AnalysisEvent[];
  summary: string;
}

function directionFor(delta: number): AnalysisTrend {
  if (delta > 0) return 'RISING';
  if (delta < 0) return 'FALLING';
  return 'STABLE';
}

function sampleMetric(run: ScenarioRun, metric: AnalysisMetric, index: number): number {
  const sample = run.series[index];
  switch (metric) {
    case 'infectious': return sample.infectious;
    case 'hospital.bedOccupancy': return sample.hospital.bedOccupancy;
    case 'hospital.icuOccupancy': return sample.hospital.icuOccupancy;
    case 'totalDeaths': return sample.deceased;
    case 'attackRate': return run.summary?.attackRate ?? 0;
  }
}

function summaryMetric(run: ScenarioRun, metric: AnalysisMetric): number {
  if (run.summary === null) throw new Error(`Scenario ${run.scenarioId} has no summary.`);
  switch (metric) {
    case 'infectious': return run.summary.peakInfectious;
    case 'hospital.bedOccupancy': return run.summary.peakBedOccupancy;
    case 'hospital.icuOccupancy': return run.summary.peakIcuOccupancy;
    case 'totalDeaths': return run.summary.totalDeaths;
    case 'attackRate': return run.summary.attackRate;
  }
}

const SERIES_METRICS: readonly AnalysisMetric[] = ['infectious', 'hospital.bedOccupancy', 'hospital.icuOccupancy'];
const SUMMARY_METRICS: readonly AnalysisMetric[] = ['infectious', 'hospital.bedOccupancy', 'hospital.icuOccupancy', 'totalDeaths', 'attackRate'];

function extremum(run: ScenarioRun, metric: AnalysisMetric, mode: 'max' | 'min'): AnalysisExtremum {
  let bestIndex = 0;
  for (let index = 1; index < run.series.length; index += 1) {
    const candidate = sampleMetric(run, metric, index);
    const best = sampleMetric(run, metric, bestIndex);
    if (mode === 'max' ? candidate > best : candidate < best) bestIndex = index;
  }
  const sample = run.series[bestIndex];
  return {
    metric,
    value: sampleMetric(run, metric, bestIndex),
    day: sample.day,
    evidence: evidenceForSample(run, sample, bestIndex),
  };
}

export function analyzeExperiment(run: ScenarioRun, baseline?: ScenarioRun): ExperimentAnalysis {
  if (run.status !== 'COMPLETED' || run.summary === null || run.resultFingerprint === null || run.series.length === 0) {
    throw new Error(`Scenario ${run.scenarioId} is not analyzable.`);
  }
  const observations = extractObservations(run);
  const maxima = SERIES_METRICS.map((metric) => extremum(run, metric, 'max'));
  const minima = SERIES_METRICS.map((metric) => extremum(run, metric, 'min'));
  const trends = SERIES_METRICS.map((metric) => {
    const from = sampleMetric(run, metric, 0);
    const to = sampleMetric(run, metric, run.series.length - 1);
    return {
      metric,
      from,
      to,
      delta: to - from,
      direction: directionFor(to - from),
      evidence: [
        evidenceForSample(run, run.series[0], 0),
        evidenceForSample(run, run.series[run.series.length - 1], run.series.length - 1),
      ],
    } satisfies AnalysisTrendResult;
  });
  const baselineDeltas = baseline === undefined
    ? []
    : SUMMARY_METRICS.map((metric) => {
      const evidenceIndex = metric === 'infectious'
        ? run.series.reduce((best, sample, index, series) => sample.infectious > series[best].infectious ? index : best, 0)
        : metric === 'hospital.bedOccupancy'
          ? run.series.reduce((best, sample, index, series) => sample.hospital.bedOccupancy > series[best].hospital.bedOccupancy ? index : best, 0)
          : metric === 'hospital.icuOccupancy'
            ? run.series.reduce((best, sample, index, series) => sample.hospital.icuOccupancy > series[best].hospital.icuOccupancy ? index : best, 0)
            : run.series.length - 1;
      const observedValue = summaryMetric(run, metric);
      const baselineValue = summaryMetric(baseline, metric);
      return { metric, observedValue, baselineValue, delta: observedValue - baselineValue, evidence: evidenceForSample(run, run.series[evidenceIndex], evidenceIndex) } satisfies BaselineDelta;
    });
  const mostSignificantDeviation = baselineDeltas.length === 0
    ? null
    : baselineDeltas.reduce((best, current) => Math.abs(current.delta) > Math.abs(best.delta) ? current : best);
  const significantEvents = observations
    .filter((observation) => observation.observationType === 'STATUS_CHANGE' || observation.observationType === 'METRIC_THRESHOLD' || observation.severity === 'CRITICAL')
    .map((observation) => ({
      day: observation.day,
      type: observation.observationType,
      value: observation.observedValue,
      severity: observation.severity,
      evidence: observation.evidence,
    } satisfies AnalysisEvent));

  return {
    experimentId: run.inputFingerprint,
    scenarioId: run.scenarioId,
    maxima,
    minima,
    trends,
    baselineDeltas,
    mostSignificantDeviation,
    significantEvents,
    summary: `Experiment ${run.scenarioId} completed over ${run.series.length} simulated days with peak infectious count ${run.summary.peakInfectious}.`,
  };
}
