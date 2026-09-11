import { webcrypto } from 'node:crypto';
import { canonicalize } from '../crypto/canonical.js';

/**
 * SHA-256 hex digest of `value`'s canonical JSON form (`crypto/canonical.ts`).
 * Cryptographic and deterministic: the same logical value — any key order,
 * any construction path — always produces the same fingerprint, and a
 * changed byte anywhere produces a different one.
 */
export async function computeFingerprint(value: unknown): Promise<string> {
  const bytes = Buffer.from(canonicalize(value), 'utf8');
  const digest = await webcrypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(digest).toString('hex');
}
