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
