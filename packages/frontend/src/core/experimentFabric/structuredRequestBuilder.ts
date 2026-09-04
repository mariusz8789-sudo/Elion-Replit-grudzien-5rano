import { EXPERIMENT_FABRIC_VERSION, type ExperimentValue, type StructuredExperimentRequest } from './types';
import type { RouterModel } from './router';

/**
 * PILOT UI STRUCTURED-FORM BRIDGE — pure helper that turns a picked
 * `RouterModel` and a flat map of user-entered parameter values into a
 * `StructuredExperimentRequest`. This is the deterministic, non-LLM
 * "structured form" path required alongside `parseScienceChatMessage`
 * (free text): both produce the exact same request shape and go through the
 * same `Experiment Fabric` validation/routing — no second parser, no second
 * request type.
 *
 * Missing/omitted values fall back to the model's own declared defaults, so a
 * user can submit the form without touching every field.
 */
export function buildStructuredRequestFromModel(
  model: RouterModel,
  values: Readonly<Record<string, ExperimentValue | undefined>>,
  options: { sourceText?: string; seed?: number } = {},
): StructuredExperimentRequest {
  const parameters: Record<string, ExperimentValue> = {};
  for (const spec of model.parameters) {
    const provided = values[spec.id];
    const value = provided !== undefined ? provided : spec.default;
    if (value !== undefined) parameters[spec.id] = value;
  }
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    sourceText: options.sourceText?.trim() || `Ustrukturyzowany formularz Pilota: model ${model.id}.`,
    domainId: model.domainId,
    operation: 'simulate',
    modelId: model.id,
    parameters,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
  };
}
