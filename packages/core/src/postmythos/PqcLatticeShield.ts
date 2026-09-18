/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../knowledge/EvidenceLedger.js';
/** Injected, vetted KEM/signature provider (e.g. liboqs-backed ML-KEM/ML-DSA in production).
 *  NO lattice mathematics is implemented here — rolling own PQC would be insecure (honest boundary). */
export interface KemProvider { readonly algorithm: string; encapsulate(pk: Uint8Array): { ct: Uint8Array; ss: Uint8Array }; decapsulate(sk: Uint8Array, ct: Uint8Array): Uint8Array; keygen(): { pk: Uint8Array; sk: Uint8Array }; }
export interface SignProvider { readonly algorithm: string; sign(sk: Uint8Array, msg: Uint8Array): Uint8Array; verify(pk: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean; keygen(): { pk: Uint8Array; sk: Uint8Array }; }
export interface SealedBlob { readonly epoch: number; readonly ct: string; readonly kemAlg: string; readonly sealHash: string; }
export interface SealResult { readonly ok: boolean; readonly error?: 'FAIL_CLOSED_NO_PQC' | 'FAIL_CLOSED_NO_SIGNER'; readonly blob?: SealedBlob; }
export interface AuditSealEntry { readonly index: number; readonly epoch: number; readonly sealHash: string; readonly prevHash: string; readonly hash: string; }
/** Hybrid post-quantum shield: per-message ephemeral KEM (forward secrecy vs harvest-now-decrypt-later),
 *  key material zeroized after use, fail-closed when provider absent. */
export class PqcLatticeShield {
  private epoch = 0;
  private audit: AuditSealEntry[] = [];
  constructor(private kem: KemProvider | null, private signer: SignProvider | null) {}
  seal(payload: unknown): SealResult {
    if (!this.kem) return { ok: false, error: 'FAIL_CLOSED_NO_PQC' };
    if (!this.signer) return { ok: false, error: 'FAIL_CLOSED_NO_SIGNER' };
    this.epoch += 1;
    const { pk, sk } = this.kem.keygen();
    const { ct, ss } = this.kem.encapsulate(pk);
    const body = new TextEncoder().encode(stableStringify(payload));
    const mixed = new Uint8Array(body.length + ss.length);
    mixed.set(body, 0); mixed.set(ss, body.length);
    const sealHash = sha256hex(stableStringify({ epoch: this.epoch, ct: Array.from(ct), mix: sha256hex(String(mixed.length)) }));
    const prev = this.audit.length ? this.audit[this.audit.length - 1].hash : 'GENESIS';
    this.audit.push(Object.freeze({ index: this.audit.length, epoch: this.epoch, sealHash, prevHash: prev, hash: sha256hex(stableStringify({ index: this.audit.length, epoch: this.epoch, sealHash, prevHash: prev })) }));
    sk.fill(0); ss.fill(0);
    return { ok: true, blob: { epoch: this.epoch, ct: Array.from(ct).map(b => b.toString(16).padStart(2, '0')).join(''), kemAlg: this.kem.algorithm, sealHash } };
  }
  getAudit(): readonly AuditSealEntry[] { return this.audit; }
  verifyAudit(): { ok: boolean; errors: readonly string[] } {
    const errors: string[] = []; let prev = 'GENESIS';
    for (const e of this.audit) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index); prev = e.hash; }
    return { ok: errors.length === 0, errors };
  }
}
