/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../evidenceTypes.js';
import type { HttpTransport, Sleeper } from './netUtils.js';
import { withRetry, DEFAULT_RETRY, TokenBucket, parseRobots, stripHtml, extractTitle, originOf, pathOf } from './netUtils.js';
import type { AdapterResult } from './YouTubeOfficialApiAdapter.js';
/** Robots-aware, rate-limited, retry/backoff public-web reader. Identifies itself; never evades blocks. */
export class PublicWebAdapter {
  readonly platform = 'WEB' as const;
  private robotsCache = new Map<string, { disallowed(p: string): boolean }>();
  private bucket: TokenBucket;
  constructor(private clock: Clock, private transport: HttpTransport, private sleeper: Sleeper, private uaToken = 'GenesisResearchBot/0.1 (+contact: ops@genesis.local)', perMin = 30) { this.bucket = new TokenBucket(clock, perMin); }
  async ingest(url: string): Promise<AdapterResult> {
    if (!this.bucket.tryTake()) return { ok: false, error: 'RATE_LIMITED', items: [] };
    const origin = 'https://' + originOf(url);
    let robots = this.robotsCache.get(originOf(url));
    if (!robots) {
      try { const r = await withRetry(() => this.transport.fetch(origin + '/robots.txt'), { attempts: 2, baseMs: 200, maxMs: 1000 }, this.sleeper); robots = parseRobots(r.status === 200 ? r.body : '', this.uaToken); }
      catch { robots = parseRobots('', this.uaToken); }
      this.robotsCache.set(originOf(url), robots);
    }
    if (robots.disallowed(pathOf(url))) return { ok: false, error: 'ROBOTS_DISALLOWED', items: [] };
    let res;
    try { res = await withRetry(() => this.transport.fetch(url, { headers: { 'User-Agent': this.uaToken } }), DEFAULT_RETRY, this.sleeper); }
    catch { return { ok: false, error: 'NETWORK', items: [] }; }
    if (res.status !== 200) return { ok: false, error: 'NETWORK', items: [] };
    const title = extractTitle(res.body);
    const text = stripHtml(res.body).slice(0, 400);
    const claim = title || text.slice(0, 120);
    if (!claim) return { ok: false, error: 'PARSE', items: [] };
    return { ok: true, items: [{ sourceUrl: url, sourceTimestamp: null, claim, claimType: 'reported_claim', confidence: 0.5, provenance: { sourceKind: 'web', retrievedBy: 'public-web-robots-aware', independentSourceIds: [] } }] };
  }
}
