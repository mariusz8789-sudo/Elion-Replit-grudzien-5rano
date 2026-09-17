import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const hmacHex = (key: Uint8Array, msg: string): string => createHmac('sha256', Buffer.from(key)).update(msg, 'utf8').digest('hex');
export const ctEqual = (a: string, b: string): boolean => { const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex'); if (ba.length !== bb.length) return false; return timingSafeEqual(ba, bb); };
export const secureZero = (b: Uint8Array): void => { b.fill(0); };
export const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

export type InstanceType = 'Municipal' | 'Defense' | 'Insurance';
export type Tier = 'ANALYTIC' | 'OPERATIONAL' | 'COMMAND';
export interface TierPolicy { readonly maxOpsPerWindow: number; readonly windowMs: number; readonly priceMonthlyEur: number; }
export const TIER_POLICIES: Record<Tier, TierPolicy> = {
  ANALYTIC: { maxOpsPerWindow: 500, windowMs: 60_000, priceMonthlyEur: 3900 },
  OPERATIONAL: { maxOpsPerWindow: 5000, windowMs: 60_000, priceMonthlyEur: 14900 },
  COMMAND: { maxOpsPerWindow: 50_000, windowMs: 60_000, priceMonthlyEur: 49900 },
};
export interface Clock { now(): number; }
export interface DeploymentKey { readonly keyId: string; readonly instanceType: InstanceType; readonly tier: Tier; readonly seats: number; readonly issuedAt: number; readonly expiresAt: number; readonly hmac: string; }
export interface AuditEntry { readonly index: number; readonly keyId: string; readonly op: string; readonly at: number; readonly prevHash: string; readonly hash: string; }
export interface ConsumeResult { ok: boolean; code?: 'BAD_KEY' | 'EXPIRED' | 'SEAT_LIMIT' | 'RATE_LIMITED'; }

export class GenesisCityMonetizer {
  private key: Uint8Array; private seats = new Map<string, Set<string>>(); private buckets = new Map<string, { count: number; start: number }>();
  private audit: AuditEntry[] = [];
  constructor(private clock: Clock, secret: string) { this.key = new TextEncoder().encode(secret); }
  issueDeploymentKey(instanceType: InstanceType, tier: Tier, seats: number, ttlMs: number): DeploymentKey {
    const issuedAt = this.clock.now(); const expiresAt = issuedAt + ttlMs; const keyId = 'DEP-' + fnv(instanceType + tier + issuedAt);
    return { keyId, instanceType, tier, seats, issuedAt, expiresAt, hmac: hmacHex(this.key, stableStringify({ keyId, instanceType, tier, seats, issuedAt, expiresAt })) };
  }
  verifyKey(k: DeploymentKey): boolean { const e = hmacHex(this.key, stableStringify({ keyId: k.keyId, instanceType: k.instanceType, tier: k.tier, seats: k.seats, issuedAt: k.issuedAt, expiresAt: k.expiresAt })); return ctEqual(e, k.hmac); }
  activateSeat(k: DeploymentKey, seatId: string): ConsumeResult {
    if (!this.verifyKey(k)) return { ok: false, code: 'BAD_KEY' };
    if (this.clock.now() > k.expiresAt) return { ok: false, code: 'EXPIRED' };
    const set = this.seats.get(k.keyId) ?? new Set<string>();
    if (!set.has(seatId) && set.size >= k.seats) return { ok: false, code: 'SEAT_LIMIT' };
    set.add(seatId); this.seats.set(k.keyId, set); this.record(k.keyId, 'seat:' + seatId); return { ok: true };
  }
  consume(k: DeploymentKey, op: string): ConsumeResult {
    if (!this.verifyKey(k)) return { ok: false, code: 'BAD_KEY' };
    if (this.clock.now() > k.expiresAt) return { ok: false, code: 'EXPIRED' };
    const pol = TIER_POLICIES[k.tier]; const now = this.clock.now();
    const b = this.buckets.get(k.keyId) ?? { count: 0, start: now };
    if (now - b.start >= pol.windowMs) { b.count = 0; b.start = now; }
    b.count += 1; this.buckets.set(k.keyId, b);
    if (b.count > pol.maxOpsPerWindow) return { ok: false, code: 'RATE_LIMITED' };
    this.record(k.keyId, op); return { ok: true };
  }
  private record(keyId: string, op: string): void {
    const prev = this.audit.length ? this.audit[this.audit.length - 1].hash : 'GENESIS';
    const at = this.clock.now(); const index = this.audit.length;
    const hash = sha256hex(stableStringify({ index, keyId, op, at, prevHash: prev }));
    this.audit.push(Object.freeze({ index, keyId, op, at, prevHash: prev, hash }));
  }
  verifyAuditChain(): boolean { let prev = 'GENESIS'; for (const e of this.audit) { if (e.prevHash !== prev) return false; if (e.hash !== sha256hex(stableStringify({ index: e.index, keyId: e.keyId, op: e.op, at: e.at, prevHash: e.prevHash }))) return false; prev = e.hash; } return true; }
  getAudit(): readonly AuditEntry[] { return this.audit; }
  sanitize(): void { secureZero(this.key); this.buckets.clear(); }
}
