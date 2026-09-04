import { afterEach, describe, expect, it, vi } from 'vitest';
import { askAI, type AskContext } from '../narrator/askAI';

function makeContext(): AskContext {
  return {
    labId: 'quantum',
    lab: 'Quantum Lab',
    experiment: 'Tunelowanie',
    honesty: 'Dokładne wzory fizyczne',
    honestyNote: '',
    params: {},
    stats: {},
    narration: [],
  };
}

function fakeResponse(status: number, body: unknown, jsonThrows = false): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => (jsonThrows ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('askAI: HTTP response handling', () => {
  it('returns the answer on a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { answer: 'Odpowiedź' })));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result).toEqual({ ok: true, answer: 'Odpowiedź' });
  });

  it('treats a missing answer field as an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, {})));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result).toEqual({ ok: false, reason: 'error', message: 'Pusta odpowiedź serwisu AI.' });
  });

  it('surfaces the rate-limit message on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(429, {})));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('rate-limited');
  });

  it('on 503, relays the backend message verbatim — no env var names or server details, one source of truth', async () => {
    const backendMessage =
      'Funkcja „Zapytaj AI" nie jest skonfigurowana w tym wdrożeniu. Deterministyczny Narrator działa bez zmian, w pełni offline.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(503, { error: 'ai_unavailable', message: backendMessage })));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result).toEqual({ ok: false, reason: 'no-key', message: backendMessage });
    if (!result.ok) {
      expect(result.message).not.toMatch(/ANTHROPIC_API_KEY|env|\.env/i);
    }
  });

  it('on 503 with an unparseable body, falls back to a safe generic message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(503, null, true)));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('no-key');
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.message).not.toMatch(/ANTHROPIC_API_KEY/);
    }
  });

  it('on other non-ok statuses, returns a generic upstream error without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(502, {})));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result).toEqual({ ok: false, reason: 'error', message: 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' });
  });

  it('on a network failure, reports offline without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await askAI(makeContext(), 'Pytanie?');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('offline');
  });
});
