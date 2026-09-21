import { fnv1a } from '../events/hash';
import type { HashPolicy } from './contracts';

/**
 * The two hash primitives this repo already has, applied to raw bytes
 * (both source functions take a string; an artifact's payload is bytes, so
 * this is the one honest place that bridges the two — not a third hash
 * algorithm).
 *
 * `sha256`: the same Web Crypto SHA-256 digest `core/discovery/evidenceCrypto.ts::sha256Hex`
 * uses, called directly on the byte array instead of on a pre-encoded
 * string (equivalent to `sha256Hex` on the bytes' own latin1 decoding, but
 * avoids the double encode/decode round trip for a real `Uint8Array`).
 *
 * `fnv1a-canonical`: the existing non-cryptographic `fnv1a`, applied to a
 * stable hex projection of the bytes — reproducible, matches every other
 * module's fingerprint shape, never claims cryptographic strength.
 */
export async function hashBytes(bytes: Uint8Array, policy: HashPolicy): Promise<string> {
  if (policy === 'sha256') {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return fnv1a(hex);
}
