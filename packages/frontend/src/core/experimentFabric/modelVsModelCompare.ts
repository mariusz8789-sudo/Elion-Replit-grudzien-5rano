import { canonicalJson, fnv1a } from '../events/hash';
import { modelFor, seedControlFor, type CounterfactualComparison, type CounterfactualModelIdentity } from './counterfactualCompare';
import { runExperiment } from './executor';
import { validateStructuredExperimentRequest } from './router';
import type { ExperimentRun, StructuredExperimentRequest } from './types';

/**
 * COUNTERFACTUAL MODEL TOURNAMENT — Model A vs Model B.
 *
 * `counterfactualCompare.ts::compareCounterfactual` EXPLICITLY refuses to
 * compare two different `modelId`s (see its own `BLOCKED_MODEL_MISMATCH`
 * message: "Porównanie różnych modeli jest osobnym, niewdrożonym
 * protokołem Model-vs-Model."). This module IS that protocol — the gap the
 * existing code already named. It reuses `runExperiment`, `modelFor` and
 * `seedControlFor` from `counterfactualCompare.ts` unchanged; it does not
 * duplicate them or build a second execution/provenance system.
 *
 * A tournament compares TWO DIFFERENT real, registered models on ONE named
 * shared observable (the same output field name on both sides — e.g.
 * `kineticEnergyMeV` on both `particle-relativistic-energy` and
 * `particle-newtonian-energy`). No metric-name mapping layer is invented:
 * if a caller wants to compare models whose outputs are named differently,
 * they are not comparable through this contract, and this module says so
 * (`OBSERVABLE_NOT_SHARED`) rather than guessing an alias.
 */
export const MODEL_VS_MODEL_COMPARE_VERSION = '1.0.0';

export type ModelVsModelStatus =
  | 'COMPLETED'
  | 'BLOCKED_INVALID_REQUEST'
  | 'BLOCKED_SAME_MODEL'
  | 'INCOMPLETE_RUN'
  | 'OBSERVABLE_NOT_SHARED';

export interface ModelVsModelMetric {
  key: string;
  modelAValue: number;
  modelBValue: number;
  absoluteDelta: number;
  /** |A-B| relative to the larger magnitude of the two — 0 = models agree exactly, 1 = maximal divergence on this scale. Never called "information gain" or a probability: it is a plain normalized distance. */
  relativeDivergence: number;
  unit: string;
}

export interface ModelVsModelComparison {
  contractVersion: string;
  comparisonId: string;
  status: ModelVsModelStatus;
  labels: { modelA: string; modelB: string };
  modelA: CounterfactualModelIdentity | null;
  modelB: CounterfactualModelIdentity | null;
  observableKey: string;
  metric: ModelVsModelMetric | null;
  seedControl: CounterfactualComparison['seedControl'] | null;
  runA?: ExperimentRun;
  runB?: ExperimentRun;
  validationErrors: readonly string[];
  disclaimer: string;
}

export interface ModelVsModelComparisonInput {
  observableKey: string;
  modelA: StructuredExperimentRequest;
  modelB: StructuredExperimentRequest;
  labels?: Readonly<{ modelA?: string; modelB?: string }>;
}

function labelsFor(input: ModelVsModelComparisonInput): { modelA: string; modelB: string } {
  return { modelA: input.labels?.modelA ?? 'Model A', modelB: input.labels?.modelB ?? 'Model B' };
}

function blocked(input: ModelVsModelComparisonInput, status: ModelVsModelStatus, validationErrors: readonly string[], disclaimer: string): ModelVsModelComparison {
  return {
    contractVersion: MODEL_VS_MODEL_COMPARE_VERSION,
    comparisonId: `modelvsmodel_${fnv1a(canonicalJson({ v: MODEL_VS_MODEL_COMPARE_VERSION, status, input }))}`,
    status, labels: labelsFor(input), modelA: null, modelB: null, observableKey: input.observableKey,
    metric: null, seedControl: null, validationErrors, disclaimer,
  };
}

function relativeDivergence(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : Math.abs(a - b) / scale;
}

/**
 * Runs BOTH models for real (via the existing `runExperiment`) and compares
 * their real, independently computed values for one declared shared
 * observable. Every number in the result is read straight from the two
 * `ExperimentRun`s; nothing here recomputes physics.
 */
export function compareModelVsModel(input: ModelVsModelComparisonInput): ModelVsModelComparison {
  const validA = validateStructuredExperimentRequest(input.modelA);
  const validB = validateStructuredExperimentRequest(input.modelB);
  if (!validA.ok || !validB.ok) {
    return blocked(input, 'BLOCKED_INVALID_REQUEST',
      [...validA.errors.map((e) => `modelA: ${e}`), ...validB.errors.map((e) => `modelB: ${e}`)],
      'Turniej modeli nie został uruchomiony: co najmniej jeden request jest nieprawidłowy.');
  }
  if (input.modelA.modelId !== undefined && input.modelA.modelId === input.modelB.modelId) {
    return blocked(input, 'BLOCKED_SAME_MODEL', [
      'Model-vs-Model wymaga DWÓCH RÓŻNYCH modeli. Ten sam modelId po obu stronach to porównanie parametrów w obrębie jednego modelu — użyj compareCounterfactual.',
    ], 'Turniej modeli wymaga dwóch różnych, realnych, zarejestrowanych modeli.');
  }

  const runA = runExperiment(input.modelA);
  const runB = runExperiment(input.modelB);
  const modelA = modelFor(runA);
  const modelB = modelFor(runB);
  const bothCompleted = runA.result.status === 'completed' && runB.result.status === 'completed';
  if (!bothCompleted) {
    return {
      contractVersion: MODEL_VS_MODEL_COMPARE_VERSION,
      comparisonId: `modelvsmodel_${fnv1a(canonicalJson({ v: MODEL_VS_MODEL_COMPARE_VERSION, a: runA.provenance.runFingerprint, b: runB.provenance.runFingerprint }))}`,
      status: 'INCOMPLETE_RUN', labels: labelsFor(input), modelA, modelB, observableKey: input.observableKey,
      metric: null, seedControl: null, runA, runB, validationErrors: [],
      disclaimer: 'Co najmniej jeden model nie ukończył realnego przebiegu — porównanie byłoby zmyśleniem różnicy.',
    };
  }

  const valueA = runA.result.outputs[input.observableKey];
  const valueB = runB.result.outputs[input.observableKey];
  const unitA = runA.result.units[input.observableKey] ?? '';
  const unitB = runB.result.units[input.observableKey] ?? '';
  const sharedNumeric = typeof valueA === 'number' && Number.isFinite(valueA) && typeof valueB === 'number' && Number.isFinite(valueB) && unitA === unitB;
  const comparisonId = `modelvsmodel_${fnv1a(canonicalJson({ v: MODEL_VS_MODEL_COMPARE_VERSION, a: runA.provenance.runFingerprint, b: runB.provenance.runFingerprint, key: input.observableKey }))}`;
  if (!sharedNumeric) {
    return {
      contractVersion: MODEL_VS_MODEL_COMPARE_VERSION, comparisonId, status: 'OBSERVABLE_NOT_SHARED',
      labels: labelsFor(input), modelA, modelB, observableKey: input.observableKey, metric: null, seedControl: null,
      runA, runB, validationErrors: [],
      disclaimer: `„${input.observableKey}" nie jest wspólną liczbową obserwablą o tej samej jednostce w obu realnych wynikach — nic tu nie zostało zmyślone zamiast tego.`,
    };
  }

  const metric: ModelVsModelMetric = {
    key: input.observableKey, modelAValue: valueA, modelBValue: valueB,
    absoluteDelta: valueB - valueA, relativeDivergence: relativeDivergence(valueA, valueB), unit: unitA,
  };
  return {
    contractVersion: MODEL_VS_MODEL_COMPARE_VERSION, comparisonId, status: 'COMPLETED',
    labels: labelsFor(input), modelA, modelB, observableKey: input.observableKey, metric,
    seedControl: seedControlFor(runA, runB), runA, runB, validationErrors: [],
    disclaimer: 'Porównanie przedstawia wyłącznie różnicę między dwoma realnymi, niezależnie policzonymi modelami na jednej wspólnej obserwabli. Nie jest predykcją świata rzeczywistego, dowodem przyczynowości ani rekomendacją, który model jest "prawdziwy".',
  };
}

export interface DivergenceSweepPoint {
  parameterValue: number;
  comparison: ModelVsModelComparison;
}

export interface DivergenceSweepResult {
  contractVersion: string;
  observableKey: string;
  sweepParameter: string;
  points: readonly DivergenceSweepPoint[];
  /** The input value at which the two models disagree MOST, by the plain relativeDivergence heuristic above — never called "information gain" or a probability, because no calibrated scoring model backs it. */
  mostDiscriminatingValue: number | null;
  mostDiscriminatingDivergence: number | null;
  reasoning: string;
}

/**
 * Sweeps ONE shared parameter across declared values, running the real
 * tournament at each point, and reports where the two models diverge most —
 * answering "what experiment would best distinguish Model A from Model B?"
 * with a real, deterministic, and honestly-labeled heuristic (largest
 * relative divergence), not a calibrated information-theoretic score.
 */
export function sweepModelDivergence(
  baseA: StructuredExperimentRequest,
  baseB: StructuredExperimentRequest,
  sweepParameter: string,
  values: readonly number[],
  observableKey: string,
  labels?: Readonly<{ modelA?: string; modelB?: string }>,
): DivergenceSweepResult {
  const points: DivergenceSweepPoint[] = values.map((value) => ({
    parameterValue: value,
    comparison: compareModelVsModel({
      observableKey,
      modelA: { ...baseA, parameters: { ...baseA.parameters, [sweepParameter]: value } },
      modelB: { ...baseB, parameters: { ...baseB.parameters, [sweepParameter]: value } },
      ...(labels === undefined ? {} : { labels }),
    }),
  }));

  const decisive = points.filter((p) => p.comparison.status === 'COMPLETED' && p.comparison.metric !== null);
  const best = decisive.length === 0 ? null : decisive.reduce((a, b) => (b.comparison.metric!.relativeDivergence > a.comparison.metric!.relativeDivergence ? b : a));

  return {
    contractVersion: MODEL_VS_MODEL_COMPARE_VERSION,
    observableKey,
    sweepParameter,
    points,
    mostDiscriminatingValue: best?.parameterValue ?? null,
    mostDiscriminatingDivergence: best?.comparison.metric?.relativeDivergence ?? null,
    reasoning: best === null
      ? `Żaden z ${values.length} punktów przemiatania nie dał kompletnego, wspólnego porównania — nie ma podstaw, by wskazać eksperyment rozróżniający.`
      : `Największa realna rozbieżność (heurystyka: znormalizowana różnica względna, NIE information gain ani prawdopodobieństwo) wystąpiła przy ${sweepParameter}=${best.parameterValue}: ${best.comparison.metric!.relativeDivergence.toFixed(4)}. To punkt, w którym realne wykonanie obu modeli różni się najbardziej na obserwabli ${observableKey}.`,
  };
}
