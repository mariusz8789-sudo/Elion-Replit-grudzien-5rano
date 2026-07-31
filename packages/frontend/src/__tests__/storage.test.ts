import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * core/storage.ts musi działać w trybie no-op (bez wyjątków) zarówno w
 * środowisku bez `window` (SSR/node — domyślne środowisko testów Vitest),
 * jak i gdy localStorage rzuca (tryb prywatny Safari, pełny dysk).
 * `vi.resetModules()` + dynamiczny import dają każdemu testowi świeży
 * moduł, bo `cachedAvailable` jest memoizowany na poziomie modułu.
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
  vi.resetModules();
});

describe('storage: no window global (default test environment)', () => {
  it('storageAvailable() is false and reads return the fallback', async () => {
    const { storageAvailable, readJSON, writeJSON } = await import('../core/storage');
    expect(storageAvailable()).toBe(false);
    expect(readJSON('k', 'fallback')).toBe('fallback');
    expect(writeJSON('k', 1)).toBe(false);
  });
});

describe('storage: working localStorage', () => {
  it('round-trips JSON through readJSON/writeJSON', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { readJSON, writeJSON, storageAvailable } = await import('../core/storage');
    expect(storageAvailable()).toBe(true);
    expect(writeJSON('k', { a: 1, b: [1, 2, 3] })).toBe(true);
    expect(readJSON('k', null)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('returns the fallback for a missing key', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { readJSON } = await import('../core/storage');
    expect(readJSON('missing', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for corrupted JSON instead of throwing', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const { readJSON } = await import('../core/storage');
    fake.setItem('genesis-os:bad', '{not valid json');
    expect(readJSON('bad', 'fallback')).toBe('fallback');
  });

  it('remove() deletes a single key', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { readJSON, writeJSON, remove } = await import('../core/storage');
    writeJSON('k', 42);
    remove('k');
    expect(readJSON('k', null)).toBe(null);
  });

  it('clearAll() removes only genesis-os: prefixed keys', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const { readJSON, writeJSON, clearAll } = await import('../core/storage');
    writeJSON('a', 1);
    fake.setItem('other-app:x', 'untouched');
    clearAll();
    expect(readJSON('a', null)).toBe(null);
    expect(fake.getItem('other-app:x')).toBe('untouched');
  });
});

describe('storage: localStorage throws (Safari private mode / quota)', () => {
  it('degrades to no-op without throwing', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        getItem: () => null,
        removeItem: () => {},
        key: () => null,
        length: 0,
      },
    });
    const { readJSON, writeJSON, storageAvailable } = await import('../core/storage');
    expect(storageAvailable()).toBe(false);
    expect(writeJSON('k', 1)).toBe(false);
    expect(readJSON('k', 'fallback')).toBe('fallback');
  });
});
