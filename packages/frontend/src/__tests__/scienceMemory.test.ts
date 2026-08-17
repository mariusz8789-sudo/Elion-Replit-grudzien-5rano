import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeFakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

describe('scienceMemory: contentHash', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('is deterministic and independent of param key order', async () => {
    const { contentHash } = await import('../core/scienceMemory');
    const a = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 1, m2: 2 } });
    const b = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m2: 2, m1: 1 } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when a parameter changes (reproducibility fingerprint)', async () => {
    const { contentHash } = await import('../core/scienceMemory');
    const a = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 1 } });
    const b = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 2 } });
    expect(a).not.toBe(b);
  });
});

describe('scienceMemory: save / list / get / delete', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  const input = {
    labId: 'universe', experimentId: 'threebody', experimentName: 'Problem trzech ciał',
    params: { mass: 1.0 }, stats: { energy: -0.5 },
    honesty: 'exact' as const, honestyNote: 'Velocity-Verlet.',
    equations: ['a_i = Σ ...'], assumptions: ['Newton'], epistemicStatus: 'Nauka ustalona',
  };

  it('saves an experiment carrying model, params, equations, stats and a hash', async () => {
    const { saveExperiment, listExperiments } = await import('../core/scienceMemory');
    const saved = saveExperiment(input);
    expect(saved.contentHash).toMatch(/^[0-9a-f]{8}$/);
    expect(saved.equations).toEqual(['a_i = Σ ...']);
    const list = listExperiments();
    expect(list.length).toBe(1);
    expect(list[0].experimentName).toBe('Problem trzech ciał');
    expect(list[0].stats.energy).toBe(-0.5);
  });

  it('persists across a fresh module load (real localStorage round-trip)', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const first = await import('../core/scienceMemory');
    first.saveExperiment(input);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    const second = await import('../core/scienceMemory');
    expect(second.countExperiments()).toBe(1);
    expect(second.listExperiments()[0].experimentId).toBe('threebody');
  });

  it('delete removes the record', async () => {
    const { saveExperiment, listExperiments, deleteExperiment } = await import('../core/scienceMemory');
    const s = saveExperiment(input);
    deleteExperiment(s.id);
    expect(listExperiments().length).toBe(0);
  });

  it('ignores corrupted rows instead of throwing (defensive read)', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:science-memory/v1', JSON.stringify([{ garbage: true }, null, 42]));
    vi.stubGlobal('window', { localStorage: fake });
    const { listExperiments } = await import('../core/scienceMemory');
    expect(listExperiments()).toEqual([]);
  });
});
