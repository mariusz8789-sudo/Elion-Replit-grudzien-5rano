import { afterEach, describe, expect, it, vi } from 'vitest';
import '../labs/index';
import { getLab } from '../core/registry';
import { ACHIEVEMENTS } from '../core/discoveryLog';

/**
 * Progi osiągnięć w discoveryLog.ts referencjonują klucze zwracane przez
 * sim.getStats() konkretnych eksperymentów — ten plik weryfikuje zarówno
 * czyste funkcje check() (przykładowe stany true/false), jak i trwałość
 * (recordVisit/recordStats/getLogState) na sfałszowanym localStorage.
 *
 * Uwaga: labs/index jest importowany raz, statycznie, na górze pliku —
 * dynamiczny import po vi.resetModules() dałby świeży (pusty) rejestr
 * laboratoriów, bo registry.ts to per-moduł singleton.
 */

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
});

describe('ACHIEVEMENTS: every entry references a real, registered lab', () => {
  it('labId matches a lab in the registry', () => {
    for (const a of ACHIEVEMENTS) {
      expect(getLab(a.labId), `${a.id} references unknown lab "${a.labId}"`).toBeDefined();
    }
  });

  it('ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ACHIEVEMENTS: check() thresholds', () => {
  it('bell-broken fires only above the CHSH classical bound with enough samples', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'bell-broken')!;
    expect(a.check({ S: 2.7, pairs: 600 })).toBe(true);
    expect(a.check({ S: 1.9, pairs: 600 })).toBe(false); // classical regime
    expect(a.check({ S: 2.7, pairs: 10 })).toBe(false); // too few samples
  });

  it('superposition-created fires near a 50/50 split, not at the extremes', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'superposition-created')!;
    expect(a.check({ p0: 50 })).toBe(true);
    expect(a.check({ p0: 99 })).toBe(false);
    expect(a.check({ p0: 0 })).toBe(false);
  });

  it('criticality-reached requires k near 1 AND an active chain', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'criticality-reached')!;
    expect(a.check({ k: 1.0, neutrons: 20 })).toBe(true);
    expect(a.check({ k: 1.0, neutrons: 1 })).toBe(false); // reaction died out
    expect(a.check({ k: 0.5, neutrons: 20 })).toBe(false); // subcritical
  });

  it('galaxy-colonized requires the expansion front to cover most of the field', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'galaxy-colonized')!;
    expect(a.check({ frac: 95 })).toBe(true);
    expect(a.check({ frac: 40 })).toBe(false);
  });

  it('earth-year-completed fires once Earth has closed one full real orbit', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'earth-year-completed')!;
    expect(a.check({ earthOrbits: 1.02 })).toBe(true);
    expect(a.check({ earthOrbits: 0.5 })).toBe(false);
  });
});

// Statyczny `import '../labs/index'` na górze pliku wciąga NarratorPanel ->
// core/settings, którego kod modułowy (top-level readJSON) wywołuje się
// natychmiast, ZANIM jakikolwiek test zdąży podstawić window — to na trwałe
// cache'uje storageAvailable()=false w współdzielonym module storage.ts.
// Testy trwałości potrzebują więc świeżej instancji: stub window, potem
// resetModules + dynamiczny import, żeby storage.ts przeliczył dostępność
// na podstawie AKTUALNIE podstawionego window.
describe('discoveryLog: persistence', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('recordVisit tracks unique (lab, experiment) pairs', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { recordVisit: freshRecordVisit, getLogState: freshGetLogState } = await import('../core/discoveryLog');
    freshRecordVisit('quantum', 'chsh');
    freshRecordVisit('quantum', 'chsh'); // duplicate, should not double-count
    freshRecordVisit('nuclear', '__base');
    expect(freshGetLogState().visited).toEqual(['quantum/chsh', 'nuclear/__base']);
  });

  it('recordStats unlocks an achievement once its threshold is met, and only once', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { recordStats: freshRecordStats, getLogState: freshGetLogState } = await import('../core/discoveryLog');
    freshRecordStats('quantum', 'chsh', { S: 2.7, pairs: 600 });
    let state = freshGetLogState();
    expect(state.unlocked).toContain('bell-broken');
    expect(state.unlockedAt['bell-broken']).toBeTruthy();

    const firstTimestamp = state.unlockedAt['bell-broken'];
    freshRecordStats('quantum', 'chsh', { S: 2.75, pairs: 700 }); // still true, must not re-timestamp
    state = freshGetLogState();
    expect(state.unlockedAt['bell-broken']).toBe(firstTimestamp);
  });

  it('getVisitedCount reports distinct labs out of the full registry size', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    await import('../labs/index'); // re-register the 13 labs in the fresh module graph
    const { recordVisit: freshRecordVisit, getVisitedCount: freshGetVisitedCount } = await import('../core/discoveryLog');
    const { getLabs: freshGetLabs } = await import('../core/registry');
    freshRecordVisit('quantum', '__base');
    freshRecordVisit('quantum', 'chsh'); // same lab, second experiment -> still 1 distinct lab
    freshRecordVisit('nuclear', '__base');
    const summary = freshGetVisitedCount();
    expect(summary.visited).toBe(2);
    expect(summary.totalLabs).toBe(freshGetLabs().length);
    expect(summary.totalLabs).toBe(13);
  });

  it('recovers cleanly from a corrupted stored blob instead of throwing', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:discovery-log/v1', JSON.stringify({ visited: 'not-an-array', unlocked: null }));
    vi.stubGlobal('window', { localStorage: fake });
    vi.resetModules();
    const { recordVisit: freshRecordVisit, getLogState: freshGetLogState } = await import('../core/discoveryLog');
    expect(freshGetLogState()).toEqual({ visited: [], unlocked: [], unlockedAt: {} });
    expect(() => freshRecordVisit('quantum', '__base')).not.toThrow();
  });
});
