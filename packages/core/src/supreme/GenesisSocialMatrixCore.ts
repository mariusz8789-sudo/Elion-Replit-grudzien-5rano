import { createHash } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export type RoleZone = 'ACADEMIC' | 'MEDICAL' | 'RESEARCH';
export interface Member { readonly id: string; readonly zone: RoleZone; reputation: number; }
export interface SocialPost { readonly postId: string; readonly authorId: string; readonly zone: RoleZone; readonly content: string; readonly simFingerprint: string | null; readonly integrityHash: string; readonly at: number; }
export interface LedgerEntry { readonly index: number; readonly kind: 'POST' | 'VERIFY' | 'REJECT'; readonly at: number; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; }
/** Integrity hash (SHA-256) over author+content; NOT an authentication signature (no private keys). */
export const integrityHash = (authorKey: string, content: string): string => sha256hex(stableStringify({ authorKey, content }));
export class GenesisSocialMatrixCore {
  private members = new Map<string, Member>();
  private posts: SocialPost[] = [];
  private ledger: LedgerEntry[] = [];
  private seq = 0;
  constructor(private clock: Clock) {}
  register(id: string, zone: RoleZone): Member { const m: Member = { id, zone, reputation: 0 }; this.members.set(id, m); return m; }
  post(authorId: string, content: string, simFingerprint: string | null): SocialPost {
    const author = this.members.get(authorId); if (!author) throw new Error('UNKNOWN_MEMBER:' + authorId);
    const at = this.clock.now();
    const p: SocialPost = { postId: 'P-' + (this.seq++), authorId, zone: author.zone, content, simFingerprint, integrityHash: integrityHash(authorId, content), at };
    this.posts.push(p); this.append('POST', { postId: p.postId, integrityHash: p.integrityHash });
    return p;
  }
  /** Engine cross-check: a post claiming a simulation is confirmed only if fingerprints match. */
  verify(postId: string, engineFingerprint: string): { confirmed: boolean; reason?: 'NO_SIM_CLAIM' | 'FINGERPRINT_MISMATCH' } {
    const p = this.posts.find(x => x.postId === postId); if (!p) return { confirmed: false, reason: 'NO_SIM_CLAIM' };
    if (p.simFingerprint === null) return { confirmed: false, reason: 'NO_SIM_CLAIM' };
    const ok = p.simFingerprint === engineFingerprint;
    const m = this.members.get(p.authorId)!; m.reputation += ok ? 1 : -1;
    this.append(ok ? 'VERIFY' : 'REJECT', { postId, ok });
    return ok ? { confirmed: true } : { confirmed: false, reason: 'FINGERPRINT_MISMATCH' };
  }
  reputation(id: string): number { return this.members.get(id)?.reputation ?? 0; }
  private append(kind: LedgerEntry['kind'], payload: unknown): void { const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS'; const at = this.clock.now(); const index = this.ledger.length; const payloadHash = sha256hex(stableStringify(payload)); const hash = sha256hex(stableStringify({ index, kind, at, payloadHash, prevHash: prev })); this.ledger.push(Object.freeze({ index, kind, at, payloadHash, prevHash: prev, hash })); }
  getLedger(): readonly LedgerEntry[] { return this.ledger; }
}
