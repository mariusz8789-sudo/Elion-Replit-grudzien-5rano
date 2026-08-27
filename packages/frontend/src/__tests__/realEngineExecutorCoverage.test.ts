import { describe, expect, it } from 'vitest';
import { listRouterModels, createExperimentIntent } from '../core/experimentFabric/router';
import { runExperiment } from '../core/experimentFabric/executor';
import { EXPERIMENT_FABRIC_VERSION, type StructuredExperimentRequest } from '../core/experimentFabric/types';

/**
 * Models that are genuinely REAL_ENGINE but deliberately do not run through the generic
 * `executeRealModel` switch. Each entry must name the real entry point; the standing
 * requirement is that the generic path stays honest instead of pretending to execute.
 */
const DOCUMENTED_GENERIC_EXECUTOR_EXCEPTIONS: Readonly<Record<string, string>> = {
  'earthquake-scenario': 'confirmEarthquakeEvidenceGuidedExperiment (Earthquake command center, async hazard provenance store)',
};

function defaultRequest(modelId: string, domainId: string, parameters: Record<string, unknown>): StructuredExperimentRequest {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    sourceText: `guard ${modelId}`,
    domainId,
    operation: 'simulate',
    modelId,
    parameters: parameters as StructuredExperimentRequest['parameters'],
    seed: 1,
  };
}

function realEngineModels() {
  return listRouterModels().filter((model) => {
    const request = defaultRequest(model.id, model.domainId, Object.fromEntries(model.parameters.map((p) => [p.id, p.default])));
    return createExperimentIntent(request).capability === 'REAL_ENGINE';
  });
}

describe('REAL_ENGINE ↔ generic executor coverage', () => {
  it('registers at least the known real-engine surface', () => {
    expect(realEngineModels().length).toBeGreaterThanOrEqual(36);
  });

  it('every REAL_ENGINE model either executes in the generic executor or is a documented adapter', () => {
    const undocumented: string[] = [];
    for (const model of realEngineModels()) {
      const request = defaultRequest(model.id, model.domainId, Object.fromEntries(model.parameters.map((p) => [p.id, p.default])));
      const run = runExperiment(request);
      if (run.result.status === 'completed') continue;
      if (!(model.id in DOCUMENTED_GENERIC_EXECUTOR_EXCEPTIONS)) {
        undocumented.push(`${model.id} -> ${run.result.status}: ${run.result.summary}`);
      }
    }
    expect(undocumented).toEqual([]);
  });

  it('a documented adapter exception stays honest instead of reporting an engine error', () => {
    for (const [modelId, entryPoint] of Object.entries(DOCUMENTED_GENERIC_EXECUTOR_EXCEPTIONS)) {
      const model = listRouterModels().find((entry) => entry.id === modelId);
      expect(model, `router model ${modelId} must exist`).toBeDefined();
      if (!model) continue;
      const run = runExperiment(defaultRequest(model.id, model.domainId, Object.fromEntries(model.parameters.map((p) => [p.id, p.default]))));
      expect(run.result.status).not.toBe('completed');
      expect(run.result.status).not.toBe('failed');
      expect(run.result.summary).toContain(entryPoint.split(' ')[0]);
      expect(run.provenance.resultOrigin).not.toBe('real-engine');
      expect(run.provenance.deterministic).toBe(false);
    }
  });

  it('does not require backend-only or hypothetical models to have a generic executor case', () => {
    const capabilities = listRouterModels().map((model) => {
      const request = defaultRequest(model.id, model.domainId, Object.fromEntries(model.parameters.map((p) => [p.id, p.default])));
      return createExperimentIntent(request).capability;
    });
    expect(capabilities).toContain('BACKEND_REAL_ENGINE');
    for (const model of listRouterModels()) {
      const request = defaultRequest(model.id, model.domainId, Object.fromEntries(model.parameters.map((p) => [p.id, p.default])));
      const capability = createExperimentIntent(request).capability;
      if (capability === 'REAL_ENGINE') continue;
      // Nothing is asserted about their generic execution; the guard is scoped to REAL_ENGINE only.
      expect(['BACKEND_REAL_ENGINE', 'HYPOTHETICAL_VISUALIZATION', 'KNOWLEDGE_ONLY', 'CAPABILITY_SEAM', 'ENGINE_NOT_AVAILABLE']).toContain(capability);
    }
  });
});

describe('provenance never stamps a non-executed run as real-engine', () => {
  it('rejects an out-of-range real-engine request without claiming a real engine result', () => {
    const run = runExperiment(defaultRequest('einstein-schwarzschild', 'spacetime-einstein', { massSolar: -5 }));
    expect(run.result.status).toBe('rejected');
    expect(run.provenance.resultOrigin).not.toBe('real-engine');
    expect(run.provenance.deterministic).toBe(false);
  });

  it('keeps real-engine origin for a completed real run', () => {
    const run = runExperiment(defaultRequest('einstein-schwarzschild', 'spacetime-einstein', { massSolar: 1 }));
    expect(run.result.status).toBe('completed');
    expect(run.provenance.resultOrigin).toBe('real-engine');
  });
});
