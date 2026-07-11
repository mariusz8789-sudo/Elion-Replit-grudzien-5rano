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

/**
 * Fałszywy Web Audio API — liczy wywołania zamiast faktycznie generować
 * dźwięk (brak audio backendu w vitest). `initialState`/`resumeBehavior`
 * pozwalają symulować Safari/iOS: kontekst utworzony jako 'suspended',
 * który wznawia się (albo NIE) dopiero po `resume()`.
 */
function makeFakeAudioContext(
  options: { initialState?: string; resumeBehavior?: 'resolve' | 'reject' } = {},
) {
  const { initialState = 'running', resumeBehavior = 'resolve' } = options;
  const calls = { oscillators: 0, gains: 0, starts: 0, stops: 0, connects: 0, resumes: 0 };

  class FakeGainNode {
    gain = {
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    };
    connect() {
      calls.connects++;
      return this;
    }
  }

  class FakeOscillatorNode {
    type = 'sine';
    frequency = { value: 0 };
    connect() {
      calls.connects++;
      return this;
    }
    start() {
      calls.starts++;
    }
    stop() {
      calls.stops++;
    }
  }

  class FakeAudioContext {
    currentTime = 0;
    state = initialState;
    destination = {};
    resume() {
      calls.resumes++;
      if (resumeBehavior === 'reject') return Promise.reject(new Error('resume refused'));
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      calls.oscillators++;
      return new FakeOscillatorNode() as unknown as OscillatorNode;
    }
    createGain() {
      calls.gains++;
      return new FakeGainNode() as unknown as GainNode;
    }
  }

  return { FakeAudioContext, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('sound: gated by settings.soundEnabled', () => {
  it('plays one oscillator per tone (single-tone event)', async () => {
    const { FakeAudioContext, calls } = makeFakeAudioContext();
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: FakeAudioContext });
    const { playSimStart } = await import('../core/sound');
    playSimStart();
    expect(calls.oscillators).toBe(1);
    expect(calls.starts).toBe(1);
  });

  it('plays a three-note chord for an achievement', async () => {
    const { FakeAudioContext, calls } = makeFakeAudioContext();
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: FakeAudioContext });
    const { playAchievement } = await import('../core/sound');
    playAchievement();
    expect(calls.oscillators).toBe(3);
    expect(calls.starts).toBe(3);
  });

  it('does nothing when soundEnabled is false in settings', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:settings/v1', JSON.stringify({ soundEnabled: false }));
    const { FakeAudioContext, calls } = makeFakeAudioContext();
    vi.stubGlobal('window', { localStorage: fake, AudioContext: FakeAudioContext });
    const { playEnterLab, playSimStart, playSimPause, playAchievement, playTimelineTransition, playNarratorEvent } =
      await import('../core/sound');
    playEnterLab();
    playSimStart();
    playSimPause();
    playAchievement();
    playTimelineTransition();
    playNarratorEvent();
    expect(calls.oscillators).toBe(0);
  });

  it('respects a live toggle: enabling sound mid-session lets subsequent calls through', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:settings/v1', JSON.stringify({ soundEnabled: false }));
    const { FakeAudioContext, calls } = makeFakeAudioContext();
    vi.stubGlobal('window', { localStorage: fake, AudioContext: FakeAudioContext });
    const { playSimStart } = await import('../core/sound');
    const { updateSettings } = await import('../core/settings');
    playSimStart();
    expect(calls.oscillators).toBe(0);
    updateSettings({ soundEnabled: true });
    playSimStart();
    expect(calls.oscillators).toBe(1);
  });
});

describe('sound: Safari/iOS-style suspended AudioContext (autoplay policy)', () => {
  it('waits for resume() to resolve before scheduling — does not schedule against a frozen clock', async () => {
    const { FakeAudioContext, calls } = makeFakeAudioContext({ initialState: 'suspended', resumeBehavior: 'resolve' });
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: FakeAudioContext });
    const { playSimStart } = await import('../core/sound');
    playSimStart();
    // Synchronicznie (przed rozstrzygnięciem resume()) nic jeszcze nie zaplanowano.
    expect(calls.resumes).toBe(1);
    expect(calls.oscillators).toBe(0);
    // Po rozstrzygnięciu obietnicy resume() dźwięk faktycznie się planuje.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.oscillators).toBe(1);
    expect(calls.starts).toBe(1);
  });

  it('does not throw and schedules nothing when the browser refuses to resume (no user gesture)', async () => {
    const { FakeAudioContext, calls } = makeFakeAudioContext({ initialState: 'suspended', resumeBehavior: 'reject' });
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: FakeAudioContext });
    const { playSimStart } = await import('../core/sound');
    expect(() => playSimStart()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.oscillators).toBe(0);
  });

  it('reuses the same context across calls instead of creating a new one each time', async () => {
    const { FakeAudioContext, calls } = makeFakeAudioContext({ initialState: 'suspended', resumeBehavior: 'resolve' });
    let constructCalls = 0;
    class CountingAudioContext extends FakeAudioContext {
      constructor() {
        super();
        constructCalls++;
      }
    }
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: CountingAudioContext });
    const { playSimStart, playSimPause } = await import('../core/sound');
    playSimStart();
    await Promise.resolve();
    await Promise.resolve();
    playSimPause();
    await Promise.resolve();
    await Promise.resolve();
    expect(constructCalls).toBe(1);
    expect(calls.oscillators).toBe(2);
  });
});

describe('sound: graceful degradation without a usable audio backend', () => {
  it('does not throw when window has no AudioContext at all', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { playEnterLab } = await import('../core/sound');
    expect(() => playEnterLab()).not.toThrow();
  });

  it('does not throw and stops retrying when constructing AudioContext throws', async () => {
    let constructCalls = 0;
    class ThrowingAudioContext {
      constructor() {
        constructCalls++;
        throw new Error('blocked by browser policy');
      }
    }
    vi.stubGlobal('window', { localStorage: makeFakeStorage(), AudioContext: ThrowingAudioContext });
    const { playEnterLab, playSimStart } = await import('../core/sound');
    expect(() => playEnterLab()).not.toThrow();
    expect(() => playSimStart()).not.toThrow();
    expect(constructCalls).toBe(1); // nie próbuje ponownie po jednej porażce
  });

  it('is a no-op without throwing when window is undefined', async () => {
    const { playEnterLab } = await import('../core/sound');
    expect(() => playEnterLab()).not.toThrow();
  });
});
