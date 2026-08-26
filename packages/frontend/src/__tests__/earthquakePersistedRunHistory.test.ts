import { describe, expect, it } from 'vitest';
import { getHazardModule } from '../core/hazard/hazardModuleRegistry';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';
import { listEarthquakePersistedRunHistory } from '../core/simulationRenderer/earthquakePersistedRunHistory';

describe('Earthquake persisted-run history', () => {
  it('lists actual persisted Earthquake runs and recomputes their registered canonical MATCH verdicts newest-first', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const first = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'history-first', magnitude: 5.4, depthKm: 12, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store, commitHash: 'test-commit' });
    const second = await executeEarthquakeCommandCenterScenario({
      scenarioLabel: 'history-second', magnitude: 5.6, depthKm: 10, epicenter: { x: 0, y: 0 }, seed: 42,
    }, { store, commitHash: 'test-commit' });
    expect(first.status).toBe('READY');
    expect(second.status).toBe('READY');
    if (first.status !== 'READY' || second.status !== 'READY') throw new Error('expected ready records');

    const history = await listEarthquakePersistedRunHistory(store);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.hazardRunId)).toEqual([second.scenario.run.hazardRunId, first.scenario.run.hazardRunId]);
    expect(history.every((entry) => entry.replay.status === 'MATCH')).toBe(true);
    expect(history.every((entry) => entry.hazardModuleVersion === getHazardModule('earthquake').moduleVersion)).toBe(true);
    expect(history.every((entry) => entry.inputFingerprint.length > 0 && entry.resultFingerprint.length > 0)).toBe(true);
  });

  it('does not manufacture history when the local provenance store has no Earthquake run records', async () => {
    await expect(listEarthquakePersistedRunHistory(new InMemoryHazardProvenanceStore())).resolves.toEqual([]);
  });
});
