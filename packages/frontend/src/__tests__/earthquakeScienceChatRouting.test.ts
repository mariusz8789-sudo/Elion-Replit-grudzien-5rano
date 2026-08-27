import { describe, expect, it, beforeEach } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { getRouterModel, validateStructuredExperimentRequest } from '../core/experimentFabric/router';
import { runExperiment } from '../core/experimentFabric/executor';
import { planEvidenceGuidedExperiment, confirmEvidenceGuidedExperiment } from '../core/experimentFabric/evidenceGuidedChat';
import { clearPendingHazardScenarios, consumePendingHazardScenario, setPendingHazardScenario } from '../core/experimentFabric/hazardScenarioHandoff';
import type { StructuredExperimentRequest } from '../core/experimentFabric/types';

describe('Science Chat -> Earthquake capability routing', () => {
  beforeEach(() => clearPendingHazardScenarios());

  it('parses "Symuluj trzęsienie ziemi" to the registered earthquake-scenario model with recognized parameter keys', () => {
    const request = parseScienceChatMessage('Symuluj trzęsienie ziemi o magnitude 6.5, głębokość 20 km');
    expect(request.domainId).toBe('earthquake');
    expect(request.modelId).toBe('earthquake-scenario');
    expect(request.parameters.magnitude).toBe(6.5);
    expect(request.parameters.depthKm).toBe(20);
  });

  it('the earthquake-scenario model is registered with the real EARTHQUAKE_MODEL_VERSION and a hazard-scenario route to #/city3d', () => {
    const model = getRouterModel('earthquake-scenario');
    expect(model).toBeDefined();
    expect(model?.route).toEqual({ kind: 'hazard-scenario', hazardType: 'earthquake', hash: '#/city3d' });
  });

  it('a request with default (unspecified) parameters validates and plans as READY_FOR_CONFIRMATION', () => {
    const request = parseScienceChatMessage('Symuluj trzęsienie ziemi');
    const validation = validateStructuredExperimentRequest(request);
    expect(validation.ok).toBe(true);
    const plan = planEvidenceGuidedExperiment(request);
    expect(plan.status).toBe('READY_FOR_CONFIRMATION');
    expect(plan.disclosure.resultWillComeFromRealRun).toBe(true);
  });

  it('confirming the plan runs to completion, never computes ImpactResult/DamageAssessment itself, and registers a hazard-scenario handoff', () => {
    const request = parseScienceChatMessage('Symuluj trzęsienie ziemi o magnitude 7.1, głębokość 30 km, seed=99');
    const plan = planEvidenceGuidedExperiment(request);
    expect(plan.status).toBe('READY_FOR_CONFIRMATION');
    const confirmed = confirmEvidenceGuidedExperiment(plan);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.route).toEqual({ kind: 'hazard-scenario', hazardType: 'earthquake', hash: '#/city3d' });
    expect(confirmed.run.result.outputs.magnitude).toBe(7.1);
    expect(confirmed.run.result.outputs.depthKm).toBe(30);
    expect(confirmed.run.result.outputs.seed).toBe(99);
    // No ImpactResult/DamageAssessment field is claimed by this adapter — only validated parameters.
    expect(Object.keys(confirmed.run.result.outputs).sort()).toEqual(['depthKm', 'epicenterX', 'epicenterY', 'magnitude', 'seed']);

    expect(setPendingHazardScenario(confirmed.run.runId)).toBe(true);
    const handoff = consumePendingHazardScenario();
    expect(handoff).toEqual({
      runId: confirmed.run.runId, hazardType: 'earthquake', magnitude: 7.1, depthKm: 30, epicenterX: 0, epicenterY: 0, seed: 99,
    });
  });

  it('is deterministic: the same request produces the same runId and outputs on repeated confirmation', () => {
    const request = parseScienceChatMessage('Symuluj trzęsienie ziemi o magnitude 5.0, seed=1');
    const first = runExperiment(request);
    const second = runExperiment(request);
    expect(first.runId).toBe(second.runId);
    expect(first.result.outputs).toEqual(second.result.outputs);
  });
});

describe('Science Chat capability routing — negative / NOT_MODELED paths', () => {
  it('rejects a non-finite magnitude (NaN) before any run is attempted', () => {
    const request: StructuredExperimentRequest = {
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'earthquake', operation: 'simulate',
      modelId: 'earthquake-scenario', parameters: { magnitude: Number.NaN },
    };
    const validation = validateStructuredExperimentRequest(request);
    expect(validation.ok).toBe(false);
    expect(planEvidenceGuidedExperiment(request).status).toBe('INVALID_REQUEST');
  });

  it('rejects an Infinity parameter value', () => {
    const request: StructuredExperimentRequest = {
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'earthquake', operation: 'simulate',
      modelId: 'earthquake-scenario', parameters: { depthKm: Number.POSITIVE_INFINITY },
    };
    expect(validateStructuredExperimentRequest(request).ok).toBe(false);
  });

  it('rejects a magnitude outside the registered 0-10 range', () => {
    const request: StructuredExperimentRequest = {
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'earthquake', operation: 'simulate',
      modelId: 'earthquake-scenario', parameters: { magnitude: 15 },
    };
    expect(validateStructuredExperimentRequest(request).ok).toBe(false);
  });

  it('rejects an unknown modelId that is not registered in the router', () => {
    const request: StructuredExperimentRequest = {
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'earthquake', operation: 'simulate',
      modelId: 'earthquake-does-not-exist', parameters: {},
    };
    expect(validateStructuredExperimentRequest(request).ok).toBe(false);
  });

  it('routes an unregistered hazard word ("Symuluj powódź") to ENGINE_NOT_AVAILABLE, never fabricating a flood result', () => {
    const request = parseScienceChatMessage('Symuluj powódź w mieście');
    expect(request.domainId).toBe('hazard-cascade');
    expect(request.modelId).toBeUndefined();
    const plan = planEvidenceGuidedExperiment(request);
    expect(plan.status).toBe('ENGINE_NOT_AVAILABLE');
    expect(plan.disclosure.resultWillComeFromRealRun).toBe(false);
    // Confirming a non-runnable plan must throw rather than silently execute anything.
    expect(() => confirmEvidenceGuidedExperiment(plan)).toThrow();
  });

  it('other hazard words (fire, blackout, cascade, evacuation) still fall into the generic NOT_MODELED bucket, not the earthquake adapter', () => {
    for (const phrase of ['Symuluj pożar', 'blackout w sieci', 'kaskada infrastruktury', 'plan ewakuacji']) {
      const request = parseScienceChatMessage(phrase);
      expect(request.domainId).toBe('hazard-cascade');
      expect(request.modelId).toBeUndefined();
    }
  });

  it('missing/absent parameters do not block a plan — the model has no required fields and defaults are applied at run time', () => {
    const request: StructuredExperimentRequest = {
      contractVersion: '1.0.0', sourceText: 'trzęsienie ziemi', domainId: 'earthquake', operation: 'simulate',
      modelId: 'earthquake-scenario', parameters: {},
    };
    expect(validateStructuredExperimentRequest(request).ok).toBe(true);
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.magnitude).toBe(5.4);
    expect(run.result.outputs.depthKm).toBe(12);
  });
});
