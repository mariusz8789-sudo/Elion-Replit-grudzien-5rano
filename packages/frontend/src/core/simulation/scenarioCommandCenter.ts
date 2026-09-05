import type { SimParams } from '../types';
import type { EpidemicCityParams } from './epidemicCity';
import {
  SCENARIOS,
  DEFAULT_SCENARIO_RUN,
  replayScenario,
  type ScenarioComparison,
  type ScenarioId,
  type ScenarioReplay,
  type ScenarioRun,
} from './scenarioEngine';
import { runScenarioCounterfactual, type ScenarioCounterfactual } from './scenarioCounterfactual';
import { buildTemporalTimeline, type TemporalTimeline } from './temporalState';
import { runTemporalMultiverse, type TemporalMultiverse } from './temporalMultiverse';
import { registerScenarioTimeline, setPendingScenarioTimeline } from '../experimentFabric/worldHandoff';

/**
 * Scenario Command Center adapter: converts only the existing live City parameter
 * state into Scenario Engine inputs, then exposes read-only runs and comparisons.
 * It does not mutate EpidemicCitySimulation or create a second epidemiological model.
 *
 * BASELINE i INTERVENTION przechodzą przez ISTNIEJĄCY silnik kontrfaktyczny
 * (`runScenarioCounterfactual`), a nie przez dwa osobne wywołania `runScenario`.
 * Wcześniej ten adapter liczył różnicę tylko przez `compareScenarios` i nie miał
 * pojęcia, KTÓREGO dnia światy faktycznie się rozeszły — `firstDivergentDay` był
 * dostępny w silniku od dawna, po prostu ten adapter po niego nie sięgał. Nie
 * powstaje żadna trzecia ścieżka porównania: to przepięcie na istniejącą, nie
 * dodanie kolejnej.
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
  counterfactual: ScenarioCounterfactual;
  /** Dzień MIERZONY na obu seriach — nie deklarowany dzień wejścia interwencji. */
  firstDivergentDay: number | null;
  counterfactualFingerprint: string;
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

/**
 * Runs BASELINE and the chosen intervention through the one existing
 * counterfactual engine. Both arms start at day 0 — this adapter has no UI
 * control for a delayed intervention — so this is behaviourally identical to
 * the two direct `runScenario` calls it replaces, plus a real measured
 * divergence day the old adapter never exposed.
 */
export function runScenarioCommandCenter(
  intervention: ScenarioId,
  params: SimParams,
  options: { variantInterventionStartDay?: number } = {},
): ScenarioCommandCenterRun {
  const variantInterventionStartDay = options.variantInterventionStartDay === undefined
    ? 0
    : Math.max(0, Math.floor(options.variantInterventionStartDay));
  const counterfactual = runScenarioCounterfactual({
    baselineScenarioId: 'BASELINE',
    variantScenarioId: intervention,
    days: DEFAULT_SCENARIO_RUN.days,
    stepsPerDay: DEFAULT_SCENARIO_RUN.stepsPerDay,
    baseParams: scenarioParamsFromCommandCenter(params),
    variantInterventionStartDay,
  });
  return {
    baseline: counterfactual.baseline,
    intervention: counterfactual.variant,
    comparison: counterfactual.comparison,
    counterfactual,
    firstDivergentDay: counterfactual.firstDivergentDay,
    counterfactualFingerprint: counterfactual.counterfactualFingerprint,
  };
}

/** Opens the measured variant in the existing World/3D timeline handoff. */
export function openScenarioVariantInWorld(run: ScenarioCommandCenterRun): string | null {
  if (run.intervention.status !== 'COMPLETED' || run.intervention.summary === null || run.intervention.resultFingerprint === null) return null;
  const handoffRunId = `what-if:${run.counterfactualFingerprint}`;
  registerScenarioTimeline({
    runId: handoffRunId,
    runFingerprint: run.intervention.resultFingerprint,
    resultOrigin: 'real-engine',
    modelId: 'scenario-timeline',
    scenarioId: run.intervention.scenarioId,
    scenarioLabel: SCENARIOS[run.intervention.scenarioId].label,
    seed: run.intervention.params.seed,
    summary: `Wariant WHAT IF: ${run.intervention.label}, od dnia ${run.intervention.interventionStartDay}, wynik z istniejącego counterfactual engine.`,
    series: run.intervention.series,
    scenarioSummary: run.intervention.summary,
    scenarioRun: run.intervention,
    epistemicStatus: 'SIMULATION',
    origin: 'fabric-run',
    counterfactual: run.counterfactual,
  });
  return setPendingScenarioTimeline(handoffRunId) ? handoffRunId : null;
}

/**
 * Oś czasu obu ramion do przewijania w UI. `null`, kiedy którekolwiek ramię
 * nie zostało wykonane (NOT_MODELED) — oś czasu bez realnego przebiegu nie
 * miałaby czego pokazywać.
 */
export function temporalTimelinesFor(run: ScenarioCommandCenterRun): { baseline: TemporalTimeline; variant: TemporalTimeline } | null {
  if (run.baseline.status !== 'COMPLETED' || run.intervention.status !== 'COMPLETED') return null;
  return {
    baseline: buildTemporalTimeline(run.baseline, 'BASELINE'),
    variant: buildTemporalTimeline(run.intervention, 'VARIANT'),
  };
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


/** Runs the existing many-worlds core from the live City parameter state. */
export function runTemporalMultiverseCommandCenter(
  branchScenarioIds: readonly ScenarioId[],
  params: SimParams,
  options: { branchInterventionStartDay?: number } = {},
): TemporalMultiverse {
  const interventionStartDay = options.branchInterventionStartDay === undefined
    ? 0
    : Math.max(0, Math.floor(options.branchInterventionStartDay));
  return runTemporalMultiverse({
    baselineScenarioId: 'BASELINE',
    days: DEFAULT_SCENARIO_RUN.days,
    stepsPerDay: DEFAULT_SCENARIO_RUN.stepsPerDay,
    baseParams: scenarioParamsFromCommandCenter(params),
    branches: branchScenarioIds.map((scenarioId, index) => ({
      branchId: String.fromCharCode('B'.charCodeAt(0) + index),
      scenarioId,
      interventionStartDay,
    })),
  });
}

/** Hands one verified multiverse branch to the existing single-world renderer. */
export function openTemporalMultiverseBranchInWorld(multiverse: TemporalMultiverse, branchId: string): string | null {
  const branch = multiverse.branches.find((candidate) => candidate.branchId === branchId);
  if (!branch || branch.run.status !== 'COMPLETED' || branch.run.summary === null || branch.run.resultFingerprint === null) return null;
  const handoffRunId = `multiverse:${multiverse.multiverseFingerprint}:${branchId}`;
  registerScenarioTimeline({
    runId: handoffRunId,
    runFingerprint: branch.run.resultFingerprint,
    resultOrigin: 'real-engine',
    modelId: 'scenario-timeline',
    scenarioId: branch.run.scenarioId,
    scenarioLabel: branch.run.label,
    seed: branch.run.params.seed,
    summary: `Multiverse ${branchId}: ${branch.run.label}; first divergence from baseline: ${branch.firstDivergentDayFromBaseline === null ? 'NOT_AVAILABLE' : `day ${branch.firstDivergentDayFromBaseline}`}.`,
    series: branch.run.series,
    scenarioSummary: branch.run.summary,
    scenarioRun: branch.run,
    epistemicStatus: 'SIMULATION',
    origin: 'fabric-run',
  });
  return setPendingScenarioTimeline(handoffRunId) ? handoffRunId : null;
}
