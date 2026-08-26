import { describe, expect, it } from 'vitest';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import {
  buildEarthquakeEvidenceExport,
  getEarthquakeEvidenceExportFilename,
  serializeEarthquakeEvidenceExport,
} from '../core/simulationRenderer/earthquakeEvidenceExport';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';

describe('Earthquake local evidence export', () => {
  it('exports the real ready envelope, evidence, replay, explicit mapping and honest labels deterministically', async () => {
    const execution = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'export-ready', magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store: new InMemoryHazardProvenanceStore(), commitHash: 'test-commit' });
    expect(execution.status).toBe('READY');
    if (execution.status !== 'READY') throw new Error(`unexpected block: ${execution.blockCode}`);

    const payload = buildEarthquakeEvidenceExport(execution);
    expect(payload).toMatchObject({
      exportSchemaVersion: '1.0.0',
      commandCenterStatus: 'READY',
      labels: ['SCENARIO', 'SYNTHETIC', 'NON_OPERATIONAL'],
      replay: { status: 'MATCH' },
      evidence: { missingFields: [] },
      mapping: { mappingFingerprint: execution.mapping.mappingFingerprint },
      overlayGate: { enabled: true },
    });
    expect(serializeEarthquakeEvidenceExport(execution)).toBe(serializeEarthquakeEvidenceExport(execution));
    expect(getEarthquakeEvidenceExportFilename(execution)).toContain(execution.scenario.run.hazardRunId);
  });

  it('exports a named blocked record with no mapping or overlay', async () => {
    const execution = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'export-invalid', magnitude: Number.NaN, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store: new InMemoryHazardProvenanceStore(), commitHash: 'test-commit' });
    expect(execution.status).toBe('BLOCKED');
    if (execution.status !== 'BLOCKED') throw new Error('expected blocked execution');

    expect(buildEarthquakeEvidenceExport(execution)).toMatchObject({
      commandCenterStatus: 'BLOCKED',
      blockCode: 'INVALID_SCENARIO_SPEC',
      mapping: null,
      overlay: null,
    });
    expect(getEarthquakeEvidenceExportFilename(execution)).toContain('invalid_scenario_spec-blocked');
  });
});
