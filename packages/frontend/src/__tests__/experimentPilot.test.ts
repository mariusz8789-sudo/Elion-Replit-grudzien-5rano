import { describe, expect, it } from 'vitest';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import {
  getRouterModel,
  planEvidenceGuidedExperiment,
  confirmEvidenceGuidedExperiment,
  isBackendEvidenceGuidedPlan,
  createScenarioCapsule,
  serializeScenarioCapsule,
  replayScenarioCapsule,
} from '../core/experimentFabric';

/**
 * PILOT UI WORKFLOW — proves the exact chain the new `ExperimentPilotScreen`
 * drives: RouterModel + form values -> StructuredExperimentRequest -> plan
 * (disclosure, no execution) -> confirm (real run) -> Scenario Capsule ->
 * export -> replay. No UI framework involved; this is the pure logic layer
 * the component calls directly, reusing the EXISTING Experiment Fabric
 * (no second parser, executor or provenance).
 */
describe('Pilot UI workflow (structured form -> plan -> run -> capsule -> export)', () => {
  it('buildStructuredRequestFromModel fills declared defaults for omitted fields', () => {
    const model = getRouterModel('epidemic-city');
    if (!model) throw new Error('epidemic-city model missing from router');
    const request = buildStructuredRequestFromModel(model, { r0: 4 });
    expect(request.modelId).toBe('epidemic-city');
    expect(request.domainId).toBe('biology');
    expect(request.parameters.r0).toBe(4);
    // horizonDays/nAgents were not provided -> fall back to the model's own defaults.
    expect(request.parameters.horizonDays).toBe(90);
    expect(request.parameters.nAgents).toBe(260);
  });

  it('full pilot chain: plan -> confirm -> capsule -> export -> replay MATCH (epidemic-city, client REAL_ENGINE)', () => {
    const model = getRouterModel('epidemic-city');
    if (!model) throw new Error('epidemic-city model missing from router');
    const request = buildStructuredRequestFromModel(model, { r0: 3, horizonDays: 30, nAgents: 80 }, { seed: 42 });

    const plan = planEvidenceGuidedExperiment(request);
    expect(plan.status).toBe('READY_FOR_CONFIRMATION');
    expect(plan.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(isBackendEvidenceGuidedPlan(plan)).toBe(false); // client-side engine, not backend Fabric

    const confirmed = confirmEvidenceGuidedExperiment(plan);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.provenance.resultOrigin).toBe('real-engine');

    const capsule = createScenarioCapsule({ title: 'Pilot: epidemic-city R0=3', baselineRun: confirmed.run });
    expect(capsule.references.baselineRunFingerprint).toBe(confirmed.run.provenance.runFingerprint);

    const exported = serializeScenarioCapsule(capsule);
    expect(typeof exported).toBe('string');
    expect(JSON.parse(exported).capsuleId).toBe(capsule.capsuleId);

    const replay = replayScenarioCapsule(capsule);
    expect(replay.status).toBe('MATCH');
  });

  it('a plan that was tampered with after disclosure is rejected at confirm (no silent re-scope)', () => {
    const model = getRouterModel('epidemic-city');
    if (!model) throw new Error('epidemic-city model missing from router');
    const request = buildStructuredRequestFromModel(model, { r0: 2 });
    const plan = planEvidenceGuidedExperiment(request);
    const tampered = { ...plan, request: { ...plan.request, parameters: { ...plan.request.parameters, r0: 6 } } };
    expect(() => confirmEvidenceGuidedExperiment(tampered)).toThrow(/modified after review/);
  });

  it('a backend-routed model is correctly flagged for the backend confirm path, not the client one', () => {
    const model = getRouterModel('nuclear-tokamak-lawson');
    if (!model) throw new Error('nuclear-tokamak-lawson model missing from router');
    const request = buildStructuredRequestFromModel(model, {});
    const plan = planEvidenceGuidedExperiment(request);
    expect(plan.status).toBe('READY_FOR_CONFIRMATION');
    expect(isBackendEvidenceGuidedPlan(plan)).toBe(true);
  });

  it('an unrunnable plan (no registered model) is disclosed honestly, never faked', () => {
    const request = buildStructuredRequestFromModel(
      { id: 'not-a-real-model', domainId: 'unknown', modelVersion: '0.0.0', engine: 'none', parameters: [], route: { kind: 'none' }, knowledgeSources: [], rationale: '' },
      {},
    );
    const plan = planEvidenceGuidedExperiment({ ...request, modelId: undefined, domainId: 'unknown' });
    expect(plan.disclosure.runnable).toBe(false);
    expect(plan.disclosure.resultWillComeFromRealRun).toBe(false);
    expect(() => confirmEvidenceGuidedExperiment(plan)).toThrow();
  });
});
