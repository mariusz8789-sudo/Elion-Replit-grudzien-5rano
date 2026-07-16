/**
 * aiChat (V6) — conversation persistence, ordering, title derivation, and the
 * honest ask transport (mocked fetch; 503 → unavailable, never fabricated).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('aiChat persistence + helpers', () => {
  it('round-trips conversations through localStorage', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/aiChat');
    const c = m.createConversation('Test');
    m.saveConversations([c]);
    const back = m.loadConversations();
    expect(back.length).toBe(1);
    expect(back[0].id).toBe(c.id);
  });
  it('sorts pinned first, then most recent', async () => {
    const m = await import('../core/aiChat');
    const a = { id: 'a', title: '', messages: [], pinned: false, createdAt: 1, updatedAt: 10 };
    const b = { id: 'b', title: '', messages: [], pinned: true, createdAt: 1, updatedAt: 1 };
    const c = { id: 'c', title: '', messages: [], pinned: false, createdAt: 1, updatedAt: 20 };
    expect(m.sortConversations([a, b, c]).map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('derives a short title and truncates long ones', async () => {
    const m = await import('../core/aiChat');
    expect(m.deriveTitle('  hello   world ')).toBe('hello world');
    expect(m.deriveTitle('x'.repeat(60)).endsWith('…')).toBe(true);
    expect(m.deriveTitle('')).toBe('Nowa rozmowa');
  });
  it('ignores malformed persisted data', async () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    const m = await import('../core/aiChat');
    (window.localStorage as Storage).setItem('genesis-os:ai-chat/v1', '{"not":"array"}');
    expect(m.loadConversations()).toEqual([]);
  });
});

describe('askDiscovery — honest transport', () => {
  it('returns the real answer on 200', async () => {
    const m = await import('../core/aiChat');
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve({ answer: 'hello' }) });
    const r = await m.askDiscovery('q', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, answer: 'hello' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).question).toBe('q');
  });
  it('maps 503 to an explicit unavailable (never fabricated)', async () => {
    const m = await import('../core/aiChat');
    const fetchImpl = vi.fn().mockResolvedValue({ status: 503, ok: false, json: () => Promise.resolve({ message: 'no key' }) });
    const r = await m.askDiscovery('q', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.kind).toBe('unavailable'); expect(r.message).toBe('no key'); }
  });
  it('maps a network throw to offline', async () => {
    const m = await import('../core/aiChat');
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'));
    const r = await m.askDiscovery('q', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('offline');
  });
});
