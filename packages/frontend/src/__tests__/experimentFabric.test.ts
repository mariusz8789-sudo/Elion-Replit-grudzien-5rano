import { describe, expect, it } from 'vitest';
import { validateKnowledgeRegistry } from '../core/knowledge/registry';
import {
  parseScienceChatMessage,
  runExperiment,
  validateStructuredExperimentRequest,
  listExternalEngineAdapters,
  listSpatialImportAdapters,
  analyseExperimentSeries,
} from '../core/experimentFabric';
import {
  clearExperimentWorldHandoffs,
  consumePendingExperimentWorld,
  setPendingExperimentWorld,
} from '../core/experimentFabric/worldHandoff';

describe('Genesis Experiment Fabric', () => {
  it('indexes each of the 20 authoritative knowledge files exactly once', () => {
    expect(validateKnowledgeRegistry()).toEqual({ ok: true, missing: [], duplicateFiles: [] });
  });

  it('declares mature solver and GIS integrations as explicit seams, never active engines', () => {
    const engines = listExternalEngineAdapters();
    expect(engines.map((entry) => entry.id)).toEqual([
      'openfoam-cfd', 'fenicsx-pde', 'einstein-toolkit-nr', 'openmc-radiation', 'quantum-schrodinger',
    ]);
    for (const entry of engines) {
      expect(entry.status).toBe('ENGINE_NOT_AVAILABLE');
      expect(entry.inputSchema.length).toBeGreaterThan(0);
      expect(entry.outputSchema.length).toBeGreaterThan(0);
      expect(entry.requiredProvenance.length).toBeGreaterThan(0);
    }
    for (const source of listSpatialImportAdapters()) {
      expect(source.status).toBe('NOT_CONFIGURED');
      expect(source.requiredRequestFields).toContain('bbox');
      expect(source.requiredProvenance).toContain('CRS');
    }
  });

  it('turns only real comparable runs into reviewable observations, not discoveries', () => {
    const runs = [1, 2, 3].map((mass) => runExperiment(parseScienceChatMessage(`Oblicz promień Schwarzschilda dla ${mass} masy Słońca.`)));
    const analysis = analyseExperimentSeries(runs, 'massSolar', 'radiusKm');
    expect(analysis.modelId).toBe('einstein-schwarzschild');
    expect(analysis.findings[0]?.kind).toBe('observed-correlation');
    expect(analysis.findings[0]?.verdict).toBe('REQUIRES_SCIENTIFIC_REVIEW');
    expect(analysis.disclaimer).toContain('nie jest odkryciem');

    const insufficient = analyseExperimentSeries(runs.slice(0, 2), 'massSolar', 'radiusKm');
    expect(insufficient.findings[0]?.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('runs a real Schwarzschild calculation from natural language with provenance', () => {
    const request = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.');
    expect(request.modelId).toBe('einstein-schwarzschild');
    expect(validateStructuredExperimentRequest(request).ok).toBe(true);
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.radiusKm).toBeCloseTo(5.94, 1);
    expect(run.provenance.modelId).toBe('einstein-schwarzschild');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.knowledgeSources).toContain('spacetime-einstein.md');
  });

  it('runs the existing Kepler ModelGraph deterministically from natural language', () => {
    const request = parseScienceChatMessage('Oblicz orbitę planety przy 2 AU i 1 masie Słońca.');
    const a = runExperiment(request);
    const b = runExperiment(request);
    expect(a.result.status).toBe('completed');
    expect(a.result.outputs.orbitalPeriodYears).toBeCloseTo(Math.sqrt(8), 8);
    expect(a.result.outputs).toEqual(b.result.outputs);
    expect(a.runId).toBe(b.runId);
    expect(a.provenance.knowledgeSources).toContain('universe.md');
  });

  it('runs the existing pump-pipe engineering graph rather than a water stub', () => {
    const run = runExperiment(parseScienceChatMessage('Zasymuluj przepływ wody w pompie i rurociągu.'));
    expect(run.request.modelId).toBe('water-pump-pipe');
    expect(run.result.status).toBe('completed');
    expect(Number(run.result.outputs.flowVelocity)).toBeGreaterThan(0);
    expect(Number(run.result.outputs.shaftPower)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('nie jest CFD');
  });

  it('runs one deterministic EpidemicCitySimulation and exposes only real event summaries', () => {
    const request = parseScienceChatMessage('Zasymuluj epidemię z R0=8 przez 90 dni seed=20260817.');
    const a = runExperiment(request);
    const b = runExperiment(request);
    expect(a.result.status).toBe('completed');
    expect(a.result.outputs.dzien).toBe(90);
    expect(a.result.eventSummary?.types).toEqual(['infection.transmission']);
    expect(a.result.eventSummary?.count).toBeGreaterThan(0);
    expect(a.result.outputs).toEqual(b.result.outputs);
    expect(a.result.eventSummary).toEqual(b.result.eventSummary);
    expect(a.runId).toBe(b.runId);
    expect(a.provenance.modelId).toBe('epidemic-city');
  });

  it('hands the original epidemic world reference to the renderer exactly once', () => {
    clearExperimentWorldHandoffs();
    const run = runExperiment(parseScienceChatMessage('Zasymuluj epidemię z R0=5 przez 10 dni seed=12.'));
    expect(run.result.status).toBe('completed');
    expect(setPendingExperimentWorld(run.runId)).toBe(true);
    const handoff = consumePendingExperimentWorld();
    expect(handoff?.simulation.stats()).toEqual(run.result.outputs);
    expect(consumePendingExperimentWorld()).toBeNull();
    clearExperimentWorldHandoffs();
  });

  it('never fabricates a tunnelling solver or an urban hazard cascade', () => {
    const quantum = runExperiment(parseScienceChatMessage('Zasymuluj tunelowanie kwantowe.'));
    expect(quantum.result.status).toBe('capability_seam');
    expect(quantum.result.outputs).toEqual({});
    expect(quantum.result.summary).toContain('Wymagany solver');

    const flood = runExperiment(parseScienceChatMessage('Zasymuluj kaskadę: powódź → infrastruktura → epidemia.'));
    expect(flood.result.status).toBe('engine_not_available');
    expect(flood.result.outputs).toEqual({});
    expect(flood.result.summary).toContain('Wymagany solver');
  });
});
