/* Proprietary / All Rights Reserved - Genesis OS */
import type { FetchedItem } from '../ProposeOnlyLearner.js';
import type { Clock } from '../evidenceTypes.js';
import type { HttpTransport, Sleeper } from './netUtils.js';
import { withRetry, DEFAULT_RETRY, HttpError } from './netUtils.js';
export type AdapterError = 'REQUIRES_OFFICIAL_API' | 'LEGAL_GATE_PENDING' | 'ROBOTS_DISALLOWED' | 'RATE_LIMITED' | 'NETWORK' | 'PARSE';
export interface AdapterResult { readonly ok: boolean; readonly error?: AdapterError; readonly items: readonly FetchedItem[]; readonly note?: string; }
export interface KeyProvider { getKey(): string | null; }
/** ONLY official YouTube Data API. No scraping, no caption download until legal gate flips to VERIFIED. */
export class YouTubeOfficialApiAdapter {
  readonly platform = 'YOUTUBE' as const;
  constructor(private clock: Clock, private transport: HttpTransport, private sleeper: Sleeper, private keys: KeyProvider) {}
  static videoId(url: string): string | null { const m = /[?&]v=([\w-]{6,})/.exec(url) ?? /youtu\.be\/([\w-]{6,})/.exec(url); return m ? m[1] : null; }
  async ingest(url: string): Promise<AdapterResult> {
    const key = this.keys.getKey();
    if (!key) return { ok: false, error: 'REQUIRES_OFFICIAL_API', items: [], note: 'Wstrzyknij klucz YouTube Data API przez KeyProvider; scraping niedostępny.' };
    const id = YouTubeOfficialApiAdapter.videoId(url);
    if (!id) return { ok: false, error: 'PARSE', items: [] };
    let body: string;
    try {
      body = (await withRetry(() => this.transport.fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' + encodeURIComponent(id) + '&key=' + encodeURIComponent(key)), DEFAULT_RETRY, this.sleeper)).body;
    } catch (e) { return { ok: false, error: e instanceof HttpError && e.status === 404 ? 'PARSE' : 'NETWORK', items: [] }; }
    let parsed: { items?: { id?: string; snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string } }[] };
    try { parsed = JSON.parse(body) as typeof parsed; } catch { return { ok: false, error: 'PARSE', items: [] }; }
    const sn = parsed.items?.[0]?.snippet;
    if (!sn?.title) return { ok: false, error: 'PARSE', items: [] };
    const items: FetchedItem[] = [{ sourceUrl: url, sourceTimestamp: sn.publishedAt ?? null, claim: sn.title, claimType: 'reported_claim', confidence: 0.4, provenance: { sourceKind: 'video', author: sn.channelTitle, retrievedBy: 'youtube-official-api', independentSourceIds: [] } }];
    if (sn.description && sn.description.trim().length > 0) items.push({ sourceUrl: url, sourceTimestamp: sn.publishedAt ?? null, claim: sn.description.trim().slice(0, 300), claimType: 'reported_claim', confidence: 0.35, provenance: { sourceKind: 'video', author: sn.channelTitle, retrievedBy: 'youtube-official-api', independentSourceIds: [] } });
    return { ok: true, items, note: 'CAPTIONS_DISABLED_PENDING_LEGAL_REVIEW' };
  }
}
