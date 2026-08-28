import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { runExperiment } from '../core/experimentFabric/executor';

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('Experiment Fabric to Scientific Memory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });

  it('persists the complete run identity, outputs, analysis and execution provenance', async () => {
    const run = runExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'));
    const { saveExperimentRunToMemory, listExperiments } = await import('../core/scienceMemory');
    const saved = saveExperimentRunToMemory(run);
    const loaded = listExperiments()[0];

    expect(run.result.status).toBe('completed');
    expect(saved.execution).toMatchObject({
      status: 'completed',
      runId: run.runId,
      runFingerprint: run.provenance.runFingerprint,
      resultOrigin: 'real-engine',
      modelId: run.request.modelId,
    });
    expect(saved.params).toEqual(run.request.parameters);
    expect(saved.observations).toEqual(run.result.outputs);
    expect(saved.analysis?.[0]).toMatchObject({ body: run.result.summary, kind: 'fabric-result' });
    expect(saved.honestyNote).toContain('resultOrigin=real-engine');
    expect(loaded?.execution?.runFingerprint).toBe(run.provenance.runFingerprint);
  });

  it('keeps knowledge-only biotech status explicit when saving a run', async () => {
    const { saveExperimentRunToMemory } = await import('../core/scienceMemory');
    const parsed = parseScienceChatMessage('Znajdź naturalnych kandydatów dla targetu A1: kofeina.');
    const run = runExperiment({ ...parsed, parameters: { ...parsed.parameters, targetQuery: 'kofeina A1' } });
    const saved = saveExperimentRunToMemory(run);

    expect(run.result.status).toBe('knowledge_only');
    expect(saved.execution).toMatchObject({ status: 'knowledge_only', resultOrigin: 'knowledge-only' });
    expect(saved.epistemicStatus).toBe('UNKNOWN');
    expect(saved.honestyNote).toContain('status=knowledge_only');
  });
});
