/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../evidenceTypes.js';
import type { FetchedItem } from '../ProposeOnlyLearner.js';
import { stableStringify, sha256hex } from '../EvidenceLedger.js';
import { SourcePolicyRegistry } from './SourcePolicyRegistry.js';
import { originOf } from './netUtils.js';
import type { AdapterResult } from './YouTubeOfficialApiAdapter.js';
export type PlatformId = 'YOUTUBE' | 'FACEBOOK' | 'X' | 'TELEGRAM' | 'WEB';
export interface SkippedUrl { readonly url: string; readonly reason: string; }
export interface IngestionReport { readonly fetched: readonly FetchedItem[]; readonly skipped: readonly SkippedUrl[]; readonly batchFingerprint: string; readonly at: number; }
export interface IngestionAdapter { ingest(url: string): Promise<AdapterResult>; }
/** Orkiestrator: detekcja platformy → bramka polityki → adapter → FetchedItem dla ProposeOnlyLearner. */
export class OmniIngestionController {
  constructor(private clock: Clock, private registry: SourcePolicyRegistry, private adapters: Readonly<Partial<Record<PlatformId, IngestionAdapter>>>) {}
  static detectPlatform(url: string): PlatformId {
    const o = originOf(url);
    if (/youtube\.com|youtu\.be/.test(o)) return 'YOUTUBE';
    if (/facebook\.com/.test(o)) return 'FACEBOOK';
    if (/(x|twitter)\.com/.test(o)) return 'X';
    if (/t\.me|telegram\.(org|me)/.test(o)) return 'TELEGRAM';
    return 'WEB';
  }
  async ingest(urls: readonly string[]): Promise<IngestionReport> {
    const fetched: FetchedItem[] = [];
    const skipped: SkippedUrl[] = [];
    for (const url of urls) {
      const platform = OmniIngestionController.detectPlatform(url);
      const policy = this.registry.get(originOf(url));
      if (platform === 'WEB' && policy && policy.legalStatus === 'PENDING') { skipped.push({ url, reason: 'LEGAL_GATE_PENDING' }); continue; }
      const adapter = this.adapters[platform];
      if (!adapter) { skipped.push({ url, reason: 'NO_ADAPTER' }); continue; }
      const res = await adapter.ingest(url);
      if (!res.ok) { skipped.push({ url, reason: res.error ?? 'UNKNOWN' }); continue; }
      for (const it of res.items) fetched.push(it);
    }
    return { fetched, skipped, batchFingerprint: sha256hex(stableStringify({ urls, fetched })), at: this.clock.now() };
  }
}
