import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';

/**
 * WORLD DISCOVERY LOOP -> SCIENTIFIC MEMORY.
 *
 * Before this, `core/agent/discoveryLoop.ts` (the sentence-driven search on a
 * WorldGraph, wired into WorldDiscoveryPanel.tsx) was the one real experiment
 * mechanism in Genesis with no memory at all: it ran and vanished. This proves
 * the smallest addition to the EXISTING `scienceMemory.ts` — `saveExperiment`
 * reused unchanged, no new saved-record type — persists a real run, and that
 * what gets saved matches what `renderDiscoveryReport` already shows on
 * screen, since the saved analysis block IS that same rendered text.
 *
 * `vi.resetModules()` + a dynamic `import('../core/scienceMemory')` per test,
 * same pattern as `scienceMemoryDiscoveryLoop.test.ts`: `storage.ts` caches
 * whether `localStorage` is available at module scope, so a stale cache from
 * an earlier test (or the ambient jsdom environment) would silently no-op
 * every write in this file otherwise.
 */
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

describe('saveWorldDiscoveryLoopToMemory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('persists a real completed search and reads it back unchanged', async () => {
    const { saveWorldDiscoveryLoopToMemory, listExperiments, getExperiment } = await import('../core/scienceMemory');
    const state = runWorldDiscovery('Minimise peak flood depth, at most 4 experiments.');
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);

    const saved = saveWorldDiscoveryLoopToMemory(state.result);
    expect(saved.experimentName).toContain(state.result.question);
    expect(saved.epistemicStatus).toBe('SIMULATION');
    expect(saved.stats?.rounds).toBe(state.result.rounds.length);
    expect(saved.analysis?.[0]?.body).toBe(state.report);

    const reloaded = getExperiment(saved.id);
    expect(reloaded).toEqual(saved);
    expect(listExperiments().some((e) => e.id === saved.id)).toBe(true);
  });

  it('names a distinct id for a distinct question, so two different searches never collide', async () => {
    const { saveWorldDiscoveryLoopToMemory, listExperiments } = await import('../core/scienceMemory');
    const a = runWorldDiscovery('Minimise peak flood depth, at most 2 experiments.');
    const b = runWorldDiscovery('Minimise peak flood depth, at most 4 experiments.');
    if (a.kind !== 'COMPLETE' || b.kind !== 'COMPLETE') throw new Error('expected both COMPLETE');

    const savedA = saveWorldDiscoveryLoopToMemory(a.result);
    const savedB = saveWorldDiscoveryLoopToMemory(b.result);
    expect(savedA.id).not.toBe(savedB.id);
    expect(listExperiments()).toHaveLength(2);
  });

  it('honesty note names what actually survived, never a promoted least-refuted mechanism', async () => {
    const { saveWorldDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const state = runWorldDiscovery('Reduce peak flood depth by outlet, at most 1 experiment.');
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const saved = saveWorldDiscoveryLoopToMemory(state.result);
    if (state.result.bestSupported.length === 0) {
      expect(saved.honestyNote).toContain('Nic nie przetrwało');
    } else {
      for (const b of state.result.bestSupported) expect(saved.honestyNote).toContain(b.hypothesisId);
    }
  });
});
