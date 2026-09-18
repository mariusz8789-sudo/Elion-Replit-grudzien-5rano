/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../evidenceTypes.js';
export interface HttpResponse { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: string; }
/** `method`/`body` are optional and additive: existing GET-only transports keep working unchanged; a transport that ignores them is still a valid implementation for GET callers. */
export interface HttpRequestOptions { readonly headers?: Readonly<Record<string, string>>; readonly method?: 'GET' | 'POST'; readonly body?: string; }
export interface HttpTransport { fetch(url: string, opts?: HttpRequestOptions): Promise<HttpResponse>; }
export interface Sleeper { sleep(ms: number): Promise<void>; }
export const realSleeper: Sleeper = { sleep: (ms) => new Promise(res => setTimeout(res, ms)) };
export class HttpError extends Error { constructor(readonly status: number) { super('HTTP_' + status); } }
export const isRetryable = (e: unknown): boolean => e instanceof HttpError && (e.status === 429 || e.status >= 500);
export interface RetryPolicy { readonly attempts: number; readonly baseMs: number; readonly maxMs: number; }
export const DEFAULT_RETRY: RetryPolicy = { attempts: 4, baseMs: 250, maxMs: 4000 };
/** Exponential backoff with injected Sleeper => deterministic, testable, no Date.now. */
export async function withRetry<T>(fn: () => Promise<T>, policy: RetryPolicy, sleeper: Sleeper, retryable: (e: unknown) => boolean = isRetryable): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < policy.attempts; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; if (!retryable(e) || i === policy.attempts - 1) break; await sleeper.sleep(Math.min(policy.maxMs, policy.baseMs * Math.pow(2, i))); }
  }
  throw lastErr;
}
/** Clock-driven token bucket rate limiter (no wall-clock). */
export class TokenBucket {
  private tokens: number; private last: number;
  constructor(private clock: Clock, private perMin: number) { this.tokens = perMin; this.last = clock.now(); }
  tryTake(): boolean {
    const now = this.clock.now();
    this.tokens = Math.min(this.perMin, this.tokens + ((now - this.last) / 60000) * this.perMin);
    this.last = now;
    if (this.tokens >= 1) { this.tokens -= 1; return true; }
    return false;
  }
}
export const originOf = (url: string): string => { const m = /^https?:\/\/([^/?#]+)/i.exec(url); return (m ? m[1] : '').toLowerCase().replace(/^www\./, ''); };
export const pathOf = (url: string): string => { const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(\?[^#]*)?/i.exec(url); return m ? (m[1] ?? '/') + (m[2] ?? '') : '/'; };
export function parseRobots(body: string, uaToken: string): { disallowed(path: string): boolean } {
  const rules: { allow: boolean; path: string }[] = [];
  let applies = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') applies = val === '*' || val.toLowerCase().includes(uaToken.toLowerCase());
    else if (applies && (key === 'disallow' || key === 'allow') && val) rules.push({ allow: key === 'allow', path: val });
  }
  return { disallowed: (path: string) => { let best: { allow: boolean; path: string } | null = null; for (const r of rules) if (path.startsWith(r.path) && (!best || r.path.length >= best.path.length)) best = r; return best ? !best.allow : false; } };
}
export const stripHtml = (html: string): string => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const extractTitle = (html: string): string => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); return m ? stripHtml(m[1]).slice(0, 200) : ''; };
