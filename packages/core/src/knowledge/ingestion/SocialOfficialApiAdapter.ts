/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../evidenceTypes.js';
import type { HttpTransport, Sleeper } from './netUtils.js';
import { withRetry, DEFAULT_RETRY } from './netUtils.js';
import type { AdapterResult, KeyProvider } from './YouTubeOfficialApiAdapter.js';
export type SocialPlatform = 'FACEBOOK' | 'X' | 'TELEGRAM';
/** OFFICIAL APIs only. Browser automation and anti-bot evasion are explicitly NOT implemented (ToS/legal). */
export class SocialOfficialApiAdapter {
  constructor(private platform: SocialPlatform, private clock: Clock, private transport: HttpTransport, private sleeper: Sleeper, private keys: KeyProvider) {}
  /** Numeric id after /posts/, /status/ or /statuses/; otherwise the last path segment (5+ chars). Never guesses. */
  static postId(url: string): string | null { const m = /(?:posts|status|statuses)\/(\d+)/.exec(url) ?? /\/([A-Za-z0-9_]{5,})\/?(?:\?|#|$)/.exec(url); return m ? m[1] : null; }
  async ingest(url: string): Promise<AdapterResult> {
    const key = this.keys.getKey();
    if (!key) return { ok: false, error: 'REQUIRES_OFFICIAL_API', items: [], note: 'Wymagany oficjalny klucz API platformy; brak automatyzacji przeglądarki.' };
    if (this.platform === 'TELEGRAM') return { ok: false, error: 'REQUIRES_OFFICIAL_API', items: [], note: 'Użyj oficjalnego eksportu kanału lub dostarcz treść ręcznie; brak publicznego API postów.' };
    const id = SocialOfficialApiAdapter.postId(url);
    if (!id) return { ok: false, error: 'PARSE', items: [] };
    const endpoint = this.platform === 'X'
      ? 'https://api.x.com/2/tweets?ids=' + encodeURIComponent(id) + '&tweet.fields=created_at,text'
      : 'https://graph.facebook.com/v19.0/' + encodeURIComponent(id) + '?fields=message,created_time,permalink_url&access_token=' + encodeURIComponent(key);
    let body: string;
    try { body = (await withRetry(() => this.transport.fetch(endpoint, this.platform === 'X' ? { headers: { Authorization: 'Bearer ' + key } } : undefined), DEFAULT_RETRY, this.sleeper)).body; }
    catch { return { ok: false, error: 'NETWORK', items: [] }; }
    let text: string | undefined; let createdAt: string | null;
    try {
      const j = JSON.parse(body) as { data?: { text?: string; created_at?: string }[]; message?: string; created_time?: string };
      if (this.platform === 'X') { text = j.data?.[0]?.text; createdAt = j.data?.[0]?.created_at ?? null; }
      else { text = j.message; createdAt = j.created_time ?? null; }
    } catch { return { ok: false, error: 'PARSE', items: [] }; }
    if (!text) return { ok: false, error: 'PARSE', items: [] };
    return { ok: true, items: [{ sourceUrl: url, sourceTimestamp: createdAt, claim: text.slice(0, 300), claimType: 'reported_claim', confidence: 0.4, provenance: { sourceKind: 'web', author: this.platform, retrievedBy: this.platform.toLowerCase() + '-official-api', independentSourceIds: [] } }] };
  }
}
