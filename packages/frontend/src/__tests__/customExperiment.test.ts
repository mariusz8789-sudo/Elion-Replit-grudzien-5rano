import { afterEach, describe, expect, it, vi } from 'vitest';

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('customExperiment: save/list/delete', () => {
  it('saves an experiment and lists it back for its lab', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveCustomExperiment, listCustomExperiments } = await import('../core/customExperiment');
    saveCustomExperiment('universe', 'Mój test', { h0: 80, omegaLambda: 0.5 });
    const list = listCustomExperiments('universe');
    expect(list.length).toBe(1);
    expect(list[0].name).toBe('Mój test');
    expect(list[0].params).toEqual({ h0: 80, omegaLambda: 0.5 });
  });

  it('does not leak experiments across labs', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveCustomExperiment, listCustomExperiments } = await import('../core/customExperiment');
    saveCustomExperiment('universe', 'A', {});
    saveCustomExperiment('quantum', 'B', {});
    expect(listCustomExperiments('universe').length).toBe(1);
    expect(listCustomExperiments('quantum').length).toBe(1);
  });

  it('most recently saved experiment comes first', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveCustomExperiment, listCustomExperiments } = await import('../core/customExperiment');
    saveCustomExperiment('universe', 'First', {});
    await new Promise((r) => setTimeout(r, 2));
    saveCustomExperiment('universe', 'Second', {});
    const list = listCustomExperiments('universe');
    expect(list[0].name).toBe('Second');
  });

  it('deletes an experiment by id', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveCustomExperiment, listCustomExperiments, deleteCustomExperiment } = await import('../core/customExperiment');
    const entry = saveCustomExperiment('universe', 'To delete', {});
    deleteCustomExperiment(entry.id);
    expect(listCustomExperiments('universe').length).toBe(0);
  });

  it('falls back to a default name when given an empty string', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveCustomExperiment } = await import('../core/customExperiment');
    const entry = saveCustomExperiment('universe', '   ', {});
    expect(entry.name).toBe('Bez nazwy');
  });

  it('recovers cleanly from a corrupted stored blob instead of throwing', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:custom-experiments/v1', JSON.stringify([{ id: 'x' }, 'garbage', null]));
    vi.stubGlobal('window', { localStorage: fake });
    const { listCustomExperiments } = await import('../core/customExperiment');
    expect(listCustomExperiments('universe')).toEqual([]);
  });

  it('rejects entries whose params contain non-primitive values', async () => {
    const fake = makeFakeStorage();
    fake.setItem(
      'genesis-os:custom-experiments/v1',
      JSON.stringify([{ id: 'x', labId: 'universe', name: 'bad', createdAt: '2026-01-01', params: { nested: { a: 1 } } }]),
    );
    vi.stubGlobal('window', { localStorage: fake });
    const { listCustomExperiments } = await import('../core/customExperiment');
    expect(listCustomExperiments('universe')).toEqual([]);
  });
});
