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

describe('analytics: local, opt-out counters', () => {
  it('track() increments the named counter', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { track, getCounters } = await import('../core/analytics');
    track('search_used');
    track('search_used');
    track('ask_ai_used');
    expect(getCounters()).toEqual({ search_used: 2, ask_ai_used: 1 });
  });

  it('track() is a no-op once analyticsEnabled is turned off', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { updateSettings } = await import('../core/settings');
    const { track, getCounters } = await import('../core/analytics');
    track('search_used');
    updateSettings({ analyticsEnabled: false });
    track('search_used');
    expect(getCounters()).toEqual({ search_used: 1 });
  });

  it('clearAnalytics() resets all counters', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { track, getCounters, clearAnalytics } = await import('../core/analytics');
    track('glossary_viewed');
    clearAnalytics();
    expect(getCounters()).toEqual({});
  });

  it('discards non-numeric or negative values from a corrupted stored blob', async () => {
    const fake = makeFakeStorage();
    fake.setItem(
      'genesis-os:analytics/v1',
      JSON.stringify({ search_used: 3, ask_ai_used: 'lots', shortcut_used: -1, glossary_viewed: NaN }),
    );
    vi.stubGlobal('window', { localStorage: fake });
    const { getCounters } = await import('../core/analytics');
    expect(getCounters()).toEqual({ search_used: 3 });
  });
});
