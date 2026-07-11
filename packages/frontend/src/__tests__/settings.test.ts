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

function makeFakeDocument() {
  const classes = new Set<string>();
  return {
    documentElement: {
      classList: {
        toggle: (name: string, force?: boolean) => {
          const on = force ?? !classes.has(name);
          if (on) classes.add(name);
          else classes.delete(name);
        },
        contains: (name: string) => classes.has(name),
      },
    },
    classes,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('settings: defaults and persistence', () => {
  it('starts with sane defaults when nothing is stored', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getSettings } = await import('../core/settings');
    expect(getSettings()).toEqual({
      reducedMotion: false,
      highContrast: false,
      compactNarrator: false,
      analyticsEnabled: true,
      soundEnabled: true,
    });
  });

  it('updateSettings persists a patch and notifies subscribers', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getSettings, updateSettings, subscribeSettings } = await import('../core/settings');
    let notified: unknown = null;
    const unsub = subscribeSettings((s) => {
      notified = s;
    });
    updateSettings({ highContrast: true });
    expect(getSettings().highContrast).toBe(true);
    expect(notified).toEqual(getSettings());
    unsub();
  });

  it('unsubscribe stops further notifications', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { updateSettings, subscribeSettings } = await import('../core/settings');
    let calls = 0;
    const unsub = subscribeSettings(() => calls++);
    updateSettings({ reducedMotion: true });
    unsub();
    updateSettings({ reducedMotion: false });
    expect(calls).toBe(1);
  });

  it('a fresh module instance reloads a previously persisted patch', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const first = await import('../core/settings');
    first.updateSettings({ compactNarrator: true });

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    const second = await import('../core/settings');
    expect(second.getSettings().compactNarrator).toBe(true);
  });
});

describe('settings: defensive validation of corrupted storage', () => {
  it('falls back field-by-field when a stored value has the wrong type', async () => {
    const fake = makeFakeStorage();
    fake.setItem(
      'genesis-os:settings/v1',
      JSON.stringify({
        reducedMotion: 'yes',
        highContrast: true,
        compactNarrator: null,
        analyticsEnabled: 1,
        soundEnabled: 'no',
      }),
    );
    vi.stubGlobal('window', { localStorage: fake });
    const { getSettings } = await import('../core/settings');
    expect(getSettings()).toEqual({
      reducedMotion: false, // invalid type -> default
      highContrast: true, // valid boolean -> kept
      compactNarrator: false, // invalid type -> default
      analyticsEnabled: true, // invalid type -> default
      soundEnabled: true, // invalid type -> default
    });
  });

  it('survives a completely malformed stored blob (array instead of object)', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:settings/v1', JSON.stringify([1, 2, 3]));
    vi.stubGlobal('window', { localStorage: fake });
    const { getSettings } = await import('../core/settings');
    expect(getSettings().reducedMotion).toBe(false);
  });
});

describe('applyDocumentFlags', () => {
  it('is a no-op without throwing when document is undefined', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { applyDocumentFlags } = await import('../core/settings');
    expect(() =>
      applyDocumentFlags({
        reducedMotion: true,
        highContrast: true,
        compactNarrator: false,
        analyticsEnabled: true,
        soundEnabled: true,
      }),
    ).not.toThrow();
  });

  it('toggles html classes to match settings when document exists', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const fakeDoc = makeFakeDocument();
    vi.stubGlobal('document', fakeDoc);
    const { applyDocumentFlags } = await import('../core/settings');
    applyDocumentFlags({
      reducedMotion: true,
      highContrast: false,
      compactNarrator: false,
      analyticsEnabled: true,
      soundEnabled: true,
    });
    expect(fakeDoc.classes.has('force-reduced-motion')).toBe(true);
    expect(fakeDoc.classes.has('high-contrast')).toBe(false);
  });
});
