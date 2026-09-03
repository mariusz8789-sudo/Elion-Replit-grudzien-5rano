/**
 * PARAMETERIZED MODEL FAMILY — the "generate variants, fit, holdout-test,
 * compare" generation strategy.
 *
 * REUSES, DOES NOT DUPLICATE:
 *   - `buildScientificModel` / `ScientificModel` / `ModelDataPoint` from
 *     scientificModel.ts, unchanged;
 *   - `fitModelParameters` (scientificModel.ts) for TRAINING-only fitting;
 *   - `validateModel` (scientificModel.ts), UNCHANGED, for HOLDOUT
 *     evaluation — the exact same function every other model-checking path
 *     in this engine already uses;
 *   - `formalizeGeneratedHypothesis` / `checkGeneratedHypothesis` /
 *     `testGeneratedHypothesis` (hypothesisGeneration.ts) for the shared
 *     GENERATED -> FORMALIZED -> CHECKED -> TESTED lifecycle and verdict
 *     vocabulary, so a parameterized-model-family candidate is governed by
 *     the identical discipline as every other generated hypothesis.
 *
 * THE FLOW: MODEL FAMILY -> GENERATE VARIANTS -> FIT PARAMETERS (training
 * only) -> HOLDOUT TEST (validateModel, unchanged) -> COMPARE -> VERDICT.
 *
 * DATA-LEAKAGE DISCIPLINE: `runParameterizedModelFamily` takes
 * `trainingData` and `holdoutData` as SEPARATE arguments. Fitting
 * (`fitModelParameters`) only ever receives `trainingData`; evaluation
 * (`validateModel`) only ever receives `holdoutData`. Neither function is
 * given the union, and nothing in this module merges them.
 */
import {
  buildScientificModel,
  fitModelParameters,
  validateModel,
  type ModelDataPoint,
  type ModelParameter,
  type ModelVariable,
  type ParameterSearchRange,
} from './molecular/scientificModel';
import {
  checkGeneratedHypothesis,
  formalizeGeneratedHypothesis,
  testGeneratedHypothesis,
  type GeneratedHypothesis,
  type GeneratedHypothesisVerdict,
} from './hypothesisGeneration';
import { saveExperiment, type SavedExperiment } from '../scienceMemory';

export const PARAMETERIZED_MODEL_FAMILY_VERSION = '1.0.0';

/**
 * One variant's declared structure. `parameters` are UNFITTED (value: null)
 * — this module refuses a variant that declares a pre-set value for a
 * parameter it also lists in `searchRanges`, since that would silently
 * decide the fit before running it.
 */
export interface ModelFamilyVariantSpec {
  variantId: string;
  statement: string;
  equationText: string;
  variables: readonly ModelVariable[];
  parameters: readonly ModelParameter[];
  assumptions: readonly string[];
  searchRanges: readonly ParameterSearchRange[];
  evaluate: (parameters: Readonly<Record<string, number>>, inputs: Readonly<Record<string, number>>) => number | null;
}

export interface ModelFamily {
  familyId: string;
  domainId: string;
  description: string;
  variants: readonly ModelFamilyVariantSpec[];
}

export interface VariantOutcome {
  variantId: string;
  candidate: GeneratedHypothesis;
  /** Null only when fitting itself failed (BLOCKED) — never a fabricated fit. */
  fit: { trainingMeanAbsoluteError: number; trainingPointsUsed: number } | null;
  /** Null when no holdout data was available, or fitting failed. */
  holdoutMeanAbsoluteError: number | null;
  holdoutPointsUsed: number;
}

export interface ModelFamilyComparisonResult {
  contractVersion: string;
  familyId: string;
  trainingPointCount: number;
  holdoutPointCount: number;
  outcomes: readonly VariantOutcome[];
  /** The lowest-holdout-error variant AMONG THOSE VERDICTED SUPPORTED — null if none was. Never picks a "best of a bad lot". */
  winningVariantId: string | null;
  resultFingerprint: string;
}

function fingerprintOf(outcomes: readonly VariantOutcome[]): string {
  // Includes the candidate's own (draft-level) fingerprint AND the actual
  // computed outcome (verdict, fit, holdout error) — the draft fingerprint
  // alone would stay identical across a training/holdout data change that
  // still happens to reach the same verdict, hiding exactly the kind of
  // drift replay exists to catch.
  const json = JSON.stringify(
    outcomes
      .map((o) => ({
        variantId: o.variantId,
        candidateFingerprint: o.candidate.fingerprint,
        status: o.candidate.status,
        verdict: o.candidate.verdict,
        fit: o.fit,
        holdoutMeanAbsoluteError: o.holdoutMeanAbsoluteError,
        holdoutPointsUsed: o.holdoutPointsUsed,
      }))
      .sort((a, b) => a.variantId.localeCompare(b.variantId)),
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function buildVariantCandidate(
  family: ModelFamily,
  variant: ModelFamilyVariantSpec,
  trainingData: readonly ModelDataPoint[],
  holdoutData: readonly ModelDataPoint[],
  holdoutToleranceMeanAbsoluteError: number,
): { candidate: GeneratedHypothesis; fit: { trainingMeanAbsoluteError: number; trainingPointsUsed: number } | null; holdoutMeanAbsoluteError: number | null; holdoutPointsUsed: number } {
  const inputVars = variant.variables.filter((v) => v.role === 'INPUT').map((v) => v.symbol);
  const draft = {
    hypothesisId: `${family.familyId}:${variant.variantId}`,
    domainId: family.domainId,
    statement: variant.statement,
    strategy: 'PARAMETERIZED_MODEL_FAMILY' as const,
    dependencyIds: [family.familyId, ...inputVars],
    assumptions: variant.assumptions,
    generationRationale: `Generated as a variant of model family "${family.familyId}": ${family.description}. This variant's functional form is ${variant.equationText}.`,
    expectedPrediction: `Fitted parameters (${variant.searchRanges.map((r) => r.symbol).join(', ')}) will generalise to held-out data within a mean absolute error of ${holdoutToleranceMeanAbsoluteError}.`,
    falsificationCriteria: `Falsified if, after fitting ${variant.searchRanges.map((r) => r.symbol).join(', ')} on training data ONLY, this variant's predictions on held-out data exceed a mean absolute error of ${holdoutToleranceMeanAbsoluteError}.`,
    requiredComputation: ['fitModelParameters (grid search, training data only)', 'validateModel (holdout data only)'],
    requiredData: holdoutData.length === 0 ? ['held-out data points (none supplied)'] : [],
    provenance: [`strategy:PARAMETERIZED_MODEL_FAMILY`, `family:${family.familyId}`, `variant:${variant.variantId}`],
  };

  let candidate = formalizeGeneratedHypothesis(draft);

  candidate = checkGeneratedHypothesis(candidate, () => {
    if (trainingData.length === 0) return { ok: false, reason: 'No training data was supplied to this family — cannot fit any variant.' };
    const overlap = variant.parameters.filter((p) => p.value !== null && variant.searchRanges.some((r) => r.symbol === p.symbol));
    if (overlap.length > 0) return { ok: false, reason: `Variant declares a pre-set value for parameter(s) also listed in searchRanges: ${overlap.map((p) => p.symbol).join(', ')} — this would decide the fit before running it.` };
    return { ok: true, reason: `Training data present (${trainingData.length} point(s)); no parameter pre-set inside its own search range.` };
  });

  let fit: { trainingMeanAbsoluteError: number; trainingPointsUsed: number } | null = null;
  let holdoutMeanAbsoluteError: number | null = null;

  candidate = testGeneratedHypothesis(candidate, () => {
    const baseModel = buildScientificModel({
      modelId: `${family.familyId}:${variant.variantId}`,
      statement: variant.statement,
      equationText: variant.equationText,
      variables: variant.variables,
      parameters: variant.parameters,
      assumptions: variant.assumptions,
      evidenceDependencyIds: trainingData.map((d) => d.evidenceRecordId),
    });

    let fitResult;
    try {
      fitResult = fitModelParameters(baseModel, trainingData, variant.searchRanges, variant.evaluate);
    } catch (error) {
      return { verdict: 'BLOCKED' as GeneratedHypothesisVerdict, reasoning: `Fitting failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    fit = { trainingMeanAbsoluteError: fitResult.trainingMeanAbsoluteError, trainingPointsUsed: fitResult.trainingPointsUsed };

    if (holdoutData.length === 0) {
      return { verdict: 'UNTESTED' as GeneratedHypothesisVerdict, reasoning: `Fitting succeeded (training MAE ${fitResult.trainingMeanAbsoluteError.toExponential(4)} over ${fitResult.trainingPointsUsed} point(s)), but no held-out data was supplied — this candidate has not been tested on unseen data.` };
    }

    const validated = validateModel(fitResult.model, holdoutData, variant.evaluate, holdoutToleranceMeanAbsoluteError);
    holdoutMeanAbsoluteError = validated.validation!.meanAbsoluteError;

    if (validated.validation!.verdict === 'VALIDATED') {
      return { verdict: 'SUPPORTED' as GeneratedHypothesisVerdict, reasoning: `Fitted on ${fitResult.trainingPointsUsed} training point(s) (training MAE ${fitResult.trainingMeanAbsoluteError.toExponential(4)}); generalises to ${validated.validation!.pointsChecked} held-out point(s) with MAE ${validated.validation!.meanAbsoluteError.toExponential(4)} <= tolerance ${holdoutToleranceMeanAbsoluteError}.` };
    }
    if (validated.validation!.verdict === 'REJECTED') {
      return { verdict: 'FALSIFIED' as GeneratedHypothesisVerdict, reasoning: `Fitted on ${fitResult.trainingPointsUsed} training point(s) (training MAE ${fitResult.trainingMeanAbsoluteError.toExponential(4)}); does NOT generalise to ${validated.validation!.pointsChecked} held-out point(s) — holdout MAE ${validated.validation!.meanAbsoluteError.toExponential(4)} exceeds tolerance ${holdoutToleranceMeanAbsoluteError}.` };
    }
    return { verdict: 'UNTESTED' as GeneratedHypothesisVerdict, reasoning: `Fitting succeeded but holdout evaluation was inconclusive: ${validated.validation!.reason}` };
  });

  return {
    candidate,
    fit,
    holdoutMeanAbsoluteError,
    holdoutPointsUsed: holdoutData.length,
  };
}

/**
 * Runs the full flow for every declared variant in the family. A variant
 * that fails formalization or checking never reaches fitting; a variant
 * whose fit throws is BLOCKED, never silently skipped or given a fabricated
 * result.
 */
export function runParameterizedModelFamily(
  family: ModelFamily,
  trainingData: readonly ModelDataPoint[],
  holdoutData: readonly ModelDataPoint[],
  holdoutToleranceMeanAbsoluteError: number,
): ModelFamilyComparisonResult {
  const outcomes = family.variants.map((variant) => {
    const built = buildVariantCandidate(family, variant, trainingData, holdoutData, holdoutToleranceMeanAbsoluteError);
    return { variantId: variant.variantId, candidate: built.candidate, fit: built.fit, holdoutMeanAbsoluteError: built.holdoutMeanAbsoluteError, holdoutPointsUsed: built.holdoutPointsUsed };
  });

  const supported = outcomes.filter((o) => o.candidate.verdict === 'SUPPORTED' && o.holdoutMeanAbsoluteError !== null);
  const winner = supported.length === 0 ? null : supported.reduce((best, o) => (o.holdoutMeanAbsoluteError! < best.holdoutMeanAbsoluteError! ? o : best));

  return {
    contractVersion: PARAMETERIZED_MODEL_FAMILY_VERSION,
    familyId: family.familyId,
    trainingPointCount: trainingData.length,
    holdoutPointCount: holdoutData.length,
    outcomes,
    winningVariantId: winner?.variantId ?? null,
    resultFingerprint: fingerprintOf(outcomes),
  };
}

export interface ModelFamilyReplay {
  status: 'MATCH' | 'DRIFT';
  reason: string;
}

/** Replays by re-running the ENTIRE family (regeneration + refit + re-evaluation) from the same family/data/tolerance and comparing fingerprints. */
export function replayParameterizedModelFamily(
  saved: ModelFamilyComparisonResult,
  family: ModelFamily,
  trainingData: readonly ModelDataPoint[],
  holdoutData: readonly ModelDataPoint[],
  holdoutToleranceMeanAbsoluteError: number,
): ModelFamilyReplay {
  const recomputed = runParameterizedModelFamily(family, trainingData, holdoutData, holdoutToleranceMeanAbsoluteError);
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: `Recomputing the same family from the same training/holdout data produced a different fingerprint (${saved.resultFingerprint} -> ${recomputed.resultFingerprint}).` };
  }
  return { status: 'MATCH', reason: '' };
}

export function saveParameterizedModelFamilyToMemory(result: ModelFamilyComparisonResult): SavedExperiment {
  const byVerdict = (v: string) => result.outcomes.filter((o) => o.candidate.verdict === v).length;
  return saveExperiment({
    labId: 'parameterized-model-family',
    experimentId: `${result.familyId}:${result.resultFingerprint}`,
    experimentName: `Model family comparison — ${result.familyId}`,
    params: { familyId: result.familyId, trainingPointCount: result.trainingPointCount, holdoutPointCount: result.holdoutPointCount, variantCount: result.outcomes.length },
    stats: {
      supported: byVerdict('SUPPORTED'),
      falsified: byVerdict('FALSIFIED'),
      untested: byVerdict('UNTESTED'),
      blocked: byVerdict('BLOCKED'),
    },
    analysis: [
      ...result.outcomes.map((o) => ({ title: o.variantId, kind: 'model-variant', body: `[${o.candidate.verdict}] ${o.candidate.verdictReasoning ?? ''}` })),
      { title: 'Winner', kind: 'comparison', body: result.winningVariantId ? `${result.winningVariantId} — lowest holdout MAE among SUPPORTED variants.` : 'No variant was SUPPORTED on held-out data; no winner is declared.' },
    ],
    honesty: 'simplified',
    honestyNote:
      'Every variant was fitted from declared training data only and evaluated on separate held-out data via the unchanged validateModel(). '
      + 'SUPPORTED means "generalises to holdout within the declared tolerance", never a claim of scientific discovery.',
    epistemicStatus: `VARIANTS=${result.outcomes.length};SUPPORTED=${byVerdict('SUPPORTED')};FALSIFIED=${byVerdict('FALSIFIED')};UNTESTED=${byVerdict('UNTESTED')};BLOCKED=${byVerdict('BLOCKED')};WINNER=${result.winningVariantId ?? 'NONE'}`,
    assumptions: ['Grid-search fitting resolution bounds achievable precision; a variant just outside tolerance may reflect grid coarseness rather than a true structural mismatch.'],
  });
}
