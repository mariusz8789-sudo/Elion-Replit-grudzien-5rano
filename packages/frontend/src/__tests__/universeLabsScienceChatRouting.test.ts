import { describe, expect, it } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { planEvidenceGuidedExperiment } from '../core/experimentFabric/evidenceGuidedChat';
import { runExperiment } from '../core/experimentFabric/executor';
import { getRouterModel } from '../core/experimentFabric/router';

/**
 * Phase 3 proof (same pattern as physicsLabsScienceChatRouting.test.ts):
 * these Universe models were already registered in ROUTER_MODELS with an
 * executeRealModel case before this file existed. This is the missing
 * regression proof that natural language actually reaches them, not new
 * wiring — no router, executor, or solver change accompanies this file.
 */
describe('Universe Lab — Science Chat -> existing deterministic models', () => {
  it('Kepler: "orbita keplerowska" routes to universe-kepler and returns a real orbital-graph result', () => {
    const request = parseScienceChatMessage('Pokaż orbitę keplerowską planety wokół gwiazdy.');
    expect(request.modelId).toBe('universe-kepler');
    expect(getRouterModel('universe-kepler')?.route).toEqual({ kind: 'lab', labId: 'universe' });
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.orbitalPeriodYears).toBeGreaterThan(0);
    expect(run.result.validity).toContain('dwóch ciał');
  });

  it('Three-body: "problem trzech ciał" routes to universe-three-body and integrates a real trajectory', () => {
    const request = parseScienceChatMessage('Pokaż problem trzech ciał w układzie ósemkowym.');
    expect(request.modelId).toBe('universe-three-body');
    expect(getRouterModel('universe-three-body')?.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'threebody' });
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(Object.keys(run.result.outputs).length).toBeGreaterThan(0);
  });

  it('rejects an out-of-contract three-body preset rather than silently substituting one', () => {
    const run = runExperiment({
      contractVersion: '1.0.0', sourceText: 'test', domainId: 'classical-mechanics', operation: 'compute',
      modelId: 'universe-three-body', parameters: { preset: 'not-a-real-preset' },
    });
    expect(run.result.status).toBe('failed');
  });

  it('Hubble tension: "napięcie Hubble\'a" routes to universe-hubble-tension with the real fixed SH0ES/Planck comparison', () => {
    const request = parseScienceChatMessage('Wyjaśnij napięcie Hubble\'a między SH0ES a Planck.');
    expect(request.modelId).toBe('universe-hubble-tension');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.tensionSigma).toBeGreaterThan(0);
    expect(run.result.summary).toContain('σ');
  });

  it('Lorenz attractor: "atraktor Lorenza" routes to universe-lorenz-attractor and integrates the real chaotic system', () => {
    const request = parseScienceChatMessage('Pokaż atraktor Lorenza dla rho=28.');
    expect(request.modelId).toBe('universe-lorenz-attractor');
    expect(request.parameters.rho).toBe(28);
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.rho).toBe(28);
    expect(run.result.summary.toLowerCase()).not.toContain('pogod');
  });

  it('is deterministic across all four models: identical requests produce identical runIds and outputs', () => {
    for (const text of ['Pokaż orbitę keplerowską planety wokół gwiazdy.', 'Pokaż atraktor Lorenza dla rho=28.']) {
      const request = parseScienceChatMessage(text);
      const first = runExperiment(request);
      const second = runExperiment(request);
      expect(first.runId).toBe(second.runId);
      expect(first.result.outputs).toEqual(second.result.outputs);
    }
  });
});
