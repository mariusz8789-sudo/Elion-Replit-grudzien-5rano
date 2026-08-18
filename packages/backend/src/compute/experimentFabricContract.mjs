/**
 * Additive API contract for model-first Experiment Fabric.
 *
 * It deliberately reuses the existing compute registry and runModel() path.
 * No model is reimplemented here; this module only validates an envelope and
 * exposes a documented capability catalogue for API clients/jobs.
 */

export const EXPERIMENT_FABRIC_API_VERSION = '1.0.0';

export function buildFabricContract(models) {
  return {
    contractVersion: EXPERIMENT_FABRIC_API_VERSION,
    request: {
      required: ['contractVersion', 'modelId', 'inputs'],
      optional: ['seed', 'projectId', 'sourceText', 'domainId', 'requestedVisualization'],
      inputRule: 'inputs must be a flat object; the selected real model validates its own schema.',
    },
    response: {
      statuses: ['ok', 'rejected', 'error'],
      provenance: 'Returned by the existing compute engine; persisted only for editor+ project context.',
      capabilityRule: 'A missing external adapter must be declared separately as ENGINE_NOT_AVAILABLE and cannot be sent to this endpoint.',
    },
    models: models.map((model) => ({
      id: model.id,
      version: model.version,
      domain: model.domain,
      inputs: model.inputs.map((input) => ({ id: input.id, type: input.type, unit: input.unit, min: input.min, max: input.max })),
      outputs: model.outputs.map((output) => ({ id: output.id, unit: output.unit })),
      deterministic: !model.stochastic,
    })),
  };
}

/** Validate only the API envelope; model-level validation remains in runModel(). */
export function validateFabricRunRequest(body) {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = [];
  if (value.contractVersion !== EXPERIMENT_FABRIC_API_VERSION) errors.push(`contractVersion must equal ${EXPERIMENT_FABRIC_API_VERSION}.`);
  if (typeof value.modelId !== 'string' || !value.modelId.trim()) errors.push('modelId must be a non-empty string.');
  if (!value.inputs || typeof value.inputs !== 'object' || Array.isArray(value.inputs)) errors.push('inputs must be a flat object.');
  else if (Object.keys(value.inputs).length > 64) errors.push('inputs exceeds 64 keys.');
  if (value.seed !== undefined && (!Number.isInteger(value.seed) || value.seed < 0)) errors.push('seed must be a non-negative integer.');
  if (value.sourceText !== undefined && (typeof value.sourceText !== 'string' || value.sourceText.length > 4000)) errors.push('sourceText must be a string of at most 4000 characters.');
  if (value.domainId !== undefined && (typeof value.domainId !== 'string' || value.domainId.length > 120)) errors.push('domainId must be a string of at most 120 characters.');
  return { ok: errors.length === 0, errors };
}

export function fabricRunEnvelope(body, run, persisted) {
  return {
    contractVersion: EXPERIMENT_FABRIC_API_VERSION,
    request: {
      sourceText: typeof body.sourceText === 'string' ? body.sourceText : null,
      domainId: typeof body.domainId === 'string' ? body.domainId : null,
      modelId: body.modelId,
      requestedVisualization: typeof body.requestedVisualization === 'string' ? body.requestedVisualization : null,
    },
    run,
    persisted,
  };
}
