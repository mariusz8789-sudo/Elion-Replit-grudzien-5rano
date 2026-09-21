import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export const hmacHex = (key: Uint8Array, msg: string): string => createHmac('sha256', Buffer.from(key)).update(msg, 'utf8').digest('hex');
export const ctEqual = (a: string, b: string): boolean => { const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex'); if (ba.length !== bb.length) return false; return timingSafeEqual(ba, bb); };
export const fnv = (s: string): number => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };

export type AccessLevel = 'PUBLIC' | 'RESEARCH' | 'CLASSIFIED';
export type InquiryLabel = 'CLASSIFIED_SCENARIO' | 'SPECULATIVE_HYPOTHESIS';
export interface Clock { now(): number; }
export interface SessionToken { readonly sessionId: string; readonly level: AccessLevel; readonly issuedAt: number; readonly expiresAt: number; readonly hmac: string; }
export interface TokenVerifier { issue(level: AccessLevel, ttlMs: number): SessionToken; verify(t: SessionToken): boolean; }
export interface InquiryResult { readonly inquiryId: string; readonly question: string; readonly level: AccessLevel; readonly scenario: { premises: readonly string[]; implications: readonly string[]; modelConfidence: number }; readonly dataLabel: InquiryLabel; readonly seed: number; readonly simulationTime: number; }

/** Default HMAC token verifier; swap for Cyber Bastion by injecting a TokenVerifier. */
export class HmacTokenVerifier implements TokenVerifier {
  private key: Uint8Array;
  constructor(clock: Clock, secret: string) { this.clock = clock; this.key = new TextEncoder().encode(secret); }
  private clock: Clock;
  issue(level: AccessLevel, ttlMs: number): SessionToken {
    const issuedAt = this.clock.now(); const expiresAt = issuedAt + ttlMs; const sessionId = 'SES-' + fnv(level + issuedAt);
    return { sessionId, level, issuedAt, expiresAt, hmac: hmacHex(this.key, stableStringify({ sessionId, level, issuedAt, expiresAt })) };
  }
  verify(t: SessionToken): boolean {
    const expected = hmacHex(this.key, stableStringify({ sessionId: t.sessionId, level: t.level, issuedAt: t.issuedAt, expiresAt: t.expiresAt }));
    return ctEqual(expected, t.hmac) && this.clock.now() <= t.expiresAt;
  }
}
const LEVEL_RANK: Record<AccessLevel, number> = { PUBLIC: 0, RESEARCH: 1, CLASSIFIED: 2 };
const FRINGE_TOPICS = ['fermi', 'anomal', 'non-human', 'nonhuman', 'extraterrestrial', 'technosignature', 'uap'] as const;

export class ClassifiedInquiryEngine {
  constructor(private clock: Clock, private verifier: TokenVerifier, private advancedMinLevel: AccessLevel = 'RESEARCH') {}
  /** Never censors topics; gates by access level and labels outputs as scenario/speculative. */
  inquire(token: SessionToken, question: string): { ok: boolean; code?: 'BAD_TOKEN' | 'ACCESS_DENIED'; result?: InquiryResult } {
    if (!this.verifier.verify(token)) return { ok: false, code: 'BAD_TOKEN' };
    const q = question.toLowerCase();
    const isFringe = FRINGE_TOPICS.some(t => q.includes(t));
    if (isFringe && LEVEL_RANK[token.level] < LEVEL_RANK[this.advancedMinLevel]) return { ok: false, code: 'ACCESS_DENIED' };
    const seed = fnv(question);
    const premises = [ 'premise:signal-anomaly-model', 'premise:observer-bias-control', 'premise:null-hypothesis-included' ];
    const implications = [ 'implication:testable-prediction', 'implication:falsification-criterion', 'implication:alternative-explanations' ];
    const modelConfidence = +((seed % 1000) / 1000 * 0.5 + 0.2).toFixed(3);
    const label: InquiryLabel = token.level === 'CLASSIFIED' ? 'CLASSIFIED_SCENARIO' : 'SPECULATIVE_HYPOTHESIS';
    return { ok: true, result: { inquiryId: 'INQ-' + seed, question, level: token.level, scenario: { premises, implications, modelConfidence }, dataLabel: label, seed, simulationTime: this.clock.now() } };
  }
}
