import { createHash } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

export interface Clock { now(): number; }
export interface FetchResult { text: string; source: string; }
export type FetchAdapter = (url: string) => Promise<FetchResult>;
export type GapStatus = 'UNVERIFIED_GAP' | 'FALSIFIED' | 'VALIDATED_GAP';
export interface GapRecord {
  readonly gapId: string; readonly sourceUrl: string; readonly excerpt: string; readonly category: string;
  readonly severity: number; readonly sha256: string; status: GapStatus; readonly retrievedAt: number;
  readonly seed: number; dataLabel: 'UNVERIFIED_GAP' | 'BLOCKED' | 'MODEL_ESTIMATE';
}
export interface GapMatrixEntry { readonly category: string; count: number; maxSeverity: number; gapIds: string[]; }

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has', 'not', 'but', 'its', 'into', 'about']);
const GAP_KEYWORDS = ['lack', 'missing', 'wish', 'problem', 'bug', 'gap', 'need', 'fail', 'slow', 'expensive'] as const;

export function normalizeText(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}
export function extractGaps(text: string, sourceUrl: string, retrievedAt: number, seed: number): GapRecord[] {
  const out: GapRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim(); if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const keyword = GAP_KEYWORDS.find(k => lower.includes(k)); if (!keyword) continue;
    const tokens = normalizeText(trimmed);
    const severity = +Math.min(1, tokens.length / 20).toFixed(3);
    const gapId = 'GAP-' + sha256hex(trimmed + '|' + sourceUrl).slice(0, 12);
    const seal = sha256hex(stableStringify({ excerpt: trimmed, category: keyword, severity, sourceUrl }));
    out.push({ gapId, sourceUrl, excerpt: trimmed, category: keyword, severity, sha256: seal, status: 'UNVERIFIED_GAP', retrievedAt, seed, dataLabel: 'UNVERIFIED_GAP' });
  }
  return out;
}
export interface HarvesterDeps { fetchAdapter: FetchAdapter; clock: Clock; }
export class MarketGapHarvester {
  private gaps = new Map<string, GapRecord>();
  private ledger: GapRecord[] = [];
  constructor(private deps: HarvesterDeps) {}
  async harvestOnce(sources: { url: string }[], seed: number): Promise<GapRecord[]> {
    const out: GapRecord[] = [];
    for (const s of sources) {
      let res: FetchResult; try { res = await this.deps.fetchAdapter(s.url); } catch { continue; }
      const recs = extractGaps(res.text, s.url, this.deps.clock.now(), seed);
      for (const r of recs) { this.gaps.set(r.gapId, r); this.ledger.push(r); out.push(r); }
    }
    return out;
  }
  getGapMatrix(): GapMatrixEntry[] {
    const by = new Map<string, GapMatrixEntry & { _m: number }>();
    for (const g of this.gaps.values()) {
      const e = by.get(g.category) ?? { category: g.category, count: 0, maxSeverity: 0, gapIds: [], _m: 0 };
      e.count += 1; e.maxSeverity = Math.max(e.maxSeverity, g.severity); e.gapIds.push(g.gapId); by.set(g.category, e);
    }
    return [...by.values()].map(({ _m, ...rest }) => rest);
  }
  falsify(gapId: string, passed: boolean): void {
    const g = this.gaps.get(gapId); if (!g) return;
    g.status = passed ? 'VALIDATED_GAP' : 'FALSIFIED';
    g.dataLabel = passed ? 'MODEL_ESTIMATE' : 'BLOCKED';
  }
  /** Gap data can NEVER be treated as clinical evidence while unverified. */
  assertNotClinical(gapId: string): void { const g = this.gaps.get(gapId); if (!g || g.status === 'UNVERIFIED_GAP') throw new Error('UNVERIFIED_GAP_CANNOT_FEED_CLINICAL:' + gapId); }
  getLedger(): readonly GapRecord[] { return this.ledger; }
}
