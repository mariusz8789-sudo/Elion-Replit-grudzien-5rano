/// <reference types="node" />
import { canonicalJson } from './canonicalJson.js';

/**
 * REAL SHA-256, via Web Crypto (`crypto.subtle.digest`) — deliberately NOT
 * Genesis's internal `fnv1a` (`core/events/hash.ts`), which is explicitly
 * documented there as non-cryptographic and exists only for stable
 * same-process ids. A certificate fingerprint that ECDSA is going to sign
 * must be a real cryptographic digest, or the signature would protect
 * nothing.
 *
 * Node 18+ and every browser expose `crypto.subtle` on `globalThis` — no
 * `node:crypto` import needed in the common case; the fallback below only
 * matters on a runtime where `globalThis.crypto` is missing.
 */
async function subtleCrypto(): Promise<SubtleCrypto> {
  const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (globalCrypto?.subtle) return globalCrypto.subtle;
  const nodeCrypto = await import('node:crypto');
  return nodeCrypto.webcrypto.subtle as unknown as SubtleCrypto;
}

export async function sha256Hex(input: string): Promise<string> {
  const subtle = await subtleCrypto();
  const bytes = new TextEncoder().encode(input);
  // `@types/node`'s global `Uint8Array<ArrayBufferLike>` augmentation (for Buffer
  // compatibility) is nominally narrower than lib.dom's `BufferSource` in this
  // TypeScript version — the runtime value is a perfectly ordinary Uint8Array;
  // this cast resolves the type mismatch, it does not change behavior.
  const digest = await subtle.digest('SHA-256', bytes as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`hexToBytes: not a valid hex string: "${hex}"`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** SHA-256 of a value's canonical JSON form — the one fingerprint primitive every other fingerprint in this package builds on. */
export async function computeFingerprint(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}
