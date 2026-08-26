import { afterEach, describe, expect, it, vi } from 'vitest';
import { earthquakeEvaluator } from '../core/hazard/earthquake/earthquakeEvaluator';
import { computeHazardInputFingerprint } from '../core/hazard/fingerprint';
import { getHazardModule } from '../core/hazard/hazardModuleRegistry';
import { InMemoryHazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { replayHazardRun } from '../core/hazard/hazardReplay';
import { executeEarthquakeCommandCenterScenario } from '../core/simulationRenderer/earthquakeCommandCenter';
import { listEarthquakePersistedRunHistory } from '../core/simulationRenderer/earthquakePersistedRunHistory';

function makeFakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

type RetainedInputPatch = Readonly<{
  scientificFields?: unknown;
  seed?: unknown;
  displayName?: unknown;
}>;

describe('Earthquake persisted-run history', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('lists actual persisted Earthquake runs and recomputes their registered canonical MATCH verdicts newest-first', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const first = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel: 'history-first',
        magnitude: 5.4,
        depthKm: 12,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      { store, commitHash: 'test-commit' },
    );
    const second = await executeEarthquakeCommandCenterScenario(
      {
        scenarioLabel: 'history-second',
        magnitude: 5.6,
        depthKm: 10,
        epicenter: { x: 0, y: 0 },
        seed: 42,
      },
      { store, commitHash: 'test-commit' },
    );
    expect(first.status).toBe('READY');
    expect(second.status).toBe('READY');
    if (first.status !== 'READY' || second.status !== 'READY') throw new Error('expected ready records');

    const history = await listEarthquakePersistedRunHistory(store);
    expect(history).toHaveLength(2);
    expect(history.map((entry) => entry.hazardRunId)).toEqual([
      second.scenario.run.hazardRunId,
      first.scenario.run.hazardRunId,
    ]);
    expect(history.every((entry) => entry.replay.status === 'MATCH')).toBe(true);
    expect(
      history.every((entry) => entry.hazardModuleVersion === getHazardModule('earthquake').moduleVersion),
    ).toBe(true);
    expect(
      history.every((entry) => entry.inputFingerprint.length > 0 && entry.resultFingerprint.length > 0),
    ).toBe(true);
  });

  it('does not manufacture history when the local provenance store has no Earthquake run records', async () => {
    await expect(listEarthquakePersistedRunHistory(new InMemoryHazardProvenanceStore())).resolves.toEqual([]);
  });

  it.each<readonly [string, RetainedInputPatch]>([
    ['scientificFields: null', { scientificFields: null }],
    ['seed: true', { seed: true }],
    ['displayName: {}', { displayName: {} }],
  ])(
    'keeps a canonically fingerprinted retained HazardInput with %s outside replay and read-only history',
    async (_label, patch) => {
      const storage = makeFakeStorage();
      vi.stubGlobal('window', { localStorage: storage });
      const { LocalHazardProvenanceStore } = await import('../core/hazard/hazardProvenanceStore');
      const store = new LocalHazardProvenanceStore();
      const outcome = await executeEarthquakeCommandCenterScenario(
        {
          scenarioLabel: 'retained-malformed-input',
          magnitude: 5.4,
          depthKm: 12,
          epicenter: { x: 0, y: 0 },
          seed: 42,
        },
        { store, commitHash: 'test-commit' },
      );
      expect(outcome.status).toBe('READY');
      if (outcome.status !== 'READY') throw new Error('expected ready records');

      const inputKey = 'genesis-os:hazard-provenance-store/inputs/v1';
      const retainedInputs = JSON.parse(storage.getItem(inputKey) ?? '{}') as Record<
        string,
        Record<string, unknown>
      >;
      const savedInput = retainedInputs[outcome.scenario.input.hazardInputId];
      retainedInputs[outcome.scenario.input.hazardInputId] = {
        ...savedInput,
        ...patch,
        inputFingerprint: await computeHazardInputFingerprint({
          hazardType: outcome.scenario.input.hazardType,
          sourceArtifactContentHash: outcome.scenario.artifact.contentHash,
          scientificFields: patch.scientificFields ?? outcome.scenario.input.scientificFields,
          seed: (patch.seed ?? outcome.scenario.input.seed) as number | string | null,
        }),
      };
      storage.setItem(inputKey, JSON.stringify(retainedInputs));

      expect(await store.getInput(outcome.scenario.input.hazardInputId)).toBeNull();
      await expect(
        replayHazardRun({
          store,
          hazardRunId: outcome.scenario.run.hazardRunId,
          evaluator: earthquakeEvaluator,
          hazardType: getHazardModule('earthquake').hazardType,
          projectionSchemaVersion: getHazardModule('earthquake').projectionSchemaVersion,
        }),
      ).resolves.toMatchObject({ status: 'NOT_REPRODUCIBLE', replayResultFingerprint: null });
      await expect(listEarthquakePersistedRunHistory(store)).resolves.toEqual([]);
    },
  );
});
