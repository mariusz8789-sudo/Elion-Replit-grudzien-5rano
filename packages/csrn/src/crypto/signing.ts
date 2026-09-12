/// <reference types="node" />
import { bytesToHex, computeFingerprint, hexToBytes } from './fingerprint.js';

/**
 * REAL ECDSA P-256 signing/verification via Web Crypto — not a placeholder,
 * not a shape check. `verifySignature` genuinely calls `crypto.subtle.verify`
 * against the exact bytes `signCertificate` produced; a tampered signature
 * value, a tampered signed message, or the wrong public key all fail
 * cryptographically here, not by string comparison.
 */
export interface KeyPair {
  readonly privateKeyJwk: JsonWebKey;
  readonly publicKeyJwk: JsonWebKey;
}

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_PARAMS = { name: 'ECDSA', hash: 'SHA-256' } as const;

async function subtleCrypto(): Promise<SubtleCrypto> {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.subtle) return globalCrypto.subtle;
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.webcrypto.subtle as unknown as SubtleCrypto;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const subtle = await subtleCrypto();
  const keyPair = await subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const privateKeyJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  return { privateKeyJwk, publicKeyJwk };
}

/** Serializes a JWK for EMBEDDING in a `Signature.publicKey` field — needs to reconstruct the exact key via `JSON.parse` for verification, so full fidelity matters here, not identity. */
export function publicKeyToString(publicKeyJwk: JsonWebKey): string {
  return JSON.stringify(publicKeyJwk);
}

/**
 * A canonical, deterministic identity for a public key — used ONLY for
 * trust-store membership (`federation/instance.ts::trust`,
 * `cert/auditor.ts`'s `trustedPublicKeys`), never for reconstructing the key
 * itself. Deliberately NOT `JSON.stringify(jwk)`: `crypto.subtle.exportKey`
 * does not guarantee a stable field order across engines, so two exports of
 * the SAME key could serialize differently and silently fail a trust-set
 * lookup. This hashes only the coordinates that actually identify an EC
 * public key (`kty`/`crv`/`x`/`y`) through the SAME canonical-JSON + SHA-256
 * pipeline every other fingerprint in this package already uses.
 */
export async function computePublicKeyId(publicKeyJwk: JsonWebKey): Promise<string> {
  const { kty, crv, x, y } = publicKeyJwk;
  return computeFingerprint({ kty, crv, x, y });
}

/**
 * Signs the given fingerprint (a hex SHA-256 digest — see `fingerprint.ts`
 * and `cert/builder.ts::computeSignedPayloadFingerprint`) with the supplied
 * private key. Returns the signature bytes as hex, and the public key as a
 * JWK string ready to embed in `Signature.publicKey`.
 */
export async function signFingerprint(fingerprintHex: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const subtle = await subtleCrypto();
  const privateKey = await subtle.importKey('jwk', privateKeyJwk, ALGORITHM, false, ['sign']);
  const data = new TextEncoder().encode(fingerprintHex);
  // See fingerprint.ts's `sha256Hex` comment: this cast bridges a nominal
  // Node/DOM typing mismatch, not a real behavioral difference.
  const signatureBuffer = await subtle.sign(SIGN_PARAMS, privateKey, data as BufferSource);
  return bytesToHex(new Uint8Array(signatureBuffer));
}

/**
 * Verifies `signatureHex` against `fingerprintHex` using `publicKeyJwk`.
 * Returns `false` (never throws) on malformed input, an untrusted/garbage
 * key, or a genuine cryptographic mismatch — the caller (the auditor) is
 * the one place that turns "false" into an honest verdict.
 */
export async function verifySignature(signatureHex: string, fingerprintHex: string, publicKeyJwk: JsonWebKey): Promise<boolean> {
  try {
    const subtle = await subtleCrypto();
    const publicKey = await subtle.importKey('jwk', publicKeyJwk, ALGORITHM, false, ['verify']);
    const data = new TextEncoder().encode(fingerprintHex);
    const signatureBytes = hexToBytes(signatureHex);
    return await subtle.verify(SIGN_PARAMS, publicKey, signatureBytes as BufferSource, data as BufferSource);
  } catch {
    return false;
  }
}
