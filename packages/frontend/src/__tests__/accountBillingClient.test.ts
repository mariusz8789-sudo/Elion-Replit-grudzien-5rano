import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAccountBilling, regenerateApiKey, startCheckout } from '../core/backend/client';

/**
 * Stage 2 billing-dashboard client — mocked-fetch HTTP contract for the three new
 * account/billing calls: read plan+usage+key, regenerate key, start checkout.
 */
function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}
afterEach(() => vi.unstubAllGlobals());

describe('fetchAccountBilling', () => {
  it('GETs /account/billing with the token and returns the view', async () => {
    const view = { email: 'a@b.io', plan: { tier: 'pro', status: 'active', renewalState: 'RENEWING' }, apiKey: { key: 'gk_x', tier: 'pro', usageCount: 3, monthlyLimit: 100000, remaining: 99997, resetDate: 1 }, stripeConfigured: true, availableTiers: ['free', 'starter', 'pro'] };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, view));
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchAccountBilling('tok');
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.plan.tier).toBe('pro'); expect(r.data.apiKey?.remaining).toBe(99997); }
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/billing');
    expect(init.method).toBe('GET');
    expect(init.headers.authorization).toBe('Bearer tok');
  });
  it('maps 401 to a typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(401, { error: 'unauthorized' })));
    expect((await fetchAccountBilling('')).ok).toBe(false);
  });
});

describe('regenerateApiKey', () => {
  it('POSTs regenerate and unwraps the new key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { apiKey: { key: 'gk_new', tier: 'free', usageCount: 0, monthlyLimit: 100, remaining: 100, resetDate: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await regenerateApiKey('tok');
    expect(r.ok && r.data.key).toBe('gk_new');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/account/api-key/regenerate');
    expect(init.method).toBe('POST');
  });
});

describe('startCheckout', () => {
  it('POSTs /billing/checkout with the tier and returns the url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { url: 'https://pay', sessionId: 'cs_1', tier: 'pro' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await startCheckout('tok', 'pro');
    expect(r.ok && r.data.url).toBe('https://pay');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/billing/checkout');
    expect(JSON.parse(init.body).tier).toBe('pro');
  });
  it('maps a 503 (billing not configured) to an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(503, { error: 'billing_not_configured' })));
    expect((await startCheckout('tok', 'starter')).ok).toBe(false);
  });
});
