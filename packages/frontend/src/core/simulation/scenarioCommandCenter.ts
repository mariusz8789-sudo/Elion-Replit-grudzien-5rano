import type { SimParams } from '../types';
import type { EpidemicCityParams } from './epidemicCity';
import {
  compareScenarios,
  replayScenario,
  runScenario,
  type ScenarioComparison,
  type ScenarioId,
  type ScenarioReplay,
  type ScenarioRun,
  type ScenarioRunOptions,
} from './scenarioEngine';

/**
 * Scenario Command Center adapter: converts only the existing live City parameter
 * state into Scenario Engine inputs, then exposes read-only runs and comparisons.
 * It does not mutate EpidemicCitySimulation or create a second epidemiological model.
 */
const CITY_PARAMETER_KEYS: readonly (keyof EpidemicCityParams)[] = [
  'nAgents', 'initialInfected', 'r0', 'infectiousDays', 'incubationDays', 'ifr',
  'contactRadius', 'transmissionScale', 'restrictions', 'isolate', 'mobility',
  'severeRate', 'closeSchools', 'householdTransmissionScale', 'seed',
];

export interface ScenarioCommandCenterRun {
  baseline: ScenarioRun;
  intervention: ScenarioRun;
  comparison: ScenarioComparison;
}

export interface ScenarioUiMetric {
  key: string;
  label: string;
  kind: 'count' | 'percent' | 'days';
  baseline: number | null;
  intervention: number | null;
}

/** Keeps clock/render-only values out of a Scenario Engine run. */
export function scenarioParamsFromCommandCenter(params: SimParams): Partial<EpidemicCityParams> {
  const out: Record<string, number | boolean> = {};
  for (const key of CITY_PARAMETER_KEYS) {
    const value = params[key];
    if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') out[key] = value;
  }
  return out as Partial<EpidemicCityParams>;
}

/** Runs BASELINE and the chosen intervention through the one existing Scenario Engine. */
export function runScenarioCommandCenter(intervention: ScenarioId, params: SimParams): ScenarioCommandCenterRun {
  const options: ScenarioRunOptions = { baseParams: scenarioParamsFromCommandCenter(params) };
  const baseline = runScenario('BASELINE', options);
  const interventionRun = runScenario(intervention, options);
  return { baseline, intervention: interventionRun, comparison: compareScenarios(baseline, interventionRun) };
}

function everHospitalized(run: ScenarioRun): number | null {
  if (!run.summary) return null;
  return Object.values(run.summary.byBand).reduce((sum, band) => sum + band.hospitalizedEver, 0);
}

/** Real summary fields only; null preserves NOT_MODELED/NOT_AVAILABLE rather than inventing a zero. */
export function scenarioUiMetrics(baseline: ScenarioRun, intervention: ScenarioRun): readonly ScenarioUiMetric[] {
  const base = baseline.summary;
  const variant = intervention.summary;
  return [
    { key: 'totalTransmissions', label: 'transmisje', kind: 'count', baseline: base?.totalTransmissions ?? null, intervention: variant?.totalTransmissions ?? null },
    { key: 'peakInfectious', label: 'szczyt I', kind: 'count', baseline: base?.peakInfectious ?? null, intervention: variant?.peakInfectious ?? null },
    { key: 'totalDeaths', label: 'zgony', kind: 'count', baseline: base?.totalDeaths ?? null, intervention: variant?.totalDeaths ?? null },
    { key: 'hospitalizedEver', label: 'hospitalizacje', kind: 'count', baseline: everHospitalized(baseline), intervention: everHospitalized(intervention) },
    { key: 'totalUnmetCareDays', label: 'dni bez opieki', kind: 'days', baseline: base?.totalUnmetCareDays ?? null, intervention: variant?.totalUnmetCareDays ?? null },
    { key: 'attackRate', label: 'atak populacji', kind: 'percent', baseline: base?.attackRate ?? null, intervention: variant?.attackRate ?? null },
    { key: 'peakBedOccupancy', label: 'szczyt łóżek', kind: 'percent', baseline: base?.peakBedOccupancy ?? null, intervention: variant?.peakBedOccupancy ?? null },
    { key: 'peakIcuOccupancy', label: 'szczyt ICU', kind: 'percent', baseline: base?.peakIcuOccupancy ?? null, intervention: variant?.peakIcuOccupancy ?? null },
  ];
}

/** Replay is a separate existing API call, retained as traceability evidence. */
export function replayScenarioCommandCenter(run: ScenarioCommandCenterRun): readonly [ScenarioReplay, ScenarioReplay] {
  return [replayScenario(run.baseline), replayScenario(run.intervention)];
}
