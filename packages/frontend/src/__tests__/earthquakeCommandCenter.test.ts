import { describe, expect, it } from 'vitest';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';

describe('Earthquake command-center execution', () => {
  it('connects existing scenario computation through persisted evidence, MATCH replay, mapping and a read-only overlay', async () => {
    const execution = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'city3d-demo-fixture', magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store: new InMemoryHazardProvenanceStore(), commitHash: 'test-commit' });
    expect(execution.scenario.input.hazardType).toBe('earthquake');
    expect(execution.moduleDescriptor).toMatchObject({
      hazardType: 'earthquake',
      projectionSchemaVersion: execution.projection.schemaVersion,
      scenarioOnly: true,
    });
    expect(execution.evidence.missingFields).toEqual([]);
    expect(execution.replay.status).toBe('MATCH');
    expect(execution.overlayGate).toEqual({ enabled: true, reasons: [] });
    expect(execution.overlay?.datasetStatus).toBe('SCENARIO');
    expect(execution.overlay?.sites).toHaveLength(5);
    expect(execution.projection.notModeled).toContain('population casualty estimation');
  });

  it('does not return an overlay when the actual workflow is blocked by unsupported schema policy', async () => {
    const execution = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'city3d-demo-blocked-schema', magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, {
      store: new InMemoryHazardProvenanceStore(),
      commitHash: 'test-commit',
      overlayPolicy: { enabled: true, supportedSchemas: [] },
    });
    expect(execution.replay.status).toBe('MATCH');
    expect(execution.evidence.missingFields).toEqual([]);
    expect(execution.overlayGate).toEqual({ enabled: false, reasons: ['UNSUPPORTED_SCHEMA'] });
    expect(execution.overlay).toBeNull();
  });
});
