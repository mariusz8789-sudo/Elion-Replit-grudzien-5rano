import { serializeDiscoveryEvidencePack } from './discoveryEvidence';
import type { DiscoveryEvidencePack } from './discoveryCase';

/**
 * EVIDENCE SHA-256 — cryptographic-grade digest, ADDED ALONGSIDE the existing
 * fingerprint system, not instead of it.
 *
 * Genesis's internal fingerprints (`fnv1a`, `core/events/hash.ts`) are
 * explicitly documented as non-cryptographic — they exist only to make a
 * given input reproducible (same string in → same short id out), and every
 * Discovery Case/Scenario Run already depends on that exact behaviour for
 * MATCH/DRIFT replay comparison. Replacing them would touch Scientific Core
 * for no reason: this file does not change discoveryEvidence.ts,
 * discoveryReplay.ts, or events/hash.ts.
 *
 * What was genuinely missing is a digest strong enough to hand to someone
 * outside the app (a scientist, an investor, an auditor) as tamper evidence
 * for a COMPLETED evidence pack. That is a different job from internal
 * replay bookkeeping, so it gets a different, real hash: the browser's own
 * SHA-256 (Web Crypto), computed over the pack's existing canonical
 * serialization (`serializeDiscoveryEvidencePack`, unchanged).
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 of a completed evidence pack's canonical content. */
export async function computeEvidencePackSha256(pack: DiscoveryEvidencePack): Promise<string> {
  return sha256Hex(serializeDiscoveryEvidencePack(pack));
}
