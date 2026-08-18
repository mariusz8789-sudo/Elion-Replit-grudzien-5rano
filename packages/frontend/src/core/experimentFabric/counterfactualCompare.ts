import { canonicalJson, fnv1a } from '../events/hash';
import { runExperiment } from './executor';
import { validateStructuredExperimentRequest } from './router';
import type { ExperimentRun, ExperimentValue, StructuredExperimentRequest } from './types';

export const COUNTERFACTUAL_COMPARISON_VERSION = '1.0.0';

export type CounterfactualComparisonStatus =
  | 'COMPLETED'
  | 'BLOCKED_INVALID_REQUEST'
  | 'BLOCKED_MODEL_MISMATCH'
  | 'INCOMPLETE_RUN'
  | 'NO_SHARED_NUMERIC_METRICS';

export type SeedControlStatus = 'MATCHED' | 'MISMATCHED' | 'UNSPECIFIED' | 'DETERMINISTIC_NO_SEED';

export interface CounterfactualComparisonInput {
  baseline: StructuredExperimentRequest;
  variant: StructuredExperimentRequest;
  labels?: Readonly<{ baseline?: string; variant?: string }>;
}

export interface CounterfactualModelIdentity {
  domainId: string;
  modelId: string;
  modelVersion?: string;
  engine: string | null;
}

export interface ParameterDifference {
  key: string;
  baseline?: ExperimentValue;
  variant?: ExperimentValue;
  changed: boolean;
}

export interface CounterfactualMetric {
  key: string;
  baseline: number;
  variant: number;
  absoluteDelta: number;
  relativeDeltaPercent: number | null;
  relativeDeltaStatus: 'AVAILABLE' | 'BASELINE_ZERO';
  unit: string;
}

export interface CounterfactualEvidence {
  baselineRunId: string;
  variantRunId: string;
  baselineRunFingerprint: string;
  variantRunFingerprint: string;
  baselineResultOrigin: ExperimentRun['provenance']['resultOrigin'];
  variantResultOrigin: ExperimentRun['provenance']['resultOrigin'];
}

/**
 * A model-first comparison of two real runs of exactly the same registered model.
 * It never creates a simulator, output, World State or provenance source of its own.
 */
export interface CounterfactualComparison {
  contractVersion: string;
  comparisonId: string;
  status: CounterfactualComparisonStatus;
  labels: { baseline: string; variant: string };
  model: CounterfactualModelIdentity | null;
  seedControl: { status: SeedControlStatus; baselineSeed?: number; variantSeed?: number };
  parameterDifferences: readonly ParameterDifference[];
  metrics: readonly CounterfactualMetric[];
  baseline?: ExperimentRun;
  variant?: ExperimentRun;
  evidence?: CounterfactualEvidence;
  validationErrors: readonly string[];
  disclaimer: string;
}

function stableComparisonId(input: CounterfactualComparisonInput, status: CounterfactualComparisonStatus, baselineFingerprint?: string, variantFingerprint?: string): string {
  return `counterfactual_${fnv1a(canonicalJson({
    version: COUNTERFACTUAL_COMPARISON_VERSION,
    status,
    labels: input.labels ?? {},
    baseline: baselineFingerprint ?? input.baseline,
    variant: variantFingerprint ?? input.variant,
  }))}`;
}

function labelsFor(input: CounterfactualComparisonInput): { baseline: string; variant: string } {
  return { baseline: input.labels?.baseline ?? 'Wariant A', variant: input.labels?.variant ?? 'Wariant B' };
}

function seedControlFor(baseline: ExperimentRun, variant: ExperimentRun): CounterfactualComparison['seedControl'] {
  const baselineSeed = baseline.provenance.seed;
  const variantSeed = variant.provenance.seed;
  if (baselineSeed !== undefined && variantSeed !== undefined) {
    return { status: baselineSeed === variantSeed ? 'MATCHED' : 'MISMATCHED', baselineSeed, variantSeed };
  }
  if (baselineSeed === undefined && variantSeed === undefined && baseline.provenance.deterministic && variant.provenance.deterministic) {
    return { status: 'DETERMINISTIC_NO_SEED' };
  }
  return { status: 'UNSPECIFIED', ...(baselineSeed === undefined ? {} : { baselineSeed }), ...(variantSeed === undefined ? {} : { variantSeed }) };
}

function parameterDifferencesFor(baseline: ExperimentRun, variant: ExperimentRun): readonly ParameterDifference[] {
  const baselineParameters = baseline.provenance.parameterSnapshot;
  const variantParameters = variant.provenance.parameterSnapshot;
  const keys = Array.from(new Set([...Object.keys(baselineParameters), ...Object.keys(variantParameters)])).sort();
  return keys.map((key) => {
    const baselineValue = baselineParameters[key];
    const variantValue = variantParameters[key];
    return {
      key,
      ...(baselineValue === undefined ? {} : { baseline: baselineValue }),
      ...(variantValue === undefined ? {} : { variant: variantValue }),
      changed: canonicalJson(baselineValue) !== canonicalJson(variantValue),
    };
  });
}

function sharedNumericMetricsFor(baseline: ExperimentRun, variant: ExperimentRun): readonly CounterfactualMetric[] {
  const baselineOutputs = baseline.result.outputs;
  const variantOutputs = variant.result.outputs;
  const keys = Object.keys(baselineOutputs).filter((key) => Object.hasOwn(variantOutputs, key)).sort();
  const metrics: CounterfactualMetric[] = [];

  for (const key of keys) {
    const baselineValue = baselineOutputs[key];
    const variantValue = variantOutputs[key];
    if (typeof baselineValue !== 'number' || !Number.isFinite(baselineValue) || typeof variantValue !== 'number' || !Number.isFinite(variantValue)) continue;
    const baselineUnit = baseline.result.units[key] ?? '';
    const variantUnit = variant.result.units[key] ?? '';
    if (baselineUnit !== variantUnit) continue;
    const absoluteDelta = variantValue - baselineValue;
    metrics.push({
      key,
      baseline: baselineValue,
      variant: variantValue,
      absoluteDelta,
      relativeDeltaPercent: baselineValue === 0 ? null : (absoluteDelta / Math.abs(baselineValue)) * 100,
      relativeDeltaStatus: baselineValue === 0 ? 'BASELINE_ZERO' : 'AVAILABLE',
      unit: baselineUnit,
    });
  }
  return metrics;
}

function modelFor(run: ExperimentRun): CounterfactualModelIdentity {
  return {
    domainId: run.provenance.domainId,
    modelId: run.provenance.modelId ?? run.request.modelId ?? 'unknown-model',
    ...(run.provenance.modelVersion === undefined ? {} : { modelVersion: run.provenance.modelVersion }),
    engine: run.provenance.engine,
  };
}

function incomplete(input: CounterfactualComparisonInput, status: 'BLOCKED_INVALID_REQUEST' | 'BLOCKED_MODEL_MISMATCH', validationErrors: readonly string[]): CounterfactualComparison {
  return {
    contractVersion: COUNTERFACTUAL_COMPARISON_VERSION,
    comparisonId: stableComparisonId(input, status),
    status,
    labels: labelsFor(input),
    model: null,
    seedControl: { status: 'UNSPECIFIED' },
    parameterDifferences: [],
    metrics: [],
    validationErrors,
    disclaimer: 'Porównanie kontrfaktyczne nie zostało uruchomione. Genesis nie tworzy wyniku, gdy request jest nieprawidłowy albo warianty wskazują różne modele.',
  };
}

/**
 * Compares two requests for the same registered model. All observable numbers are taken
 * directly from the two canonical ExperimentRun records produced by the existing executor.
 */
export function compareCounterfactual(input: CounterfactualComparisonInput): CounterfactualComparison {
  const baselineValidation = validateStructuredExperimentRequest(input.baseline);
  const variantValidation = validateStructuredExperimentRequest(input.variant);
  if (!baselineValidation.ok || !variantValidation.ok) {
    return incomplete(input, 'BLOCKED_INVALID_REQUEST', [
      ...baselineValidation.errors.map((error) => `baseline: ${error}`),
      ...variantValidation.errors.map((error) => `variant: ${error}`),
    ]);
  }
  if (input.baseline.domainId !== input.variant.domainId || input.baseline.modelId === undefined || input.baseline.modelId !== input.variant.modelId) {
    return incomplete(input, 'BLOCKED_MODEL_MISMATCH', [
      'Counterfactual Evidence Compare wymaga identycznej domeny i modelId po obu stronach. Porównanie różnych modeli jest osobnym, niewdrożonym protokołem Model-vs-Model.',
    ]);
  }

  const baseline = runExperiment(input.baseline);
  const variant = runExperiment(input.variant);
  const model = modelFor(baseline);
  const seedControl = seedControlFor(baseline, variant);
  const parameterDifferences = parameterDifferencesFor(baseline, variant);
  const evidence: CounterfactualEvidence = {
    baselineRunId: baseline.runId,
    variantRunId: variant.runId,
    baselineRunFingerprint: baseline.provenance.runFingerprint,
    variantRunFingerprint: variant.provenance.runFingerprint,
    baselineResultOrigin: baseline.provenance.resultOrigin,
    variantResultOrigin: variant.provenance.resultOrigin,
  };
  const bothCompleted = baseline.result.status === 'completed' && variant.result.status === 'completed';
  const metrics = bothCompleted ? sharedNumericMetricsFor(baseline, variant) : [];
  const status: CounterfactualComparisonStatus = !bothCompleted
    ? 'INCOMPLETE_RUN'
    : metrics.length === 0
      ? 'NO_SHARED_NUMERIC_METRICS'
      : 'COMPLETED';

  return {
    contractVersion: COUNTERFACTUAL_COMPARISON_VERSION,
    comparisonId: stableComparisonId(input, status, baseline.provenance.runFingerprint, variant.provenance.runFingerprint),
    status,
    labels: labelsFor(input),
    model,
    seedControl,
    parameterDifferences,
    metrics,
    baseline,
    variant,
    evidence,
    validationErrors: [],
    disclaimer: 'Porównanie przedstawia wyłącznie różnicę między dwoma realnymi runami tego samego modelu w zadanych parametrach. Nie jest predykcją świata rzeczywistego, rekomendacją działania, dowodem przyczynowości ani odkryciem naukowym.',
  };
}

export function serializeCounterfactualComparison(comparison: CounterfactualComparison): string {
  return canonicalJson(comparison);
}
