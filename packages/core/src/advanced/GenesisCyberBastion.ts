import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const hmacSha256hex = (key: Uint8Array, msg: string): string => createHmac('sha256', Buffer.from(key)).update(msg, 'utf8').digest('hex');
/** Constant-time compare to resist timing attacks. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
export function secureZero(buf: Uint8Array): void { buf.fill(0); }

export interface Clock { now(): number; }
export interface SessionToken { readonly sessionId: string; readonly issuedAt: number; readonly expiresAt: number; readonly hmac: string; }
export interface AuditEntry { readonly index: number; readonly type: 'WRITE' | 'LOCKDOWN' | 'SANITIZE'; readonly sessionId: string; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; readonly at: number; }
export interface WriteResult { ok: boolean; code?: 'LOCKED' | 'BAD_SIGNATURE' | 'RATE_LIMITED' | 'EXPIRED'; entryIndex?: number; }
export interface RateLimitConfig { maxOps: number; windowMs: number; }

export class GenesisCyberBastion {
  private sessionKey: Uint8Array;
  private audit: AuditEntry[] = [];
  private locked = false;
  private buckets = new Map<string, { count: number; windowStart: number }>();
  constructor(private clock: Clock, sessionKeyText: string, private rateLimit: RateLimitConfig = { maxOps: 3, windowMs: 1000 }) {
    this.sessionKey = new TextEncoder().encode(sessionKeyText);
  }
  issueToken(sessionId: string, ttlMs = 60_000): SessionToken {
    const issuedAt = this.clock.now(); const expiresAt = issuedAt + ttlMs;
    return { sessionId, issuedAt, expiresAt, hmac: hmacSha256hex(this.sessionKey, stableStringify({ sessionId, issuedAt, expiresAt })) };
  }
  verifyToken(t: SessionToken): boolean {
    const expected = hmacSha256hex(this.sessionKey, stableStringify({ sessionId: t.sessionId, issuedAt: t.issuedAt, expiresAt: t.expiresAt }));
    return constantTimeEqual(expected, t.hmac);
  }
  private chainHash(index: number, type: AuditEntry['type'], sessionId: string, payloadHash: string, prevHash: string, at: number): string {
    return sha256hex(stableStringify({ index, type, sessionId, payloadHash, prevHash, at }));
  }
  private append(type: AuditEntry['type'], sessionId: string, payloadHash: string): AuditEntry {
    const prev = this.audit.length ? this.audit[this.audit.length - 1].hash : 'GENESIS';
    const at = this.clock.now();
    const entry: AuditEntry = { index: this.audit.length, type, sessionId, payloadHash, prevHash: prev, hash: this.chainHash(this.audit.length, type, sessionId, payloadHash, prev, at), at };
    this.audit.push(Object.freeze(entry));
    return entry;
  }
  write(token: SessionToken, payload: unknown): WriteResult {
    if (this.locked) return { ok: false, code: 'LOCKED' };
    if (!this.verifyToken(token)) return { ok: false, code: 'BAD_SIGNATURE' };
    if (this.clock.now() > token.expiresAt) return { ok: false, code: 'EXPIRED' };
    const now = this.clock.now();
    const b = this.buckets.get(token.sessionId) ?? { count: 0, windowStart: now };
    if (now - b.windowStart >= this.rateLimit.windowMs) { b.count = 0; b.windowStart = now; }
    b.count += 1; this.buckets.set(token.sessionId, b);
    if (b.count > this.rateLimit.maxOps) return { ok: false, code: 'RATE_LIMITED' };
    const entry = this.append('WRITE', token.sessionId, sha256hex(stableStringify(payload)));
    return { ok: true, entryIndex: entry.index };
  }
  /** Verify the immutable chain; on mismatch trigger air-gapped lockdown. */
  verifyChain(): boolean {
    let prev = 'GENESIS';
    for (const e of this.audit) {
      if (e.prevHash !== prev) { this.triggerLockdown('CHAIN_PREV_MISMATCH@' + e.index); return false; }
      if (e.hash !== this.chainHash(e.index, e.type, e.sessionId, e.payloadHash, e.prevHash, e.at)) { this.triggerLockdown('CHAIN_HASH_MISMATCH@' + e.index); return false; }
      prev = e.hash;
    }
    return true;
  }
  /** External tamper probe: if stored hash != expected, lockdown immediately. */
  detectTamper(index: number, expectedHash: string): boolean {
    const e = this.audit[index]; if (!e) return false;
    if (!constantTimeEqual(e.hash, expectedHash)) { this.triggerLockdown('EXTERNAL_TAMPER@' + index); return true; }
    return false;
  }
  triggerLockdown(reason: string): void { this.locked = true; this.append('LOCKDOWN', 'SYSTEM', sha256hex(reason)); }
  sanitize(): void { secureZero(this.sessionKey); this.buckets.clear(); this.append('SANITIZE', 'SYSTEM', sha256hex('sanitize')); }
  getSessionKeyBuffer(): Uint8Array { return this.sessionKey; }
  getAuditTrail(): readonly AuditEntry[] { return [...this.audit]; }
  isLocked(): boolean { return this.locked; }
}
