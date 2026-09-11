/**
 * SHARED CRYPTO LAYER — real ECDSA P-256 via Node's Web Crypto
 * (`node:crypto`'s `webcrypto`, the same `SubtleCrypto` interface a browser
 * exposes as `crypto.subtle`), used by BOTH `cert/builder.ts` (signing) and
 * `audit/auditor.ts` (verifying). Neither of those imports the other, and
 * neither imports `federation/` — this module is the one shared dependency,
 * so `src/audit` never depends on `federation` (a `federation/*` instance is
 * a *user* of this module, at the same level as the cert builder, not
 * something the audit layer routes through).
 */
import { webcrypto } from 'node:crypto';
import { canonicalize } from './canonical.js';

export type JsonWebKey = webcrypto.JsonWebKey;

const subtle = webcrypto.subtle;
const ECDSA_KEY_PARAMS = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

export type SignatureAlgorithm = 'ECDSA-P256-SHA256';
export const SIGNATURE_ALGORITHM: SignatureAlgorithm = 'ECDSA-P256-SHA256';

export interface KeyPair {
  readonly privateKeyJwk: JsonWebKey;
  readonly publicKeyJwk: JsonWebKey;
}

/** A fresh, real ECDSA P-256 key pair, both halves exported as JWK (explicit, self-describing — never an opaque/implicit string encoding). */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = (await subtle.generateKey(ECDSA_KEY_PARAMS, true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair;
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    subtle.exportKey('jwk', keyPair.privateKey),
    subtle.exportKey('jwk', keyPair.publicKey),
  ]);
  return { privateKeyJwk, publicKeyJwk };
}

/**
 * Signs `payloadFingerprint`'s UTF-8 bytes with `privateKeyJwk`, returning a
 * hex-encoded ECDSA signature.
 *
 * Deliberately does NOT try to derive the matching public key from
 * `privateKeyJwk` here: an EC private-key JWK already carries its public
 * coordinates (`x`, `y`) alongside the private scalar (`d`), and importing it
 * with a `'sign'`-only usage and re-exporting does NOT strip `d` — the
 * result is the same private key, not a public one. A caller that tried
 * that would silently leak the private key into a field labelled "public".
 * The caller must instead carry the `publicKeyJwk` it already has from
 * `generateKeyPair` (this is exactly what `KeyPair` is for).
 */
export async function signPayload(payloadFingerprint: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const privateKey = await subtle.importKey('jwk', privateKeyJwk, ECDSA_KEY_PARAMS, false, ['sign']);
  const data = Buffer.from(payloadFingerprint, 'utf8');
  const signatureBuffer = await subtle.sign(ECDSA_SIGN_PARAMS, privateKey, data);
  return Buffer.from(signatureBuffer).toString('hex');
}

/** Verifies a hex-encoded ECDSA signature against `payloadFingerprint` under `publicKeyJwk`. Never throws — a malformed key or signature is simply not valid. */
export async function verifySignature(signatureHex: string, payloadFingerprint: string, publicKeyJwk: JsonWebKey): Promise<boolean> {
  try {
    const publicKey = await subtle.importKey('jwk', publicKeyJwk, ECDSA_KEY_PARAMS, false, ['verify']);
    const data = Buffer.from(payloadFingerprint, 'utf8');
    const signatureBytes = Buffer.from(signatureHex, 'hex');
    if (signatureBytes.length === 0) return false; // Buffer.from(..., 'hex') silently drops invalid trailing bytes rather than throwing — an empty result means the input was not real hex.
    return await subtle.verify(ECDSA_SIGN_PARAMS, publicKey, signatureBytes, data);
  } catch {
    return false;
  }
}

/**
 * A stable string identity for a public key, for trust-set membership
 * (`Set<string>`) and equality checks. Canonical JSON of the JWK rather than
 * a fresh hash: a public key is not secret, so there is nothing to protect
 * by hashing it, and keeping it a reversible canonical string makes a
 * mismatch debuggable by inspection.
 */
export function publicKeyId(publicKeyJwk: JsonWebKey): string {
  return canonicalize(publicKeyJwk);
}
