/**
 * GENESIS SEEDED UNCERTAINTY
 *
 * A bounded, preregistered seed-sweep for RouterModels explicitly declared as
 * `seeded-stochastic`. It reuses the canonical local Experiment Fabric
 * executor. It is not a new simulator, optimizer, statistical inference
 * engine, stochastic-process model, or confidence-interval calculator.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import { runExperiment } from './executor';
import { getRouterModel, validateStructuredExperimentRequest } from './router';
import type { ExperimentRun, StructuredExperimentRequest } from './types';

export const SEEDED_UNCERTAINTY_VERSION = '1.0.0';
export const MAX_PREREGISTERED_SEEDS = 8;

export interface SeededUncertaintyInput {
  /** A valid request for an existing local seeded-stochastic RouterModel. */
  baselineRequest: StructuredExperimentRequest;
  /** Existing numeric observable to summarize across a fixed set of seeds. */
  metric: string;
  /** Explicit seed list, fixed before any of the arms are executed. */
  seeds: readonly number[];
}

export interface SeededUncertaintyArm {
  seed: number;
  request: StructuredExperimentRequest;
}

export interface SeededUncertaintyPlan {
  contractVersion: string;
  planId: string;
  modelId: string;
  modelVersion: string;
  engine: string;
  metric: string;
  seedArms: readonly SeededUncertaintyArm[];
  planFingerprint: string;
  assumptions: readonly string[];
  limitations: readonly string[];
}

export interface SeededUncertaintySummary {
  metric: string;
  unit: string;
  sampleCount: number;
  mean: number;
  sampleStandardDeviation: number;
  minimum: number;
  maximum: number;
}

export interface SeededUncertaintyEvidence {
  contractVersion: string;
  evidenceId: string;
  plan: SeededUncertaintyPlan;
  runs: readonly ExperimentRun[];
  summary: SeededUncertaintySummary;
  provenanceFingerprint: string;
  createdFromRealRunsOnly: true;
  disclaimer: string;
}

function validateSeeds(seeds: readonly number[]): readonly number[] {
  if (seeds.length < 2 || seeds.length > MAX_PREREGISTERED_SEEDS) {
    throw new Error(`Seeded uncertainty requires 2–${MAX_PREREGISTERED_SEEDS} preregistered seeds.`);
  }
  const unique = new Set<number>();
  for (const seed of seeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new Error('Every preregistered seed must be an unsigned 32-bit integer.');
    }
    if (unique.has(seed)) throw new Error('Preregestred seed values must be unique.');
    unique.add(seed);
  }
  return [...unique].sort((left, right) => left - right);
}

/** True only for models explicitly declared in the Router as seeded-stochastic. */
export function isSeededStochasticModel(modelId: string | undefined): boolean {
  return modelId !== undefined && getRouterModel(modelId)?.executionMode === 'seeded-stochastic';
}

/**
 * Freezes seed arms before execution. It rejects any model not explicitly
 * declared seeded-stochastic and duplicates every seed both as canonical input
 * parameter and ExperimentRun provenance seed.
 */
export function planSeededUncertainty(input: SeededUncertaintyInput): SeededUncertaintyPlan {
  const validation = validateStructuredExperimentRequest(input.baselineRequest);
  if (!validation.ok) throw new Error(`Seeded uncertainty request is invalid: ${validation.errors.join('; ')}`);
  const modelId = input.baselineRequest.modelId;
  if (modelId === undefined) throw new Error('Seeded uncertainty requires an explicit registered modelId.');
  const model = getRouterModel(modelId);
  if (!model || model.executionMode !== 'seeded-stochastic') {
    throw new Error('Seeded uncertainty is available only for an explicitly registered seeded-stochastic model.');
  }
  if (!model.parameters.some((parameter) => parameter.id === 'seed')) {
    throw new Error(`Seeded-stochastic model '${model.id}' has no registered seed parameter.`);
  }
  if (!input.metric || input.metric === 'seed') {
    throw new Error('Seeded uncertainty requires a non-seed numeric observable as metric.');
  }

  const seeds = validateSeeds(input.seeds);
  const seedArms = seeds.map((seed) => ({
    seed,
    request: {
      ...input.baselineRequest,
      seed,
      parameters: { ...input.baselineRequest.parameters, seed },
    },
  }));
  const seed = {
    version: SEEDED_UNCERTAINTY_VERSION,
    modelId: model.id,
    modelVersion: model.modelVersion,
    engine: model.engine,
    metric: input.metric,
    seedArms,
  };
  const planFingerprint = `seed_plan_${fnv1a(canonicalJson(seed))}`;
  return {
    contractVersion: SEEDED_UNCERTAINTY_VERSION,
    planId: planFingerprint,
    modelId: model.id,
    modelVersion: model.modelVersion,
    engine: model.engine,
    metric: input.metric,
    seedArms,
    planFingerprint,
    assumptions: [
      'Każdy seed jest prerejestrowany przed pierwszym runem i przekazany zarówno do parametrów modelu, jak i provenance ExperimentRun.',
      'Wszystkie arms używają tego samego modelu, wersji, engine i parametrów poza seedem.',
      'Arms są wykonywane sekwencyjnie; ten protokół nie uruchamia równoległego sweepu ani HPC.',
    ],
    limitations: [
      'Statystyki opisują wyłącznie skończoną, prerejestrowaną próbę seedów; nie są przedziałem ufności ani uogólnieniem na świat rzeczywisty.',
      'Pojedynczy seed-run jest odtwarzalny przy tym samym seedzie, ale wyniki między seedami mogą się różnić z powodu stochastycznego modelu.',
      'Model, horyzont, rozmiar siatki i każda inne założenie pozostają ograniczeniami istniejącego engine’u.',
    ],
  };
}

function sampleStandardDeviation(values: readonly number[], mean: number): number {
  if (values.length < 2) throw new Error('Sample standard deviation requires at least two values.');
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

/**
 * Executes a frozen plan against canonical `runExperiment()` one arm at a time.
 * All numbers in the summary come directly from completed real-engine runs.
 */
export function executeSeededUncertainty(plan: SeededUncertaintyPlan): SeededUncertaintyEvidence {
  const runs = plan.seedArms.map((arm) => runExperiment(arm.request));
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const arm = plan.seedArms[index];
    if (
      run.result.status !== 'completed'
      || run.provenance.resultOrigin !== 'real-engine'
      || run.provenance.modelId !== plan.modelId
      || run.provenance.modelVersion !== plan.modelVersion
      || run.provenance.engine !== plan.engine
      || run.provenance.seed !== arm.seed
      || run.request.seed !== arm.seed
      || run.request.parameters.seed !== arm.seed
    ) {
      throw new Error(`Seeded uncertainty arm ${index + 1} did not return a valid real-engine run with complete seed provenance.`);
    }
  }

  const values = runs.map((run) => run.result.outputs[plan.metric]);
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Metric '${plan.metric}' is not a finite numeric observable in every completed seed arm.`);
  }
  const numericValues = values as number[];
  const units = runs.map((run) => run.result.units[plan.metric] ?? '');
  if (new Set(units).size !== 1) throw new Error(`Metric '${plan.metric}' has inconsistent units across seed arms.`);

  const mean = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  const summary: SeededUncertaintySummary = {
    metric: plan.metric,
    unit: units[0],
    sampleCount: numericValues.length,
    mean,
    sampleStandardDeviation: sampleStandardDeviation(numericValues, mean),
    minimum: Math.min(...numericValues),
    maximum: Math.max(...numericValues),
  };
  const provenanceFingerprint = `seed_evidence_${fnv1a(canonicalJson({
    version: SEEDED_UNCERTAINTY_VERSION,
    plan: plan.planFingerprint,
    runs: runs.map((run) => ({ runId: run.runId, fingerprint: run.provenance.runFingerprint, seed: run.provenance.seed })),
    summary,
  }))}`;
  return {
    contractVersion: SEEDED_UNCERTAINTY_VERSION,
    evidenceId: provenanceFingerprint,
    plan,
    runs,
    summary,
    provenanceFingerprint,
    createdFromRealRunsOnly: true,
    disclaimer: 'To jest opisowa zmienność skończonej, prerejestrowanej próbki seedów w granicach istniejącego stochastycznego modelu. Nie jest to discovery, test hipotezy, przedział ufności, kalibracja ani predykcja świata rzeczywistego.',
  };
}

/** Replay re-executes the same frozen seed arms through the canonical executor. */
export function replaySeededUncertainty(plan: SeededUncertaintyPlan): SeededUncertaintyEvidence {
  return executeSeededUncertainty(plan);
}
