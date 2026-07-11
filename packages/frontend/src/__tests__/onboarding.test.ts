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

describe('onboarding: first-launch gate', () => {
  it('has not completed onboarding when nothing is stored', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { hasCompletedOnboarding } = await import('../core/onboarding');
    expect(hasCompletedOnboarding()).toBe(false);
  });

  it('markOnboardingComplete persists completion', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { hasCompletedOnboarding, markOnboardingComplete } = await import('../core/onboarding');
    markOnboardingComplete();
    expect(hasCompletedOnboarding()).toBe(true);
  });

  it('a fresh module instance reloads a previously persisted completion', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const first = await import('../core/onboarding');
    first.markOnboardingComplete();

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    const second = await import('../core/onboarding');
    expect(second.hasCompletedOnboarding()).toBe(true);
  });

  it('falls back to false on a corrupted stored value', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: 'yes' }));
    vi.stubGlobal('window', { localStorage: fake });
    const { hasCompletedOnboarding } = await import('../core/onboarding');
    expect(hasCompletedOnboarding()).toBe(false);
  });

  it('survives a completely malformed stored blob', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:onboarding/v1', JSON.stringify([1, 2, 3]));
    vi.stubGlobal('window', { localStorage: fake });
    const { hasCompletedOnboarding } = await import('../core/onboarding');
    expect(() => hasCompletedOnboarding()).not.toThrow();
    expect(hasCompletedOnboarding()).toBe(false);
  });
});
