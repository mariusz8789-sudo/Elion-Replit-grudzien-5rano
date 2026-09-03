/**
 * SCIENTIFIC MODEL / EQUATION — minimal foundation.
 *
 * Not a symbolic-regression engine. A CONTAINER that keeps a proposed model
 * honest: its variables, parameters, units, and — most importantly — which
 * evidence it depends on and whether that evidence has actually validated it.
 *
 * A model is a HYPOTHESIS ABOUT STRUCTURE, not a fact. It starts as
 * `GENERATED_MODEL` and stays there until `validateModel` runs it against
 * `EXPERIMENTAL_RESULT` data and the fit is checked — nothing here upgrades a
 * model's status by narration.
 *
 * THE FOUR KINDS THIS MODULE REFUSES TO CONFLATE:
 *
 *   GENERATED_MODEL     a proposed relationship between variables — a
 *                        hypothesis about STRUCTURE, unverified.
 *   MODEL_PREDICTION     what the model outputs when its parameters are fed
 *                        into it — a computed number, not an observation.
 *   MEASURED_RESULT       a real assay value; what the model is trying to fit.
 *   EXPERIMENTAL_RESULT    the full record of a measurement — imported from
 *                        `experimentalResult.ts`, not redefined here.
 */
export const SCIENTIFIC_MODEL_VERSION = '1.0.0';

export interface ModelVariable {
  symbol: string;
  meaning: string;
  unit: string;
  /** Whether Genesis observes this from data (INPUT) or the model computes it (OUTPUT). */
  role: 'INPUT' | 'OUTPUT';
}

export interface ModelParameter {
  symbol: string;
  meaning: string;
  unit: string;
  /** Null until fitted. A parameter with no value is an unfitted model, not zero. */
  value: number | null;
  /** How the value was obtained, when it exists. Never invented. */
  source: 'FITTED_TO_EVIDENCE' | 'LITERATURE_VALUE' | 'DECLARED_ASSUMPTION' | 'NOT_YET_ESTIMATED';
}

export type ModelStatus = 'GENERATED_MODEL' | 'FITTED' | 'VALIDATED' | 'REJECTED';

export interface ScientificModel {
  modelId: string;
  /** What the model claims, in words — not a claim of truth, a claim of structure. */
  statement: string;
  equationText: string;
  variables: readonly ModelVariable[];
  parameters: readonly ModelParameter[];
  /** Stated up front, so a validation cannot quietly test something the model never assumed. */
  assumptions: readonly string[];
  /** Evidence record ids (from experimentalResult / dataset ingestion) this model is checked against. */
  evidenceDependencyIds: readonly string[];
  status: ModelStatus;
  /** Populated only after `validateModel` runs. */
  validation: ModelValidation | null;
}

export interface BuildModelInput {
  modelId: string;
  statement: string;
  equationText: string;
  variables: readonly ModelVariable[];
  parameters: readonly ModelParameter[];
  assumptions: readonly string[];
  evidenceDependencyIds: readonly string[];
}

/**
 * The only way to construct a model. Every model starts `GENERATED_MODEL`
 * with no validation — there is no input path that skips straight to
 * VALIDATED.
 */
export function buildScientificModel(input: BuildModelInput): ScientificModel {
  if (input.assumptions.length === 0) {
    throw new Error(`Model ${input.modelId} declares no assumptions. A model with unstated assumptions cannot be honestly validated or falsified.`);
  }
  return { ...input, status: 'GENERATED_MODEL', validation: null };
}

export interface ModelDataPoint {
  /** Values for every INPUT variable, keyed by symbol. */
  inputs: Readonly<Record<string, number>>;
  /** The measured value of the (single) OUTPUT variable this point provides. */
  measuredOutput: number;
  /** Provenance of this point — must trace back to a real experimental result. */
  evidenceRecordId: string;
}

export interface ModelValidation {
  pointsChecked: number;
  /** Prediction vs measurement, per point — MODEL_PREDICTION explicitly labelled as such. */
  residuals: readonly { evidenceRecordId: string; measuredOutput: number; modelPrediction: number; residual: number }[];
  meanAbsoluteError: number;
  /** True only when every declared parameter actually has a value — an unfitted model cannot be evaluated. */
  allParametersFitted: boolean;
  verdict: 'VALIDATED' | 'REJECTED' | 'INCONCLUSIVE';
  reason: string;
}

/**
 * Validates a model against real data points.
 *
 * `evaluate` is supplied by the caller — this module holds no equation
 * evaluator of its own, so it can never silently compute a result the caller
 * did not actually implement. A model with an unfitted parameter cannot be
 * evaluated at all: `INCONCLUSIVE`, never a number computed from a missing
 * value.
 */
export function validateModel(
  model: ScientificModel,
  dataPoints: readonly ModelDataPoint[],
  evaluate: (parameters: Readonly<Record<string, number>>, inputs: Readonly<Record<string, number>>) => number | null,
  toleranceMeanAbsoluteError: number,
): ScientificModel {
  const allParametersFitted = model.parameters.every((p) => p.value !== null);
  if (!allParametersFitted || dataPoints.length === 0) {
    const validation: ModelValidation = {
      pointsChecked: 0, residuals: [], meanAbsoluteError: NaN, allParametersFitted,
      verdict: 'INCONCLUSIVE',
      reason: !allParametersFitted
        ? `Model has unfitted parameter(s): ${model.parameters.filter((p) => p.value === null).map((p) => p.symbol).join(', ')}. It cannot be evaluated.`
        : 'No data points were supplied to validate against.',
    };
    return { ...model, status: 'GENERATED_MODEL', validation };
  }

  const parameterValues: Record<string, number> = {};
  for (const p of model.parameters) parameterValues[p.symbol] = p.value!;

  const residuals = dataPoints
    .map((point) => {
      const prediction = evaluate(parameterValues, point.inputs);
      return prediction === null ? null : {
        evidenceRecordId: point.evidenceRecordId,
        measuredOutput: point.measuredOutput,
        modelPrediction: prediction,
        residual: prediction - point.measuredOutput,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (residuals.length === 0) {
    const validation: ModelValidation = {
      pointsChecked: 0, residuals: [], meanAbsoluteError: NaN, allParametersFitted,
      verdict: 'INCONCLUSIVE', reason: 'The evaluator returned no computable prediction for any supplied data point.',
    };
    return { ...model, status: 'GENERATED_MODEL', validation };
  }

  const meanAbsoluteError = residuals.reduce((sum, r) => sum + Math.abs(r.residual), 0) / residuals.length;
  const verdict: ModelValidation['verdict'] = meanAbsoluteError <= toleranceMeanAbsoluteError ? 'VALIDATED' : 'REJECTED';

  const validation: ModelValidation = {
    pointsChecked: residuals.length,
    residuals,
    meanAbsoluteError,
    allParametersFitted,
    verdict,
    reason: `Mean absolute error ${meanAbsoluteError.toFixed(6)} over ${residuals.length} point(s), against a tolerance of ${toleranceMeanAbsoluteError}.`,
  };

  return { ...model, status: verdict === 'VALIDATED' ? 'VALIDATED' : 'REJECTED', validation };
}

/**
 * PARAMETER FITTING — the piece this module never had: a way to go from an
 * UNFITTED model (parameters with `value: null`) to a FITTED one, from
 * TRAINING data only.
 *
 * Deterministic grid search over caller-declared search ranges — not a
 * black-box optimizer, not gradient descent with an opaque stopping rule.
 * Every candidate parameter combination the search considers is one
 * concrete, reproducible point; the result is whichever point minimises
 * mean absolute error on the SUPPLIED training data. This is bounded,
 * auditable, and — because the grid is declared, not adaptive — exactly
 * reproducible from the same inputs.
 *
 * DATA-LEAKAGE DISCIPLINE: this function only ever sees `trainingData`. It
 * has no parameter for holdout data and cannot be called with any — the
 * caller (parameterizedModelFamily.ts) is responsible for the split, and
 * evaluating the FITTED result on held-out data is `validateModel` above,
 * unchanged, called separately.
 */
export interface ParameterSearchRange {
  symbol: string;
  min: number;
  max: number;
  /** Grid resolution along this parameter — must be >= 2 (a single-point "range" is a fixed value, not a search). */
  steps: number;
}

export interface ModelFitResult {
  /** The model with searched parameters now FITTED_TO_EVIDENCE; any parameter not in `searchRanges` is left untouched. */
  model: ScientificModel;
  trainingPointsUsed: number;
  trainingMeanAbsoluteError: number;
  searchRanges: readonly ParameterSearchRange[];
  method: 'GRID_SEARCH';
}

/**
 * Fits ONLY the parameters named in `searchRanges`, over the declared grid,
 * to minimise mean absolute error on `trainingData`. Throws (never returns
 * a fabricated fit) when there is no training data, a declared range names
 * a parameter the model does not have, a range has fewer than 2 steps, or
 * no training point produced a finite prediction anywhere on the grid.
 */
export function fitModelParameters(
  model: ScientificModel,
  trainingData: readonly ModelDataPoint[],
  searchRanges: readonly ParameterSearchRange[],
  evaluate: (parameters: Readonly<Record<string, number>>, inputs: Readonly<Record<string, number>>) => number | null,
): ModelFitResult {
  if (trainingData.length === 0) {
    throw new Error(`Cannot fit model "${model.modelId}": no training data points were supplied.`);
  }
  if (searchRanges.length === 0) {
    throw new Error(`Cannot fit model "${model.modelId}": no parameter search ranges were declared.`);
  }
  for (const range of searchRanges) {
    if (!model.parameters.some((p) => p.symbol === range.symbol)) {
      throw new Error(`Search range declared for "${range.symbol}", which is not a parameter of model "${model.modelId}".`);
    }
    if (range.steps < 2) {
      throw new Error(`Search range for "${range.symbol}" must have at least 2 steps (got ${range.steps}).`);
    }
    if (range.max <= range.min) {
      throw new Error(`Search range for "${range.symbol}" must have max > min (got min=${range.min}, max=${range.max}).`);
    }
  }

  const fixedValues: Record<string, number> = {};
  for (const p of model.parameters) {
    if (!searchRanges.some((r) => r.symbol === p.symbol) && p.value !== null) fixedValues[p.symbol] = p.value;
  }

  const grids = searchRanges.map((r) => Array.from({ length: r.steps }, (_, i) => r.min + (r.max - r.min) * (i / (r.steps - 1))));

  function meanAbsoluteErrorFor(values: readonly number[]): number {
    const parameterValues: Record<string, number> = { ...fixedValues };
    searchRanges.forEach((r, idx) => { parameterValues[r.symbol] = values[idx]!; });
    let sum = 0;
    let count = 0;
    for (const point of trainingData) {
      const prediction = evaluate(parameterValues, point.inputs);
      if (prediction === null || !Number.isFinite(prediction)) continue;
      sum += Math.abs(prediction - point.measuredOutput);
      count++;
    }
    return count === 0 ? Number.POSITIVE_INFINITY : sum / count;
  }

  let best: { values: readonly number[]; mae: number } | null = null;
  function* cartesian(idx: number, acc: number[]): Generator<readonly number[]> {
    // `acc` is mutated in place across the whole recursion (push/pop), so a
    // caller storing a yielded combination (e.g. as the current best) must
    // get an independent snapshot — yielding `acc` itself would hand back a
    // reference that later un-pops back to empty.
    if (idx === grids.length) { yield [...acc]; return; }
    for (const v of grids[idx]!) {
      acc.push(v);
      yield* cartesian(idx + 1, acc);
      acc.pop();
    }
  }
  for (const combo of cartesian(0, [])) {
    const mae = meanAbsoluteErrorFor(combo);
    if (best === null || mae < best.mae) best = { values: combo, mae };
  }

  if (best === null || !Number.isFinite(best.mae)) {
    throw new Error(`Fitting model "${model.modelId}" failed: no point on the declared search grid produced a finite prediction for any training point.`);
  }

  const fittedParameters: ModelParameter[] = model.parameters.map((p) => {
    const idx = searchRanges.findIndex((r) => r.symbol === p.symbol);
    if (idx === -1) return p;
    return { ...p, value: best!.values[idx]!, source: 'FITTED_TO_EVIDENCE' };
  });

  return {
    model: { ...model, parameters: fittedParameters, status: 'FITTED', validation: null },
    trainingPointsUsed: trainingData.length,
    trainingMeanAbsoluteError: best.mae,
    searchRanges,
    method: 'GRID_SEARCH',
  };
}
