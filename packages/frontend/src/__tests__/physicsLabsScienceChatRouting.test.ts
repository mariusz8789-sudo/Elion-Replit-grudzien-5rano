import { describe, expect, it } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { planEvidenceGuidedExperiment } from '../core/experimentFabric/evidenceGuidedChat';
import { runExperiment } from '../core/experimentFabric/executor';
import { getRouterModel } from '../core/experimentFabric/router';
import { schwarzschildRadius } from '../core/physics';

/**
 * Phase 3 proof, same pattern already established for Earthquake and
 * Minkowski: parse -> plan (shown before execution) -> confirm/run ->
 * correct real values, through the existing Experiment Fabric only.
 * No router, solver, or executor change accompanies these tests — every
 * model exercised here (einstein-schwarzschild, einstein-schwarzschild-
 * geodesic, spacetime-c-slider, particle-relativistic-energy) was already
 * registered in ROUTER_MODELS and already had an executeRealModel case;
 * this file is the missing regression proof that the route actually works
 * end-to-end from natural language, not evidence of new wiring.
 */
describe('Schwarzschild radius — Science Chat -> existing analytic model', () => {
  it('routes "promień Schwarzschilda" to the registered model with a scene-3d lab route', () => {
    const request = parseScienceChatMessage('Policz promień Schwarzschilda dla 3 masy słońca.');
    expect(request.domainId).toBe('spacetime-einstein');
    expect(request.modelId).toBe('einstein-schwarzschild');
    expect(request.parameters.massSolar).toBe(3);
    expect(getRouterModel('einstein-schwarzschild')?.route).toEqual({ kind: 'lab', labId: 'einstein' });
  });

  it('shows a plan with units, assumptions and limitations before any run', () => {
    const request = parseScienceChatMessage('Policz promień Schwarzschilda dla 3 masy słońca.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(planned.disclosure.parameterSchema.length).toBeGreaterThan(0);
    expect(planned.disclosure.limitations.join(' ')).toContain('nieobracającej się');
  });

  it('confirming the plan computes the exact real radius (r_s = 2GM/c²), never a fabricated value', () => {
    const request = parseScienceChatMessage('Policz promień Schwarzschilda dla 3 masy słońca.');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    const SOLAR_MASS_KG = 1.989e30;
    const expectedRadiusMeters = schwarzschildRadius(3 * SOLAR_MASS_KG);
    expect(run.result.outputs.radiusMeters).toBeCloseTo(expectedRadiusMeters, 3);
    expect(run.result.units.radiusMeters).toBe('m');
    expect(run.result.validity).toContain('Metryka Schwarzschilda');
    expect(run.result.assumptions.join(' ')).toContain('Brak spinu i ładunku');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'einstein' });
  });

  it('a bare "czarna dziura" request without an explicit mass uses the documented default (1 M☉)', () => {
    const request = parseScienceChatMessage('Co to jest czarna dziura?');
    expect(request.modelId).toBe('einstein-schwarzschild');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.radiusMeters).toBeCloseTo(schwarzschildRadius(1.989e30), 3);
  });

  it('is deterministic: identical requests produce identical outputs and runIds', () => {
    const request = parseScienceChatMessage('Policz promień Schwarzschilda dla 3 masy słońca.');
    const first = runExperiment(request);
    const second = runExperiment(request);
    expect(first.runId).toBe(second.runId);
    expect(first.result.outputs).toEqual(second.result.outputs);
  });
});

describe('Schwarzschild geodesic — Science Chat -> existing RK4 geodesic model', () => {
  it('routes a combined "geodezyjna"/"czarna dziura" phrase to the registered geodesic model', () => {
    const request = parseScienceChatMessage('Pokaż tor fotonu geodezyjny wokół czarnej dziury Schwarzschilda.');
    expect(request.modelId).toBe('einstein-schwarzschild-geodesic');
    expect(getRouterModel('einstein-schwarzschild-geodesic')?.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'geodesics' });
  });

  it('runs to completion with the documented default impact parameter and a non-empty result', () => {
    const request = parseScienceChatMessage('Pokaż tor fotonu geodezyjny wokół czarnej dziury Schwarzschilda.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(Object.keys(run.result.outputs).length).toBeGreaterThan(0);
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'geodesics' });
  });
});

describe('c-Slider — Science Chat -> existing bounded thought-experiment graph', () => {
  it('routes "gdyby prędkość światła była inna" to spacetime-c-slider', () => {
    const request = parseScienceChatMessage('Gdyby prędkość światła była inna, co by się stało?');
    expect(request.modelId).toBe('spacetime-c-slider');
    expect(getRouterModel('spacetime-c-slider')?.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'c-slider' });
  });

  it('the plan explicitly discloses this is a hypothetical c, not the physical constant', () => {
    const request = parseScienceChatMessage('Gdyby prędkość światła była inna, co by się stało?');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.rationale).toContain('eksperymentu myślowego');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.summary).toContain('hipotetycznej');
    expect(run.result.warnings.join(' ')).toContain('eksperyment myślowy');
  });

  it('a velocity at or above the hypothetical c is honestly rejected, not silently clamped', () => {
    const run = runExperiment({
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'spacetime-einstein', operation: 'compute',
      modelId: 'spacetime-c-slider', parameters: { velocityMs: 3e8, lightSpeedMs: 2e8, distanceKm: 1 },
    });
    expect(run.result.status).toBe('rejected');
    expect(run.result.outputs).toEqual({});
  });
});

describe('Particle Lab — Science Chat -> existing relativistic-energy graph', () => {
  it('routes "relatywistyczna energia cząstki" to the registered particle model', () => {
    const request = parseScienceChatMessage('Policz relatywistyczną energię cząstki.');
    expect(request.domainId).toBe('particle');
    expect(request.modelId).toBe('particle-relativistic-energy');
    expect(getRouterModel('particle-relativistic-energy')?.route).toEqual({ kind: 'lab', labId: 'particle' });
  });

  it('runs the existing shared model graph and reports honest bounded assumptions (β<1, free particle in vacuum)', () => {
    const request = parseScienceChatMessage('Policz relatywistyczną energię cząstki.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.lorentzGammaFactor).toBeGreaterThan(1);
    expect(run.result.validity).toContain('swobodna');
  });

  it('never claims Geant4-grade kinematics or a real LHC measurement', () => {
    const request = parseScienceChatMessage('Policz relatywistyczną energię cząstki.');
    const run = runExperiment(request);
    expect(run.result.summary.toLowerCase()).not.toContain('lhc');
    expect(run.result.summary.toLowerCase()).not.toContain('geant');
  });
});
