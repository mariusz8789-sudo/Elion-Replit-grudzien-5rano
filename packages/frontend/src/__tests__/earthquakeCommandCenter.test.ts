import { describe, expect, it } from 'vitest';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';

describe('Earthquake command-center execution', () => {
  it('connects existing scenario computation through persisted evidence, MATCH replay, mapping and a read-only overlay', async () => {
    const execution = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel: 'city3d-demo-fixture',
        magnitude: 5.4,
        depthKm: 12,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      { store: new InMemoryHazardProvenanceStore(), commitHash: 'test-commit' },
    );
    expect(execution.status).toBe('READY');
    if (execution.status !== 'READY') throw new Error(`unexpected envelope block: ${execution.blockCode}`);
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
    expect(execution.projection.notModeled).toEqual(
      expect.arrayContaining([
        'population casualty estimation',
        'building-level structural damage',
        'aftershock sequence',
        'infrastructure/utility cascade effects',
        'evacuation or emergency response guidance',
      ]),
    );
    expect(execution.overlay?.notModeled).toEqual(
      expect.arrayContaining([
        'real-world geography',
        'real facility association',
        'CityWorld model coupling',
      ]),
    );
  });

  it('does not return an overlay when the actual workflow is blocked by unsupported schema policy', async () => {
    const execution = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel: 'city3d-demo-blocked-schema',
        magnitude: 5.4,
        depthKm: 12,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      {
        store: new InMemoryHazardProvenanceStore(),
        commitHash: 'test-commit',
        overlayPolicy: { enabled: true, supportedSchemas: [] },
      },
    );
    expect(execution.status).toBe('READY');
    if (execution.status !== 'READY') throw new Error(`unexpected envelope block: ${execution.blockCode}`);
    expect(execution.replay.status).toBe('MATCH');
    expect(execution.evidence.missingFields).toEqual([]);
    expect(execution.overlayGate).toEqual({ enabled: false, reasons: ['UNSUPPORTED_SCHEMA'] });
    expect(execution.overlay).toBeNull();
  });

  it('returns a named envelope block with no overlay for invalid synthetic input', async () => {
    const execution = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel: 'command-center-invalid-spec',
        magnitude: Number.NaN,
        depthKm: 8,
        epicenter: { x: 0, y: 0 },
        seed: 1,
      },
      { commitHash: 'test-commit', store: new InMemoryHazardProvenanceStore() },
    );

    expect(execution).toMatchObject({
      status: 'BLOCKED',
      blockCode: 'INVALID_SCENARIO_SPEC',
      overlay: null,
    });
  });

  it('blocks an immutable provenance conflict before mapping or City3D overlay output', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const scenarioLabel = 'command-center-reused-immutable-label';
    const first = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel,
        magnitude: 5.4,
        depthKm: 12,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      { store, commitHash: 'test-commit' },
    );
    expect(first.status).toBe('READY');

    const conflict = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel,
        magnitude: 6.1,
        depthKm: 12,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      { store, commitHash: 'test-commit' },
    );

    expect(conflict).toMatchObject({
      status: 'BLOCKED',
      blockCode: 'PROVENANCE_CONFLICT',
      overlay: null,
    });
    expect(conflict.envelope.projection).toBeNull();
  });
});
