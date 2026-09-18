/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OmniIngestionController } from './OmniIngestionController.js';
import { SourcePolicyRegistry } from './SourcePolicyRegistry.js';
import { YouTubeOfficialApiAdapter } from './YouTubeOfficialApiAdapter.js';
import { PublicWebAdapter } from './PublicWebAdapter.js';
import { SocialOfficialApiAdapter } from './SocialOfficialApiAdapter.js';
import { HttpError, type HttpTransport, type HttpResponse, type Sleeper } from './netUtils.js';
import { EvidenceLedger } from '../EvidenceLedger.js';
import { ProposeOnlyLearner } from '../ProposeOnlyLearner.js';
const clock = { t: 1000, now() { return this.t; } };
const makeSleeper = (): { delays: number[]; sleeper: Sleeper } => { const delays: number[] = []; return { delays, sleeper: { sleep: async (ms: number) => { delays.push(ms); } } }; };
class MockTransport implements HttpTransport {
  constructor(private routes: Map<string, () => HttpResponse>, private failTimes: Map<string, number> = new Map()) {}
  async fetch(url: string): Promise<HttpResponse> {
    const fails = this.failTimes.get(url) ?? 0;
    if (fails > 0) { this.failTimes.set(url, fails - 1); throw new HttpError(503); }
    const r = this.routes.get(url);
    if (!r) throw new HttpError(404);
    return r();
  }
}
const json = (body: unknown): HttpResponse => ({ status: 200, headers: {}, body: JSON.stringify(body) });
const YT_JSON = { items: [{ id: 'abc123', snippet: { title: 'Tytul wideo', description: 'Opis testowy', publishedAt: '2024-01-01T00:00:00Z', channelTitle: 'Chan' } }] };
const X_JSON = { data: [{ id: '1', text: 'Post testowy X', created_at: '2024-01-01T00:00:00.000Z' }] };
const WEB_HTML = '<html><head><title>Strona testowa</title></head><body><p>Tresc strony</p></body></html>';
const ROBOTS = 'User-agent: *\nDisallow: /private/\n';
const baseRoutes = (): Map<string, () => HttpResponse> => new Map([
  ['https://www.googleapis.com/youtube/v3/videos?part=snippet&id=abc123&key=KEY', () => json(YT_JSON)],
  ['https://api.x.com/2/tweets?ids=1&tweet.fields=created_at,text', () => json(X_JSON)],
  ['https://example.org/robots.txt', () => ({ status: 200, headers: {}, body: ROBOTS })],
  ['https://example.org/page', () => ({ status: 200, headers: {}, body: WEB_HTML })],
  ['https://example.org/private/secret', () => ({ status: 200, headers: {}, body: WEB_HTML })],
]);
const build = (keys: { yt: string | null; x: string | null }, routes = baseRoutes(), failTimes = new Map<string, number>()) => {
  const transport = new MockTransport(routes, failTimes);
  const { delays, sleeper } = makeSleeper();
  const yt = new YouTubeOfficialApiAdapter(clock, transport, sleeper, { getKey: () => keys.yt });
  const web = new PublicWebAdapter(clock, transport, sleeper, 'GenesisResearchBot/0.1', 30);
  const x = new SocialOfficialApiAdapter('X', clock, transport, sleeper, { getKey: () => keys.x });
  const ctrl = new OmniIngestionController(clock, new SourcePolicyRegistry(), { YOUTUBE: yt, WEB: web, X: x });
  return { ctrl, delays };
};
describe('OmniIngestionController', () => {
  it('YouTube bez klucza -> REQUIRES_OFFICIAL_API, zero itemow', async () => {
    const { ctrl } = build({ yt: null, x: null });
    const rep = await ctrl.ingest(['https://youtu.be/abc123']);
    expect(rep.fetched.length).toBe(0);
    expect(rep.skipped[0].reason).toBe('REQUIRES_OFFICIAL_API');
  });
  it('YouTube z kluczem -> itemy video, deterministyczny fingerprint', async () => {
    const a = await build({ yt: 'KEY', x: null }).ctrl.ingest(['https://youtu.be/abc123']);
    const b = await build({ yt: 'KEY', x: null }).ctrl.ingest(['https://youtu.be/abc123']);
    expect(a.fetched.length).toBe(2);
    expect(a.fetched[0].provenance.sourceKind).toBe('video');
    expect(a.fetched[0].claimType).toBe('reported_claim');
    expect(a.batchFingerprint).toBe(b.batchFingerprint);
  });
  it('WEB robots disallow -> ROBOTS_DISALLOWED', async () => {
    const { ctrl } = build({ yt: null, x: null });
    const rep = await ctrl.ingest(['https://example.org/private/secret']);
    expect(rep.skipped[0].reason).toBe('ROBOTS_DISALLOWED');
  });
  it('WEB allowed + retry/backoff: 2x503 potem 200, delays [250,500]', async () => {
    const fails = new Map([['https://example.org/page', 2]]);
    const { ctrl, delays } = build({ yt: null, x: null }, baseRoutes(), fails);
    const rep = await ctrl.ingest(['https://example.org/page']);
    expect(rep.fetched.length).toBe(1);
    expect(rep.fetched[0].provenance.sourceKind).toBe('web');
    expect(delays).toEqual([250, 500]);
  });
  it('X bez klucza -> REQUIRES_OFFICIAL_API; z kluczem -> item', async () => {
    const noKey = await build({ yt: null, x: null }).ctrl.ingest(['https://x.com/i/status/1']);
    expect(noKey.skipped[0].reason).toBe('REQUIRES_OFFICIAL_API');
    const withKey = await build({ yt: null, x: 'KEY' }).ctrl.ingest(['https://x.com/i/status/1']);
    expect(withKey.fetched.length).toBe(1);
    expect(withKey.fetched[0].claim).toBe('Post testowy X');
  });
  it('rate limit: drugi URL w tym samym ticku -> RATE_LIMITED', async () => {
    const transport = new MockTransport(baseRoutes());
    const { sleeper } = makeSleeper();
    const web = new PublicWebAdapter(clock, transport, sleeper, 'GenesisResearchBot/0.1', 1);
    const ctrl = new OmniIngestionController(clock, new SourcePolicyRegistry(), { WEB: web });
    const rep = await ctrl.ingest(['https://example.org/page', 'https://example.org/page']);
    expect(rep.fetched.length).toBe(1);
    expect(rep.skipped[0].reason).toBe('RATE_LIMITED');
  });
  it('ingested items reach the ledger ONLY as proposals; nothing is active until a human publishes', async () => {
    const rep = await build({ yt: 'KEY', x: null }).ctrl.ingest(['https://youtu.be/abc123']);
    const ledger = new EvidenceLedger(clock);
    const ids = new ProposeOnlyLearner(clock, ledger).runBatch({ sourceId: 'omni', fetch: () => rep.fetched });
    expect(ids.length).toBe(2);
    expect(ledger.getActive().length).toBe(0);
    const published = ledger.publish(ids[0], 'OWNER');
    expect(published?.status).not.toBe('verified');
    expect(ledger.getActive().length).toBe(1);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});
describe('iron rules', () => {
  for (const f of ['netUtils.ts', 'SourcePolicyRegistry.ts', 'OmniIngestionController.ts', 'YouTubeOfficialApiAdapter.ts', 'PublicWebAdapter.ts', 'SocialOfficialApiAdapter.ts']) {
    it(f + ' bez Math.random/Date.now/automatyzacji przegladarki', () => {
      const s = readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
      expect(s).not.toContain('Math.random(');
      expect(s).not.toContain('Date.now(');
      expect(s).not.toMatch(/playwright|puppeteer|headless/i);
    });
  }
});
