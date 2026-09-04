import { describe, expect, it } from 'vitest';
import { compareModelVsModel, sweepModelDivergence, verdictOf } from '../core/experimentFabric/modelVsModelCompare';
import type { StructuredExperimentRequest } from '../core/experimentFabric/types';

/**
 * COUNTERFACTUAL MODEL TOURNAMENT — Newtonian vs relativistic kinetic
 * energy, the two real, registered `particle-*-energy` models
 * (`router.ts`), executed for real through the existing `runExperiment`.
 * No PySCF/network involved: both models are exact closed-form physics
 * (`modelGraph/newtonianEnergyGraph.ts` / `relativisticEnergyGraph.ts`),
 * so every assertion below reproduces real, deterministic arithmetic —
 * not a mock.
 */
function requestFor(modelId: string, velocityFraction: number, restMassMeV = 0.511): StructuredExperimentRequest {
  return {
    contractVersion: '1.0.0', sourceText: `test:${modelId}:${velocityFraction}`, domainId: 'particle',
    operation: 'compute', modelId, parameters: { restMassMeV, velocityFraction },
  };
}

describe('Model-vs-Model Tournament (Newtonian vs relativistic kinetic energy)', () => {
  it('runs two REAL, different models and compares a shared real observable', () => {
    const cmp = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-newtonian-energy', 0.9),
      modelB: requestFor('particle-relativistic-energy', 0.9),
      labels: { modelA: 'Newtonian', modelB: 'Relativistic' },
    });
    expect(cmp.status).toBe('COMPLETED');
    expect(cmp.modelA?.modelId).toBe('particle-newtonian-energy');
    expect(cmp.modelB?.modelId).toBe('particle-relativistic-energy');
    // Real arithmetic: classical E_kin = 0.5 * 0.511 * 0.9^2
    expect(cmp.metric?.modelAValue).toBeCloseTo(0.5 * 0.511 * 0.81, 6);
    expect(cmp.metric?.unit).toBe('MeV');
  });

  it('the two models converge (near-zero divergence) at low velocity, exactly as physics predicts, and are verdicted MODELS_AGREE', () => {
    const cmp = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-newtonian-energy', 0.01),
      modelB: requestFor('particle-relativistic-energy', 0.01),
    });
    expect(cmp.status).toBe('COMPLETED');
    expect(cmp.metric!.relativeDivergence).toBeLessThan(0.01);
    expect(cmp.metric!.verdict).toBe('MODELS_AGREE');
    expect(verdictOf(cmp)).toBe('MODELS_AGREE');
  });

  it('the two models diverge sharply at high velocity — a real, computed disagreement, verdicted MODELS_DIVERGE, not asserted', () => {
    const cmp = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-newtonian-energy', 0.99),
      modelB: requestFor('particle-relativistic-energy', 0.99),
    });
    expect(cmp.status).toBe('COMPLETED');
    expect(cmp.metric!.relativeDivergence).toBeGreaterThan(0.5);
    expect(cmp.metric!.verdict).toBe('MODELS_DIVERGE');
    expect(cmp.metric!.verdictReasoning).toContain('not calibrated');
  });

  it('an untested comparison (blocked/incomplete/unshared) reports UNTESTED via verdictOf, never a fabricated agreement', () => {
    const blocked = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-relativistic-energy', 0.5),
      modelB: requestFor('particle-relativistic-energy', 0.5),
    });
    expect(verdictOf(blocked)).toBe('UNTESTED');
  });

  it('refuses to compare a model against itself — Model-vs-Model requires two different models', () => {
    const cmp = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-relativistic-energy', 0.5),
      modelB: requestFor('particle-relativistic-energy', 0.5),
    });
    expect(cmp.status).toBe('BLOCKED_SAME_MODEL');
    expect(cmp.metric).toBeNull();
  });

  it('reports OBSERVABLE_NOT_SHARED honestly instead of guessing a metric alias', () => {
    const cmp = compareModelVsModel({
      observableKey: 'thisFieldDoesNotExistOnEitherModel',
      modelA: requestFor('particle-newtonian-energy', 0.5),
      modelB: requestFor('particle-relativistic-energy', 0.5),
    });
    expect(cmp.status).toBe('OBSERVABLE_NOT_SHARED');
    expect(cmp.metric).toBeNull();
  });

  it('sweeping the shared parameter finds the REAL point of maximal divergence, monotonically rising with velocity', () => {
    const sweep = sweepModelDivergence(
      { contractVersion: '1.0.0', sourceText: 'sweep', domainId: 'particle', operation: 'compute', modelId: 'particle-newtonian-energy', parameters: { restMassMeV: 0.511 } },
      { contractVersion: '1.0.0', sourceText: 'sweep', domainId: 'particle', operation: 'compute', modelId: 'particle-relativistic-energy', parameters: { restMassMeV: 0.511 } },
      'velocityFraction', [0.01, 0.1, 0.5, 0.9, 0.99], 'kineticEnergyMeV',
    );
    expect(sweep.mostDiscriminatingValue).toBe(0.99);
    const divergences = sweep.points.map((p) => p.comparison.metric!.relativeDivergence);
    for (let i = 1; i < divergences.length; i++) expect(divergences[i]).toBeGreaterThanOrEqual(divergences[i - 1]!);
    expect(sweep.reasoning).toContain('heurystyka');
    expect(sweep.reasoning).toContain('NIE information gain');
  });

  it('an unregistered model id is refused at validation, never silently substituted or backfilled', () => {
    const cmp = compareModelVsModel({
      observableKey: 'kineticEnergyMeV',
      modelA: requestFor('particle-newtonian-energy', 0.5),
      modelB: { ...requestFor('particle-relativistic-energy', 0.5), modelId: 'not-a-real-model' },
    });
    expect(cmp.status).toBe('BLOCKED_INVALID_REQUEST');
    expect(cmp.metric).toBeNull();
  });

  it('an empty sweep with no completed comparisons declares no discriminating experiment, never a fabricated one', () => {
    const sweep = sweepModelDivergence(
      { contractVersion: '1.0.0', sourceText: 'sweep', domainId: 'particle', operation: 'compute', modelId: 'not-a-real-model', parameters: {} },
      { contractVersion: '1.0.0', sourceText: 'sweep', domainId: 'particle', operation: 'compute', modelId: 'particle-relativistic-energy', parameters: { restMassMeV: 0.511 } },
      'velocityFraction', [0.5], 'kineticEnergyMeV',
    );
    expect(sweep.mostDiscriminatingValue).toBeNull();
    expect(sweep.mostDiscriminatingDivergence).toBeNull();
  });
});
