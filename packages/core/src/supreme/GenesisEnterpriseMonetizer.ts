import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const hmacHex = (key: Uint8Array, msg: string): string => createHmac('sha256', Buffer.from(key)).update(msg, 'utf8').digest('hex');
export const ctEqual = (a: string, b: string): boolean => { const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex'); if (ba.length !== bb.length) return false; return timingSafeEqual(ba, bb); };
export const secureZero = (b: Uint8Array): void => { b.fill(0); };
export const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

export type Tier = 'ACADEMIC' | 'RESEARCH' | 'ENTERPRISE' | 'B2G';
export interface TierPolicy { readonly maxOpsPerWindow: number; readonly windowMs: number; readonly maxInstances: number; readonly priceMonthlyEur: number; }
export const TIER_POLICIES: Record<Tier, TierPolicy> = {
  ACADEMIC: { maxOpsPerWindow: 100, windowMs: 60_000, maxInstances: 2, priceMonthlyEur: 490 },
  RESEARCH: { maxOpsPerWindow: 1000, windowMs: 60_000, maxInstances: 8, priceMonthlyEur: 4900 },
  ENTERPRISE: { maxOpsPerWindow: 10_000, windowMs: 60_000, maxInstances: 32, priceMonthlyEur: 24900 },
  B2G: { maxOpsPerWindow: 50_000, windowMs: 60_000, maxInstances: 128, priceMonthlyEur: 49900 },
};
export interface Clock { now(): number; }
export interface LicenseKey { readonly licenseId: string; readonly tier: Tier; readonly issuedAt: number; readonly expiresAt: number; readonly maxInstances: number; readonly hmac: string; }
export interface TelemetryEntry { readonly index: number; readonly licenseId: string; readonly op: string; readonly at: number; readonly prevHash: string; readonly hash: string; }
export interface ConsumeResult { ok: boolean; code?: 'BAD_LICENSE' | 'EXPIRED' | 'INSTANCE_LIMIT' | 'RATE_LIMITED'; }

export class GenesisEnterpriseMonetizer {
  private key: Uint8Array; private instances = new Map<string, Set<string>>(); private buckets = new Map<string, { count: number; start: number }>();
  private telemetry: TelemetryEntry[] = []; private locked = false;
  constructor(private clock: Clock, secret: string) { this.key = new TextEncoder().encode(secret); }
  issueLicense(tier: Tier, ttlMs: number): LicenseKey {
    const issuedAt = this.clock.now(); const expiresAt = issuedAt + ttlMs; const licenseId = 'LIC-' + fnv(tier + issuedAt);
    return { licenseId, tier, issuedAt, expiresAt, maxInstances: TIER_POLICIES[tier].maxInstances, hmac: hmacHex(this.key, stableStringify({ licenseId, tier, issuedAt, expiresAt })) };
  }
  verifyLicense(l: LicenseKey): boolean { const e = hmacHex(this.key, stableStringify({ licenseId: l.licenseId, tier: l.tier, issuedAt: l.issuedAt, expiresAt: l.expiresAt })); return ctEqual(e, l.hmac); }
  activateInstance(l: LicenseKey, instanceId: string): ConsumeResult {
    if (!this.verifyLicense(l)) return { ok: false, code: 'BAD_LICENSE' };
    if (this.clock.now() > l.expiresAt) return { ok: false, code: 'EXPIRED' };
    const set = this.instances.get(l.licenseId) ?? new Set<string>();
    if (!set.has(instanceId) && set.size >= l.maxInstances) return { ok: false, code: 'INSTANCE_LIMIT' };
    set.add(instanceId); this.instances.set(l.licenseId, set); this.record(l.licenseId, 'activate:' + instanceId); return { ok: true };
  }
  consume(l: LicenseKey, op: string): ConsumeResult {
    if (!this.verifyLicense(l)) return { ok: false, code: 'BAD_LICENSE' };
    if (this.clock.now() > l.expiresAt) return { ok: false, code: 'EXPIRED' };
    const pol = TIER_POLICIES[l.tier]; const now = this.clock.now();
    const b = this.buckets.get(l.licenseId) ?? { count: 0, start: now };
    if (now - b.start >= pol.windowMs) { b.count = 0; b.start = now; }
    b.count += 1; this.buckets.set(l.licenseId, b);
    if (b.count > pol.maxOpsPerWindow) return { ok: false, code: 'RATE_LIMITED' };
    this.record(l.licenseId, op); return { ok: true };
  }
  private record(licenseId: string, op: string): void {
    const prev = this.telemetry.length ? this.telemetry[this.telemetry.length - 1].hash : 'GENESIS';
    const at = this.clock.now(); const index = this.telemetry.length;
    const hash = sha256hex(stableStringify({ index, licenseId, op, at, prevHash: prev }));
    this.telemetry.push(Object.freeze({ index, licenseId, op, at, prevHash: prev, hash }));
  }
  verifyTelemetryChain(): boolean { let prev = 'GENESIS'; for (const e of this.telemetry) { if (e.prevHash !== prev) return false; if (e.hash !== sha256hex(stableStringify({ index: e.index, licenseId: e.licenseId, op: e.op, at: e.at, prevHash: e.prevHash }))) return false; prev = e.hash; } return true; }
  getTelemetry(): readonly TelemetryEntry[] { return this.telemetry; }
  sanitize(): void { secureZero(this.key); this.buckets.clear(); }
  isLocked(): boolean { return this.locked; }
}
